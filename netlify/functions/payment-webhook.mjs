import crypto from 'node:crypto';
import { json } from './_lib/http.mjs';
import paystackModule from '../../api/_lib/paystack.js';
import emailModule from '../../api/_lib/email.js';
import supabaseModule from '../../api/_lib/supabase.js';
import envModule from '../../api/_lib/env.js';
import paymentUtilsModule from '../../api/_lib/payment-utils.js';

const { verifyTransaction } = paystackModule;
const { renderAdminEmail, sendAdminEmail } = emailModule;
const { getPaymentByReference, getPaymentItems, updatePaymentByReference } = supabaseModule;
const { getEnvVar } = envModule;
const { mapGatewayStatus, toSubunits } = paymentUtilsModule;

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

export default async (req) => {
  if (req.method !== 'POST') {
    return json({ ok: false, error: 'Method not allowed.' }, 405);
  }

  try {
    const rawBody = await req.text();
    const signature = req.headers.get('x-paystack-signature');
    const secret = getEnvVar('PAYSTACK_SECRET_KEY');

    if (!isSignatureValid(rawBody, signature, secret)) {
      return json({ ok: false, error: 'Invalid webhook signature.' }, 401);
    }

    const event = JSON.parse(rawBody);
    const reference = event?.data?.reference;

    if (!reference) {
      return json({ ok: true, ignored: true, reason: 'missing-reference' }, 200);
    }

    const payment = await getPaymentByReference(reference);
    if (!payment) {
      return json({ ok: true, ignored: true, reason: 'unknown-reference' }, 200);
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

    return json({ ok: true, status: safeStatus }, 200);
  } catch (error) {
    return json({
      ok: false,
      error: error.message || 'Webhook processing failed.',
      details: error.details || null,
    }, error.statusCode || 500);
  }
};

export const config = {
  path: '/api/payments/webhook',
  preferStatic: true,
};
