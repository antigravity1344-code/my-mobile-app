'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { confirmOrderQuote, issueOrderQuote } = require('./orderQuote');
const { seedCommittedPolicy } = require('./tariffPublication');

process.env.NODE_ENV = 'test';
process.env.PAKSHO_PRICING_MODE = 'server';
process.env.PAKSHO_QUOTE_SECRET = 'stage2-isolated-quote-secret';
const tariffDir = fs.mkdtempSync(path.join(os.tmpdir(), 'paksho-d60-stage2-tariff-'));
const tariffPath = path.join(tariffDir, 'tariff.json');
process.env.PAKSHO_TARIFF_FILE = tariffPath;

const { createTestHarness, request } = require('../testAuthHarness');

const FROM = '2020-01-01T00:00:00.000Z';
const TO = '2099-01-01T00:00:00.000Z';
const NO_TARIFF = 'تعرفه این خدمت هنوز تعیین نشده است.';

function writeTariff(versions) {
  const seeded = seedCommittedPolicy(process.env, {
    companyId: 'company-isolated',
    currencyUnit: 'minor',
    versions,
  });
  if (!seeded.ok) throw new Error(seeded.code);
}

function published(id, services, window = {}) {
  return {
    id,
    status: 'published',
    validFrom: window.validFrom || FROM,
    validTo: window.validTo || TO,
    services,
  };
}

function baseTariff() {
  writeTariff([published('v-published', {
    hourly: { model: 'hourly', rate: 1000 },
    fixed: { model: 'fixed', rate: 2500 },
    count: { model: 'count', rate: 300 },
    area: { model: 'area', rate: 4 },
    extra: {
      model: 'fixed',
      rate: 1000,
      surcharges: [{ id: 'tools', optionId: 'tools', amount: 50 }],
      discounts: [{ id: 'early', basisPoints: 1000 }],
    },
    round: {
      model: 'hourly',
      rate: 1,
      factors: [{ id: 'outer', optionId: 'place', equals: 'outer', basisPoints: 15000 }],
    },
  })]);
}

function orderBody(token, total, extra = {}) {
  return {
    serviceTitle: 'خدمت آزمایشی',
    address: 'آدرس ساختگی',
    date: '1405-01-01',
    time: '10:00',
    quoteToken: token,
    confirmedTotal: total,
    ...extra,
  };
}

