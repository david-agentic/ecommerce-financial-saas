/**
 * Universal Financial Intelligence & Reporting Engine
 * Computes P&L, Channel Metrics, Margin Analysis, and Payout Reconciliation with strict tenant isolation.
 */

export async function getFinancialSummary(db, orgId, startDate = null, endDate = null) {
  let dateFilter = '';
  const params = [orgId];

  if (startDate && endDate) {
    dateFilter = ' AND ordered_at BETWEEN ? AND ?';
    params.push(startDate, endDate);
  }

  // 1. Order Header Totals
  const orderStats = await db.prepare(`
    SELECT
      COUNT(id) as total_orders,
      COALESCE(SUM(gross_amount), 0) as gross_sales,
      COALESCE(SUM(discount_amount), 0) as total_discounts,
      COALESCE(SUM(shipping_amount), 0) as shipping_income,
      COALESCE(SUM(tax_amount), 0) as total_tax
    FROM canonical_orders
    WHERE org_id = ? ${dateFilter}
  `).bind(...params).first();

  const grossSales     = orderStats.gross_sales || 0;
  const totalDiscounts = orderStats.total_discounts || 0;
  const shippingIncome = orderStats.shipping_income || 0;

  // 2. Financial Ledger Event Summaries
  let eventDateFilter = '';
  const eventParams = [orgId];
  if (startDate && endDate) {
    eventDateFilter = ' AND occurred_at BETWEEN ? AND ?';
    eventParams.push(startDate, endDate);
  }

  const eventStats = await db.prepare(`
    SELECT
      COALESCE(SUM(CASE WHEN event_type = 'refund' THEN ABS(amount) ELSE 0 END), 0) as total_refunds,
      COALESCE(SUM(CASE WHEN event_type = 'platform_fee' THEN ABS(amount) ELSE 0 END), 0) as platform_fees,
      COALESCE(SUM(CASE WHEN event_type = 'processing_fee' THEN ABS(amount) ELSE 0 END), 0) as processing_fees,
      COALESCE(SUM(CASE WHEN event_type = 'shipping_fee' THEN ABS(amount) ELSE 0 END), 0) as shipping_costs,
      COALESCE(SUM(CASE WHEN event_type = 'adjustment' THEN amount ELSE 0 END), 0) as net_adjustments
    FROM canonical_financial_events
    WHERE org_id = ? ${eventDateFilter}
  `).bind(...eventParams).first();

  const totalRefunds   = eventStats.total_refunds || 0;
  const platformFees   = eventStats.platform_fees || 0;
  const processingFees = eventStats.processing_fees || 0;
  const shippingCosts  = eventStats.shipping_costs || 0;
  const netAdjustments = eventStats.net_adjustments || 0;

  // Net Sales & Proceeds calculations
  const netSales    = grossSales - totalDiscounts - totalRefunds;
  const totalFees   = platformFees + processingFees + shippingCosts;
  const netProceeds = netSales + shippingIncome - totalFees + netAdjustments;

  // COGS & Margin calculation
  const cogsStats = await db.prepare(`
    SELECT COALESCE(SUM(qty * unit_cost), 0) as total_cogs
    FROM canonical_order_items
    WHERE org_id = ?
  `).bind(orgId).first();

  const totalCogs   = cogsStats.total_cogs || 0;
  const grossProfit = netProceeds - totalCogs;
  const grossMarginPercent = netSales > 0 ? ((grossProfit / netSales) * 100) : 0;

  // Operating Expenses
  let totalExpenses = 0;
  try {
    const expenseStats = await db.prepare(`
      SELECT COALESCE(SUM(amount), 0) as total_expenses
      FROM business_expenses
      WHERE org_id = ?
    `).bind(orgId).first();
    totalExpenses = expenseStats?.total_expenses || 0;
  } catch (e) {
    // Table may not exist yet
    totalExpenses = 0;
  }
  const netProfit = grossProfit - totalExpenses;
  const netProfitMarginPercent = netSales > 0 ? ((netProfit / netSales) * 100) : 0;

  return {
    orgId,
    period: { startDate, endDate },
    metrics: {
      totalOrders: orderStats.total_orders || 0,
      grossSales: round(grossSales),
      totalDiscounts: round(totalDiscounts),
      totalRefunds: round(totalRefunds),
      netSales: round(netSales),
      shippingIncome: round(shippingIncome),
      platformFees: round(platformFees),
      processingFees: round(processingFees),
      totalFees: round(totalFees),
      netProceeds: round(netProceeds),
      totalCogs: round(totalCogs),
      grossProfit: round(grossProfit),
      grossMarginPercent: round(grossMarginPercent),
      totalExpenses: round(totalExpenses),
      netProfit: round(netProfit),
      netProfitMarginPercent: round(netProfitMarginPercent)
    }
  };
}

