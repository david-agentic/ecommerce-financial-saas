/**
 * WooCommerce Channel Normalization Adapter
 * Translates WooCommerce API/CSV Order payloads into Canonical Commerce & Financial Events.
 */

export function normalizeWooCommerceOrder(raw, orgId, channelId) {
  const externalOrderId = String(raw.id || raw.number || raw['Order Number'] || '').trim();
  const orderNumber     = String(raw.number || raw.order_key || `#WC-${externalOrderId}`).trim();
  const currency        = String(raw.currency || raw['Currency'] || 'GBP').toUpperCase();

  const grossAmount    = parseFloat(raw.total || raw['Order Total'] || 0);
  const discountAmount = parseFloat(raw.discount_total || raw['Discount Total'] || 0);
  const shippingAmount = parseFloat(raw.shipping_total || raw['Shipping Total'] || 0);
  const taxAmount      = parseFloat(raw.total_tax || raw['Total Tax'] || 0);
  const customerEmail  = raw.billing?.email || raw['Billing Email'] || null;
  const orderedAt      = raw.date_created || raw['Date Created'] || new Date().toISOString();

  let financialStatus = 'paid';
  if (raw.status) {
    const st = raw.status.toLowerCase();
    if (st.includes('refund')) financialStatus = 'refunded';
    else if (st.includes('pending')) financialStatus = 'pending';
    else if (st.includes('cancelled')) financialStatus = 'voided';
  }

  const canonicalOrder = {
    id: `ord_wc_${externalOrderId}`,
    orgId,
    channelId,
    externalOrderId,
    orderNumber,
    currency,
    grossAmount,
    discountAmount,
    shippingAmount,
    taxAmount,
    netAmount: grossAmount,
    financialStatus,
    fulfillmentStatus: raw.status === 'completed' ? 'fulfilled' : 'unfulfilled',
    customerEmail,
    orderedAt
  };

  // Line Items
  const rawItems = raw.line_items || [];
  const canonicalItems = rawItems.map((item, idx) => ({
    id: `itm_wc_${externalOrderId}_${idx + 1}`,
    orgId,
    orderId: canonicalOrder.id,
    sku: item.sku || `WC-SKU-${idx + 1}`,
    title: item.name || 'WooCommerce Product',
    qty: parseInt(item.quantity || 1, 10),
    unitPrice: parseFloat(item.price || 0),
    unitCost: parseFloat(item.unit_cost || 0)
  }));

  const events = [];

  // Sale Event
  events.push({
    id: `evt_wc_sale_${externalOrderId}`,
    orgId,
    channelId,
    orderId: canonicalOrder.id,
    externalEventId: `wc_sale_${externalOrderId}`,
    eventType: 'sale',
    amount: canonicalOrder.grossAmount,
    currency,
    description: `WooCommerce Order ${orderNumber}`,
    occurredAt: orderedAt
  });

  // Processing Fee Event (Stripe/PayPal Gateway Fee)
  if (raw.payment_gateway_fee && parseFloat(raw.payment_gateway_fee) > 0) {
    events.push({
      id: `evt_wc_fee_${externalOrderId}`,
      orgId,
      channelId,
      orderId: canonicalOrder.id,
      externalEventId: `wc_fee_${externalOrderId}`,
      eventType: 'processing_fee',
      amount: -Math.abs(parseFloat(raw.payment_gateway_fee)),
      currency,
      description: `WooCommerce Payment Gateway Fee (${raw.payment_method_title || 'Gateway'})`,
      occurredAt: orderedAt
    });
  }

  return {
    order: canonicalOrder,
    items: canonicalItems,
    events
  };
}
