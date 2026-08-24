export async function readJson(req) {
  try {
    return await req.json();
  } catch (error) {
    const parseError = new Error('Invalid JSON body.');
    parseError.statusCode = 400;
    throw parseError;
  }
}

export function json(payload, status = 200) {
  return Response.json(payload, {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
    },
  });
}

export function redirect(location, status = 302) {
  return new Response(null, {
    status,
    headers: {
      Location: location,
    },
  });
}
