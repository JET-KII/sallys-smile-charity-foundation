const { getStoreConfig } = require('../_lib/config');
const { parseJsonBody, sendJson } = require('../_lib/http');
const { initializeTransaction } = require('../_lib/paystack');
const { createPayment, insertPaymentItems, updatePaymentByReference } = require('../_lib/supabase');
const { buildCartSummary, buildItemRows, buildPaymentRecord, generateReference, toSubunits } = require('../_lib/payment-utils');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return sendJson(res, 405, { ok: false, error: 'Method not allowed.' });
  }

  try {
    const payload = await parseJsonBody(req);
    const { cart = [], customer = {} } = payload;
    const cartSummary = buildCartSummary(cart, customer);
    const config = getStoreConfig();
    const reference = generateReference('shop');
    const metadata = {
      kind: 'shop',
      paymentReference: reference,
      fulfillmentMethod: cartSummary.customer.fulfillmentMethod,
      deliveryZoneCode: cartSummary.deliveryZone?.code || null,
      items: cartSummary.items.map((item) => ({
        sku: item.sku,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
      })),
    };

    const paymentRecord = buildPaymentRecord({
      kind: 'shop',
      reference,
      customer: cartSummary.customer,
      subtotal: cartSummary.subtotal,
      deliveryFee: cartSummary.deliveryFee,
      total: cartSummary.total,
      notes: cartSummary.customer.notes,
      deliveryZone: cartSummary.deliveryZone,
      metadata,
      fulfillmentMethod: cartSummary.customer.fulfillmentMethod,
    });

    await createPayment(paymentRecord);
    await insertPaymentItems(buildItemRows(reference, cartSummary.items));

    const transaction = await initializeTransaction({
      amount: toSubunits(cartSummary.total),
      callback_url: `${process.env.SITE_BASE_URL}/api/payments/callback?kind=shop`,
      currency: config.currency,
      email: cartSummary.customer.email,
      metadata: {
        ...metadata,
        customerName: cartSummary.customer.name,
        customerPhone: cartSummary.customer.phone,
      },
      reference,
    });

    await updatePaymentByReference(reference, {
      paystack_access_code: transaction.access_code,
      metadata: {
        ...metadata,
        paystackAuthorizationUrl: transaction.authorization_url,
      },
    });

    return sendJson(res, 200, {
      ok: true,
      checkoutUrl: transaction.authorization_url,
      reference,
    });
  } catch (error) {
    return sendJson(res, error.statusCode || 500, {
      ok: false,
      error: error.message || 'Unable to start checkout.',
      details: error.details || null,
    });
  }
};
