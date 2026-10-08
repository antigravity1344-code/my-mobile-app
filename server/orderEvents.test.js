const { isMainThread, workerData, parentPort, Worker } = require('node:worker_threads');

if (!isMainThread) {
  const { createDataStore } = require('./dataStore');
  const raceStore = createDataStore(workerData.sqlite);
  const result = raceStore.appendOrderEvent(workerData.event);
  raceStore.close();
  parentPort.postMessage(result.code);
} else {
  const { test, after } = require('node:test');
  const assert = require('node:assert/strict');
  const fs = require('node:fs');
  const http = require('node:http');
  const os = require('node:os');
  const path = require('node:path');
  const { DatabaseSync } = require('node:sqlite');

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'paksho-order-events-'));
  process.env.PAKSHO_DATA_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
  process.env.PAKSHO_SQLITE_PATH = path.join(tmp, 'paksho.sqlite');
  process.env.PAKSHO_WORKER_DOC_DIR = path.join(tmp, 'docs');
  process.env.PAKSHO_ADMIN_PASSWORD = 'paksho-test-admin';
  process.env.NODE_ENV = 'test';

  const { createDataStore, ORDER_EVENT_KINDS, normalizeIsoTimestamp } = require('./dataStore');
  const { app, store } = require('./index.js');
  after(() => {
    store.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  const INVALID_START_MESSAGE = 'زمان انتخاب‌شده برای شروع کار معتبر نیست. لطفاً تاریخ و ساعت را دوباره انتخاب کنید.';
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
  let fileCounter = 0;

  function freshStore() {
    fileCounter += 1;
    const file = path.join(tmp, 'events-' + fileCounter + '.sqlite');
    return { file, db: createDataStore(file) };
  }

  function sampleOrder(id, overrides = {}) {
    return {
      id,
      customerId: 'USER-EVT',
      customerName: 'مشتری',
      customerPhone: '09130000301',
      serviceTitle: 'نظافت',
      address: 'تهران',
      date: 'مهر 20',
      time: 'صبح',
      price: 500000,
      status: 'PENDING',
      createdAt: new Date().toISOString(),
      ...overrides,
    };
  }

  function sampleEvent(orderId, overrides = {}) {
    return {
      orderId,
      actorId: 'WORKER-EVT',
      actorRole: 'worker',
      kind: 'START_REPORTED_BY_WORKER',
      claimedAt: '2026-01-02T10:00:00+03:30',
      note: null,
      idempotencyKey: 'start:' + orderId + ':worker',
      ...overrides,
    };
  }

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
              text: buf.toString('utf8'),
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

  async function adminLogin(server) {
    const admin = await request(server, {
      method: 'POST',
      pathname: '/api/admin/login',
      body: { password: process.env.PAKSHO_ADMIN_PASSWORD },
    });
    assert.equal(admin.status, 200);
    return admin.json.token;
  }

  async function approvedWorker(server, phone, adminToken) {
    const worker = await login(server, phone, 'WORKER');
    const onboard = await request(server, {
      method: 'PUT',
      pathname: '/api/users/worker-onboarding',
      token: worker.token,
      body: {
        name: 'متخصص ' + phone.slice(-2),
        nationalId: '1098765432',
        birthDate: '1368/05/12',
        address: 'تهران',
        city: 'تهران',
        bankSheba: 'IR120000000000000000000000',
        idDocFile: { mimeType: 'image/jpeg', data: jpeg.toString('base64') },
      },
    });
    assert.equal(onboard.status, 200);
    const approved = await request(server, {
      method: 'PUT',
      pathname: '/api/admin/approve-worker/' + worker.user.id,
      token: adminToken,
    });
    assert.equal(approved.status, 200);
    return worker;
  }

  function postOrder(server, token, overrides = {}) {
    return request(server, {
      method: 'POST',
      pathname: '/api/orders',
      token,
      body: {
        serviceTitle: 'نظافت منزل',
        serviceId: 'home_unit_cleaning',
        customerName: 'گیرنده',
        customerPhone: '09130000302',
        address: 'سعادت‌آباد، خیابان سرو',
        date: 'مهر 20',
        time: 'صبح',
        price: 800000,
        ...overrides,
      },
    });
  }

  async function startServer(t) {
    const server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    t.after(() => server.close());
    return server;
  }

  test('a fresh database has the order_events table, index, append-only triggers and new order columns', () => {
    const { file, db } = freshStore();
    db.close();
    const raw = new DatabaseSync(file, { readOnly: true });
    const names = raw
      .prepare("SELECT type, name FROM sqlite_master WHERE name LIKE '%order_events%'")
      .all()
      .map((row) => row.type + ':' + row.name);
    assert.equal(names.includes('table:order_events'), true);
    assert.equal(names.includes('index:idx_order_events_order'), true);
    assert.equal(names.includes('trigger:order_events_no_update'), true);
    assert.equal(names.includes('trigger:order_events_no_delete'), true);
    assert.equal(names.includes('trigger:order_events_no_overwrite'), true);
    const columns = raw.prepare('PRAGMA table_info(order_events)').all().map((column) => column.name);
    assert.deepEqual(columns, [
      'id', 'orderId', 'actorId', 'actorRole', 'kind', 'claimedAt', 'recordedAt', 'correctsEventId', 'note', 'idempotencyKey',
    ]);
    const foreignKeys = raw.prepare('PRAGMA foreign_key_list(order_events)').all();
    assert.equal(foreignKeys.some((fk) => fk.table === 'orders'), false, 'orderId must not reference orders');
    const orderColumns = raw.prepare('PRAGMA table_info(orders)').all();
    const byName = Object.fromEntries(orderColumns.map((column) => [column.name, column]));
    for (const name of ['acceptedAt', 'expectedStartAt', 'agreedStartAt', 'startStatus']) {
      assert.ok(byName[name], 'missing orders.' + name);
    }
    assert.equal(byName.startStatus.notnull, 1);
    assert.equal(byName.startStatus.dflt_value, "'not_recorded'");
    assert.equal(byName.cancelInitiator, undefined);
    assert.equal(byName.cancelFault, undefined);
    raw.close();
  });

  test('a new order starts with not_recorded and empty time fields', () => {
    const { db } = freshStore();
    const order = db.createOrder(sampleOrder('ORD-EVT-NEW'));
    assert.equal(order.startStatus, 'not_recorded');
    assert.equal(order.acceptedAt, null);
    assert.equal(order.expectedStartAt, null);
    assert.equal(order.agreedStartAt, null);
    db.close();
  });

  test('appendOrderEvent stores server recordedAt and the claimed time separately', () => {
    const { db } = freshStore();
    db.createOrder(sampleOrder('ORD-EVT-1'));
    const before = Date.now();
    const result = db.appendOrderEvent({ ...sampleEvent('ORD-EVT-1'), recordedAt: '2000-01-01T00:00:00Z' });
    const afterTime = Date.now();
    assert.equal(result.code, 'ok');
    const event = result.event;
    assert.match(event.id, /^EVT-/);
    assert.equal(event.claimedAt, '2026-01-02T06:30:00.000Z');
    const recorded = Date.parse(event.recordedAt);
    assert.equal(recorded >= before - 1000 && recorded <= afterTime + 1000, true, 'recordedAt is server time');
    assert.equal(event.actorRole, 'worker');
    assert.equal(event.actorId, 'WORKER-EVT');
    assert.equal(event.correctsEventId, null);
    assert.deepEqual(db.listOrderEvents('ORD-EVT-1'), [event]);
    assert.deepEqual(db.listOrderEvents('ORD-OTHER'), []);
    db.close();
  });

  test('claimedAt may be empty and system or admin events need no actor id', () => {
    const { db } = freshStore();
    db.createOrder(sampleOrder('ORD-EVT-SYS'));
    const result = db.appendOrderEvent({
      orderId: 'ORD-EVT-SYS',
      actorRole: 'system',
      kind: 'START_PROMPT_SENT',
      idempotencyKey: 'prompt:ORD-EVT-SYS',
    });
    assert.equal(result.code, 'ok');
    assert.equal(result.event.actorId, null);
    assert.equal(result.event.claimedAt, null);
    const byAdmin = db.appendOrderEvent({
      orderId: 'ORD-EVT-SYS',
      actorRole: 'admin',
      kind: 'ADMIN_DECISION',
      idempotencyKey: 'decision:ORD-EVT-SYS',
    });
    assert.equal(byAdmin.code, 'ok');
    assert.equal(byAdmin.event.actorId, null);
    db.close();
  });

  test('the same idempotency key is stored once; different content under that key is a conflict', () => {
    const { db } = freshStore();
    db.createOrder(sampleOrder('ORD-EVT-2'));
    const first = db.appendOrderEvent(sampleEvent('ORD-EVT-2'));
    assert.equal(first.code, 'ok');
    const again = db.appendOrderEvent(sampleEvent('ORD-EVT-2'));
    assert.equal(again.code, 'duplicate');
    assert.equal(again.event.id, first.event.id);
    const conflict = db.appendOrderEvent(sampleEvent('ORD-EVT-2', { claimedAt: '2026-01-02T11:00:00+03:30' }));
    assert.equal(conflict.code, 'key-conflict');
    assert.equal(conflict.event.id, first.event.id);
    assert.equal(db.listOrderEvents('ORD-EVT-2').length, 1);
    db.close();
  });

  test('invalid events are rejected without inserting anything', () => {
    const { db } = freshStore();
    db.createOrder(sampleOrder('ORD-EVT-3'));
    const cases = [
      [{ kind: 'ORDER_CREATED' }, 'kind'],
      [{ kind: 'start_reported_by_worker' }, 'kind'],
      [{ actorRole: 'WORKER' }, 'actorRole'],
      [{ actorRole: 'guest' }, 'actorRole'],
      [{ actorId: null }, 'actorId'],
      [{ actorId: 42 }, 'actorId'],
      [{ claimedAt: 'yesterday' }, 'claimedAt'],
      [{ claimedAt: '2026-01-02T10:00:00' }, 'claimedAt'],
      [{ claimedAt: '2026-02-30T10:00:00Z' }, 'claimedAt'],
      [{ claimedAt: 1767337200000 }, 'claimedAt'],
      [{ idempotencyKey: '' }, 'idempotencyKey'],
      [{ idempotencyKey: 'k'.repeat(129) }, 'idempotencyKey'],
      [{ note: 'x'.repeat(501) }, 'note'],
      [{ note: { text: 'x' } }, 'note'],
      [{ correctsEventId: '' }, 'correctsEventId'],
      [{ orderId: '' }, 'orderId'],
    ];
    cases.forEach(([overrides, field], index) => {
      const result = db.appendOrderEvent(sampleEvent('ORD-EVT-3', { idempotencyKey: 'bad:' + index, ...overrides }));
      assert.equal(result.code, 'invalid', JSON.stringify(overrides));
      assert.equal(result.field, field, JSON.stringify(overrides));
    });
    assert.equal(db.appendOrderEvent(sampleEvent('ORD-MISSING')).code, 'missing-order');
    assert.equal(db.appendOrderEvent(null).code, 'invalid');
    assert.equal(db.listOrderEvents('ORD-EVT-3').length, 0);
    assert.equal(ORDER_EVENT_KINDS.length, 13);
    assert.equal(ORDER_EVENT_KINDS.includes('ORDER_ACCEPTED'), true);
    assert.equal(Object.isFrozen(ORDER_EVENT_KINDS), true);
    db.close();
  });

  test('a correction is a new record that references an earlier event of the same order', () => {
    const { db } = freshStore();
    db.createOrder(sampleOrder('ORD-EVT-4'));
    db.createOrder(sampleOrder('ORD-EVT-5'));
    const original = db.appendOrderEvent(sampleEvent('ORD-EVT-4')).event;
    const otherOrderEvent = db.appendOrderEvent(sampleEvent('ORD-EVT-5')).event;

    const unknown = db.appendOrderEvent(sampleEvent('ORD-EVT-4', { idempotencyKey: 'fix:1', correctsEventId: 'EVT-NOPE' }));
    assert.equal(unknown.code, 'missing-correction');
    const crossOrder = db.appendOrderEvent(
      sampleEvent('ORD-EVT-4', { idempotencyKey: 'fix:2', correctsEventId: otherOrderEvent.id })
    );
    assert.equal(crossOrder.code, 'missing-correction');

    const fixed = db.appendOrderEvent(
      sampleEvent('ORD-EVT-4', {
        idempotencyKey: 'fix:3',
        claimedAt: '2026-01-02T09:30:00+03:30',
        correctsEventId: original.id,
      })
    );
    assert.equal(fixed.code, 'ok');
    assert.equal(fixed.event.correctsEventId, original.id);
    const events = db.listOrderEvents('ORD-EVT-4');
    assert.equal(events.length, 2);
    assert.deepEqual(events[0], original, 'the original record is unchanged');
    db.close();
  });

  test('order_events rejects UPDATE and DELETE at the database level', () => {
    const { file, db } = freshStore();
    db.createOrder(sampleOrder('ORD-EVT-6'));
    const event = db.appendOrderEvent(sampleEvent('ORD-EVT-6')).event;
    db.close();
    const raw = new DatabaseSync(file);
    assert.throws(() => raw.prepare("UPDATE order_events SET note = 'x' WHERE id = ?").run(event.id), /append-only/);
    assert.throws(() => raw.prepare('DELETE FROM order_events WHERE id = ?').run(event.id), /append-only/);
    assert.equal(raw.prepare('SELECT COUNT(*) AS c FROM order_events').get().c, 1);
    raw.close();
    const reopened = createDataStore(file);
    assert.deepEqual(reopened.listOrderEvents('ORD-EVT-6'), [event]);
    reopened.close();
  });

  test('two concurrent appends with one idempotency key leave exactly one event', async () => {
    const { file, db } = freshStore();
    db.createOrder(sampleOrder('ORD-EVT-RACE'));
    db.close();
    const event = sampleEvent('ORD-EVT-RACE', { idempotencyKey: 'race:ORD-EVT-RACE' });
    const run = () =>
      new Promise((resolve, reject) => {
        const worker = new Worker(__filename, { workerData: { sqlite: file, event } });
        worker.on('message', resolve);
        worker.on('error', reject);
      });
    const results = await Promise.all([run(), run()]);
    assert.deepEqual(results.sort(), ['duplicate', 'ok']);
    const check = createDataStore(file);
    assert.equal(check.listOrderEvents('ORD-EVT-RACE').length, 1);
    check.close();
  });

  test('recordAcceptance keeps the last acceptance on the order, the history in events, and needs a worker', () => {
    const { db } = freshStore();
    db.createOrder(sampleOrder('ORD-EVT-7', { expectedStartAt: '2026-10-08T08:00:00+03:30' }));
    assert.equal(db.getOrder('ORD-EVT-7').expectedStartAt, '2026-10-08T04:30:00.000Z');

    assert.throws(() => db.recordAcceptance('ORD-EVT-7', { actorRole: 'worker', actorId: 'W1' }), /ACCEPTANCE_WITHOUT_WORKER/);
    assert.equal(db.getOrder('ORD-EVT-7').acceptedAt, null);
    assert.deepEqual(db.listOrderEvents('ORD-EVT-7'), []);

    db.updateOrder(sampleOrder('ORD-EVT-7', { status: 'ACCEPTED', cleanerId: 'W1' }));
    assert.throws(() => db.recordAcceptance('ORD-EVT-7', { actorRole: 'customer', actorId: 'U1' }), /INVALID_ACCEPTANCE_ACTOR/);
    assert.throws(() => db.recordAcceptance('ORD-EVT-7', { actorRole: 'worker', actorId: 'W1', at: 'nope' }), /INVALID_ACCEPTED_AT/);
    assert.throws(() => db.recordAcceptance('ORD-MISSING', { actorRole: 'worker', actorId: 'W1' }), /ORDER_NOT_FOUND/);
    assert.deepEqual(db.listOrderEvents('ORD-EVT-7'), []);

    assert.equal(db.recordAcceptance('ORD-EVT-7', { actorRole: 'worker', actorId: 'W1', at: '2026-10-08T05:00:00Z' }), '2026-10-08T05:00:00.000Z');
    assert.equal(db.recordAcceptance('ORD-EVT-7', { actorRole: 'admin', actorId: null, at: '2026-10-08T06:00:00Z' }), '2026-10-08T06:00:00.000Z');
    assert.equal(db.getOrder('ORD-EVT-7').acceptedAt, '2026-10-08T06:00:00.000Z', 'the order keeps the last acceptance');
    const events = db.listOrderEvents('ORD-EVT-7');
    assert.deepEqual(
      events.map((event) => [event.kind, event.actorRole, event.actorId, event.claimedAt, event.idempotencyKey, event.note]),
      [
        ['ORDER_ACCEPTED', 'worker', 'W1', '2026-10-08T05:00:00.000Z', 'accept:ORD-EVT-7:1', null],
        ['ORDER_ACCEPTED', 'admin', null, '2026-10-08T06:00:00.000Z', 'accept:ORD-EVT-7:2', null],
      ]
    );

    const plain = sampleOrder('ORD-EVT-7', { status: 'ACCEPTED', cleanerId: 'W1', notes: 'تغییر' });
    const saved = db.updateOrder(plain);
    assert.equal(saved.notes, 'تغییر');
    assert.equal(saved.acceptedAt, '2026-10-08T06:00:00.000Z');
    assert.equal(saved.expectedStartAt, '2026-10-08T04:30:00.000Z');
    assert.equal(saved.startStatus, 'not_recorded');
    assert.throws(() => db.createOrder(sampleOrder('ORD-EVT-8', { expectedStartAt: 'not-a-time' })), /INVALID_EXPECTED_START_AT/);
    assert.equal(db.getOrder('ORD-EVT-8'), null, 'a rejected order is not half-saved');
    db.close();
  });

  test('two acceptances in the same millisecond get distinct keys and never overwrite earlier events', () => {
    const { db } = freshStore();
    db.createOrder(sampleOrder('ORD-EVT-MS', { status: 'ACCEPTED', cleanerId: 'W1' }));
    const at = '2026-10-08T05:00:00.000Z';
    db.recordAcceptance('ORD-EVT-MS', { actorRole: 'worker', actorId: 'W1', at });
    const first = db.listOrderEvents('ORD-EVT-MS')[0];
    db.updateOrder(sampleOrder('ORD-EVT-MS', { status: 'ACCEPTED', cleanerId: 'W2' }));
    db.recordAcceptance('ORD-EVT-MS', { actorRole: 'admin', actorId: null, at });
    db.recordAcceptance('ORD-EVT-MS', { actorRole: 'worker', actorId: 'W2', at });
    const events = db.listOrderEvents('ORD-EVT-MS');
    assert.equal(events.length, 3);
    assert.deepEqual(events.find((event) => event.id === first.id), first, 'the first acceptance event is untouched');
    assert.deepEqual(
      events.map((event) => event.idempotencyKey).sort(),
      ['accept:ORD-EVT-MS:1', 'accept:ORD-EVT-MS:2', 'accept:ORD-EVT-MS:3']
    );
    assert.equal(events.every((event) => event.claimedAt === at), true);
    db.close();
  });

  test('clearAcceptanceForReturnToPending is the only clearing path and needs a PENDING order', () => {
    const { db } = freshStore();
    db.createOrder(sampleOrder('ORD-EVT-CLR', { status: 'ACCEPTED', cleanerId: 'W1', cleanerName: 'متخصص', cleanerPhone: '09130000399' }));
    db.recordAcceptance('ORD-EVT-CLR', { actorRole: 'worker', actorId: 'W1', at: '2026-10-08T05:00:00Z' });
    assert.throws(() => db.clearAcceptanceForReturnToPending('ORD-EVT-CLR'), /ORDER_NOT_PENDING/);
    assert.equal(db.getOrder('ORD-EVT-CLR').acceptedAt, '2026-10-08T05:00:00.000Z');
    assert.throws(() => db.clearAcceptanceForReturnToPending('ORD-MISSING'), /ORDER_NOT_FOUND/);
    const events = db.listOrderEvents('ORD-EVT-CLR');
    db.updateOrder({ ...db.getOrder('ORD-EVT-CLR'), status: 'PENDING' });
    const cleared = db.clearAcceptanceForReturnToPending('ORD-EVT-CLR');
    assert.equal(cleared.status, 'PENDING');
    assert.equal(cleared.acceptedAt, null);
    assert.equal(cleared.cleanerId, null);
    assert.equal(cleared.cleanerName, null);
    assert.equal(cleared.cleanerPhone, null);
    assert.deepEqual(db.listOrderEvents('ORD-EVT-CLR'), events, 'history stays and no event is added');
    db.close();
  });

  test('normalizeIsoTimestamp accepts only explicit-zone ISO timestamps', () => {
    assert.equal(normalizeIsoTimestamp('2026-10-08T08:00:00+03:30'), '2026-10-08T04:30:00.000Z');
    assert.equal(normalizeIsoTimestamp('2026-10-08T04:30:00.000Z'), '2026-10-08T04:30:00.000Z');
    assert.equal(normalizeIsoTimestamp('2026-10-08T04:30Z'), '2026-10-08T04:30:00.000Z');
    for (const bad of ['', '2026-10-08', '2026-10-08 08:00:00Z', '2026-10-08T08:00:00', '2026-13-01T08:00:00Z',
      '2026-02-29T08:00:00Z', '2026-10-08T24:00:00Z', '2026-10-08T08:60:00Z', '2026-10-08T08:00:00+25:00', null, 5, {}]) {
      assert.equal(normalizeIsoTimestamp(bad), null, String(bad));
    }
  });

  test('POST /api/orders stores a valid expectedStartAt as UTC, allows it missing and rejects invalid values in Persian', async (t) => {
    const server = await startServer(t);
    const customer = await login(server, '09130000311', 'CUSTOMER');

    const withTime = await postOrder(server, customer.token, { expectedStartAt: '2026-10-08T08:00:00+03:30' });
    assert.equal(withTime.status, 200);
    assert.equal(withTime.json.order.expectedStartAt, '2026-10-08T04:30:00.000Z');
    assert.equal(store.getOrder(withTime.json.order.id).expectedStartAt, '2026-10-08T04:30:00.000Z');
    assert.equal(withTime.json.order.startStatus, 'not_recorded');
    assert.equal(withTime.json.order.acceptedAt, null);

    const pastTime = await postOrder(server, customer.token, { expectedStartAt: '2020-01-01T05:30:00.000Z' });
    assert.equal(pastTime.status, 200, 'no time rules: a past time is not rejected');
    assert.equal(pastTime.json.order.expectedStartAt, '2020-01-01T05:30:00.000Z');

    const missing = await postOrder(server, customer.token);
    assert.equal(missing.status, 200);
    assert.equal(missing.json.order.expectedStartAt, null);
    const explicitNull = await postOrder(server, customer.token, { expectedStartAt: null });
    assert.equal(explicitNull.status, 200);
    assert.equal(explicitNull.json.order.expectedStartAt, null);

    const before = store.getOrders({ customerId: customer.user.id }).length;
    for (const bad of ['not-a-date', '2026-13-01T08:00:00Z', '2026-10-08T08:00:00', 12345, { at: 'x' }, ['2026-10-08T08:00:00Z']]) {
      const res = await postOrder(server, customer.token, { expectedStartAt: bad });
      assert.equal(res.status, 400, JSON.stringify(bad));
      assert.equal(res.json.success, false);
      assert.equal(res.json.message, INVALID_START_MESSAGE);
      assert.equal(/[A-Za-z]/.test(res.json.message), false, 'no technical text');
    }
    assert.equal(store.getOrders({ customerId: customer.user.id }).length, before, 'rejected orders are not saved');
  });

  test('a reset to PENDING clears acceptedAt and the worker; re-acceptance records a new acceptedAt and keeps both events', async (t) => {
    const server = await startServer(t);
    const adminToken = await adminLogin(server);
    const customer = await login(server, '09130000321', 'CUSTOMER');
    const worker1 = await approvedWorker(server, '09130000322', adminToken);
    const worker2 = await approvedWorker(server, '09130000323', adminToken);
    const created = await postOrder(server, customer.token, { expectedStartAt: '2026-10-09T10:00:00+03:30' });
    const orderId = created.json.order.id;

    const first = await request(server, { method: 'PUT', pathname: '/api/orders/' + orderId + '/accept', token: worker1.token, body: {} });
    assert.equal(first.status, 200);
    const firstAcceptedAt = store.getOrder(orderId).acceptedAt;
    assert.ok(firstAcceptedAt);
    assert.equal(first.json.order.acceptedAt, firstAcceptedAt);

    const firstEvents = store.listOrderEvents(orderId);
    const reset = await request(server, { method: 'PUT', pathname: '/api/admin/orders/' + orderId, token: adminToken, body: { status: 'PENDING' } });
    assert.equal(reset.status, 200);
    const afterReset = store.getOrder(orderId);
    assert.equal(afterReset.status, 'PENDING');
    assert.equal(afterReset.acceptedAt, null, 'a reset to PENDING clears acceptedAt');
    assert.equal(afterReset.cleanerId, null, 'a reset to PENDING clears the assigned worker');
    assert.equal(afterReset.cleanerName, null);
    assert.equal(afterReset.cleanerPhone, null);
    assert.equal(reset.json.order.acceptedAt, null);
    assert.equal(reset.json.order.cleanerId, null);
    assert.deepEqual(store.listOrderEvents(orderId), firstEvents, 'the history stays and a reset adds no event');

    // متخصص قبلی دیگر سفارش را مال خود نمی‌بیند؛ فقط در فهرست سفارش‌های باز و بدون اطلاعات خصوصی دیده می‌شود.
    const mine = await request(server, { pathname: '/api/orders', token: worker1.token });
    assert.equal(mine.status, 200);
    assert.equal(mine.json.orders.some((item) => item.id === orderId), false);
    const open = await request(server, { pathname: '/api/orders/available', token: worker1.token });
    const listed = open.json.orders.find((item) => item.id === orderId);
    assert.ok(listed);
    assert.equal(listed.customerPhone, '');
    assert.equal(listed.notes, undefined);
    const worker1Notes = store.listNotifications(worker1.user.id).filter((item) => item.orderId === orderId);
    assert.equal(worker1Notes.some((item) => item.kind === 'ORDER_STATUS'), true, 'the removed worker is still told the status changed');

    const reactivated = await request(server, { method: 'PUT', pathname: '/api/admin/orders/' + orderId, token: adminToken, body: { status: 'ACCEPTED' } });
    assert.equal(reactivated.status, 400, 're-activation without a worker is rejected');
    assert.equal(reactivated.json.message, 'برای فعال کردن این سفارش، اول یک متخصص تأییدشده به آن اختصاص دهید.');
    assert.deepEqual(store.getOrder(orderId), afterReset, 'the rejected re-activation changes nothing');
    assert.deepEqual(store.listOrderEvents(orderId), firstEvents);

    await new Promise((resolve) => setTimeout(resolve, 5));
    const second = await request(server, { method: 'PUT', pathname: '/api/orders/' + orderId + '/accept', token: worker2.token, body: {} });
    assert.equal(second.status, 200);
    const order = store.getOrder(orderId);
    assert.equal(order.cleanerId, worker2.user.id);
    assert.notEqual(order.acceptedAt, firstAcceptedAt);
    assert.equal(Date.parse(order.acceptedAt) > Date.parse(firstAcceptedAt), true);
    assert.equal(order.expectedStartAt, '2026-10-09T06:30:00.000Z');
    const events = store.listOrderEvents(orderId);
    assert.deepEqual(
      events.map((event) => [event.kind, event.actorRole, event.actorId, event.claimedAt]),
      [
        ['ORDER_ACCEPTED', 'worker', worker1.user.id, firstAcceptedAt],
        ['ORDER_ACCEPTED', 'worker', worker2.user.id, order.acceptedAt],
      ]
    );
    assert.deepEqual(events[0], firstEvents[0], 'the first acceptance event is untouched');
  });

  test('complete, rate and cancel do not emit order events', async (t) => {
    const server = await startServer(t);
    const adminToken = await adminLogin(server);
    const customer = await login(server, '09130000324', 'CUSTOMER');
    const worker = await approvedWorker(server, '09130000325', adminToken);
    const orderId = (await postOrder(server, customer.token)).json.order.id;
    await request(server, { method: 'PUT', pathname: '/api/orders/' + orderId + '/accept', token: worker.token, body: {} });
    const completed = await request(server, { method: 'PUT', pathname: '/api/orders/' + orderId + '/complete', token: worker.token, body: {} });
    assert.equal(completed.status, 200);
    const rated = await request(server, { method: 'PUT', pathname: '/api/orders/' + orderId + '/rate', token: customer.token, body: { rating: 5 } });
    assert.equal(rated.status, 200);
    const cancelledId = (await postOrder(server, customer.token)).json.order.id;
    const cancelled = await request(server, { method: 'PUT', pathname: '/api/orders/' + cancelledId + '/cancel', token: customer.token, body: {} });
    assert.equal(cancelled.status, 200);
    assert.deepEqual(store.listOrderEvents(orderId).map((event) => event.kind), ['ORDER_ACCEPTED']);
    assert.deepEqual(store.listOrderEvents(cancelledId), []);
  });

  test('admin activation into each active status is an acceptance that needs a worker', async (t) => {
    const server = await startServer(t);
    const adminToken = await adminLogin(server);
    const customer = await login(server, '09130000331', 'CUSTOMER');
    const worker = await approvedWorker(server, '09130000332', adminToken);
    const adminPut = (orderId, body) =>
      request(server, { method: 'PUT', pathname: '/api/admin/orders/' + orderId, token: adminToken, body });

    for (const status of ['ACCEPTED', 'CONFIRMED', 'ASSIGNED', 'IN_PROGRESS']) {
      const withWorker = (await postOrder(server, customer.token)).json.order;
      const activated = await adminPut(withWorker.id, { status, cleanerId: worker.user.id });
      assert.equal(activated.status, 200, status);
      const saved = store.getOrder(withWorker.id);
      assert.equal(saved.status, status);
      assert.ok(saved.acceptedAt, status + ' records acceptedAt');
      assert.equal(activated.json.order.acceptedAt, saved.acceptedAt);
      assert.deepEqual(
        store.listOrderEvents(withWorker.id).map((event) => [event.kind, event.actorRole, event.actorId, event.claimedAt]),
        [['ORDER_ACCEPTED', 'admin', null, saved.acceptedAt]],
        status
      );

      const withoutWorker = (await postOrder(server, customer.token)).json.order;
      const rejected = await adminPut(withoutWorker.id, { status });
      assert.equal(rejected.status, 400, status + ' without a worker');
      assert.equal(rejected.json.success, false);
      assert.equal(rejected.json.message, 'برای فعال کردن این سفارش، اول یک متخصص تأییدشده به آن اختصاص دهید.');
      assert.equal(/[A-Za-z]/.test(rejected.json.message), false, 'no technical text');
      const unchanged = store.getOrder(withoutWorker.id);
      assert.equal(unchanged.status, 'PENDING');
      assert.equal(unchanged.acceptedAt, null);
      assert.deepEqual(store.listOrderEvents(withoutWorker.id), []);
    }
  });

  test('admin moves between active statuses are not new acceptances; worker assignment and reassignment are', async (t) => {
    const server = await startServer(t);
    const adminToken = await adminLogin(server);
    const customer = await login(server, '09130000341', 'CUSTOMER');
    const worker1 = await approvedWorker(server, '09130000342', adminToken);
    const worker2 = await approvedWorker(server, '09130000343', adminToken);
    const adminPut = (orderId, body) =>
      request(server, { method: 'PUT', pathname: '/api/admin/orders/' + orderId, token: adminToken, body });

    const order = (await postOrder(server, customer.token)).json.order;
    const assigned = await adminPut(order.id, { cleanerId: worker1.user.id });
    assert.equal(assigned.status, 200);
    assert.equal(assigned.json.order.status, 'ACCEPTED');
    const acceptedAt = store.getOrder(order.id).acceptedAt;
    assert.ok(acceptedAt);
    assert.equal(store.listOrderEvents(order.id).length, 1);

    for (const status of ['IN_PROGRESS', 'CONFIRMED', 'ASSIGNED', 'ACCEPTED']) {
      const moved = await adminPut(order.id, { status });
      assert.equal(moved.status, 200, status);
      assert.equal(store.getOrder(order.id).acceptedAt, acceptedAt, status + ' keeps acceptedAt');
    }
    const sameWorker = await adminPut(order.id, { cleanerId: worker1.user.id });
    assert.equal(sameWorker.status, 200);
    assert.equal(store.getOrder(order.id).acceptedAt, acceptedAt, 'the same worker again is not a new acceptance');
    assert.equal(store.listOrderEvents(order.id).length, 1);

    const eventsBefore = store.listOrderEvents(order.id);
    await new Promise((resolve) => setTimeout(resolve, 5));
    const reassigned = await adminPut(order.id, { cleanerId: worker2.user.id });
    assert.equal(reassigned.status, 200);
    const afterReassign = store.getOrder(order.id);
    assert.equal(afterReassign.cleanerId, worker2.user.id);
    assert.notEqual(afterReassign.acceptedAt, acceptedAt, 'another worker is a new acceptance');
    const eventsAfter = store.listOrderEvents(order.id);
    assert.equal(eventsAfter.length, 2);
    assert.deepEqual(eventsAfter[0], eventsBefore[0], 'the earlier acceptance event is untouched');
    assert.deepEqual(
      [eventsAfter[1].kind, eventsAfter[1].actorRole, eventsAfter[1].claimedAt],
      ['ORDER_ACCEPTED', 'admin', afterReassign.acceptedAt]
    );
    assert.notEqual(eventsAfter[1].idempotencyKey, eventsAfter[0].idempotencyKey);

    const completedFromActive = await adminPut(order.id, { status: 'COMPLETED' });
    assert.equal(completedFromActive.status, 200);
    assert.equal(store.listOrderEvents(order.id).length, 2, 'COMPLETED is not an acceptance');

    // PENDING → COMPLETED مستقیم مدیر رد می‌شود و سفارش تغییری نمی‌کند (با یا بدون متخصص در درخواست).
    const direct = (await postOrder(server, customer.token)).json.order;
    const before = store.getOrder(direct.id);
    for (const body of [{ status: 'COMPLETED' }, { status: 'COMPLETED', cleanerId: worker1.user.id }]) {
      const directCompleted = await adminPut(direct.id, body);
      assert.equal(directCompleted.status, 400);
      assert.equal(directCompleted.json.success, false);
      assert.equal(directCompleted.json.message, 'این سفارش هنوز توسط متخصصی پذیرفته نشده است و نمی‌توان آن را تکمیل‌شده ثبت کرد.');
      assert.equal(/[A-Za-z]/.test(directCompleted.json.message), false, 'no technical text');
      assert.deepEqual(store.getOrder(direct.id), before, 'the order is unchanged');
    }
    assert.deepEqual(store.listOrderEvents(direct.id), []);
  });

  test('admin activation re-checks the order\'s current worker inside the transaction', async (t) => {
    const server = await startServer(t);
    const adminToken = await adminLogin(server);
    const customer = await login(server, '09130000351', 'CUSTOMER');
    const worker1 = await approvedWorker(server, '09130000352', adminToken);
    const worker2 = await approvedWorker(server, '09130000353', adminToken);
    const unapproved = await login(server, '09130000354', 'WORKER');
    const adminPut = (orderId, body) =>
      request(server, { method: 'PUT', pathname: '/api/admin/orders/' + orderId, token: adminToken, body });
    const setUserStatus = (userId, status) =>
      request(server, { method: 'PUT', pathname: '/api/admin/users/' + userId + '/status', token: adminToken, body: { status } });
    const snapshot = (orderId) => ({
      order: store.getOrder(orderId),
      events: store.listOrderEvents(orderId),
      customerNotifications: store.listNotifications(customer.user.id).length,
    });
    async function assertRejected(orderId, body, message, label) {
      const before = snapshot(orderId);
      const rejected = await adminPut(orderId, body);
      assert.equal(rejected.status, 400, label);
      assert.equal(rejected.json.success, false, label);
      assert.equal(rejected.json.message, message, label);
      assert.equal(/[A-Za-z]/.test(rejected.json.message), false, label + ': no technical text');
      assert.deepEqual(snapshot(orderId), before, label + ': order, events and notifications unchanged');
    }

    // CANCELLED → فعال: متخصص قبلی بعد از لغو مسدود شده است.
    const cancelledId = (await postOrder(server, customer.token)).json.order.id;
    assert.equal((await request(server, { method: 'PUT', pathname: '/api/orders/' + cancelledId + '/accept', token: worker1.token, body: {} })).status, 200);
    assert.equal((await request(server, { method: 'PUT', pathname: '/api/orders/' + cancelledId + '/cancel', token: customer.token, body: {} })).status, 200);
    assert.equal((await setUserStatus(worker1.user.id, 'BLOCKED')).status, 200);
    for (const status of ['ACCEPTED', 'CONFIRMED', 'ASSIGNED', 'IN_PROGRESS']) {
      await assertRejected(cancelledId, { status }, 'متخصص هنوز تایید نشده است.', 'CANCELLED → ' + status + ' with a blocked worker');
    }

    // COMPLETED → ACCEPTED با متخصص مسدود.
    const completedId = (await postOrder(server, customer.token)).json.order.id;
    assert.equal((await adminPut(completedId, { cleanerId: worker2.user.id })).status, 200);
    assert.equal((await adminPut(completedId, { status: 'COMPLETED' })).status, 200);
    assert.equal((await setUserStatus(worker2.user.id, 'BLOCKED')).status, 200);
    await assertRejected(completedId, { status: 'ACCEPTED' }, 'متخصص هنوز تایید نشده است.', 'COMPLETED → ACCEPTED with a blocked worker');

    // متخصص تأییدنشده، شناسه ناموجود و کاربری که متخصص نیست (داده قدیمی، فقط در پایگاه داده آزمایشی).
    const staleCases = [
      [unapproved.user.id, 'متخصص هنوز تایید نشده است.', 'an unapproved worker'],
      ['USER-DOES-NOT-EXIST', 'متخصص معتبر یافت نشد.', 'a missing worker'],
      [customer.user.id, 'متخصص معتبر یافت نشد.', 'a non-worker user'],
    ];
    for (const [staleId, message, label] of staleCases) {
      for (const closed of ['CANCELLED', 'COMPLETED']) {
        const id = (await postOrder(server, customer.token)).json.order.id;
        store.updateOrder({ ...store.getOrder(id), status: closed, cleanerId: staleId, cleanerName: 'قدیمی' });
        await assertRejected(id, { status: 'ACCEPTED' }, message, closed + ' → ACCEPTED with ' + label);
      }
    }

    // PENDING → فعال: متخصص مسدود در درخواست رد می‌شود و متخصص باقی‌مانده روی ردیف PENDING قدیمی پذیرش حساب نمی‌شود.
    const pendingId = (await postOrder(server, customer.token)).json.order.id;
    await assertRejected(pendingId, { cleanerId: worker1.user.id, status: 'ACCEPTED' }, 'متخصص هنوز تایید نشده است.', 'PENDING → ACCEPTED with a blocked worker');
    const legacyPendingId = (await postOrder(server, customer.token)).json.order.id;
    const worker3 = await approvedWorker(server, '09130000355', adminToken);
    store.updateOrder({ ...store.getOrder(legacyPendingId), cleanerId: worker3.user.id, cleanerName: 'باقی‌مانده' });
    for (const status of ['ACCEPTED', 'ASSIGNED']) {
      await assertRejected(
        legacyPendingId,
        { status },
        'برای فعال کردن این سفارش، اول یک متخصص تأییدشده به آن اختصاص دهید.',
        'legacy PENDING with a leftover worker → ' + status
      );
    }

    // متخصص دوباره تأییدشده: فعال‌سازی دوباره مجاز است و پذیرش تازه ثبت می‌شود؛ رویداد قبلی می‌ماند.
    assert.equal((await setUserStatus(worker1.user.id, 'APPROVED')).status, 200);
    const eventsBefore = store.listOrderEvents(cancelledId);
    await new Promise((resolve) => setTimeout(resolve, 5));
    const reactivated = await adminPut(cancelledId, { status: 'ACCEPTED' });
    assert.equal(reactivated.status, 200);
    const order = store.getOrder(cancelledId);
    assert.equal(order.status, 'ACCEPTED');
    assert.equal(order.cleanerId, worker1.user.id);
    const eventsAfter = store.listOrderEvents(cancelledId);
    assert.equal(eventsAfter.length, eventsBefore.length + 1);
    assert.deepEqual(eventsAfter.slice(0, eventsBefore.length), eventsBefore);
    assert.deepEqual([eventsAfter.at(-1).kind, eventsAfter.at(-1).claimedAt], ['ORDER_ACCEPTED', order.acceptedAt]);
  });

  test('saving an order as PENDING always removes the worker, so no later change re-activates it silently', async (t) => {
    const server = await startServer(t);
    const adminToken = await adminLogin(server);
    const customer = await login(server, '09130000361', 'CUSTOMER');
    const worker1 = await approvedWorker(server, '09130000362', adminToken);
    const worker2 = await approvedWorker(server, '09130000363', adminToken);
    const adminPut = (orderId, body) =>
      request(server, { method: 'PUT', pathname: '/api/admin/orders/' + orderId, token: adminToken, body });
    function assertNoWorker(order, label) {
      assert.equal(order.status, 'PENDING', label);
      for (const key of ['cleanerId', 'cleanerName', 'cleanerAvatar', 'cleanerPhone', 'acceptedAt']) {
        assert.equal(order[key], null, label + ': ' + key);
      }
    }
    async function assertNotInWorkerList(worker, orderId, label) {
      const mine = await request(server, { pathname: '/api/orders', token: worker.token });
      assert.equal(mine.json.orders.some((item) => item.id === orderId), false, label);
    }

    // PENDING → PENDING با cleanerId در درخواست: متخصصی ذخیره نمی‌شود و اعلانی به متخصص ارسال نمی‌شود.
    const pendingId = (await postOrder(server, customer.token)).json.order.id;
    const initialWorker1Notes = store.listNotifications(worker1.user.id).length;
    const kept = await adminPut(pendingId, { cleanerId: worker1.user.id, status: 'PENDING' });
    assert.equal(kept.status, 200);
    assertNoWorker(kept.json.order, 'PENDING with cleanerId response');
    assertNoWorker(store.getOrder(pendingId), 'PENDING with cleanerId stored');
    assert.deepEqual(store.listOrderEvents(pendingId), []);
    assert.equal(store.listNotifications(worker1.user.id).length, initialWorker1Notes, 'no notification sent to requested cleaner on PENDING');
    await assertNotInWorkerList(worker1, pendingId, 'the worker does not get a PENDING order');
    for (const status of ['ASSIGNED', 'ACCEPTED', 'CONFIRMED', 'IN_PROGRESS']) {
      const later = await adminPut(pendingId, { status });
      assert.equal(later.status, 400, status + ' after PENDING');
      assert.equal(later.json.message, 'برای فعال کردن این سفارش، اول یک متخصص تأییدشده به آن اختصاص دهید.');
      assertNoWorker(store.getOrder(pendingId), status + ' changes nothing');
    }

    // فعال → PENDING همراه با متخصص دیگر در درخواست: متخصص پاک می‌شود و رویداد پذیرش قبلی می‌ماند.
    const activeId = (await postOrder(server, customer.token)).json.order.id;
    assert.equal((await request(server, { method: 'PUT', pathname: '/api/orders/' + activeId + '/accept', token: worker1.token, body: {} })).status, 200);
    const activeEvents = store.listOrderEvents(activeId);
    const reset = await adminPut(activeId, { cleanerId: worker2.user.id, status: 'PENDING' });
    assert.equal(reset.status, 200);
    assertNoWorker(store.getOrder(activeId), 'active → PENDING with another cleanerId');
    assert.deepEqual(store.listOrderEvents(activeId), activeEvents);
    await assertNotInWorkerList(worker1, activeId, 'previous worker');
    await assertNotInWorkerList(worker2, activeId, 'worker in the request');
    assert.equal((await adminPut(activeId, { status: 'ASSIGNED' })).status, 400);

    // لغوشده یا انجام‌شده → PENDING: متخصص و acceptedAt پاک می‌شوند و متخصص قبلی اعلان می‌گیرد.
    for (const closed of ['CANCELLED', 'COMPLETED']) {
      const id = (await postOrder(server, customer.token)).json.order.id;
      assert.equal((await request(server, { method: 'PUT', pathname: '/api/orders/' + id + '/accept', token: worker1.token, body: {} })).status, 200);
      assert.equal((await adminPut(id, { status: closed })).status, 200);
      const events = store.listOrderEvents(id);
      const back = await adminPut(id, { status: 'PENDING' });
      assert.equal(back.status, 200, closed + ' → PENDING');
      assertNoWorker(store.getOrder(id), closed + ' → PENDING');
      assert.deepEqual(store.listOrderEvents(id), events, closed + ': history kept');
      const told = store.listNotifications(worker1.user.id).filter((item) => item.orderId === id && item.kind === 'ORDER_STATUS');
      assert.equal(told.length, 2, closed + ': the removed worker is told about both changes');
      await assertNotInWorkerList(worker1, id, closed + ' → PENDING');
      const later = await adminPut(id, { status: 'ACCEPTED' });
      assert.equal(later.status, 400, closed + ' → PENDING → ACCEPTED without a worker');
      assertNoWorker(store.getOrder(id), closed + ': rejected activation changes nothing');
    }
  });

  test('admin cannot swap the worker in the same request that completes or cancels the order', async (t) => {
    const server = await startServer(t);
    const adminToken = await adminLogin(server);
    const customer = await login(server, '09130000371', 'CUSTOMER');
    const worker1 = await approvedWorker(server, '09130000372', adminToken);
    const worker2 = await approvedWorker(server, '09130000373', adminToken);
    const adminPut = (orderId, body) =>
      request(server, { method: 'PUT', pathname: '/api/admin/orders/' + orderId, token: adminToken, body });
    const SWAP_MESSAGE = 'تغییر متخصص همراه با تکمیل یا لغو سفارش ممکن نیست. اول متخصص جدید را به سفارش اختصاص دهید، بعد وضعیت را تغییر دهید.';
    async function acceptedBy(worker) {
      const id = (await postOrder(server, customer.token)).json.order.id;
      assert.equal((await request(server, { method: 'PUT', pathname: '/api/orders/' + id + '/accept', token: worker.token, body: {} })).status, 200);
      return id;
    }
    async function assertSwapRejected(id, body, label) {
      const before = { order: store.getOrder(id), events: store.listOrderEvents(id), notes: store.listNotifications(customer.user.id).length };
      const rejected = await adminPut(id, body);
      assert.equal(rejected.status, 400, label);
      assert.equal(rejected.json.success, false, label);
      assert.equal(rejected.json.message, SWAP_MESSAGE, label);
      assert.equal(/[A-Za-z]/.test(rejected.json.message), false, label + ': no technical text');
      assert.deepEqual(
        { order: store.getOrder(id), events: store.listOrderEvents(id), notes: store.listNotifications(customer.user.id).length },
        before,
        label + ': nothing changes'
      );
    }

    const activeId = await acceptedBy(worker1);
    for (const status of ['COMPLETED', 'CANCELLED']) {
      await assertSwapRejected(activeId, { cleanerId: worker2.user.id, status }, 'active + swap + ' + status);
    }
    assert.equal(store.getOrder(activeId).cleanerId, worker1.user.id);

    // روی سفارش بسته‌شده هم تعویض متخصص بدون پذیرش ممکن نیست.
    const cancelledId = await acceptedBy(worker1);
    assert.equal((await adminPut(cancelledId, { status: 'CANCELLED' })).status, 200);
    await assertSwapRejected(cancelledId, { cleanerId: worker2.user.id, status: 'CANCELLED' }, 'cancelled + swap + CANCELLED');
    await assertSwapRejected(cancelledId, { cleanerId: worker2.user.id, status: 'COMPLETED' }, 'cancelled + swap + COMPLETED');
    const pendingId = (await postOrder(server, customer.token)).json.order.id;
    await assertSwapRejected(pendingId, { cleanerId: worker2.user.id, status: 'CANCELLED' }, 'pending + worker + CANCELLED');

    // همان متخصص یا بدون cleanerId: تکمیل و لغو مثل قبل کار می‌کند و پذیرش جدیدی ساخته نمی‌شود.
    for (const [status, withSameWorker] of [['COMPLETED', true], ['CANCELLED', true], ['COMPLETED', false], ['CANCELLED', false]]) {
      const id = await acceptedBy(worker1);
      const events = store.listOrderEvents(id);
      const acceptedAt = store.getOrder(id).acceptedAt;
      const body = withSameWorker ? { cleanerId: worker1.user.id, status } : { status };
      const done = await adminPut(id, body);
      assert.equal(done.status, 200, status + (withSameWorker ? ' with the same worker' : ' without cleanerId'));
      const saved = store.getOrder(id);
      assert.equal(saved.status, status);
      assert.equal(saved.cleanerId, worker1.user.id);
      assert.equal(saved.acceptedAt, acceptedAt);
      assert.deepEqual(store.listOrderEvents(id), events);
    }

    // مسیر معتبر: اول اختصاص متخصص جدید (پذیرش تازه)، بعد تکمیل.
    const eventsBefore = store.listOrderEvents(activeId);
    await new Promise((resolve) => setTimeout(resolve, 5));
    assert.equal((await adminPut(activeId, { cleanerId: worker2.user.id })).status, 200);
    const reassigned = store.getOrder(activeId);
    const eventsAfter = store.listOrderEvents(activeId);
    assert.equal(eventsAfter.length, eventsBefore.length + 1);
    assert.deepEqual(eventsAfter[0], eventsBefore[0]);
    assert.equal(eventsAfter.at(-1).claimedAt, reassigned.acceptedAt);
    const completed = await adminPut(activeId, { cleanerId: worker2.user.id, status: 'COMPLETED' });
    assert.equal(completed.status, 200);
    assert.equal(store.getOrder(activeId).cleanerId, worker2.user.id);
    assert.equal(store.getOrder(activeId).acceptedAt, reassigned.acceptedAt);
    assert.equal(store.listOrderEvents(activeId).length, eventsAfter.length);
  });

  test('admin reassigning an active order notifies both previous and new workers', async (t) => {
    const server = await startServer(t);
    const adminToken = await adminLogin(server);
    const customer = await login(server, '09130000391', 'CUSTOMER');
    const workerA = await approvedWorker(server, '09130000392', adminToken);
    const workerB = await approvedWorker(server, '09130000393', adminToken);
    const adminPut = (orderId, body) =>
      request(server, { method: 'PUT', pathname: '/api/admin/orders/' + orderId, token: adminToken, body });

    const orderNotes = (userId, orderId) =>
      store.listNotifications(userId).filter((item) => item.orderId === orderId).reverse();

    // ۱. PENDING → B: فقط B اعلان می‌گیرد؛ هیچ اعلان Reassign صادر نمی‌شود
    const pendingOrder = (await postOrder(server, customer.token)).json.order;
    const pendingToB = await adminPut(pendingOrder.id, { cleanerId: workerB.user.id, status: 'ACCEPTED' });
    assert.equal(pendingToB.status, 200);
    assert.equal(orderNotes(workerA.user.id, pendingOrder.id).length, 0);
    assert.equal(orderNotes(workerB.user.id, pendingOrder.id).length, 1);
    assert.equal(orderNotes(workerB.user.id, pendingOrder.id)[0].kind, 'ORDER_STATUS');

    // ایجاد یک سفارش فعال تحت هدایت متخصص A
    const activeOrder = (await postOrder(server, customer.token)).json.order;
    assert.equal(
      (await request(server, { method: 'PUT', pathname: '/api/orders/' + activeOrder.id + '/accept', token: workerA.token, body: {} })).status,
      200
    );
    const initialCustomerNotes = orderNotes(customer.user.id, activeOrder.id).length;
    const initialWorkerANotes = orderNotes(workerA.user.id, activeOrder.id).length;
    const initialWorkerBNotes = orderNotes(workerB.user.id, activeOrder.id).length;

    // ۲. A → B با status ثابت: A اعلان ORDER_REASSIGNED و B اعلان ORDER_ASSIGNED می‌گیرد؛ مشتری اعلان جدیدی نمی‌گیرد
    const swapFixedStatus = await adminPut(activeOrder.id, { cleanerId: workerB.user.id });
    assert.equal(swapFixedStatus.status, 200);
    assert.equal(swapFixedStatus.json.order.cleanerId, workerB.user.id);

    const aNotesAfterSwap1 = orderNotes(workerA.user.id, activeOrder.id);
    const freshA1 = aNotesAfterSwap1.slice(initialWorkerANotes);
    assert.equal(freshA1.length, 1);
    assert.equal(freshA1[0].kind, 'ORDER_REASSIGNED');
    assert.equal(freshA1[0].title, 'تغییر متخصص سفارش');
    assert.equal(freshA1[0].body.includes('به متخصص دیگری واگذار شد'), true);

    const bNotesAfterSwap1 = orderNotes(workerB.user.id, activeOrder.id);
    const freshB1 = bNotesAfterSwap1.slice(initialWorkerBNotes);
    assert.equal(freshB1.length, 1);
    assert.equal(freshB1[0].kind, 'ORDER_ASSIGNED');
    assert.equal(freshB1[0].title, 'واگذاری سفارش جدید');
    assert.equal(freshB1[0].body.includes('به شما واگذار شد'), true);

    // برای مشتری هیچ اعلان جدیدی اضافه نمی‌شود
    assert.equal(orderNotes(customer.user.id, activeOrder.id).length, initialCustomerNotes);

    // ۳. تغییر متخصص به همان متخصص قبلی (B → B): هیچ اعلان واگذاری یا سلب جدیدی تولید نمی‌شود
    const bCountBefore = orderNotes(workerB.user.id, activeOrder.id).length;
    const sameWorker = await adminPut(activeOrder.id, { cleanerId: workerB.user.id });
    assert.equal(sameWorker.status, 200);
    assert.equal(orderNotes(workerB.user.id, activeOrder.id).length, bCountBefore);

    // ۴. B → A همراه با تغییر وضعیت (مثلاً به IN_PROGRESS):
    // B اعلان ORDER_REASSIGNED می‌گیرد؛ A فقط یک اعلان ORDER_ASSIGNED می‌گیرد (بدون اعلان تکراری ORDER_STATUS)؛ مشتری اعلان تغییر وضعیت می‌گیرد
    const custCountBeforeStatusChange = orderNotes(customer.user.id, activeOrder.id).length;
    const bCountBeforeSwap2 = orderNotes(workerB.user.id, activeOrder.id).length;
    const aCountBeforeSwap2 = orderNotes(workerA.user.id, activeOrder.id).length;

    const swapWithStatus = await adminPut(activeOrder.id, { cleanerId: workerA.user.id, status: 'IN_PROGRESS' });
    assert.equal(swapWithStatus.status, 200);
    assert.equal(swapWithStatus.json.order.cleanerId, workerA.user.id);
    assert.equal(swapWithStatus.json.order.status, 'IN_PROGRESS');

    const freshB2 = orderNotes(workerB.user.id, activeOrder.id).slice(bCountBeforeSwap2);
    assert.equal(freshB2.length, 1);
    assert.equal(freshB2[0].kind, 'ORDER_REASSIGNED');

    const freshA2 = orderNotes(workerA.user.id, activeOrder.id).slice(aCountBeforeSwap2);
    assert.equal(freshA2.length, 1, 'worker A receives only ORDER_ASSIGNED, without duplicate ORDER_STATUS');
    assert.equal(freshA2[0].kind, 'ORDER_ASSIGNED');

    const freshCust = orderNotes(customer.user.id, activeOrder.id).slice(custCountBeforeStatusChange);
    assert.equal(freshCust.length, 1);
    assert.equal(freshCust[0].kind, 'ORDER_STATUS');

    // ۵. بدون تغییر متخصص ولی با تغییر وضعیت: فقط اعلان عادی تغییر وضعیت ارسال می‌شود
    const aCountBeforeStatusOnly = orderNotes(workerA.user.id, activeOrder.id).length;
    const statusOnly = await adminPut(activeOrder.id, { status: 'CONFIRMED' });
    assert.equal(statusOnly.status, 200);
    const freshAStatusOnly = orderNotes(workerA.user.id, activeOrder.id).slice(aCountBeforeStatusOnly);
    assert.equal(freshAStatusOnly.length, 1);
    assert.equal(freshAStatusOnly[0].kind, 'ORDER_STATUS');

    // ۶. ارسال متخصص نامعتبر/تأییدنشده: ارور ۴۰۰ برمی‌گردد و هیچ اعلانی ثبت نمی‌شود (Rollback)
    const aCountBeforeBad = orderNotes(workerA.user.id, activeOrder.id).length;
    const badWorker = await adminPut(activeOrder.id, { cleanerId: 'non-existent-user' });
    assert.equal(badWorker.status, 400);
    assert.equal(orderNotes(workerA.user.id, activeOrder.id).length, aCountBeforeBad);
  });

  test('admin status notifications use Persian status labels, never raw status values', async (t) => {
    const server = await startServer(t);
    const adminToken = await adminLogin(server);
    const customer = await login(server, '09130000381', 'CUSTOMER');
    const worker = await approvedWorker(server, '09130000382', adminToken);
    const adminPut = (orderId, body) =>
      request(server, { method: 'PUT', pathname: '/api/admin/orders/' + orderId, token: adminToken, body });
    const id = (await postOrder(server, customer.token)).json.order.id;
    const steps = [
      [{ cleanerId: worker.user.id }, 'در حال انجام'],
      [{ status: 'CONFIRMED' }, 'تأیید شده'],
      [{ status: 'ASSIGNED' }, 'تخصیص متخصص'],
      [{ status: 'IN_PROGRESS' }, 'در حال انجام'],
      [{ status: 'COMPLETED' }, 'انجام شده'],
      [{ status: 'CANCELLED' }, 'لغو شده'],
      [{ status: 'PENDING' }, 'در انتظار تأیید'],
    ];
    const RAW = /\b(PENDING|ACCEPTED|CONFIRMED|ASSIGNED|IN_PROGRESS|COMPLETED|CANCELLED)\b/;
    const statusNotifications = (userId) =>
      store.listNotifications(userId).filter((item) => item.orderId === id && item.kind === 'ORDER_STATUS');
    for (const [body, label] of steps) {
      const seen = new Map([customer.user.id, worker.user.id].map((userId) => [userId, new Set(statusNotifications(userId).map((item) => item.id))]));
      assert.equal((await adminPut(id, body)).status, 200, JSON.stringify(body));
      for (const userId of [customer.user.id, worker.user.id]) {
        const fresh = statusNotifications(userId).filter((item) => !seen.get(userId).has(item.id));
        assert.equal(fresh.length, 1, 'one new status notification for ' + label);
        assert.equal(fresh[0].body.includes('«' + label + '»'), true, fresh[0].body);
        assert.equal(RAW.test(fresh[0].title + ' ' + fresh[0].body), false, 'no raw status: ' + fresh[0].body);
      }
    }
    for (const userId of [customer.user.id, worker.user.id]) {
      for (const item of store.listNotifications(userId).filter((n) => n.kind === 'ORDER_STATUS')) {
        assert.equal(RAW.test(item.title + ' ' + item.body), false, 'no raw status: ' + item.body);
      }
    }
  });

  test('order_events cannot be overwritten through REPLACE, INSERT OR IGNORE or UPSERT', () => {
    const { file, db } = freshStore();
    db.createOrder(sampleOrder('ORD-EVT-9'));
    const original = db.appendOrderEvent(sampleEvent('ORD-EVT-9')).event;
    const correction = db.appendOrderEvent(
      sampleEvent('ORD-EVT-9', { idempotencyKey: 'fix:ORD-EVT-9', correctsEventId: original.id })
    ).event;
    db.close();

    const raw = new DatabaseSync(file);
    const columns = 'id, orderId, actorId, actorRole, kind, claimedAt, recordedAt, correctsEventId, note, idempotencyKey';
    const values = (id, key) => [id, 'ORD-EVT-9', 'X', 'worker', 'END_REPORTED_BY_WORKER', null, '2026-01-01T00:00:00.000Z', null, 'x', key];
    const attempts = [
      ['INSERT OR REPLACE by id', `INSERT OR REPLACE INTO order_events (${columns}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, values(original.id, 'other:1')],
      ['REPLACE INTO by id', `REPLACE INTO order_events (${columns}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, values(original.id, 'other:2')],
      ['INSERT OR REPLACE by key', `INSERT OR REPLACE INTO order_events (${columns}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, values('EVT-NEW-1', original.idempotencyKey)],
      ['REPLACE INTO by key of a referenced event', `REPLACE INTO order_events (${columns}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, values('EVT-NEW-2', original.idempotencyKey)],
      ['REPLACE INTO by key of the correction', `REPLACE INTO order_events (${columns}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, values('EVT-NEW-3', correction.idempotencyKey)],
      ['INSERT OR IGNORE by id', `INSERT OR IGNORE INTO order_events (${columns}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, values(original.id, 'other:3')],
      ['INSERT OR IGNORE by key', `INSERT OR IGNORE INTO order_events (${columns}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, values('EVT-NEW-4', original.idempotencyKey)],
      ['UPSERT DO UPDATE', `INSERT INTO order_events (${columns}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(idempotencyKey) DO UPDATE SET note = 'x'`, values('EVT-NEW-5', original.idempotencyKey)],
      ['UPSERT DO NOTHING', `INSERT INTO order_events (${columns}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT DO NOTHING`, values('EVT-NEW-6', original.idempotencyKey)],
      ['plain duplicate id', `INSERT INTO order_events (${columns}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, values(original.id, 'other:4')],
    ];
    for (const [label, sql, params] of attempts) {
      assert.throws(() => raw.prepare(sql).run(...params), /append-only/, label);
    }
    // درج یک رکورد واقعاً جدید هنوز ممکن است (فقط درج).
    raw.prepare(`INSERT INTO order_events (${columns}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(...values('EVT-NEW-OK', 'fresh:1'));
    assert.equal(raw.prepare('SELECT COUNT(*) AS c FROM order_events').get().c, 3);
    raw.close();

    const reopened = createDataStore(file);
    const events = reopened.listOrderEvents('ORD-EVT-9');
    const byId = (id) => events.find((event) => event.id === id);
    assert.equal(events.length, 3);
    assert.deepEqual(byId(original.id), original, 'the original event is untouched');
    assert.deepEqual(byId(correction.id), correction, 'the correction chain is intact');
    assert.equal(byId(correction.id).correctsEventId, original.id);
    assert.equal(reopened.appendOrderEvent(sampleEvent('ORD-EVT-9')).code, 'duplicate');
    assert.equal(reopened.appendOrderEvent(sampleEvent('ORD-EVT-9', { note: 'دیگر' })).code, 'key-conflict');
    reopened.close();
  });

  test('an older database gains the new columns and tables once, keeping its data', () => {
    const file = path.join(tmp, 'legacy-stage1.sqlite');
    const legacy = new DatabaseSync(file);
    legacy.exec(`
      CREATE TABLE orders (
        id TEXT PRIMARY KEY, customerId TEXT NOT NULL, customerName TEXT NOT NULL, customerPhone TEXT NOT NULL,
        customerAvatar TEXT, serviceTitle TEXT NOT NULL, address TEXT NOT NULL, date TEXT NOT NULL, time TEXT NOT NULL,
        price INTEGER NOT NULL, notes TEXT, status TEXT NOT NULL, paymentStatus TEXT, paymentMethod TEXT,
        cleanerId TEXT, cleanerName TEXT, cleanerAvatar TEXT, cleanerPhone TEXT, ratingsJson TEXT,
        createdAt TEXT NOT NULL, completedAt TEXT, cancelledAt TEXT, cancelledBy TEXT, cancelReason TEXT,
        seq INTEGER NOT NULL
      );
    `);
    legacy
      .prepare(
        `INSERT INTO orders (id, customerId, customerName, customerPhone, serviceTitle, address, date, time, price, status, cleanerId, createdAt, seq)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run('ORD-LEGACY', 'USER-OLD', 'مشتری قدیمی', '09120000000', 'نظافت', 'تهران', 'مهر 1', '09:00', 40000, 'ACCEPTED', 'WORKER-OLD', '2026-01-01T00:00:00.000Z', 1);
    legacy.close();

    const first = createDataStore(file);
    const migrated = first.getOrder('ORD-LEGACY');
    assert.equal(migrated.status, 'ACCEPTED');
    assert.equal(migrated.cleanerId, 'WORKER-OLD');
    assert.equal(migrated.startStatus, 'not_recorded');
    assert.equal(migrated.acceptedAt, null, 'no invented acceptance time for old orders');
    assert.equal(migrated.expectedStartAt, null);
    assert.equal(migrated.agreedStartAt, null);
    assert.equal(first.appendOrderEvent(sampleEvent('ORD-LEGACY')).code, 'ok');
    first.close();

    const second = createDataStore(file);
    assert.equal(second.listOrderEvents('ORD-LEGACY').length, 1);
    assert.equal(second.getOrder('ORD-LEGACY').startStatus, 'not_recorded');
    second.close();

    const raw = new DatabaseSync(file, { readOnly: true });
    const columns = raw.prepare('PRAGMA table_info(orders)').all().map((column) => column.name);
    for (const name of ['acceptedAt', 'expectedStartAt', 'agreedStartAt', 'startStatus']) {
      assert.equal(columns.filter((column) => column === name).length, 1, name);
    }
    const triggers = raw.prepare("SELECT name FROM sqlite_master WHERE type = 'trigger'").all().map((row) => row.name).sort();
    assert.deepEqual(triggers, ['order_events_no_delete', 'order_events_no_overwrite', 'order_events_no_update']);
    raw.close();
  });
}
