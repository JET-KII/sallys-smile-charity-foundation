import { json, readJson } from './_lib/http.mjs';
import configModule from '../../api/_lib/config.js';
import paystackModule from '../../api/_lib/paystack.js';
import supabaseModule from '../../api/_lib/supabase.js';
import envModule from '../../api/_lib/env.js';
import paymentUtilsModule from '../../api/_lib/payment-utils.js';

const { getStoreConfig } = configModule;
const { initializeTransaction } = paystackModule;
const { createPayment, insertPaymentItems, updatePaymentByReference } = supabaseModule;
const { getEnvVar } = envModule;
const {
  buildCartSummary,
  buildItemRows,
  buildPaymentRecord,
  generateReference,
  toSubunits,
} = paymentUtilsModule;

export default async (req) => {
  if (req.method !== 'POST') {
    return json({ ok: false, error: 'Method not allowed.' }, 405);
  }

  try {
    const payload = await readJson(req);
    const { cart = [], customer = {} } = payload;
    const cartSummary = buildCartSummary(cart, customer);
    const config = getStoreConfig();
    const siteBaseUrl = getEnvVar('SITE_BASE_URL');

    if (!siteBaseUrl) {
      throw new Error('SITE_BASE_URL is not configured.');
    }

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
      callback_url: `${siteBaseUrl}/api/payments/callback?kind=shop`,
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

    return json({
      ok: true,
      checkoutUrl: transaction.authorization_url,
      reference,
    });
  } catch (error) {
    return json({
      ok: false,
      error: error.message || 'Unable to start checkout.',
      details: error.details || null,
    }, error.statusCode || 500);
  }
};

export const config = {
  path: '/api/checkout/cart',
  preferStatic: true,
};
