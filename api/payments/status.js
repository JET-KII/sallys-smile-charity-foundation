const { getRequestUrl, sendJson } = require('../_lib/http');
const { getPaymentByReference, getPaymentItems } = require('../_lib/supabase');
const { sanitizePayment } = require('../_lib/payment-utils');

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return sendJson(res, 405, { ok: false, error: 'Method not allowed.' });
  }

  try {
    const url = getRequestUrl(req);
    const reference = url.searchParams.get('reference');

    if (!reference) {
      return sendJson(res, 400, { ok: false, error: 'A payment reference is required.' });
    }

    const payment = await getPaymentByReference(reference);
    if (!payment) {
      return sendJson(res, 404, { ok: false, error: 'Payment record not found.' });
    }

    const items = payment.kind === 'shop' ? await getPaymentItems(reference) : [];
    return sendJson(res, 200, {
      ok: true,
      payment: sanitizePayment(payment, items),
    });
  } catch (error) {
    return sendJson(res, error.statusCode || 500, {
      ok: false,
      error: error.message || 'Unable to load payment status.',
    });
  }
};
