'use strict';

const { normalizeIranMobile } = require('./kavenegarSms');

const messages = Object.freeze({
  ORDER_CREATED: 'سفارش شما ثبت شد.',
  ORDER_ACCEPTED: 'متخصص سفارش شما را پذیرفت.',
  START_REPORTED: 'متخصص شروع کار را اعلام کرد. لطفاً در سایت پاک‌شو آن را بررسی کنید.',
  END_REPORTED: 'پایان کار ثبت شد. لطفاً در سایت پاک‌شو پایان کار و مبلغ را بررسی کنید.',
  ORDER_COMPLETED: 'پایان کار سفارش شما تأیید شد.',
});

const templates = {
  ORDER_CREATED: 'PAKSHO_ORDER_SMS_CREATED_TEMPLATE',
  ORDER_ACCEPTED: 'PAKSHO_ORDER_SMS_ACCEPTED_TEMPLATE',
  START_REPORTED: 'PAKSHO_ORDER_SMS_START_TEMPLATE',
  END_REPORTED: 'PAKSHO_ORDER_SMS_END_TEMPLATE',
  ORDER_COMPLETED: 'PAKSHO_ORDER_SMS_COMPLETED_TEMPLATE',
};
const trackingCodePattern = /^ORD-([0-9A-Z]+)-([0-9a-f]{8})$/;

function readOrderSmsConfig(env = process.env) {
  const apiKey = env.KAVENEGAR_API_KEY?.trim();
  if (env.NODE_ENV === 'test' || env.PAKSHO_SMS_MODE === 'fake' || !apiKey) return null;
  const rawSender = env.PAKSHO_ORDER_SMS_SENDER?.trim();
  const sender = /^\d{4,20}$/.test(rawSender ?? '') ? rawSender : null;
  const templateByKind = Object.fromEntries(Object.entries(templates)
    .map(([kind, name]) => [kind, env[name]?.trim()])
    .filter(([, name]) => /^[A-Za-z0-9-]+$/.test(name ?? '')));
  const enabledKinds = new Set(sender ? Object.keys(messages) : Object.keys(templateByKind));
  return enabledKinds.size ? { apiKey, sender, templateByKind, enabledKinds } : null;
}

function createOrderSmsOutbox({ database, transaction, getOrder, getUser, enabledKinds }) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS order_sms_outbox (
      id TEXT PRIMARY KEY, order_id TEXT NOT NULL, user_id TEXT NOT NULL, kind TEXT NOT NULL,
      created_at TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'pending'
        CHECK(state IN ('pending','sending','accepted','failed','unknown','skipped')),
      claimed_at TEXT, provider_code INTEGER, provider_message_id TEXT
    );
    CREATE INDEX IF NOT EXISTS order_sms_pending ON order_sms_outbox (state, created_at);
  `);
  const add = database.prepare('INSERT OR IGNORE INTO order_sms_outbox (id, order_id, user_id, kind, created_at) VALUES (?, ?, ?, ?, ?)');
  const next = database.prepare("SELECT * FROM order_sms_outbox WHERE state='pending' ORDER BY created_at, rowid LIMIT 1");
  const claim = database.prepare("UPDATE order_sms_outbox SET state='sending', claimed_at=? WHERE id=? AND state='pending'");
  const finish = database.prepare("UPDATE order_sms_outbox SET state=?, provider_code=?, provider_message_id=? WHERE id=? AND state='sending'");
  const expire = database.prepare("UPDATE order_sms_outbox SET state='unknown' WHERE state='sending' AND claimed_at < ?");

  function enqueue(notification) {
    if (!enabledKinds?.has(notification.kind) || !trackingCodePattern.test(notification.orderId)) return;
    const order = getOrder(notification.orderId);
    if (!order || order.customerId !== notification.userId) return;
    add.run(notification.id, notification.orderId, notification.userId, notification.kind, notification.createdAt);
  }

  async function dispatchOne(send, now = new Date()) {
    const row = transaction(() => {
      // An interrupted send is ambiguous. Keep it for review instead of sending a duplicate.
      expire.run(new Date(now.getTime() - 5 * 60_000).toISOString());
      const candidate = next.get();
      if (candidate && claim.run(now.toISOString(), candidate.id).changes === 1) return candidate;
      return null;
    });
    if (!row) return false;
    const user = getUser(row.user_id);
    const recipient = user?.role === 'CUSTOMER' && user.status !== 'BLOCKED' ? normalizeIranMobile(user.phone) : null;
    if (!recipient) {
      finish.run('skipped', null, null, row.id);
      return true;
    }
    let result;
    try {
      result = await send({ recipient, kind: row.kind, orderId: row.order_id });
    } catch {
      result = { state: 'unknown' };
    }
    finish.run(result.state, result.code ?? null, result.messageId ?? null, row.id);
    return true;
  }

  return { enqueue, dispatchOne };
}

async function sendOrderSms(config, { recipient, kind, orderId }, fetchImpl = fetch) {
  const match = trackingCodePattern.exec(orderId);
  if (!match || !Object.hasOwn(messages, kind)) return { state: 'skipped' };
  const template = config.templateByKind[kind];
  if (!template && !config.sender) return { state: 'skipped' };
  const route = template ? 'verify/lookup.json' : 'sms/send.json';
  const body = template
    ? { receptor: recipient, template, token: match[1], token2: match[2], type: 'sms' }
    : { receptor: recipient, sender: config.sender, message: 'پاک‌شو\n' + messages[kind] + '\nکد پیگیری: ' + orderId };
  const url = 'https://api.kavenegar.com/v1/' + encodeURIComponent(config.apiKey) + '/' + route;
  const response = await fetchImpl(url, {
    method: 'POST',
    body: new URLSearchParams(body),
    signal: AbortSignal.timeout(8000),
    redirect: 'error',
  });
  const payload = await response.json();
  const code = payload.return?.status;
  if (Number.isInteger(code) && code !== 200) return { state: 'failed', code };
  const messageId = payload.entries?.[0]?.messageid;
  return response.ok && code === 200 && (typeof messageId === 'number' || typeof messageId === 'string') && /^\d+$/.test(String(messageId))
    ? { state: 'accepted', code, messageId: String(messageId) }
    : { state: 'unknown' };
}

function startOrderSmsScheduler(outbox, config = readOrderSmsConfig()) {
  if (!config) return;
  let busy = false;
  const tick = async () => {
    if (busy) return;
    busy = true;
    try {
      for (let i = 0; i < 10; i++) {
        if (!await outbox.dispatchOne(message => sendOrderSms(config, message))) break;
      }
    } catch {
      console.error('[Paksho] پردازش صف پیامک سفارش انجام نشد.');
    } finally {
      busy = false;
    }
  };
  const timer = setInterval(tick, 5000);
  timer.unref();
}

module.exports = { createOrderSmsOutbox, readOrderSmsConfig, sendOrderSms, startOrderSmsScheduler };
