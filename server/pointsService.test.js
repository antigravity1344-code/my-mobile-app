const { isMainThread, workerData, parentPort, Worker } = require('node:worker_threads');

if (!isMainThread) {
  const { createDataStore } = require('./dataStore');
  const db = createDataStore(workerData.sqlite);
  const result = db.postEntry(workerData.entry);
  db.close();
  parentPort.postMessage({
    code: result.code,
    balance: result.account ? result.account.balance : null,
  });
} else {
  const { test, after } = require('node:test');
  const assert = require('node:assert/strict');
  const crypto = require('node:crypto');
  const fs = require('node:fs');
  const http = require('node:http');
  const os = require('node:os');
  const path = require('node:path');
  const { DatabaseSync } = require('node:sqlite');

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'paksho-points-'));
  process.env.PAKSHO_DATA_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
  process.env.PAKSHO_SQLITE_PATH = path.join(tmp, 'paksho.sqlite');
  process.env.PAKSHO_WORKER_DOC_DIR = path.join(tmp, 'docs');
  process.env.PAKSHO_ADMIN_PASSWORD = 'paksho-test-admin';
  process.env.NODE_ENV = 'test';

  const { createDataStore } = require('./dataStore');
  const { app, store } = require('./index.js');

  after(() => {
    store.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  function freshStore() {
    const file = path.join(tmp, 'points-' + crypto.randomBytes(4).toString('hex') + '.sqlite');
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
      customerPhone: '09120001001',
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

  function seedPair(db) {
    db.createUser(user('USER-C', 'CUSTOMER', '09120001001'));
    db.createUser(user('USER-W', 'WORKER', '09120001002'));
  }

  function publish(db, ruleKey, value) {
    const result = db.publishRule({ ruleKey, value, actor: 'system' });
    assert.equal(result.code, 'ok', ruleKey);
    return result.rule;
  }

  function entry(overrides = {}) {
    return {
      userId: 'USER-C',
      role: 'CUSTOMER',
      unit: 'points',
      delta: 7,
      reasonCode: 'order_completed',
      orderId: null,
      ruleKey: 'earn.orderCompleted',
      ruleVersion: 1,
      idempotencyKey: 'earn:test:1',
      actor: 'system',
      ...overrides,
    };
  }

  function accept(db, id) {
    db.createOrder(order(id));
    const accepted = db.tryAcceptOrder(id, { id: 'USER-W', name: 'متخصص', avatar: '', phone: '09120001002' });
    assert.equal(accepted.code, 'ok');
    return accepted.order;
  }

  test('a new database has no point rules and no seeded amounts', () => {
    const { db } = freshStore();
    assert.deepEqual(db.listPointRules(), []);
    assert.equal(db.getUserPoints('USER-C'), null);
    const source = fs.readFileSync(path.join(__dirname, 'pointsService.js'), 'utf8');
    assert.equal(/amount\s*:\s*200\b/.test(source), false);
    assert.equal(/initial\s*:\s*5\b/.test(source), false);
    db.close();
  });

  test('rules are appended as new versions and cannot be edited', () => {
    const { file, db } = freshStore();
    const first = publish(db, 'cancel.penalty', { amount: 4 });
    const second = publish(db, 'cancel.penalty', { amount: 9 });
    assert.equal(first.version, 1);
    assert.equal(second.version, 2);
    assert.equal(second.active, true);
    assert.deepEqual(db.rulesFor('cancel.penalty').value, { amount: 9 });
    assert.equal(db.listPointRules()[0].value.amount, 4, 'the first version stays');
    assert.equal(db.publishRule({ ruleKey: 'Bad Key', value: { amount: 4 }, actor: 'system' }).code, 'invalid');
    assert.equal(db.publishRule({ ruleKey: 'cancel.penalty', value: [], actor: 'system' }).code, 'invalid');
    db.close();

    const raw = new DatabaseSync(file);
    assert.throws(() => raw.prepare("UPDATE point_rules SET valueJson = '{}' WHERE version = 1").run(), /append-only/);
    assert.throws(() => raw.prepare('DELETE FROM point_rules WHERE version = 1').run(), /append-only/);
    assert.equal(raw.prepare('SELECT COUNT(*) AS c FROM point_rules').get().c, 2);
    raw.close();
  });

  test('postEntry is idempotent, rejects a conflicting key, and never goes below zero', () => {
    const { db } = freshStore();
    seedPair(db);
    publish(db, 'earn.orderCompleted', { customerAmount: 7, workerAmount: 6 });
    const first = db.postEntry(entry());
    assert.equal(first.code, 'ok');
    assert.equal(first.account.balance, 7);
    assert.equal(first.entry.balanceBefore, 0);
    assert.equal(first.entry.balanceAfter, 7);
    const second = db.postEntry(entry());
    assert.equal(second.code, 'duplicate');
    assert.equal(second.account.balance, 7);
    assert.equal(db.listLedger('USER-C').length, 1);
    const clash = db.postEntry(entry({ delta: 4 }));
    assert.equal(clash.code, 'key-conflict');
    assert.equal(db.getUserPoints('USER-C').balance, 7);
    const poor = db.postEntry(entry({ delta: -11, idempotencyKey: 'earn:test:down' }));
    assert.equal(poor.code, 'insufficient');
    assert.equal(db.listLedger('USER-C').length, 1);
    assert.equal(db.getUserPoints('USER-C').balance, 7);
    db.close();
  });

  test('initial free cancels are granted once from the published rule and capped by it', () => {
    const { db } = freshStore();
    seedPair(db);
    const bare = db.ensureAccount('USER-C');
    assert.equal(bare.account.freeCancelsRemaining, 0);
    assert.equal(bare.account.tierKey, 'gray');
    assert.equal(db.listLedger('USER-C').length, 0);
    publish(db, 'cancel.freeAllowance', { initial: 9, cap: 2 });
    const granted = db.ensureAccount('USER-C');
    assert.equal(granted.account.freeCancelsRemaining, 2);
    assert.equal(db.ensureAccount('USER-C').account.freeCancelsRemaining, 2);
    assert.equal(db.listLedger('USER-C').length, 1);
    assert.equal(db.listLedger('USER-C')[0].reasonCode, 'free_cancel_grant');
    assert.equal(db.listLedger('USER-C')[0].unit, 'free_cancel');
    db.close();
  });

  test('quoteCancelPenalty does not write, is free before acceptance, and reads the penalty rule after it', () => {
    const { db } = freshStore();
    seedPair(db);
    db.createOrder(order('ORD-Q'));
    publish(db, 'cancel.freeAllowance', { initial: 2, cap: 4 });
    const before = db.quoteCancelPenalty({ orderId: 'ORD-Q', userId: 'USER-C' });
    assert.equal(before.code, 'ok');
    assert.equal(before.phase, 'before_accept');
    assert.equal(before.quotedPoints, 0);
    assert.equal(before.usesFreeCancel, false);
    assert.equal(before.locks, false);
    assert.equal(db.getUserPoints('USER-C'), null, 'preview creates nothing');

    accept(db, 'ORD-A');
    const quoted = db.quoteCancelPenalty({ orderId: 'ORD-A', userId: 'USER-C' });
    assert.equal(quoted.usesFreeCancel, true);
    assert.equal(quoted.freeCancelsRemaining, 2);
    assert.equal(quoted.quotedPoints, 0);
    assert.equal(db.getUserPoints('USER-C'), null, 'preview still creates nothing');
    assert.equal(db.quoteCancelPenalty({ orderId: 'ORD-A', userId: 'USER-W' }).code, 'forbidden');

    db.ensureAccount('USER-C');
    db.postEntry({
      userId: 'USER-C',
      role: 'CUSTOMER',
      unit: 'free_cancel',
      delta: -2,
      reasonCode: 'free_cancel_use',
      orderId: 'ORD-A',
      ruleKey: 'cancel.freeAllowance',
      ruleVersion: 1,
      idempotencyKey: 'free_cancel:use:ORD-A',
      actor: 'system',
    });
    assert.equal(db.quoteCancelPenalty({ orderId: 'ORD-A', userId: 'USER-C' }).code, 'rule-missing');
    publish(db, 'cancel.penalty', { amount: 4 });
    publish(db, 'earn.orderCompleted', { customerAmount: 9 });
    db.postEntry(entry({ idempotencyKey: 'earn:quote', delta: 9 }));
    const penalty = db.quoteCancelPenalty({ orderId: 'ORD-A', userId: 'USER-C' });
    assert.equal(penalty.quotedPoints, 4);
    assert.equal(penalty.deductiblePoints, 4);
    assert.equal(penalty.usesFreeCancel, false);
    assert.equal(penalty.ruleVersion, 1);
    assert.equal(penalty.locks, false);
    const again = db.quoteCancelPenalty({ orderId: 'ORD-A', userId: 'USER-C' });
    assert.deepEqual(again, penalty);
    assert.equal(db.listLedger('USER-C').some((row) => row.reasonCode === 'cancel_penalty'), false);

    db.createOrder(order('ORD-LEGACY', { status: 'ACCEPTED', cleanerId: 'USER-W' }));
    assert.equal(db.getOrder('ORD-LEGACY').acceptedAt, null);
    assert.equal(db.quoteCancelPenalty({ orderId: 'ORD-LEGACY', userId: 'USER-C' }).phase, 'after_accept');
    db.close();
  });

  test('postTransfer moves only the points actually deducted and can be reversed once', () => {
    const { db } = freshStore();
    seedPair(db);
    const rule = publish(db, 'cancel.penalty', { amount: 9 });
    db.postEntry(entry({ ruleKey: rule.ruleKey, ruleVersion: rule.version, delta: 9, idempotencyKey: 'seed:c' }));
    const moved = db.postTransfer({
      fromUserId: 'USER-C',
      fromRole: 'CUSTOMER',
      toUserId: 'USER-W',
      toRole: 'WORKER',
      points: 4,
      orderId: 'ORD-T',
      ruleKey: rule.ruleKey,
      ruleVersion: rule.version,
      transferGroupId: 'cancel:ORD-T',
      debitKey: 'cancel:ORD-T:penalty',
      creditKey: 'cancel:ORD-T:credit',
      debitReasonCode: 'cancel_penalty',
      creditReasonCode: 'cancel_credit',
      actor: 'system',
    });
    assert.equal(moved.code, 'ok');
    assert.equal(moved.transferred, 4);
    assert.equal(db.getUserPoints('USER-C').balance, 5);
    assert.equal(db.getUserPoints('USER-W').balance, 4);
    const again = db.postTransfer({
      fromUserId: 'USER-C',
      fromRole: 'CUSTOMER',
      toUserId: 'USER-W',
      toRole: 'WORKER',
      points: 4,
      orderId: 'ORD-T',
      ruleKey: rule.ruleKey,
      ruleVersion: rule.version,
      transferGroupId: 'cancel:ORD-T',
      debitKey: 'cancel:ORD-T:penalty',
      creditKey: 'cancel:ORD-T:credit',
      debitReasonCode: 'cancel_penalty',
      creditReasonCode: 'cancel_credit',
      actor: 'system',
    });
    assert.equal(again.code, 'duplicate');
    assert.equal(db.getUserPoints('USER-C').balance, 5);

    const poor = db.postTransfer({
      fromUserId: 'USER-C',
      fromRole: 'CUSTOMER',
      toUserId: 'USER-W',
      toRole: 'WORKER',
      points: 11,
      orderId: 'ORD-T2',
      ruleKey: rule.ruleKey,
      ruleVersion: rule.version,
      transferGroupId: 'cancel:ORD-T2',
      debitKey: 'cancel:ORD-T2:penalty',
      creditKey: 'cancel:ORD-T2:credit',
      debitReasonCode: 'cancel_penalty',
      creditReasonCode: 'cancel_credit',
      actor: 'system',
    });
    assert.equal(poor.transferred, 5);
    assert.equal(db.getUserPoints('USER-C').balance, 0);
    assert.equal(db.getUserPoints('USER-W').balance, 9);

    const original = db.listLedger('USER-W').find((row) => row.idempotencyKey === 'cancel:ORD-T:credit');
    const reversed = db.reverseEntry({ entryId: original.id, idempotencyKey: 'cancel:ORD-T:credit:reverse', actor: 'admin' });
    assert.equal(reversed.code, 'ok');
    assert.equal(reversed.entry.reversalOf, original.id);
    assert.equal(reversed.entry.delta, -4);
    assert.equal(db.getUserPoints('USER-W').balance, 5);
    const untouched = db.listLedger('USER-W').find((row) => row.id === original.id);
    assert.equal(untouched.delta, 4);
    assert.equal(untouched.balanceAfter, original.balanceAfter);
    assert.equal(
      db.reverseEntry({ entryId: original.id, idempotencyKey: 'cancel:ORD-T:credit:reverse', actor: 'admin' }).code,
      'duplicate'
    );
    db.close();
  });

  test('tier changes only by a published rule, upgrades immediately, and does not fall', () => {
    const { db } = freshStore();
    seedPair(db);
    const adjust = publish(db, 'earn.orderCompleted', { customerAmount: 7 });
    db.postEntry(entry({ ruleKey: adjust.ruleKey, ruleVersion: adjust.version, delta: 11, idempotencyKey: 'tier:seed' }));
    assert.equal(db.getUserPoints('USER-C').tierKey, 'gray', 'no tier rule means no promotion');
    publish(db, 'tiers.customer', {
      levels: [
        { tierKey: 'silver', minPoints: 4, minCompleted: 0 },
        { tierKey: 'gold', minPoints: 11, minCompleted: 2 },
      ],
    });
    const silver = db.recomputeTier('USER-C');
    assert.equal(silver.changed, true);
    assert.equal(silver.tierKey, 'silver');
    accept(db, 'ORD-TIER-1');
    assert.equal(db.tryCompleteOrder('ORD-TIER-1', { id: 'USER-W', name: 'متخصص' }).code, 'ok');
    assert.equal(db.getUserPoints('USER-C').tierKey, 'silver', 'one completion is not enough for gold');
    accept(db, 'ORD-TIER-2');
    assert.equal(db.tryCompleteOrder('ORD-TIER-2', { id: 'USER-W', name: 'متخصص' }).code, 'ok');
    assert.equal(db.getUserPoints('USER-C').tierKey, 'gold');
    publish(db, 'tiers.customer', {
      levels: [{ tierKey: 'silver', minPoints: 40, minCompleted: 9 }],
    });
    const stayed = db.recomputeTier('USER-C');
    assert.equal(stayed.changed, false);
    assert.equal(stayed.tierKey, 'gold');
    db.close();
  });

  test('completion awards points and free-cancel refills only from active rules; cancel and rating do not', () => {
    const { db } = freshStore();
    seedPair(db);
    accept(db, 'ORD-BARE');
    assert.equal(db.tryCompleteOrder('ORD-BARE', { id: 'USER-W', name: 'متخصص' }).code, 'ok');
    assert.equal(db.getUserPoints('USER-C'), null);
    assert.equal(db.listLedger().length, 0);

    const earn = publish(db, 'earn.orderCompleted', { customerAmount: 7, workerAmount: 6 });
    publish(db, 'cancel.freeAllowance', { initial: 2, earnEveryCompleted: 2, earnAmount: 2, cap: 4 });
    accept(db, 'ORD-1');
    assert.equal(db.tryCompleteOrder('ORD-1', { id: 'USER-W', name: 'متخصص' }).code, 'ok');
    assert.equal(db.getUserPoints('USER-C').balance, 7);
    assert.equal(db.getUserPoints('USER-W').balance, 6);
    // ORD-BARE هم جزو سفارش‌های انجام‌شده است، پس با این تکمیل شمارش به ۲ می‌رسد و یک‌بار فرصت تا سقف اضافه می‌شود.
    assert.equal(db.getUserPoints('USER-C').freeCancelsRemaining, 4);
    accept(db, 'ORD-2');
    assert.equal(db.tryCompleteOrder('ORD-2', { id: 'USER-W', name: 'متخصص' }).code, 'ok');
    assert.equal(db.getUserPoints('USER-C').balance, 14);
    assert.equal(db.getUserPoints('USER-C').freeCancelsRemaining, 4);
    assert.equal(db.tryCompleteOrder('ORD-2', { id: 'USER-W', name: 'متخصص' }).code, 'bad-status');
    assert.equal(db.getUserPoints('USER-C').balance, 14, 'a repeated completion does not award twice');

    const rated = db.createRating('ORD-2', 'USER-C', { customerRating: 5, customerComment: 'خوب بود' });
    assert.equal(rated.code, 'ok');
    assert.equal(db.listLedger('USER-C').some((row) => row.reasonCode === 'rating'), false);
    assert.equal(db.getUserPoints('USER-C').balance, 14);

    publish(db, 'cancel.penalty', { amount: 4 });
    const beforeCancel = db.getUserPoints('USER-C').balance;
    const freeBefore = db.getUserPoints('USER-C').freeCancelsRemaining;
    accept(db, 'ORD-X');
    const preview = db.tryCancelOrder('ORD-X', 'USER-C', ['PENDING', 'ACCEPTED'], 'انصراف');
    assert.equal(preview.code, 'needs-confirmation');
    assert.equal(preview.quote.usesFreeCancel, true);
    assert.equal(db.getOrder('ORD-X').status, 'ACCEPTED');
    assert.equal(db.getUserPoints('USER-C').balance, beforeCancel);
    const requested = db.tryCancelOrder('ORD-X', 'USER-C', ['PENDING', 'ACCEPTED'], 'انصراف', { confirmQuote: preview.quote });
    assert.equal(requested.code, 'ok');
    assert.equal(requested.order.status, 'CANCEL_REQUESTED');
    assert.equal(db.getUserPoints('USER-C').balance, beforeCancel, 'requesting a cancel does not charge points');
    assert.equal(db.listLedger('USER-C').some((row) => row.reasonCode === 'cancel_penalty'), false);
    const finalized = db.finalizeCancelRequest('ORD-X', { actor: 'admin' });
    assert.equal(finalized.code, 'ok');
    assert.equal(finalized.order.status, 'CANCELLED');
    assert.equal(db.getUserPoints('USER-C').balance, beforeCancel, 'a free cancel does not transfer points');
    assert.equal(db.getUserPoints('USER-C').freeCancelsRemaining, freeBefore - 1);
    assert.equal(db.listLedger('USER-C').some((row) => row.reasonCode === 'free_cancel_use'), true);
    assert.equal(db.listLedger('USER-C').some((row) => row.reasonCode === 'cancel_penalty'), false);

    const notes = db.listNotifications('USER-C').concat(db.listNotifications('USER-W'));
    for (const note of notes) {
      assert.equal(note.body.includes('ORD-'), false, note.body);
      assert.equal(note.title.includes('ORD-'), false, note.title);
    }
    db.close();
  });

  test('two concurrent posts with one key award once, and two keys add up', async () => {
    const { file, db } = freshStore();
    seedPair(db);
    const rule = publish(db, 'earn.orderCompleted', { customerAmount: 4 });
    db.close();
    const run = (idempotencyKey, delta) =>
      new Promise((resolve, reject) => {
        const worker = new Worker(__filename, {
          workerData: {
            sqlite: file,
            entry: entry({
              ruleKey: rule.ruleKey,
              ruleVersion: rule.version,
              delta,
              idempotencyKey,
            }),
          },
        });
        worker.on('message', resolve);
        worker.on('error', reject);
      });

    const same = await Promise.all([run('race:same', 4), run('race:same', 4)]);
    assert.deepEqual(same.map((item) => item.code).sort(), ['duplicate', 'ok']);
    const afterSame = createDataStore(file);
    assert.equal(afterSame.getUserPoints('USER-C').balance, 4);
    assert.equal(afterSame.listLedger('USER-C').length, 1);
    afterSame.close();

    const both = await Promise.all([run('race:a', 4), run('race:b', 7)]);
    assert.deepEqual(both.map((item) => item.code).sort(), ['ok', 'ok']);
    const afterBoth = createDataStore(file);
    assert.equal(afterBoth.getUserPoints('USER-C').balance, 15);
    assert.equal(afterBoth.listLedger('USER-C').length, 3);
    afterBoth.close();
  });

  test('points_ledger rejects update, delete and replace', () => {
    const { file, db } = freshStore();
    seedPair(db);
    const rule = publish(db, 'earn.orderCompleted', { customerAmount: 4 });
    const posted = db.postEntry(entry({ ruleKey: rule.ruleKey, ruleVersion: rule.version, delta: 4, idempotencyKey: 'lock:1' }));
    assert.equal(posted.code, 'ok');
    db.close();
    const raw = new DatabaseSync(file);
    assert.throws(() => raw.prepare("UPDATE points_ledger SET delta = 1 WHERE id = ?").run(posted.entry.id), /append-only/);
    assert.throws(() => raw.prepare('DELETE FROM points_ledger WHERE id = ?').run(posted.entry.id), /append-only/);
    assert.throws(
      () =>
        raw
          .prepare(
            `INSERT OR REPLACE INTO points_ledger (
              id, userId, role, unit, delta, balanceBefore, balanceAfter, reasonCode, orderId,
              ruleKey, ruleVersion, idempotencyKey, transferGroupId, reversalOf, actor, createdAt, note
            ) VALUES (?, ?, 'CUSTOMER', 'points', 1, 0, 1, 'order_completed', NULL, 'earn.orderCompleted', 1, 'other', NULL, NULL, 'system', '2026-01-01T00:00:00.000Z', NULL)`
          )
          .run(posted.entry.id),
      /append-only/
    );
    assert.equal(raw.prepare('SELECT delta FROM points_ledger WHERE id = ?').get(posted.entry.id).delta, 4);
    raw.close();
  });

  function request(server, { method = 'GET', pathname, token, body }) {
    const payload = body === undefined ? null : JSON.stringify(body);
    const { port } = server.address();
    return new Promise((resolve, reject) => {
      const req = http.request(
        {
          hostname: '127.0.0.1',
          port,
          path: pathname,
          method,
          headers: {
            ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {}),
            ...(token ? { Authorization: 'Bearer ' + token } : {}),
          },
        },
        (res) => {
          const chunks = [];
          res.on('data', (chunk) => chunks.push(chunk));
          res.on('end', () => {
            const buf = Buffer.concat(chunks);
            const type = String(res.headers['content-type'] || '');
            resolve({
              status: res.statusCode,
              json: type.includes('application/json') ? JSON.parse(buf.toString('utf8')) : null,
            });
          });
        }
      );
      req.on('error', reject);
      if (payload) req.write(payload);
      req.end();
    });
  }

  async function login(server, phone, role) {
    await request(server, { method: 'POST', pathname: '/api/auth/send-otp', body: { phone } });
    const verified = await request(server, {
      method: 'POST',
      pathname: '/api/auth/verify-otp',
      body: { phone, code: store.getOtp(phone).code, role },
    });
    assert.equal(verified.status, 200);
    return verified.json;
  }

  test('admin can append a point rule, customers cannot, and admin completion awards from that rule', async (t) => {
    const server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    t.after(() => server.close());
    const admin = await request(server, {
      method: 'POST',
      pathname: '/api/admin/login',
      body: { password: process.env.PAKSHO_ADMIN_PASSWORD },
    });
    assert.equal(admin.status, 200);
    const adminToken = admin.json.token;
    const denied = await request(server, {
      method: 'POST',
      pathname: '/api/admin/point-rules',
      body: { ruleKey: 'cancel.penalty', value: { amount: 4 } },
    });
    assert.equal(denied.status, 401);
    const bad = await request(server, {
      method: 'POST',
      pathname: '/api/admin/point-rules',
      token: adminToken,
      body: { ruleKey: 'cancel.penalty', value: { amount: 'چهار' } },
    });
    assert.equal(bad.status, 400);
    const created = await request(server, {
      method: 'POST',
      pathname: '/api/admin/point-rules',
      token: adminToken,
      body: { ruleKey: 'earn.orderCompleted', value: { customerAmount: 7, workerAmount: 6 } },
    });
    assert.equal(created.status, 200);
    assert.equal(created.json.rule.version, 1);
    const next = await request(server, {
      method: 'POST',
      pathname: '/api/admin/point-rules',
      token: adminToken,
      body: { ruleKey: 'earn.orderCompleted', value: { customerAmount: 2, workerAmount: 2 } },
    });
    assert.equal(next.json.rule.version, 2);
    assert.equal(store.rulesFor('earn.orderCompleted').value.customerAmount, 2);

    const customer = await login(server, '09120001021', 'CUSTOMER');
    const worker = await login(server, '09120001022', 'WORKER');
    const customerDenied = await request(server, {
      method: 'GET',
      pathname: '/api/admin/point-rules',
      token: customer.token,
    });
    assert.equal(customerDenied.status, 401);
    const onboard = await request(server, {
      method: 'PUT',
      pathname: '/api/users/worker-onboarding',
      token: worker.token,
      body: {
        name: 'متخصص',
        nationalId: '1098765432',
        birthDate: '1368/05/12',
        address: 'تهران',
        city: 'تهران',
        bankSheba: 'IR120000000000000000000000',
        idDocFile: { mimeType: 'image/jpeg', data: Buffer.from([0xff, 0xd8, 0xff, 0xd9]).toString('base64') },
      },
    });
    assert.equal(onboard.status, 200);
    const approved = await request(server, {
      method: 'PUT',
      pathname: '/api/admin/approve-worker/' + worker.user.id,
      token: adminToken,
    });
    assert.equal(approved.status, 200);
    const made = await request(server, {
      method: 'POST',
      pathname: '/api/orders',
      token: customer.token,
      body: { address: 'سعادت‌آباد، کوچه ۱', date: 'مهر 20', time: '10:00', price: 800000, serviceTitle: 'نظافت' },
    });
    assert.equal(made.status, 200);
    const accepted = await request(server, {
      method: 'PUT',
      pathname: '/api/orders/' + made.json.order.id + '/accept',
      token: worker.token,
      body: {},
    });
    assert.equal(accepted.status, 200);
    const completed = await request(server, {
      method: 'PUT',
      pathname: '/api/admin/orders/' + made.json.order.id,
      token: adminToken,
      body: { status: 'COMPLETED' },
    });
    assert.equal(completed.status, 200);
    assert.equal(store.getUserPoints(customer.user.id).balance, 2, 'admin completion uses the latest rule');
    assert.equal(store.getUserPoints(worker.user.id).balance, 2);
    const repeat = await request(server, {
      method: 'PUT',
      pathname: '/api/admin/orders/' + made.json.order.id,
      token: adminToken,
      body: { status: 'COMPLETED' },
    });
    assert.equal(repeat.status, 200);
    assert.equal(store.getUserPoints(customer.user.id).balance, 2);
  });
}
