import { redirect } from './_lib/http.mjs';
import paystackModule from '../../api/_lib/paystack.js';
import supabaseModule from '../../api/_lib/supabase.js';
import envModule from '../../api/_lib/env.js';
import paymentUtilsModule from '../../api/_lib/payment-utils.js';

const { verifyTransaction } = paystackModule;
const { getPaymentByReference, updatePaymentByReference } = supabaseModule;
const { getEnvVar } = envModule;
const { mapGatewayStatus, roundMoney, toSubunits } = paymentUtilsModule;

export default async (req) => {
  if (req.method !== 'GET') {
    return new Response('Method not allowed.', { status: 405 });
  }

  const siteBaseUrl = getEnvVar('SITE_BASE_URL');

  if (!siteBaseUrl) {
    return new Response('SITE_BASE_URL is not configured.', { status: 500 });
  }

  const fallbackTarget = new URL('/payment-cancelled.html', siteBaseUrl);

  try {
    const url = new URL(req.url);
    const reference = url.searchParams.get('reference') || url.searchParams.get('trxref');
    const kind = url.searchParams.get('kind') || 'shop';

    if (!reference) {
      fallbackTarget.searchParams.set('reason', 'missing-reference');
      return redirect(fallbackTarget.toString());
    }

    const payment = await getPaymentByReference(reference);
    if (!payment) {
      fallbackTarget.searchParams.set('reference', reference);
      fallbackTarget.searchParams.set('reason', 'unknown-reference');
      return redirect(fallbackTarget.toString());
    }

    const transaction = await verifyTransaction(reference);
    const computedStatus = mapGatewayStatus(transaction.status);
    const expectedAmount = toSubunits(payment.total);
    const amountMatches = Number(transaction.amount) === expectedAmount;
    const currencyMatches = String(transaction.currency || '').toUpperCase() === String(payment.currency || 'GHS').toUpperCase();
    const safeStatus = amountMatches && currencyMatches ? computedStatus : 'review';
    const metadata = {
      ...(payment.metadata || {}),
      amountMatched: amountMatches,
      currencyMatched: currencyMatches,
      gatewayResponse: transaction.gateway_response || null,
    };

    await updatePaymentByReference(reference, {
      status: safeStatus,
      paystack_status: transaction.status,
      paystack_transaction_id: transaction.id,
      paystack_customer_code: transaction.customer?.customer_code || null,
      verified_at: safeStatus === 'paid' ? new Date().toISOString() : payment.verified_at,
      metadata,
    });

    const redirectTarget = new URL(
      safeStatus === 'paid' ? '/payment-success.html' : '/payment-cancelled.html',
      siteBaseUrl,
    );
    redirectTarget.searchParams.set('reference', reference);
    redirectTarget.searchParams.set('kind', payment.kind || kind);
    redirectTarget.searchParams.set('status', safeStatus);
    redirectTarget.searchParams.set('amount', roundMoney(payment.total).toFixed(2));

    return redirect(redirectTarget.toString());
  } catch (error) {
    fallbackTarget.searchParams.set('reason', 'verification-error');
    if (error.message) {
      fallbackTarget.searchParams.set('message', error.message);
    }
    return redirect(fallbackTarget.toString());
  }
};

export const config = {
  path: '/api/payments/callback',
  preferStatic: true,
};
