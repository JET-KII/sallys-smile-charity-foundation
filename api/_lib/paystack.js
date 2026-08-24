const { getEnvVar } = require('./env');

const PAYSTACK_API_BASE = 'https://api.paystack.co';

function getPaystackSecretKey() {
  const secret = getEnvVar('PAYSTACK_SECRET_KEY');
  if (!secret) {
    throw new Error('PAYSTACK_SECRET_KEY is not configured.');
  }
  return secret;
}

async function paystackRequest(endpoint, options = {}) {
  const secret = getPaystackSecretKey();
  const response = await fetch(`${PAYSTACK_API_BASE}${endpoint}`, {
    method: options.method || 'GET',
    headers: {
      Authorization: `Bearer ${secret}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    body: options.body,
  });

  const text = await response.text();
  let payload = {};

  if (text) {
    try {
      payload = JSON.parse(text);
    } catch (error) {
      payload = { message: text };
    }
  }

  if (!response.ok || payload.status === false) {
    const message = payload.message || `Paystack request failed with status ${response.status}.`;
    const requestError = new Error(message);
    requestError.statusCode = response.status || 502;
    requestError.details = payload;
    throw requestError;
  }

  return payload;
}

async function initializeTransaction(payload) {
  const result = await paystackRequest('/transaction/initialize', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

  return result.data;
}

async function verifyTransaction(reference) {
  const result = await paystackRequest(`/transaction/verify/${encodeURIComponent(reference)}`);
  return result.data;
}

module.exports = {
  initializeTransaction,
  verifyTransaction,
};
