const { getRequestUrl, sendRedirect } = require('../_lib/http');
const { verifyTransaction } = require('../_lib/paystack');
const { getPaymentByReference, updatePaymentByReference } = require('../_lib/supabase');
const { mapGatewayStatus, roundMoney, toSubunits } = require('../_lib/payment-utils');

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.statusCode = 405;
    return res.end('Method not allowed.');
  }

  const siteBaseUrl = process.env.SITE_BASE_URL;
  const fallbackTarget = new URL('/payment-cancelled.html', siteBaseUrl);

  try {
    const url = getRequestUrl(req);
    const reference = url.searchParams.get('reference') || url.searchParams.get('trxref');
    const kind = url.searchParams.get('kind') || 'shop';

    if (!reference) {
      fallbackTarget.searchParams.set('reason', 'missing-reference');
      return sendRedirect(res, fallbackTarget.toString());
    }

    const payment = await getPaymentByReference(reference);
    if (!payment) {
      fallbackTarget.searchParams.set('reference', reference);
      fallbackTarget.searchParams.set('reason', 'unknown-reference');
      return sendRedirect(res, fallbackTarget.toString());
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

    return sendRedirect(res, redirectTarget.toString());
  } catch (error) {
    fallbackTarget.searchParams.set('reason', 'verification-error');
    if (error.message) {
      fallbackTarget.searchParams.set('message', error.message);
    }
    return sendRedirect(res, fallbackTarget.toString());
  }
};
