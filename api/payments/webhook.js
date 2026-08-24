const crypto = require('crypto');
const { readRawBody, sendJson } = require('../_lib/http');
const { verifyTransaction } = require('../_lib/paystack');
const { renderAdminEmail, sendAdminEmail } = require('../_lib/email');
const { getPaymentByReference, getPaymentItems, updatePaymentByReference } = require('../_lib/supabase');
const { mapGatewayStatus, toSubunits } = require('../_lib/payment-utils');

function isSignatureValid(rawBody, signature, secret) {
  if (!signature || !secret) {
    return false;
  }

  const expected = crypto.createHmac('sha512', secret).update(rawBody).digest('hex');
  const expectedBuffer = Buffer.from(expected, 'utf8');
  const receivedBuffer = Buffer.from(signature, 'utf8');

  if (expectedBuffer.length !== receivedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return sendJson(res, 405, { ok: false, error: 'Method not allowed.' });
  }

  try {
    const rawBody = await readRawBody(req);
    const signature = req.headers['x-paystack-signature'];
    const secret = process.env.PAYSTACK_SECRET_KEY;

    if (!isSignatureValid(rawBody, signature, secret)) {
      return sendJson(res, 401, { ok: false, error: 'Invalid webhook signature.' });
    }

    const event = JSON.parse(rawBody.toString('utf8'));
    const reference = event?.data?.reference;

    if (!reference) {
      return sendJson(res, 200, { ok: true, ignored: true, reason: 'missing-reference' });
    }

    const payment = await getPaymentByReference(reference);
    if (!payment) {
      return sendJson(res, 200, { ok: true, ignored: true, reason: 'unknown-reference' });
    }

    const transaction = await verifyTransaction(reference);
    const computedStatus = mapGatewayStatus(transaction.status);
    const amountMatches = Number(transaction.amount) === toSubunits(payment.total);
    const currencyMatches = String(transaction.currency || '').toUpperCase() === String(payment.currency || 'GHS').toUpperCase();
    const safeStatus = amountMatches && currencyMatches ? computedStatus : 'review';
    const alreadyNotified = Boolean(payment.admin_notified_at);

    const updatedPayment = await updatePaymentByReference(reference, {
      status: safeStatus,
      paystack_status: transaction.status,
      paystack_transaction_id: transaction.id,
      paystack_customer_code: transaction.customer?.customer_code || null,
      verified_at: safeStatus === 'paid' ? new Date().toISOString() : payment.verified_at,
      metadata: {
        ...(payment.metadata || {}),
        amountMatched: amountMatches,
        currencyMatched: currencyMatches,
        lastWebhookEvent: event.event,
        gatewayResponse: transaction.gateway_response || null,
      },
    });

    if (safeStatus === 'paid' && !alreadyNotified) {
      const items = payment.kind === 'shop' ? await getPaymentItems(reference) : [];
      const emailPayload = renderAdminEmail(updatedPayment || payment, items);
      const emailResult = await sendAdminEmail(emailPayload);

      if (emailResult.sent) {
        await updatePaymentByReference(reference, {
          admin_notified_at: new Date().toISOString(),
        });
      }
    }

    return sendJson(res, 200, { ok: true, status: safeStatus });
  } catch (error) {
    return sendJson(res, error.statusCode || 500, {
      ok: false,
      error: error.message || 'Webhook processing failed.',
      details: error.details || null,
    });
  }
};
