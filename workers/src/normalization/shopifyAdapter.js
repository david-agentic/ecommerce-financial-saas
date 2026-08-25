/**
 * Shopify Channel Normalization Adapter
 * Translates raw Shopify Order/Transaction payloads into Canonical Commerce & Financial Events.
 */

export function normalizeShopifyOrder(raw, orgId, channelId) {
  const externalOrderId = String(raw.id || raw.Name || raw['Name'] || '').trim();
  const orderNumber     = String(raw.name || raw.order_number || raw.Name || externalOrderId).trim();
  const currency        = String(raw.currency || raw.Currency || 'GBP').toUpperCase();

  const grossAmount    = parseFloat(raw.subtotal_price || raw['Subtotal'] || raw.gross_amount || 0);
  const discountAmount = parseFloat(raw.total_discounts || raw['Discount Amount'] || 0);
  const shippingAmount = parseFloat(raw.total_shipping_price_set?.shop_money?.amount || raw['Shipping'] || 0);
  const taxAmount      = parseFloat(raw.total_tax || raw['Taxes'] || 0);
  const customerEmail  = raw.email || raw['Email'] || null;
  const orderedAt      = raw.created_at || raw['Created at'] || new Date().toISOString();

  let financialStatus = 'paid';
  if (raw.financial_status) {
    const fs = raw.financial_status.toLowerCase();
    if (fs.includes('refund')) financialStatus = 'refunded';
    else if (fs.includes('part')) financialStatus = 'partially_refunded';
    else if (fs.includes('pending')) financialStatus = 'pending';
  }

  const canonicalOrder = {
    id: `ord_shp_${externalOrderId}`,
    orgId,
    channelId,
    externalOrderId,
    orderNumber,
    currency,
    grossAmount,
    discountAmount,
    shippingAmount,
    taxAmount,
    netAmount: grossAmount - discountAmount + shippingAmount + taxAmount,
    financialStatus,
    fulfillmentStatus: raw.fulfillment_status === 'fulfilled' ? 'fulfilled' : 'unfulfilled',
    customerEmail,
    orderedAt
  };

  // Line items
  const rawItems = raw.line_items || [];
  const canonicalItems = rawItems.map((item, idx) => ({
    id: `itm_shp_${externalOrderId}_${idx + 1}`,
    orgId,
    orderId: canonicalOrder.id,
    sku: item.sku || `NOSKU-${idx + 1}`,
    title: item.title || item.name || 'Untitled Product',
    qty: parseInt(item.quantity || item.qty || 1, 10),
    unitPrice: parseFloat(item.price || 0),
    unitCost: parseFloat(item.unit_cost || 0)
  }));

  // Financial Ledger Events
  const events = [];

  // Sale Event
  events.push({
    id: `evt_shp_sale_${externalOrderId}`,
    orgId,
    channelId,
    orderId: canonicalOrder.id,
    externalEventId: raw.payment_reference || `txn_sale_${externalOrderId}`,
    eventType: 'sale',
    amount: canonicalOrder.netAmount,
    currency,
    description: `Shopify Sale Order ${orderNumber}`,
    occurredAt: orderedAt
  });

  // Processing Fee Event (if provided in Shopify Payout/Transaction)
  if (raw.processing_fee && parseFloat(raw.processing_fee) > 0) {
    events.push({
      id: `evt_shp_fee_${externalOrderId}`,
      orgId,
      channelId,
      orderId: canonicalOrder.id,
      externalEventId: `txn_fee_${externalOrderId}`,
      eventType: 'processing_fee',
      amount: -Math.abs(parseFloat(raw.processing_fee)),
      currency,
      description: `Shopify Payments Processing Fee`,
      occurredAt: orderedAt
    });
  }

  return {
    order: canonicalOrder,
    items: canonicalItems,
    events
  };
}
