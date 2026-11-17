#!/usr/bin/env node
import fs from 'node:fs';
import crypto from 'node:crypto';

const API = 'https://pakshu.ir/api';
const lines = [];
const log = (s) => lines.push(String(s));

async function req(method, path, { token, body } = {}) {
  let lastErr;
  for (let i = 0; i < 4; i += 1) {
    try {
      const headers = { Accept: 'application/json' };
      if (body !== undefined) headers['Content-Type'] = 'application/json';
      if (token) headers.Authorization = `Bearer ${token}`;
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 45000);
      const res = await fetch(`${API}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      const text = await res.text();
      let json = null;
      try { json = text ? JSON.parse(text) : null; } catch {}
      return { status: res.status, json, text };
    } catch (err) {
      lastErr = err;
      await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
    }
  }
  throw lastErr;
}

function temp(name) {
  return `${process.env.TEMP}\\${name}`;
}

async function main() {
  const customerToken = fs.readFileSync(temp('paksho-customer-token.txt'), 'utf8').trim();
  const workerToken = fs.readFileSync(temp('paksho-worker-token.txt'), 'utf8').trim();
  const adminPassword = process.env.PAKSHO_ADMIN_PASSWORD || '';
  const customerPhone = process.env.PAKSHO_QA_CUSTOMER_PHONE || '';
  if (!customerPhone) {
    log('BLOCK: set PAKSHO_QA_CUSTOMER_PHONE');
    console.log(lines.join('\n'));
    process.exit(2);
  }

  const meC = await req('GET', '/users/me', { token: customerToken });
  const meW = await req('GET', '/users/me', { token: workerToken });
  log(`customer=${meC.json?.user?.id || '?'} status=${meC.json?.user?.status || meC.status}`);
  log(`worker=${meW.json?.user?.id || '?'} status=${meW.json?.user?.status || meW.status} profile=${meW.json?.user?.isProfileComplete}`);

  // Fresh/debt-free: onboard if not complete, then admin-approve if possible
  if (meW.json?.user && !meW.json.user.isProfileComplete) {
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xd9]).toString('base64');
    const onboard = await req('PUT', '/users/worker-onboarding', {
      token: workerToken,
      body: {
        name: 'متخصص آزمون دود',
        nationalId: '0013542419',
        birthDate: '1370/01/01',
        address: 'تهران آزمون',
        city: 'تهران',
        bankSheba: 'IR120170000000111111111111',
        gender: 'MALE',
        skills: ['home_unit_cleaning', 'hourly_labor'],
        idDocFile: { mimeType: 'image/jpeg', data: jpeg },
      },
    });
    log(`onboard=${onboard.status} status=${onboard.json?.user?.status || onboard.json?.message || onboard.json?.code || '-'}`);
  }

  if (adminPassword) {
    const admin = await req('POST', '/admin/login', { body: { password: adminPassword } });
    if (admin.status === 200 && admin.json?.token) {
      const wid = (await req('GET', '/users/me', { token: workerToken })).json?.user?.id;
      const appr = await req('PUT', `/admin/approve-worker/${wid}`, { token: admin.json.token, body: {} });
      log(`approve=${appr.status} status=${appr.json?.user?.status || appr.json?.message || '-'}`);
    } else {
      log(`admin-login=${admin.status} ${admin.json?.message || ''}`);
    }
  } else {
    const st = (await req('GET', '/users/me', { token: workerToken })).json?.user?.status;
    if (st !== 'APPROVED' && st !== 'ACTIVE') {
      log('BLOCK: worker not APPROVED; set PAKSHO_ADMIN_PASSWORD and rerun');
      console.log(lines.join('\n'));
      process.exit(2);
    }
  }

  const workerNow = await req('GET', '/users/me', { token: workerToken });
  log(`worker-after=${workerNow.json?.user?.status}`);

  // 1) create order
  const quoteBody = { serviceId: 'home_unit_cleaning', quantity: 2 };
  const quote = await req('POST', '/pricing/quote', { token: customerToken, body: quoteBody });
  if (quote.status !== 200) {
    log(`quote FAIL ${quote.status} ${quote.text}`);
    console.log(lines.join('\n'));
    process.exit(1);
  }
  const q = quote.json.quote;
  const created = await req('POST', '/orders', {
    token: customerToken,
    body: {
      serviceId: 'home_unit_cleaning',
      serviceTitle: 'نظافت منزل',
      address: 'تهران، دود عمومی پاک‌شو',
      date: 'آزمون',
      time: '۱۰:۰۰',
      quantity: 2,
      durationHours: 2,
      customerName: 'مشتری آزمون',
      customerPhone,
      quoteToken: q.quoteToken,
      confirmedTotal: q.total,
      clientRequestId: crypto.randomUUID(),
    },
  });
  const orderId = created.json?.order?.id;
  log(`create=${created.status} id=${orderId || '-'} status=${created.json?.order?.status || created.json?.message || '-'} total=${q.total}`);
  if (!orderId) { console.log(lines.join('\n')); process.exit(1); }

  // 2) accept
  const accepted = await req('PUT', `/orders/${orderId}/accept`, { token: workerToken, body: {} });
  log(`accept=${accepted.status} status=${accepted.json?.order?.status || accepted.json?.code || accepted.json?.message || '-'}`);

  // 3) start
  const mine = await req('GET', '/orders', { token: workerToken });
  const live = (mine.json?.orders || []).find((o) => o.id === orderId) || accepted.json?.order;
  const started = await req('PUT', `/orders/${orderId}/start`, {
    token: workerToken,
    body: { acceptanceKey: live?.startAcceptanceKey },
  });
  log(`start=${started.status} status=${started.json?.order?.status || started.json?.message || '-'}`);

  // customer confirm start if prompted
  const custOrders = await req('GET', '/orders', { token: customerToken });
  const cOrder = (custOrders.json?.orders || []).find((o) => o.id === orderId);
  if (cOrder?.startPrompt && cOrder?.startPromptEventId) {
    const resp = await req('PUT', `/orders/${orderId}/start-response`, {
      token: customerToken,
      body: { answer: 'yes', promptEventId: cOrder.startPromptEventId },
    });
    log(`start-response=${resp.status}`);
  }

  // 4) complete
  const afterStart = await req('GET', '/orders', { token: workerToken });
  const wOrder = (afterStart.json?.orders || []).find((o) => o.id === orderId) || started.json?.order;
  const completed = await req('PUT', `/orders/${orderId}/complete`, {
    token: workerToken,
    body: {
      acceptanceKey: wOrder?.completionAcceptanceKey,
      actualHours: Number(wOrder?.durationHours) > 0 ? Number(wOrder.durationHours) : 2,
      finalAmount: wOrder?.price ?? quote.json.quote.total,
    },
  });
  log(`complete=${completed.status} status=${completed.json?.order?.status || completed.json?.code || completed.json?.message || '-'}`);

  // 5) cancel on a second order
  const quote2 = await req('POST', '/pricing/quote', {
    token: customerToken,
    body: { serviceId: 'home_unit_cleaning', quantity: 2 },
  });
  const q2 = quote2.json?.quote;
  const cancelCreate = await req('POST', '/orders', {
    token: customerToken,
    body: {
      serviceId: 'home_unit_cleaning',
      serviceTitle: 'نظافت منزل',
      address: 'تهران، دود لغو',
      date: 'آزمون',
      time: '۱۱:۰۰',
      quantity: 2,
      durationHours: 2,
      customerName: 'مشتری آزمون',
      customerPhone,
      quoteToken: q2?.quoteToken,
      confirmedTotal: q2?.total,
      clientRequestId: crypto.randomUUID(),
    },
  });
  const cancelId = cancelCreate.json?.order?.id;
  const cancelled = cancelId
    ? await req('PUT', `/orders/${cancelId}/cancel`, { token: customerToken, body: { reason: 'دود' } })
    : { status: 0, json: null };
  log(`cancel-order=${cancelId || '-'} create=${cancelCreate.status} cancel=${cancelled.status} status=${cancelled.json?.order?.status || cancelled.json?.message || '-'}`);

  // 6) worker offer
  const startAt = new Date(Date.now() + 48 * 3600000).toISOString();
  const endAt = new Date(Date.now() + 50 * 3600000).toISOString();
  const offer = await req('POST', '/workers/me/offers', {
    token: workerToken,
    body: { serviceId: 'home_unit_cleaning', startAt, endAt, adjustmentBasisPoints: 10000 },
  });
  log(`offer=${offer.status} id=${offer.json?.offer?.id || '-'} ${offer.json?.code || offer.json?.message || ''}`);

  // 7) preferred-time request
  const pref = await req('POST', '/customer/requests', {
    token: customerToken,
    body: {
      serviceId: 'home_unit_cleaning',
      address: 'تهران، درخواست ساعت دلخواه دود',
      startAt: new Date(Date.now() + 72 * 3600000).toISOString(),
      endAt: new Date(Date.now() + 74 * 3600000).toISOString(),
      adjustmentBasisPoints: 10000,
      genderPreference: 'NO_PREFERENCE',
    },
  });
  log(`pref-request=${pref.status} id=${pref.json?.request?.id || '-'} ${pref.json?.code || pref.json?.message || ''}`);

  console.log(lines.join('\n'));
}

main().catch((e) => {
  console.log(`FATAL ${e.message || e}`);
  process.exit(1);
});
