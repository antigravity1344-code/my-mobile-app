const { isMainThread, workerData, parentPort, Worker } = require('node:worker_threads');

if (!isMainThread) {
  const { createDataStore } = require('./dataStore');
  const db = createDataStore(workerData.sqlite);
  const result = db.finalizeCancelRequest(workerData.orderId, { actor: workerData.actor });
  const penalty = db.listLedger(workerData.customerId).filter((row) => row.reasonCode === 'cancel_penalty');
  db.close();
  parentPort.postMessage({ code: result.code, penalties: penalty.length });
} else {
  const { test } = require('node:test');
  const assert = require('node:assert/strict');
  const crypto = require('node:crypto');
  const fs = require('node:fs');
  const os = require('node:os');
  const path = require('node:path');

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'paksho-cancel-'));
  process.env.PAKSHO_DATA_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
  process.env.NODE_ENV = 'test';

  const { createDataStore, CANCEL_REVIEW_MS } = require('./dataStore');

  function freshStore() {
    const file = path.join(tmp, 'cancel-' + crypto.randomBytes(4).toString('hex') + '.sqlite');
    return { file, db: createDataStore(file) };
  }

  function user(id, role, phone) {
    return {
      id,
      phone,
      role,
      status: 'ACTIVE',
      isProfileComplete: true,
      name: role === 'WORKER' ? 'متخصص' : 'مشتری',
      createdAt: '2026-10-11T08:00:00.000Z',
    };
  }

  function order(id, overrides = {}) {
    return {
      id,
      customerId: 'USER-C',
      customerName: 'مشتری',
      customerPhone: '09120002001',
      serviceTitle: 'نظافت',
      address: 'تهران',
      date: 'مهر 20',
      time: 'صبح',
      price: 800000,
      status: 'PENDING',
      createdAt: '2026-10-11T08:00:00.000Z',
      ...overrides,
    };
  }

  function seed(db) {
    db.createUser(user('USER-C', 'CUSTOMER', '09120002001'));
    db.createUser(user('USER-W', 'WORKER', '09120002002'));
  }

  function publish(db, ruleKey, value) {
    const result = db.publishRule({ ruleKey, value, actor: 'system' });
    assert.equal(result.code, 'ok', ruleKey);
    return result.rule;
  }

  function credit(db, rule, amount, key) {
    const posted = db.postEntry({
      userId: 'USER-C',
      role: 'CUSTOMER',
      unit: 'points',
      delta: amount,
      reasonCode: 'order_completed',
      ruleKey: rule.ruleKey,
      ruleVersion: rule.version,
      idempotencyKey: key,
      actor: 'system',
    });
    assert.equal(posted.code, 'ok');
  }

  function accept(db, id) {
    db.createOrder(order(id));
    const accepted = db.tryAcceptOrder(id, { id: 'USER-W', name: 'متخصص', avatar: '', phone: '09120002002' });
    assert.equal(accepted.code, 'ok');
    return accepted.order;
  }

  const CANCELLABLE = ['PENDING', 'ACCEPTED', 'CONFIRMED', 'ASSIGNED', 'IN_PROGRESS'];

  function requestCancel(db, id, quote) {
    return db.tryCancelOrder(id, 'USER-C', CANCELLABLE, 'انصراف', quote ? { confirmQuote: quote } : undefined);
  }

  test('a pending cancel stays immediate and does not spend a free cancel or points', () => {
    const { db } = freshStore();
    seed(db);
    publish(db, 'cancel.freeAllowance', { initial: 2, cap: 3 });
    publish(db, 'cancel.penalty', { amount: 4 });
    db.ensureAccount('USER-C');
    db.createOrder(order('ORD-P'));
    const cancelled = requestCancel(db, 'ORD-P');
    assert.equal(cancelled.code, 'ok');
    assert.equal(cancelled.order.status, 'CANCELLED');
    assert.equal(cancelled.order.cancelInitiator, 'customer');
    assert.equal(cancelled.order.cancelFault, 'customer');
    assert.equal(db.getUserPoints('USER-C').freeCancelsRemaining, 2);
    assert.equal(db.getUserPoints('USER-C').balance, 0);
    assert.deepEqual(db.listOrderEvents('ORD-P').map((event) => event.kind), ['ORDER_CANCELLED']);
    assert.equal(db.listLedger('USER-C').some((row) => row.reasonCode === 'free_cancel_use'), false);
    db.close();
  });

  test('after acceptance the preview does not write, and a changed rule must be confirmed again', () => {
    const { db } = freshStore();
    seed(db);
    const penalty = publish(db, 'cancel.penalty', { amount: 4 });
    credit(db, penalty, 11, 'seed:balance');
    accept(db, 'ORD-A');
    const preview = requestCancel(db, 'ORD-A');
    assert.equal(preview.code, 'needs-confirmation');
    assert.equal(preview.quote.deductiblePoints, 4);
    assert.equal(preview.quote.quotedPoints, 4);
    assert.equal(Object.hasOwn(preview.quote, 'ruleKey'), false);
    assert.match(preview.message, /۴|4/);
    assert.equal(db.getOrder('ORD-A').status, 'ACCEPTED');
    assert.equal(db.getOrder('ORD-A').cancelRequestedAt, null);
    assert.equal(db.listLedger('USER-C').some((row) => row.reasonCode === 'cancel_penalty'), false);

    publish(db, 'cancel.penalty', { amount: 9 });
    const stale = requestCancel(db, 'ORD-A', preview.quote);
    assert.equal(stale.code, 'needs-confirmation');
    assert.equal(stale.quote.quotedPoints, 9);
    assert.equal(db.getOrder('ORD-A').status, 'ACCEPTED');
    const confirmed = requestCancel(db, 'ORD-A', stale.quote);
    assert.equal(confirmed.code, 'ok');
    assert.equal(confirmed.order.status, 'CANCEL_REQUESTED');
    assert.equal(confirmed.order.cancelQuote.ruleVersion, 2);
    assert.equal(confirmed.order.cancelQuote.deductiblePoints, 9);
    assert.equal(db.getUserPoints('USER-C').balance, 11);
    db.close();
  });

  test('final cancel transfers only the locked deductible once, even if confirmed twice', () => {
    const { db } = freshStore();
    seed(db);
    const penalty = publish(db, 'cancel.penalty', { amount: 4 });
    credit(db, penalty, 3, 'seed:small');
    accept(db, 'ORD-B');
    const preview = requestCancel(db, 'ORD-B');
    assert.equal(preview.quote.deductiblePoints, 3, 'the preview cannot exceed the balance');
    assert.equal(requestCancel(db, 'ORD-B', preview.quote).code, 'ok');
    publish(db, 'cancel.penalty', { amount: 9 });
    const finalized = db.finalizeCancelRequest('ORD-B', { actor: 'admin' });
    assert.equal(finalized.code, 'ok');
    assert.equal(finalized.order.status, 'CANCELLED');
    assert.equal(finalized.order.cancelledBy, 'USER-C');
    assert.equal(db.getUserPoints('USER-C').balance, 0);
    assert.equal(db.getUserPoints('USER-W').balance, 3);
    assert.equal(db.listLedger('USER-C').filter((row) => row.reasonCode === 'cancel_penalty').length, 1);
    assert.equal(db.listLedger('USER-W').filter((row) => row.reasonCode === 'cancel_penalty_credit').length, 1);
    const again = db.finalizeCancelRequest('ORD-B', { actor: 'system' });
    assert.equal(again.code, 'already-final');
    assert.equal(db.getUserPoints('USER-C').balance, 0);
    assert.equal(db.getUserPoints('USER-W').balance, 3);
    const kinds = db.listOrderEvents('ORD-B').map((event) => event.kind);
    assert.deepEqual(kinds, ['ORDER_ACCEPTED', 'CANCEL_REQUESTED', 'ORDER_CANCELLED']);
    db.close();
  });

  test('auto confirmation waits ten minutes and uses the same final function', () => {
    const { db } = freshStore();
    seed(db);
    const penalty = publish(db, 'cancel.penalty', { amount: 4 });
    credit(db, penalty, 8, 'seed:auto');
    accept(db, 'ORD-T');
    const preview = requestCancel(db, 'ORD-T');
    assert.equal(requestCancel(db, 'ORD-T', preview.quote).code, 'ok');
    const requestedAt = Date.parse(db.getOrder('ORD-T').cancelRequestedAt);
    assert.equal(db.finalizeDueCancelRequests(requestedAt + CANCEL_REVIEW_MS - 1).length, 0);
    assert.equal(db.getOrder('ORD-T').status, 'CANCEL_REQUESTED');
    const due = db.finalizeDueCancelRequests(requestedAt + CANCEL_REVIEW_MS);
    assert.equal(due.length, 1);
    assert.equal(due[0].code, 'ok');
    assert.equal(db.getOrder('ORD-T').status, 'CANCELLED');
    assert.equal(db.listOrderEvents('ORD-T').at(-1).actorRole, 'system');
    assert.equal(db.getUserPoints('USER-C').balance, 4);
    assert.equal(db.getUserPoints('USER-W').balance, 4);
    const workerNotes = db.listNotifications('USER-W').map((note) => note.body);
    const customerNotes = db.listNotifications('USER-C').map((note) => note.body);
    assert.equal(workerNotes.includes('درخواست لغو این سفارش در حال بررسی است. تا پایان بررسی کار را ادامه ندهید.'), true);
    assert.equal(workerNotes.includes('این سفارش لغو شد. کار را ادامه ندهید.'), true);
    assert.equal(customerNotes.includes('درخواست ثبت شده و در حال بررسی است.'), true);
    assert.equal(customerNotes.includes('سفارش شما لغو شد.'), true);
    for (const body of workerNotes.concat(customerNotes)) assert.equal(body.includes('ORD-'), false);
    db.close();
  });

  test('without an active penalty rule the cancel is free, and a free allowance is consumed only at the end', () => {
    const { db } = freshStore();
    seed(db);
    accept(db, 'ORD-N');
    const missing = requestCancel(db, 'ORD-N');
    assert.equal(missing.code, 'needs-confirmation');
    assert.equal(missing.quote.deductiblePoints, 0);
    assert.equal(missing.quote.reasonCode, 'no_penalty_rule');
    assert.match(missing.message, /امتیازی کسر نمی‌شود/);
    assert.equal(requestCancel(db, 'ORD-N', missing.quote).code, 'ok');
    assert.equal(db.finalizeCancelRequest('ORD-N', { actor: 'system' }).code, 'ok');
    assert.equal(db.listLedger().some((row) => row.reasonCode === 'cancel_penalty'), false);

    publish(db, 'cancel.freeAllowance', { initial: 2, cap: 3 });
    db.ensureAccount('USER-C');
    accept(db, 'ORD-F');
    const free = requestCancel(db, 'ORD-F');
    assert.equal(free.quote.usesFreeCancel, true);
    assert.match(free.message, /فرصت/);
    assert.equal(requestCancel(db, 'ORD-F', free.quote).code, 'ok');
    assert.equal(db.getUserPoints('USER-C').freeCancelsRemaining, 2);
    assert.equal(db.finalizeCancelRequest('ORD-F', { actor: 'admin' }).code, 'ok');
    assert.equal(db.getUserPoints('USER-C').freeCancelsRemaining, 1);
    assert.equal(db.listLedger('USER-W').some((row) => row.reasonCode === 'cancel_penalty_credit'), false);
    db.close();
  });

  test('admin fault none skips the penalty, and relaxing fault after the end reverses it', () => {
    const { db } = freshStore();
    seed(db);
    const penalty = publish(db, 'cancel.penalty', { amount: 4 });
    credit(db, penalty, 8, 'seed:fault');
    accept(db, 'ORD-D');
    const direct = db.transaction(() => {
      const order = db.getOrder('ORD-D');
      order.status = 'CANCELLED';
      order.cancelledAt = new Date().toISOString();
      order.cancelledBy = 'admin';
      db.updateOrder(order);
      return db.recordImmediateAdminCancel('ORD-D');
    });
    assert.equal(direct.code, 'ok');
    assert.equal(direct.order.cancelInitiator, 'admin');
    assert.equal(direct.order.cancelFault, 'none');
    assert.equal(db.getUserPoints('USER-C').balance, 8);

    accept(db, 'ORD-E');
    const preview = requestCancel(db, 'ORD-E');
    assert.equal(requestCancel(db, 'ORD-E', preview.quote).code, 'ok');
    assert.equal(db.setCancelFault('ORD-E', 'none', 'CANCEL_REQUESTED').code, 'ok');
    assert.equal(db.finalizeCancelRequest('ORD-E', { actor: 'admin' }).code, 'ok');
    assert.equal(db.getUserPoints('USER-C').balance, 8, 'fault none does not charge');

    accept(db, 'ORD-R');
    const charged = requestCancel(db, 'ORD-R');
    assert.equal(requestCancel(db, 'ORD-R', charged.quote).code, 'ok');
    assert.equal(db.finalizeCancelRequest('ORD-R', { actor: 'admin' }).code, 'ok');
    assert.equal(db.getUserPoints('USER-C').balance, 4);
    assert.equal(db.getUserPoints('USER-W').balance, 4);
    assert.equal(db.relaxCancelFault('ORD-R', 'customer').code, 'ok');
    assert.equal(db.relaxCancelFault('ORD-R', 'none').code, 'ok');
    assert.equal(db.getUserPoints('USER-C').balance, 8);
    assert.equal(db.getUserPoints('USER-W').balance, 0);
    assert.equal(db.relaxCancelFault('ORD-R', 'customer').code, 'fault-increase-unsupported');
    assert.equal(db.getOrder('ORD-R').cancelFault, 'none');
    db.close();
  });

  test('two concurrent final confirms charge the penalty once', async () => {
    const { file, db } = freshStore();
    seed(db);
    const penalty = publish(db, 'cancel.penalty', { amount: 4 });
    credit(db, penalty, 8, 'seed:race');
    accept(db, 'ORD-Z');
    const preview = requestCancel(db, 'ORD-Z');
    assert.equal(requestCancel(db, 'ORD-Z', preview.quote).code, 'ok');
    db.close();

    const run = (actor) =>
      new Promise((resolve, reject) => {
        const worker = new Worker(__filename, { workerData: { sqlite: file, orderId: 'ORD-Z', actor, customerId: 'USER-C' } });
        worker.on('message', resolve);
        worker.on('error', reject);
      });
    const results = await Promise.all([run('admin'), run('system')]);
    assert.deepEqual(results.map((item) => item.code).sort(), ['already-final', 'ok']);
    assert.equal(results.every((item) => item.penalties === 1), true);
    const after = createDataStore(file);
    assert.equal(after.getOrder('ORD-Z').status, 'CANCELLED');
    assert.equal(after.getUserPoints('USER-C').balance, 4);
    assert.equal(after.getUserPoints('USER-W').balance, 4);
    assert.equal(after.listLedger('USER-C').filter((row) => row.reasonCode === 'cancel_penalty').length, 1);
    after.close();
  });

  test('the ten-minute review window is fixed and the running server starts a due-cancel check', () => {
    const source = fs.readFileSync(path.join(__dirname, 'index.js'), 'utf8');
    const scheduler = fs.readFileSync(path.join(__dirname, 'cancelDueScheduler.js'), 'utf8');
    assert.equal(source.includes('finalizeDueCancelRequests()'), true);
    assert.equal(source.includes('startCancelDueScheduler'), true);
    assert.equal(scheduler.includes('finalizeDueCancelRequests'), true);
    assert.equal(CANCEL_REVIEW_MS, 10 * 60 * 1000);
  });
}
