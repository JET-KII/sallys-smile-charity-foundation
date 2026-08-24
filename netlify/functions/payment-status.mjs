import { json } from './_lib/http.mjs';
import supabaseModule from '../../api/_lib/supabase.js';
import paymentUtilsModule from '../../api/_lib/payment-utils.js';

const { getPaymentByReference, getPaymentItems } = supabaseModule;
const { sanitizePayment } = paymentUtilsModule;

export default async (req) => {
  if (req.method !== 'GET') {
    return json({ ok: false, error: 'Method not allowed.' }, 405);
  }

  try {
    const url = new URL(req.url);
    const reference = url.searchParams.get('reference');

    if (!reference) {
      return json({ ok: false, error: 'A payment reference is required.' }, 400);
    }

    const payment = await getPaymentByReference(reference);
    if (!payment) {
      return json({ ok: false, error: 'Payment record not found.' }, 404);
    }

    const items = payment.kind === 'shop' ? await getPaymentItems(reference) : [];
    return json({
      ok: true,
      payment: sanitizePayment(payment, items),
    });
  } catch (error) {
    return json({
      ok: false,
      error: error.message || 'Unable to load payment status.',
    }, error.statusCode || 500);
  }
};

export const config = {
  path: '/api/payments/status',
  preferStatic: true,
};
