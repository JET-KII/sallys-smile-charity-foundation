const { getStoreConfig } = require('../_lib/config');
const { parseJsonBody, sendJson } = require('../_lib/http');
const { initializeTransaction } = require('../_lib/paystack');
const { createPayment, updatePaymentByReference } = require('../_lib/supabase');
const { buildDonationSummary, buildPaymentRecord, generateReference, toSubunits } = require('../_lib/payment-utils');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return sendJson(res, 405, { ok: false, error: 'Method not allowed.' });
  }

  try {
    const payload = await parseJsonBody(req);
    const donation = buildDonationSummary(payload);
    const config = getStoreConfig();
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
      callback_url: `${process.env.SITE_BASE_URL}/api/payments/callback?kind=donation`,
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

    return sendJson(res, 200, {
      ok: true,
      checkoutUrl: transaction.authorization_url,
      reference,
    });
  } catch (error) {
    return sendJson(res, error.statusCode || 500, {
      ok: false,
      error: error.message || 'Unable to start donation checkout.',
      details: error.details || null,
    });
  }
};
