'use strict';

// One company per deployment. Production never falls back to client-supplied prices.
function resolvePricingMode(env = process.env) {
  const nodeEnv = env && env.NODE_ENV;
  const requested = env && typeof env.PAKSHO_PRICING_MODE === 'string'
    ? env.PAKSHO_PRICING_MODE.trim()
    : '';
  if (nodeEnv === 'production') return 'server';
  if (requested === 'server') return 'server';
  if (requested === 'legacy' && (nodeEnv === 'test' || nodeEnv === 'development')) return 'legacy';
  if (requested === '' && nodeEnv === 'test') return 'legacy';
  return 'server';
}

module.exports = { resolvePricingMode };
