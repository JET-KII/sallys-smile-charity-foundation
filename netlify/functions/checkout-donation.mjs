import { json, readJson } from './_lib/http.mjs';
import configModule from '../../api/_lib/config.js';
import paystackModule from '../../api/_lib/paystack.js';
import supabaseModule from '../../api/_lib/supabase.js';
import envModule from '../../api/_lib/env.js';
import paymentUtilsModule from '../../api/_lib/payment-utils.js';

const { getStoreConfig } = configModule;
const { initializeTransaction } = paystackModule;
const { createPayment, updatePaymentByReference } = supabaseModule;
const { getEnvVar } = envModule;
const {
  buildDonationSummary,
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
    const donation = buildDonationSummary(payload);
    const config = getStoreConfig();
    const siteBaseUrl = getEnvVar('SITE_BASE_URL');

    if (!siteBaseUrl) {
      throw new Error('SITE_BASE_URL is not configured.');
    }

    const reference = generateReference('donation');
    const metadata = {
      kind: 'donation',
      paymentReference: reference,
      donationAmount: donation.amount,
    };

    await createPayment(buildPaymentRecord({
      kind: 'donation',
      reference,
      customer: donation.donor,
      subtotal: donation.amount,
      total: donation.amount,
      notes: donation.donor.notes,
      metadata,
    }));

    const transaction = await initializeTransaction({
      amount: toSubunits(donation.amount),
      callback_url: `${siteBaseUrl}/api/payments/callback?kind=donation`,
      currency: config.currency,
      email: donation.donor.email,
      metadata: {
        ...metadata,
        customerName: donation.donor.name,
        customerPhone: donation.donor.phone,
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
      error: error.message || 'Unable to start donation checkout.',
      details: error.details || null,
    }, error.statusCode || 500);
  }
};

export const config = {
  path: '/api/checkout/donation',
  preferStatic: true,
};
