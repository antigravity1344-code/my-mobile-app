'use strict';

// D-80: a company may select only a gateway that has a real server-side adapter.
// The first gateway and merchant account are not chosen yet, so this list stays empty.
const IMPLEMENTED_PAYMENT_PROVIDERS = Object.freeze([]);

function providerById(providers, id) {
  if (typeof id !== 'string') return null;
  return (Array.isArray(providers) ? providers : []).find((provider) => provider && provider.id === id) || null;
}

module.exports = { IMPLEMENTED_PAYMENT_PROVIDERS, providerById };
