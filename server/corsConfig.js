'use strict';

function corsOptionsFromEnv(env) {
  const configured = env.PAKSHO_CORS_ORIGINS?.trim();
  if (!configured) return {};

  const origins = configured.split(',').map((value) => value.trim());
  for (const origin of origins) {
    const url = URL.parse(origin);
    if (!url || !['http:', 'https:'].includes(url.protocol) || url.origin !== origin) {
      throw new Error('PAKSHO_CORS_ORIGINS must contain comma-separated HTTP(S) origins without paths.');
    }
  }
  return { origin: origins };
}

module.exports = { corsOptionsFromEnv };
