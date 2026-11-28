'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { DatabaseSync } = require('node:sqlite');
const { createOrderSmsOutbox, readOrderSmsConfig, sendOrderSms } = require('./orderStatusSms');

const fixture = { api: 'fixture', template: 'paksho-order-created', recipient: '09123456789', orderId: 'ORD-MWXU54ZN-663ed01f' };

test('the order template receives two unpunctuated tracking-code tokens without a sender line', async () => {
  const config = readOrderSmsConfig({
    KAVENEGAR_API_KEY: fixture.api, PAKSHO_ORDER_SMS_CREATED_TEMPLATE: fixture.template,
  });
  assert.deepEqual([...config.enabledKinds], ['ORDER_CREATED']);
  const accepted = await sendOrderSms(config, {
    recipient: fixture.recipient, kind: 'ORDER_CREATED', orderId: fixture.orderId,
  }, async (url, request) => {
    assert.ok(url.endsWith('/verify/lookup.json'));
    assert.equal(request.method, 'POST');
    assert.deepEqual(Object.fromEntries(request.body), {
      receptor: fixture.recipient, template: fixture.template, token: 'MWXU54ZN', token2: '663ed01f', type: 'sms',
    });
    return { ok: true, json: async () => ({ return: { status: 200 }, entries: [{ messageid: 456 }] }) };
  });
  assert.deepEqual(accepted, { state: 'accepted', code: 200, messageId: '456' });
  const skipped = await sendOrderSms(config, {
    recipient: fixture.recipient, kind: 'END_REPORTED', orderId: fixture.orderId,
  }, () => assert.fail('no template is configured for completion'));
  assert.deepEqual(skipped, { state: 'skipped' });
});

test('the outbox queues only enabled events for the customer and dispatches each once', async t => {
  const database = new DatabaseSync(':memory:');
  t.after(() => database.close());
  const queue = createOrderSmsOutbox({
    database, transaction: fn => fn(), getOrder: () => ({ customerId: 'owner' }),
    getUser: () => ({ role: 'CUSTOMER', phone: fixture.recipient }),
    enabledKinds: new Set(['ORDER_CREATED']),
  });
  const row = { id: 'notice-1', orderId: fixture.orderId, userId: 'owner', kind: 'ORDER_CREATED', createdAt: new Date().toISOString() };
  queue.enqueue(row);
  queue.enqueue(row);
  queue.enqueue({ ...row, id: 'notice-2', kind: 'END_REPORTED' });
  queue.enqueue({ ...row, id: 'notice-3', userId: 'worker' });
  assert.equal(await queue.dispatchOne(async job => {
    assert.deepEqual(job, { recipient: fixture.recipient, kind: row.kind, orderId: fixture.orderId });
    return { state: 'accepted', messageId: '456' };
  }), true);
  assert.equal(await queue.dispatchOne(() => assert.fail('unexpected SMS')), false);
});

test('test mode disables all real SMS transport options', () => {
  assert.equal(readOrderSmsConfig({
    NODE_ENV: 'test', KAVENEGAR_API_KEY: fixture.api,
    PAKSHO_ORDER_SMS_CREATED_TEMPLATE: fixture.template, PAKSHO_ORDER_SMS_SENDER: '10001234',
  }), null);
});