export async function computeDataConfidence(db, orgId) {
  let score = 100;
  const issues = [];

  // 1. Check for uncosted products (missing COGS)
  try {
    const uncosted = await db.prepare(`
      SELECT COUNT(DISTINCT sku) as count, COALESCE(SUM(qty * 0), 0) as dummy
      FROM canonical_order_items
      WHERE org_id = ? AND (unit_cost IS NULL OR unit_cost = 0)
    `).bind(orgId).first();
    const count = uncosted?.count || 0;
    if (count > 0) {
      score -= Math.min(30, count * 5);
      issues.push(`${count} product(s) missing unit purchase cost (COGS)`);
    }
  } catch (e) {}

  // 2. Check for missing expenses
  try {
    const expCount = await db.prepare(`
      SELECT COUNT(id) as count FROM business_expenses WHERE org_id = ?
    `).bind(orgId).first();
    if (!expCount || expCount.count === 0) {
      score -= 10;
      issues.push("No operating expenses recorded yet");
    }
  } catch (e) {}

  // 3. Check channel connections
  try {
    const chCount = await db.prepare(`
      SELECT COUNT(id) as count FROM sales_channels WHERE org_id = ?
    `).bind(orgId).first();
    if (!chCount || chCount.count === 0) {
      score -= 20;
      issues.push("No sales channels connected");
    }
  } catch (e) {}

  score = Math.max(0, Math.min(100, score));
  return {
    score,
    rating: score >= 85 ? 'High' : (score >= 60 ? 'Moderate' : 'Low (Estimated)'),
    isEstimated: score < 85,
    issues
  };
}

export async function getPeriodMovement(db, orgId) {
  const current = await getFinancialSummary(db, orgId);
  const m = current.metrics;

  const positiveDrivers = [];
  const negativeDrivers = [];

  if (m.grossSales > 0) {
    positiveDrivers.push({ title: "Gross Sales Revenue", impact: m.grossSales, note: "Core order revenue" });
  }
  if (m.totalCogs > 0) {
    negativeDrivers.push({ title: "Cost of Goods Sold (COGS)", impact: m.totalCogs, note: "Inventory procurement cost" });
  }
  if (m.totalExpenses > 0) {
    negativeDrivers.push({ title: "Operating Expenses", impact: m.totalExpenses, note: "Rent, marketing, overheads" });
  }
  if (m.totalFees > 0) {
    negativeDrivers.push({ title: "Platform & Processing Fees", impact: m.totalFees, note: "Channel & gateway commissions" });
  }
  if (m.totalRefunds > 0) {
    negativeDrivers.push({ title: "Discounts & Refunds", impact: m.totalRefunds + m.totalDiscounts, note: "Deducted from sales" });
  }

  return {
    netProfit: m.netProfit,
    netMarginPercent: m.netProfitMarginPercent,
    positiveDrivers,
    negativeDrivers
  };
}

export async function getAttentionCenterItems(db, orgId) {
  const items = [];

  // Check 1: Missing COGS
  try {
    const uncosted = await db.prepare(`
      SELECT COUNT(DISTINCT sku) as count
      FROM canonical_order_items
      WHERE org_id = ? AND (unit_cost IS NULL OR unit_cost = 0)
    `).bind(orgId).first();
    const count = uncosted?.count || 0;
    if (count > 0) {
      items.push({
        id: 'att_cogs',
        severity: 'danger',
        title: `${count} Product(s) Missing Unit Cost`,
        message: 'Your reported profit is overstated because product costs are unassigned.',
        impactText: 'Profit Calculation Incomplete',
        actionText: 'Set Product Costs',
        actionView: 'cogs'
      });
    }
  } catch (e) {}

  // Check 2: Expenses
  try {
    const expCount = await db.prepare(`
      SELECT COUNT(id) as count FROM business_expenses WHERE org_id = ?
    `).bind(orgId).first();
    if (!expCount || expCount.count === 0) {
      items.push({
        id: 'att_exp',
        severity: 'warn',
        title: 'No Operating Expenses Recorded',
        message: 'Add marketing, rent, and software costs to see your true Net Profit.',
        impactText: 'Net Profit Overhead Missing',
        actionText: 'Add Expense',
        actionView: 'expenses'
      });
    }
  } catch (e) {}

  // Check 3: Channels
  try {
    const chCount = await db.prepare(`
      SELECT COUNT(id) as count FROM sales_channels WHERE org_id = ?
    `).bind(orgId).first();
    if (!chCount || chCount.count === 0) {
      items.push({
        id: 'att_ch',
        severity: 'warn',
        title: 'No Sales Data Source Connected',
        message: 'Import a CSV file or connect Shopify/Daraz to generate your financial compass.',
        impactText: 'No Sales Data',
        actionText: 'Connect Channel',
        actionView: 'datasources'
      });
    }
  } catch (e) {}

  return items;
}

