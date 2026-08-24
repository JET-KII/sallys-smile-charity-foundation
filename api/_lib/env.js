function getEnvVar(name) {
  if (
    typeof globalThis !== 'undefined' &&
    globalThis.Netlify &&
    globalThis.Netlify.env &&
    typeof globalThis.Netlify.env.get === 'function'
  ) {
    const value = globalThis.Netlify.env.get(name);
    if (value !== undefined && value !== null && value !== '') {
      return value;
    }
  }

  if (typeof process !== 'undefined' && process.env) {
    const fallback = process.env[name];
    if (fallback !== undefined && fallback !== null && fallback !== '') {
      return fallback;
    }
  }

  return undefined;
}

module.exports = {
  getEnvVar,
};
