/**
 * TikTok Shop Channel Normalization Adapter
 * Translates raw TikTok Shop Order & Settlement records into Canonical Commerce & Financial Events.
 */

export function normalizeTikTokOrder(raw, orgId, channelId) {
  const externalOrderId = String(raw.order_id || raw['Order ID'] || '').trim();
  const orderNumber     = String(raw.order_number || raw['Order ID'] || externalOrderId).trim();
  const currency        = String(raw.currency || raw['Currency'] || 'GBP').toUpperCase();

  const grossAmount    = parseFloat(raw.sku_subtotal || raw['Order Amount'] || 0);
  const discountAmount = parseFloat(raw.seller_discount || raw['Discount'] || 0);
  const shippingAmount = parseFloat(raw.shipping_fee || raw['Shipping Fee'] || 0);
  const taxAmount      = parseFloat(raw.tax || 0);
  const orderedAt      = raw.created_time || raw['Created Time'] || new Date().toISOString();

  const canonicalOrder = {
    id: `ord_ttk_${externalOrderId}`,
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
    financialStatus: 'paid',
    fulfillmentStatus: 'fulfilled',
    customerEmail: raw.buyer_email || null,
    orderedAt
  };

  const events = [];

  // 1. Gross Sale Event
  events.push({
    id: `evt_ttk_sale_${externalOrderId}`,
    orgId,
    channelId,
    orderId: canonicalOrder.id,
    externalEventId: `ttk_sale_${externalOrderId}`,
    eventType: 'sale',
    amount: canonicalOrder.netAmount,
    currency,
    description: `TikTok Shop Sale ${orderNumber}`,
    occurredAt: orderedAt
  });

  // 2. TikTok Platform Commission Fee Event
  const commission = parseFloat(raw.platform_commission || raw['TikTok Commission'] || 0);
  if (commission > 0) {
    events.push({
      id: `evt_ttk_comm_${externalOrderId}`,
      orgId,
      channelId,
      orderId: canonicalOrder.id,
      externalEventId: `ttk_comm_${externalOrderId}`,
      eventType: 'platform_fee',
      amount: -Math.abs(commission),
      currency,
      description: `TikTok Shop Platform Commission Fee`,
      occurredAt: orderedAt
    });
  }

  return {
    order: canonicalOrder,
    items: [],
    events
  };
}
