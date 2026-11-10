'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { seedCommittedPolicy } = require('./tariffPublication');

process.env.NODE_ENV = 'test';
process.env.PAKSHO_PRICING_MODE = 'server';
process.env.PAKSHO_QUOTE_SECRET = 'tier-exempt-quote-secret';
process.env.PAKSHO_TARIFF_FILE = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'paksho-tier-exempt-')), 'tariff.json');

const seeded = seedCommittedPolicy(process.env, {
  companyId: 'company-tier-exempt',
  currencyUnit: 'toman',
  versions: [{
    id: 'v1',
    status: 'published',
    validFrom: '2020-01-01T00:00:00.000Z',
    validTo: '2099-01-01T00:00:00.000Z',
    services: {
      open: { model: 'hourly', rate: 1000, minQuantity: 1 },
      locked: { model: 'hourly', rate: 1000, minQuantity: 1, exemptFromTierLock: true },
      staircase_common_areas: { model: 'fixed', rate: 500000 },
    },
  }],
});
if (!seeded.ok) throw new Error(seeded.code);

const { issueOrderQuote, setTierResolver, setDirectRequestResolver, QuoteError } = require('./orderQuote');

setTierResolver((tier) => {
  const basisPoints = { gray: 10000, silver: 11000, gold: 13000 }[tier];
  return basisPoints ? { basisPoints, version: 4 } : null;
});
setDirectRequestResolver(() => ({ basisPoints: 13000, version: 2, windowMinutes: 30 }));

const at = new Date('2026-11-10T08:00:00.000Z');

function inputError(fn) {
  try {
    fn();
    return null;
  } catch (error) {
    return error;
  }
}

test('a service without the flag still takes the silver tier price', () => {
  const quote = issueOrderQuote({ serviceId: 'open', quantity: 2, workerTier: 'silver' }, at);
  assert.equal(quote.total, 2200);
});

test('exemptFromTierLock keeps the base price and rejects a higher tier', () => {
  const gray = issueOrderQuote({ serviceId: 'locked', quantity: 2, workerTier: 'gray' }, at);
  const plain = issueOrderQuote({ serviceId: 'locked', quantity: 2 }, at);
  assert.equal(gray.total, 2000);
  assert.equal(plain.total, 2000);
  const silver = inputError(() => issueOrderQuote({ serviceId: 'locked', quantity: 2, workerTier: 'silver' }, at));
  assert.ok(silver instanceof QuoteError);
  assert.equal(silver.code, 'INPUT_INVALID');
  assert.match(silver.message, /قفل سطح/);
  const gold = inputError(() => issueOrderQuote({ serviceId: 'locked', quantity: 2, workerTier: 'gold' }, at));
  assert.ok(gold instanceof QuoteError);
  assert.equal(gold.code, 'INPUT_INVALID');
});

test('the hardcoded stairs exemption still rejects silver before that list is removed', () => {
  const silver = inputError(() => issueOrderQuote({ serviceId: 'staircase_common_areas', workerTier: 'silver' }, at));
  assert.ok(silver instanceof QuoteError);
  assert.match(silver.message, /راه‌پله/);
  const gray = issueOrderQuote({ serviceId: 'staircase_common_areas', workerTier: 'gray' }, at);
  assert.equal(gray.total, 500000);
});

test('a golden request on an exempt service still uses the independent percent', () => {
  const quote = issueOrderQuote({ serviceId: 'locked', quantity: 2, directRequestWorkerId: 'USER-TARGET' }, at);
  assert.equal(quote.total, 2600);
});
