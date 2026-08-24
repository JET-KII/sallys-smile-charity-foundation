const { getEnvVar } = require('./env');

function getSupabaseConfig() {
  const url = getEnvVar('SUPABASE_URL');
  const serviceRoleKey = getEnvVar('SUPABASE_SECRET_KEY') || getEnvVar('SUPABASE_SERVICE_ROLE_KEY');

  if (!url || !serviceRoleKey) {
    throw new Error('Supabase environment variables are not configured. Add SUPABASE_URL and SUPABASE_SECRET_KEY (or legacy SUPABASE_SERVICE_ROLE_KEY).');
  }

  return { url, serviceRoleKey };
}

async function supabaseRequest(table, options = {}) {
  const { url, serviceRoleKey } = getSupabaseConfig();
  const endpoint = new URL(`/rest/v1/${table}`, url);
  const query = options.query || {};

  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      endpoint.searchParams.set(key, String(value));
    }
  });

  const response = await fetch(endpoint, {
    method: options.method || 'GET',
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const text = await response.text();
  let payload = [];

  if (text) {
    try {
      payload = JSON.parse(text);
    } catch (error) {
      payload = text;
    }
  }

  if (!response.ok) {
    const requestError = new Error('Supabase request failed.');
    requestError.statusCode = response.status || 500;
    requestError.details = payload;
    throw requestError;
  }

  return payload;
}

async function createPayment(record) {
  const rows = await supabaseRequest('payments', {
    method: 'POST',
    headers: {
      Prefer: 'return=representation',
    },
    body: record,
  });

  return rows[0] || null;
}

async function insertPaymentItems(items) {
  if (!items.length) {
    return [];
  }

  return supabaseRequest('payment_items', {
    method: 'POST',
    headers: {
      Prefer: 'return=representation',
    },
    body: items,
  });
}

async function getPaymentByReference(reference) {
  const rows = await supabaseRequest('payments', {
    query: {
      reference: `eq.${reference}`,
      select: '*',
      limit: '1',
    },
  });

  return rows[0] || null;
}

async function updatePaymentByReference(reference, patch) {
  const rows = await supabaseRequest('payments', {
    method: 'PATCH',
    headers: {
      Prefer: 'return=representation',
    },
    query: {
      reference: `eq.${reference}`,
      select: '*',
    },
    body: patch,
  });

  return rows[0] || null;
}

async function getPaymentItems(reference) {
  return supabaseRequest('payment_items', {
    query: {
      reference: `eq.${reference}`,
      select: 'sku,title_snapshot,unit_price,quantity,line_total',
      order: 'created_at.asc',
    },
  });
}

module.exports = {
  createPayment,
  getPaymentByReference,
  getPaymentItems,
  insertPaymentItems,
  updatePaymentByReference,
};
