const crypto = require('crypto');
const { getCurrency, getDeliveryZoneByCode, getProductBySku, getStoreConfig } = require('./config');

function roundMoney(value) {
  return Number(Number(value || 0).toFixed(2));
}

function formatMoney(value, currency = getCurrency()) {
  return `${currency} ${roundMoney(value).toFixed(2)}`;
}

function toSubunits(value) {
  return Math.round(roundMoney(value) * 100);
}

function generateReference(kind) {
  const label = kind === 'donation' ? 'DON' : 'SHOP';
  return `SSCF-${label}-${Date.now()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
}

function mapGatewayStatus(status) {
  switch (status) {
    case 'success':
      return 'paid';
    case 'failed':
      return 'failed';
    case 'abandoned':
      return 'cancelled';
    case 'reversed':
      return 'refunded';
    default:
      return 'pending';
  }
}

function assertCustomer(customer, { requireDelivery } = {}) {
  if (!customer || typeof customer !== 'object') {
    const error = new Error('Customer details are required.');
    error.statusCode = 400;
    throw error;
  }

  const name = String(customer.name || '').trim();
  const email = String(customer.email || '').trim();
  const phone = String(customer.phone || '').trim();
  const address = String(customer.address || '').trim();
  const notes = String(customer.notes || '').trim();
  const deliveryZoneCode = String(customer.deliveryZoneCode || '').trim();
  const fulfillmentMethod = String(customer.fulfillmentMethod || 'pickup').trim().toLowerCase();

  if (!name || !email || !phone) {
    const error = new Error('Name, email, and phone are required.');
    error.statusCode = 400;
    throw error;
  }

  if (requireDelivery && (!deliveryZoneCode || !address)) {
    const error = new Error('Delivery area and address are required for delivery orders.');
    error.statusCode = 400;
    throw error;
  }

  return {
    name,
    email,
    phone,
    address,
    notes,
    deliveryZoneCode,
    fulfillmentMethod,
  };
}

function buildCartSummary(cart, customer) {
  if (!Array.isArray(cart) || !cart.length) {
    const error = new Error('Cart is empty.');
    error.statusCode = 400;
    throw error;
  }

  const normalizedCustomer = assertCustomer(customer, {
    requireDelivery: String(customer?.fulfillmentMethod || '').toLowerCase() === 'delivery',
  });

  const items = cart.map((item) => {
    const product = getProductBySku(item.sku);
    const quantity = Number(item.quantity);

    if (!product || !product.purchasable || product.enquireOnly) {
      const error = new Error(`Product ${item.sku} is not available for checkout.`);
      error.statusCode = 400;
      throw error;
    }

    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 20) {
      const error = new Error(`Invalid quantity provided for ${item.sku}.`);
      error.statusCode = 400;
      throw error;
    }

    return {
      sku: product.sku,
      title: product.name,
      quantity,
      unitPrice: roundMoney(product.price),
      lineTotal: roundMoney(product.price * quantity),
      image: product.image,
    };
  });

  const subtotal = roundMoney(items.reduce((sum, item) => sum + item.lineTotal, 0));
  let deliveryZone = null;
  let deliveryFee = 0;

  if (normalizedCustomer.fulfillmentMethod === 'delivery') {
    deliveryZone = getDeliveryZoneByCode(normalizedCustomer.deliveryZoneCode);
    if (!deliveryZone) {
      const error = new Error('Selected delivery area is invalid.');
      error.statusCode = 400;
      throw error;
    }
    deliveryFee = roundMoney(deliveryZone.fee);
  }

  return {
    currency: getCurrency(),
    customer: normalizedCustomer,
    deliveryFee,
    deliveryZone,
    items,
    subtotal,
    total: roundMoney(subtotal + deliveryFee),
  };
}

function buildDonationSummary(payload) {
  const minimumAmount = Number(getStoreConfig().donation?.minimumAmount || 10);
  const amount = Number(payload?.amount);
  const donor = assertCustomer({
    name: payload?.name,
    email: payload?.email,
    phone: payload?.phone,
    notes: payload?.note,
  });

  if (!Number.isFinite(amount) || amount < minimumAmount) {
    const error = new Error(`Donation amount must be at least ${formatMoney(minimumAmount)}.`);
    error.statusCode = 400;
    throw error;
  }

  return {
    amount: roundMoney(amount),
    currency: getCurrency(),
    donor,
  };
}

function buildPaymentRecord({
  kind,
  reference,
  customer,
  subtotal = 0,
  deliveryFee = 0,
  total,
  notes = '',
  deliveryZone = null,
  metadata = {},
  fulfillmentMethod = null,
}) {
  return {
    reference,
    kind,
    status: 'pending',
    customer_name: customer.name,
    customer_email: customer.email,
    customer_phone: customer.phone,
    currency: getCurrency(),
    subtotal: roundMoney(subtotal),
    delivery_fee: roundMoney(deliveryFee),
    total: roundMoney(total),
    fulfillment_method: fulfillmentMethod,
    delivery_area: deliveryZone ? deliveryZone.name : null,
    address: customer.address || null,
    notes: notes || customer.notes || null,
    metadata,
  };
}

function buildItemRows(reference, items) {
  return items.map((item) => ({
    reference,
    sku: item.sku,
    title_snapshot: item.title,
    unit_price: roundMoney(item.unitPrice),
    quantity: item.quantity,
    line_total: roundMoney(item.lineTotal),
  }));
}

function sanitizePayment(payment, items = []) {
  if (!payment) {
    return null;
  }

  return {
    reference: payment.reference,
    kind: payment.kind,
    status: payment.status,
    customerName: payment.customer_name,
    customerEmail: payment.customer_email,
    customerPhone: payment.customer_phone,
    currency: payment.currency,
    subtotal: roundMoney(payment.subtotal),
    deliveryFee: roundMoney(payment.delivery_fee),
    total: roundMoney(payment.total),
    fulfillmentMethod: payment.fulfillment_method,
    deliveryArea: payment.delivery_area,
    address: payment.address,
    notes: payment.notes,
    items: items.map((item) => ({
      sku: item.sku,
      title: item.title_snapshot,
      unitPrice: roundMoney(item.unit_price),
      quantity: Number(item.quantity),
      lineTotal: roundMoney(item.line_total),
    })),
    createdAt: payment.created_at,
    verifiedAt: payment.verified_at,
  };
}

module.exports = {
  buildCartSummary,
  buildDonationSummary,
  buildItemRows,
  buildPaymentRecord,
  formatMoney,
  generateReference,
  mapGatewayStatus,
  roundMoney,
  sanitizePayment,
  toSubunits,
};
