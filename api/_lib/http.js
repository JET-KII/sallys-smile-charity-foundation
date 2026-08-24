async function readRawBody(req) {
  if (req.body !== undefined && req.body !== null) {
    if (Buffer.isBuffer(req.body)) {
      return req.body;
    }

    if (typeof req.body === 'string') {
      return Buffer.from(req.body);
    }

    return Buffer.from(JSON.stringify(req.body));
  }

  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return Buffer.concat(chunks);
}

async function parseJsonBody(req) {
  const rawBody = await readRawBody(req);

  if (!rawBody.length) {
    return {};
  }

  try {
    return JSON.parse(rawBody.toString('utf8'));
  } catch (error) {
    const parseError = new Error('Invalid JSON body.');
    parseError.statusCode = 400;
    throw parseError;
  }
}

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

function sendRedirect(res, location, statusCode = 302) {
  res.statusCode = statusCode;
  res.setHeader('Location', location);
  res.end();
}

function getRequestUrl(req) {
  const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost';
  const protocol = req.headers['x-forwarded-proto'] || 'https';
  return new URL(req.url, `${protocol}://${host}`);
}

module.exports = {
  getRequestUrl,
  parseJsonBody,
  readRawBody,
  sendJson,
  sendRedirect,
};