export async function getProfitWaterfall(db, orgId) {
  const s = await getFinancialSummary(db, orgId);
  const m = s.metrics;

  return [
    { label: 'Gross Sales', amount: m.grossSales, type: 'start' },
    { label: 'Discounts & Refunds', amount: - (m.totalDiscounts + m.totalRefunds), type: 'subtraction' },
    { label: 'Net Sales', amount: m.netSales, type: 'subtotal' },
    { label: 'Platform & Gateway Fees', amount: - m.totalFees, type: 'subtraction' },
    { label: 'Cost of Goods Sold (COGS)', amount: - m.totalCogs, type: 'subtraction' },
    { label: 'Gross Profit', amount: m.grossProfit, type: 'subtotal' },
    { label: 'Operating Expenses', amount: - m.totalExpenses, type: 'subtraction' },
    { label: 'Net Profit', amount: m.netProfit, type: 'final' }
  ];
}

export async function getExpenseSummary(db, orgId) {
  const result = await db.prepare(`
    SELECT
      COALESCE(SUM(amount), 0) as total_expenses,
      COUNT(id) as expense_count
    FROM business_expenses
    WHERE org_id = ?
  `).bind(orgId).first();

  const byCategory = await db.prepare(`
    SELECT category, COALESCE(SUM(amount), 0) as total
    FROM business_expenses
    WHERE org_id = ?
    GROUP BY category
    ORDER BY total DESC
  `).bind(orgId).all();

  return {
    totalExpenses: round(result?.total_expenses || 0),
    expenseCount: result?.expense_count || 0,
    byCategory: byCategory.results || []
  };
}

export async function getChannelBreakdown(db, orgId) {
  const channels = await db.prepare(`
    SELECT
      c.id as channel_id,
      c.provider,
      c.channel_name,
      COUNT(o.id) as order_count,
      COALESCE(SUM(o.gross_amount - o.discount_amount), 0) as net_sales
    FROM sales_channels c
    LEFT JOIN canonical_orders o ON c.id = o.channel_id AND o.org_id = c.org_id
    WHERE c.org_id = ?
    GROUP BY c.id
  `).bind(orgId).all();

  return channels.results || [];
}

export async function reconcilePayouts(db, orgId) {
  const payouts = await db.prepare(`
    SELECT
      p.id,
      p.external_payout_id,
      p.payout_date,
      p.net_amount as recorded_net_payout,
      COALESCE(SUM(e.amount), 0) as expected_net_amount,
      p.reconciliation_status
    FROM canonical_payouts p
    LEFT JOIN canonical_financial_events e ON p.id = e.payout_id AND e.org_id = p.org_id
    WHERE p.org_id = ?
    GROUP BY p.id
  `).bind(orgId).all();

  const results = (payouts.results || []).map(p => {
    const expected = round(p.expected_net_amount);
    const recorded = round(p.recorded_net_payout);
    const diff = round(recorded - expected);
    const status = Math.abs(diff) < 0.01 ? 'matched' : 'discrepancy';

    return {
      payoutId: p.id,
      externalPayoutId: p.external_payout_id,
      payoutDate: p.payout_date,
      recordedNetPayout: recorded,
      expectedNetPayout: expected,
      discrepancy: diff,
      status
    };
  });

  return results;
}

function round(val) {
  return Math.round((val + Number.EPSILON) * 100) / 100;
}