test('server quote and confirmed order use the deployment tariff', async (t) => {
  baseTariff();
  const harness = createTestHarness('paksho-d60-stage2-');
const { store } = harness;
const activeCompletionPolicy = store.completionPolicy.read();
assert.equal(store.completionPolicy.publish({ mode: 'worker_only', expectedVersion: activeCompletionPolicy.version }).code, 'ok');
function completionPayload(orderId) {
  const order = store.getOrder(orderId);
  return {
    acceptanceKey: store.completionAcceptanceKey(order) || 'legacy-invalid-acceptance',
    actualHours: Number(order && order.durationHours) > 0 ? Number(order.durationHours) : null,
    finalAmount: Number.isSafeInteger(order && order.price) ? order.price : 0,
  };
}

  t.after(() => harness.close());
  const server = await harness.serverFor(t);
  const customer = await harness.login(server, '09120000111');
  const workerLogin = await harness.login(server, '09120000112', 'WORKER');
  const worker = harness.store.getUser(workerLogin.user.id);
  worker.status = 'APPROVED';
  harness.store.updateUser(worker);

  async function quote(body) {
    return request(server, {
      method: 'POST', pathname: '/api/pricing/quote', token: customer.token, body,
    });
  }
  async function place(body) {
    return request(server, {
      method: 'POST', pathname: '/api/orders', token: customer.token, body,
    });
  }
  async function orders() {
    const response = await request(server, { method: 'GET', pathname: '/api/orders', token: customer.token });
    assert.equal(response.status, 200);
    return response.json.orders;
  }
  async function notifications() {
    const response = await request(server, { method: 'GET', pathname: '/api/notifications', token: customer.token });
    assert.equal(response.status, 200);
    return response.json.notifications;
  }

  const anonymous = await request(server, { method: 'POST', pathname: '/api/pricing/quote', body: { serviceId: 'hourly', quantity: 1 } });
  assert.equal(anonymous.status, 401);

  const workerQuote = await request(server, {
    method: 'POST', pathname: '/api/pricing/quote', token: workerLogin.token, body: { serviceId: 'hourly', quantity: 1 },
  });
  assert.equal(workerQuote.status, 403);

  const hourly = await quote({ serviceId: 'hourly', quantity: 2 });
  assert.equal(hourly.status, 200);
  assert.equal(hourly.json.quote.total, 2000);
  assert.equal(hourly.json.quote.subtotal, 2000);
  assert.equal(hourly.json.quote.currencyUnit, 'minor');
  assert.equal(hourly.json.quote.tariffVersionId, 'v-published');
  assert.equal(typeof hourly.json.quote.quoteToken, 'string');
  assert.equal(Object.hasOwn(hourly.json.quote, 'companyId'), false);
  assert.equal(JSON.stringify(hourly.json.quote).includes('"rate"'), false);

  const fixed = await quote({ serviceId: 'fixed' });
  assert.equal(fixed.json.quote.total, 2500);
  const counted = await quote({ serviceId: 'count', quantity: 3 });
  assert.equal(counted.json.quote.total, 900);
  const area = await quote({ serviceId: 'area', quantity: 3 });
  assert.equal(area.json.quote.total, 12);
  const extra = await quote({ serviceId: 'extra', options: { tools: true } });
  assert.equal(extra.json.quote.subtotal, 1050);
  assert.deepEqual(extra.json.quote.surcharges, [{ id: 'tools', amount: 50 }]);
  assert.deepEqual(extra.json.quote.discounts, [{ id: 'early', amount: 105 }]);
  assert.equal(extra.json.quote.total, 945);
  const rounded = await quote({ serviceId: 'round', quantity: 1, options: { place: 'outer' } });
  assert.equal(rounded.json.quote.total, 2);

  const ignoredClientPrice = await quote({ serviceId: 'hourly', quantity: 2, price: 1, pricing: { total: 1 } });
  assert.equal(ignoredClientPrice.status, 200);
  assert.equal(ignoredClientPrice.json.quote.total, 2000);

  const created = await place(orderBody(hourly.json.quote.quoteToken, 2000, {
    serviceId: 'hourly', quantity: 2, durationHours: 2, clientRequestId: 'stage2ok01',
  }));
  assert.equal(created.status, 200);
  assert.equal(created.json.order.price, 2000);
  assert.equal(created.json.order.pricing.source, 'server');
  assert.equal(created.json.order.pricing.tariffVersionId, 'v-published');
  assert.equal(created.json.order.pricing.total, 2000);
  const createdNotifications = await notifications();
  assert.equal(createdNotifications.some((item) => item.orderId === created.json.order.id), true);

  const repeated = await place(orderBody(hourly.json.quote.quoteToken, 2000, {
    serviceId: 'hourly', quantity: 2, clientRequestId: 'stage2ok01',
  }));
  assert.equal(repeated.status, 200);
  assert.equal(repeated.json.duplicate, true);
  assert.equal(repeated.json.order.id, created.json.order.id);
  assert.equal(repeated.json.order.price, 2000);
  assert.equal((await orders()).filter((order) => order.id === created.json.order.id).length, 1);

  const conflictBefore = (await orders()).find((order) => order.id === created.json.order.id).price;
  const conflict = await place(orderBody(fixed.json.quote.quoteToken, 2500, {
    serviceId: 'fixed', clientRequestId: 'stage2ok01',
  }));
  assert.equal(conflict.status, 409);
  assert.equal(conflict.json.code, 'ORDER_REQUEST_CONFLICT');
  assert.equal((await orders()).find((order) => order.id === created.json.order.id).price, conflictBefore);

  const beforeFailure = (await notifications()).length;
  const beforeOrders = (await orders()).length;
  const tampered = await place(orderBody(hourly.json.quote.quoteToken, 1, {
    serviceId: 'hourly', quantity: 2, price: 1,
  }));
  assert.equal(tampered.status, 400);
  assert.equal(tampered.json.code, 'PRICE_NOT_CONFIRMED');
  assert.equal((await orders()).length, beforeOrders);
  assert.equal((await notifications()).length, beforeFailure);

  const missingConfirmation = await place(orderBody(hourly.json.quote.quoteToken, 2000, {
    serviceId: 'hourly', quantity: 2, confirmedTotal: undefined,
  }));
  assert.equal(missingConfirmation.status, 400);

  const rejectedCompany = await quote({ serviceId: 'hourly', quantity: 1, companyId: 'other-company' });
  assert.equal(rejectedCompany.status, 400);
  assert.equal(rejectedCompany.json.code, 'INPUT_INVALID');
  const rejectedDate = await quote({ serviceId: 'hourly', quantity: 1, at: '2098-01-01T00:00:00.000Z' });
  assert.equal(rejectedDate.status, 400);
  const rejectedOption = await quote({ serviceId: 'hourly', quantity: 1, options: { unpaid: true } });
  assert.equal(rejectedOption.status, 400);
  const unknownService = await quote({ serviceId: 'missing-service', quantity: 1 });
  assert.equal(unknownService.status, 409);
  assert.equal(unknownService.json.message, NO_TARIFF);

  writeTariff([published('v-expired', { hourly: { model: 'hourly', rate: 1000 } }, { validTo: '2020-02-01T00:00:00.000Z' })]);
  const expired = await quote({ serviceId: 'hourly', quantity: 1 });
  assert.equal(expired.status, 409);
  assert.equal(expired.json.message, NO_TARIFF);
  writeTariff([{ id: 'v-draft', status: 'draft', validFrom: FROM, validTo: TO, services: { hourly: { model: 'hourly', rate: 1000 } } }]);
  const draft = await quote({ serviceId: 'hourly', quantity: 1 });
  assert.equal(draft.status, 409);
  assert.equal(draft.json.message, NO_TARIFF);
  fs.rmSync(tariffPath, { force: true });
  const absent = await quote({ serviceId: 'hourly', quantity: 1 });
  assert.equal(absent.status, 409);
  assert.equal(absent.json.code, 'NO_TARIFF');
  assert.equal(absent.json.message, NO_TARIFF);
  const absentOrder = await place({ serviceId: 'hourly', quantity: 1, price: 150000, address: 'آدرس ساختگی', date: '1405-01-01', time: '10:00' });
  assert.equal(absentOrder.status, 409);
  assert.equal(absentOrder.json.message, NO_TARIFF);
  assert.equal((await orders()).some((order) => order.price === 150000), false);

  baseTariff();
  const firstHourly = await quote({ serviceId: 'hourly', quantity: 2 });
  writeTariff([published('v-next', { hourly: { model: 'hourly', rate: 10 } })]);
  const changed = await place(orderBody(firstHourly.json.quote.quoteToken, 2000, { serviceId: 'hourly', quantity: 2 }));
  assert.equal(changed.status, 409);
  assert.equal(changed.json.code, 'PRICE_CHANGED');
  const requoted = await quote({ serviceId: 'hourly', quantity: 2 });
  assert.equal(requoted.json.quote.total, 20);
  assert.equal(requoted.json.quote.tariffVersionId, 'v-next');
  const oldVersion = await place(orderBody(firstHourly.json.quote.quoteToken, 20, { serviceId: 'hourly', quantity: 2 }));
  assert.equal(oldVersion.status, 409);
  assert.equal(oldVersion.json.code, 'PRICE_CHANGED');
  const confirmedNew = await place(orderBody(requoted.json.quote.quoteToken, 20, {
    serviceId: 'hourly', quantity: 2, clientRequestId: 'stage2new01',
  }));
  assert.equal(confirmedNew.status, 200);
  assert.equal(confirmedNew.json.order.price, 20);

  const expiredQuote = await quote({ serviceId: 'hourly', quantity: 2 });
  assert.throws(
    () => confirmOrderQuote({
      serviceId: 'hourly',
      quantity: 2,
      quoteToken: expiredQuote.json.quote.quoteToken,
      confirmedTotal: 20,
    }, new Date(Date.now() + 16 * 60 * 1000)),
    (error) => error.code === 'QUOTE_EXPIRED',
  );

  process.env.PAKSHO_PRICING_MODE = 'legacy';
  const historical = await place({
    serviceTitle: 'سفارش قدیمی آزمایشی',
    address: 'آدرس ساختگی',
    date: '1405-01-01',
    time: '11:00',
    price: 150000,
    clientRequestId: 'legacykey1',
  });
  assert.equal(historical.status, 200);
  assert.equal(historical.json.order.price, 150000);
  const historicalRepeat = await place({
    serviceTitle: 'سفارش قدیمی آزمایشی',
    address: 'آدرس ساختگی',
    date: '1405-01-01',
    time: '11:00',
    price: 180000,
    clientRequestId: 'legacykey1',
  });
  assert.equal(historicalRepeat.status, 200);
  assert.equal(historicalRepeat.json.duplicate, true);
  assert.equal(historicalRepeat.json.order.price, 150000);
  process.env.PAKSHO_PRICING_MODE = 'server';
  baseTariff();
  const afterLegacy = (await orders()).find((order) => order.id === historical.json.order.id);
  assert.equal(afterLegacy.price, 150000);

  const secure = (await orders()).find((order) => order.id === created.json.order.id);
  assert.equal(secure.price, 2000);
  const accepted = await request(server, {
    method: 'PUT', pathname: '/api/orders/' + secure.id + '/accept', token: workerLogin.token, body: { price: 1 },
  });
  assert.equal(accepted.status, 200);
  assert.equal(accepted.json.order.price, 2000);
  const started = await request(server, {
    method: 'PUT', pathname: '/api/orders/' + secure.id + '/start', token: workerLogin.token, body: { price: 1, acceptanceKey: 'not-the-key' },
  });
  assert.notEqual(started.status, 200);
  assert.equal((await orders()).find((order) => order.id === secure.id).price, 2000);
  const completed = await request(server, {
    method: 'PUT', pathname: '/api/orders/' + secure.id + '/complete', token: workerLogin.token, body: { ...completionPayload(secure.id), price: 1 },
  });
  assert.equal(completed.status, 400);
  assert.equal((await orders()).find((order) => order.id === secure.id).price, 2000);
  assert.equal((await orders()).find((order) => order.id === secure.id).status, 'ACCEPTED');

  const cancelQuote = await quote({ serviceId: 'fixed' });
  const cancelOrder = await place(orderBody(cancelQuote.json.quote.quoteToken, 2500, {
    serviceId: 'fixed', clientRequestId: 'stage2cancel',
  }));
  assert.equal(cancelOrder.status, 200);
  const cancelled = await request(server, {
    method: 'PUT', pathname: '/api/orders/' + cancelOrder.json.order.id + '/cancel', token: customer.token, body: { price: 1, reason: 'آزمایش' },
  });
  assert.equal(cancelled.status, 200);
  assert.equal(cancelled.json.order.price, 2500);
  assert.equal(cancelled.json.order.status, 'CANCELLED');

  const nodeEnv = process.env.NODE_ENV;
  const mode = process.env.PAKSHO_PRICING_MODE;
  const file = process.env.PAKSHO_TARIFF_FILE;
  process.env.NODE_ENV = 'production';
  process.env.PAKSHO_PRICING_MODE = 'legacy';
  delete process.env.PAKSHO_TARIFF_FILE;
  const ordersBeforeProduction = (await orders()).length;
  const productionLegacy = await place({
    serviceId: 'hourly', quantity: 1, price: 150000, address: 'آدرس ساختگی', date: '1405-01-01', time: '12:00',
  });
  assert.notEqual(productionLegacy.status, 200);
  assert.equal(productionLegacy.json.message, NO_TARIFF);
  assert.equal((await orders()).length, ordersBeforeProduction);
  process.env.NODE_ENV = nodeEnv;
  process.env.PAKSHO_PRICING_MODE = mode;
  process.env.PAKSHO_TARIFF_FILE = file;
  baseTariff();

  // The first write commits, but its response never reaches the client.
  const lostQuote = await quote({ serviceId: 'hourly', quantity: 2 });
  const lostBody = orderBody(lostQuote.json.quote.quoteToken, 2000, {
    serviceId: 'hourly', quantity: 2, clientRequestId: 'stage2lostresponse',
  });
  const beforeLostIds = new Set((await orders()).map((order) => order.id));
  const lostResponse = await request(server, {
    method: 'POST', pathname: '/api/orders', token: customer.token,
    body: lostBody, loseResponse: true,
  });
  assert.equal(lostResponse.responseLost, true);
  const committedAfterLoss = await orders();
  assert.equal(committedAfterLoss.length, beforeLostIds.size + 1);
  const committedLostOrder = committedAfterLoss.find((order) => !beforeLostIds.has(order.id));
  assert.equal(committedLostOrder.price, 2000);
  const notesAfterLoss = (await notifications()).length;
  const recoveredLost = await place(lostBody);
  assert.equal(recoveredLost.status, 200);
  assert.equal(recoveredLost.json.duplicate, true);
  assert.equal(recoveredLost.json.order.id, committedLostOrder.id);
  assert.equal(recoveredLost.json.order.price, 2000);
  assert.equal((await orders()).length, committedAfterLoss.length);
  assert.equal((await notifications()).length, notesAfterLoss);

  const replayQuote = await quote({ serviceId: 'hourly', quantity: 2 });
  const replayed = await place(orderBody(replayQuote.json.quote.quoteToken, 2000, {
    serviceId: 'hourly', quantity: 2, clientRequestId: 'stage2replay1',
  }));
  assert.equal(replayed.status, 200);
  const replayId = replayed.json.order.id;
  const replayCount = (await orders()).length;
  const replayNotes = (await notifications()).length;
  const staleQuote = issueOrderQuote(
    { serviceId: 'hourly', quantity: 2 },
    new Date(Date.now() - 16 * 60 * 1000),
  );
  const afterExpiry = await place(orderBody(staleQuote.quoteToken, 2000, {
    serviceId: 'hourly', quantity: 2, clientRequestId: 'stage2replay1',
  }));
  assert.equal(afterExpiry.status, 200);
  assert.equal(afterExpiry.json.duplicate, true);
  assert.equal(afterExpiry.json.order.id, replayId);
  assert.equal(afterExpiry.json.order.price, 2000);

  writeTariff([published('v-changed', { hourly: { model: 'hourly', rate: 5 } })]);
  const afterTariffChange = await place(orderBody(staleQuote.quoteToken, 2000, {
    serviceId: 'hourly', quantity: 2, clientRequestId: 'stage2replay1',
  }));
  assert.equal(afterTariffChange.status, 200);
  assert.equal(afterTariffChange.json.order.id, replayId);
  assert.equal(afterTariffChange.json.order.price, 2000);

  fs.rmSync(tariffPath, { force: true });
  const afterTariffDeletion = await place(orderBody(staleQuote.quoteToken, 2000, {
    serviceId: 'hourly', quantity: 2, clientRequestId: 'stage2replay1',
  }));
  assert.equal(afterTariffDeletion.status, 200);
  assert.equal(afterTariffDeletion.json.order.id, replayId);
  assert.equal(afterTariffDeletion.json.order.price, 2000);
  assert.equal((await orders()).length, replayCount);
  assert.equal((await notifications()).length, replayNotes);

  baseTariff();
  const differentQuote = await quote({ serviceId: 'fixed' });
  const differentRequest = await place(orderBody(differentQuote.json.quote.quoteToken, 2500, {
    serviceId: 'fixed', clientRequestId: 'stage2replay1',
  }));
  assert.equal(differentRequest.status, 409);
  assert.equal(differentRequest.json.code, 'ORDER_REQUEST_CONFLICT');
  assert.equal((await orders()).find((order) => order.id === replayId).price, 2000);
  assert.equal((await orders()).length, replayCount);

  const expiredNew = await place(orderBody(staleQuote.quoteToken, 2000, {
    serviceId: 'hourly', quantity: 2, clientRequestId: 'stage2expired',
  }));
  assert.equal(expiredNew.status, 409);
  assert.equal(expiredNew.json.code, 'QUOTE_EXPIRED');
  const expiredWithoutKey = await place(orderBody(staleQuote.quoteToken, 2000, {
    serviceId: 'hourly', quantity: 2,
  }));
  assert.equal(expiredWithoutKey.status, 409);
  assert.equal(expiredWithoutKey.json.code, 'QUOTE_EXPIRED');
  const bypass = await place({
    serviceId: 'hourly', quantity: 2, price: 150000, confirmedTotal: 2000,
    quoteToken: staleQuote.quoteToken, address: 'آدرس ساختگی', date: '1405-01-01', time: '10:00',
    clientRequestId: 'stage2bypass',
  });
  assert.equal(bypass.status, 409);
  assert.equal(bypass.json.code, 'QUOTE_EXPIRED');
  assert.equal((await orders()).some((order) => order.price === 150000 && order.id !== historical.json.order.id), false);
  assert.equal((await orders()).length, replayCount);
  assert.equal((await notifications()).length, replayNotes);

  const oversized = await place(orderBody('x'.repeat(40000), 2000, {
    serviceId: 'hourly', quantity: 2, clientRequestId: 'stage2replay1',
  }));
  assert.equal(oversized.status, 400);
  assert.equal(oversized.json.code, 'QUOTE_INVALID');
  assert.equal((await orders()).find((order) => order.id === replayId).price, 2000);

  const otherCustomer = await harness.login(server, '09120000113');
  const otherReplay = await request(server, {
    method: 'POST', pathname: '/api/orders', token: otherCustomer.token,
    body: orderBody(staleQuote.quoteToken, 2000, {
      serviceId: 'hourly', quantity: 2, clientRequestId: 'stage2replay1',
    }),
  });
  assert.equal(otherReplay.status, 409);
  assert.equal(otherReplay.json.code, 'QUOTE_EXPIRED');
  const otherOrders = await request(server, { method: 'GET', pathname: '/api/orders', token: otherCustomer.token });
  assert.equal(otherOrders.json.orders.some((order) => order.id === replayId), false);

  const legacyBefore = (await orders()).find((order) => order.id === historical.json.order.id);
  assert.equal(legacyBefore.price, 150000);
  const legacyStatus = legacyBefore.status;
  const legacyCount = (await orders()).length;
  const legacyNotes = (await notifications()).length;
  const emptyLegacyReplay = await place({ clientRequestId: 'legacykey1' });
  assert.equal(emptyLegacyReplay.status, 409);
  assert.equal(emptyLegacyReplay.json.code, 'ORDER_REQUEST_CONFLICT');
  assert.equal(emptyLegacyReplay.json.duplicate, undefined);
  const differentLegacyAmount = await place({
    clientRequestId: 'legacykey1', price: 180000, address: 'آدرس ساختگی', date: '1405-01-01', time: '11:00',
  });
  assert.equal(differentLegacyAmount.status, 409);
  assert.equal(differentLegacyAmount.json.code, 'ORDER_REQUEST_CONFLICT');
  const differentLegacyService = await place(orderBody((await quote({ serviceId: 'fixed' })).json.quote.quoteToken, 2500, {
    serviceId: 'fixed', clientRequestId: 'legacykey1',
  }));
  assert.equal(differentLegacyService.status, 409);
  assert.equal(differentLegacyService.json.code, 'ORDER_REQUEST_CONFLICT');
  const legacyAfter = (await orders()).find((order) => order.id === historical.json.order.id);
  assert.equal(legacyAfter.price, 150000);
  assert.equal(legacyAfter.status, legacyStatus);
  assert.equal((await orders()).length, legacyCount);
  assert.equal((await notifications()).length, legacyNotes);

  process.env.PAKSHO_PRICING_MODE = 'legacy';
  const legacyAgain = await place({
    serviceTitle: 'سفارش قدیمی آزمایشی', address: 'آدرس ساختگی', date: '1405-01-01', time: '11:00',
    price: 180000, clientRequestId: 'legacykey1',
  });
  assert.equal(legacyAgain.status, 200);
  assert.equal(legacyAgain.json.duplicate, true);
  assert.equal(legacyAgain.json.order.price, 150000);
  process.env.PAKSHO_PRICING_MODE = 'server';
  baseTariff();
});
