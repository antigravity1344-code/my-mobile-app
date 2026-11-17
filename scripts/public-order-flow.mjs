#!/usr/bin/env node
// One-shot public order lifecycle against https://pakshu.ir/api
// Needs either:
//   PAKSHO_QA_CUSTOMER_PHONE + PAKSHO_QA_CUSTOMER_OTP (+ worker phone/otp)
// or PAKSHO_ADMIN_PASSWORD (admin can approve worker; still needs OTP for users)
import crypto from 'node:crypto';

const API = (process.env.PAKSHO_API_URL || 'https://pakshu.ir/api').replace(/\/$/, '');
const summary = [];
const note = (s) => summary.push(s);

async function req(method, path, { token, body } = {}) {
  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* keep null */ }
  return { status: res.status, json, text };
}

async function login(phone, role, code) {
  if (!phone || !code) return null;
  const sent = await req('POST', '/auth/send-otp', { body: { phone } });
  if (sent.status !== 200) {
    note(`login ${role}: send-otp ${sent.status} ${sent.json?.message || ''}`);
    return null;
  }
  const verified = await req('POST', '/auth/verify-otp', { body: { phone, code, role } });
  if (verified.status !== 200 || !verified.json?.token) {
    note(`login ${role}: verify ${verified.status} ${verified.json?.message || ''}`);
    return null;
  }
  return verified.json;
}

async function main() {
  const customerPhone = process.env.PAKSHO_QA_CUSTOMER_PHONE || '';
  const customerOtp = process.env.PAKSHO_QA_CUSTOMER_OTP || '';
  const workerPhone = process.env.PAKSHO_QA_WORKER_PHONE || '';
  const workerOtp = process.env.PAKSHO_QA_WORKER_OTP || '';
  const adminPassword = process.env.PAKSHO_ADMIN_PASSWORD || '';

  note(`api=${API}`);

  if (!customerPhone || !customerOtp || !workerPhone || !workerOtp) {
    note('BLOCK: no QA OTP env (need PAKSHO_QA_CUSTOMER_PHONE/OTP and PAKSHO_QA_WORKER_PHONE/OTP)');
    note('SSH: no local private key; root@37.221.113.61 Permission denied (publickey)');
    console.log(summary.join('\n'));
    process.exit(2);
  }

  const customer = await login(customerPhone, 'CUSTOMER', customerOtp);
  const worker = await login(workerPhone, 'WORKER', workerOtp);
  if (!customer?.token || !worker?.token) {
    note('BLOCK: login failed');
    console.log(summary.join('\n'));
    process.exit(2);
  }
  note(`customer=${customer.user?.id || '?'} worker=${worker.user?.id || '?'}`);

  if (adminPassword && worker.user?.status !== 'APPROVED') {
    const admin = await req('POST', '/admin/login', { body: { password: adminPassword } });
    if (admin.status === 200 && admin.json?.token) {
      const appr = await req('PUT', `/admin/approve-worker/${worker.user.id}`, { token: admin.json.token, body: {} });
      note(`approve-worker=${appr.status}`);
    } else {
      note(`admin-login=${admin.status}`);
    }
  }

  // quote + create order
  const quote = await req('POST', '/pricing/quote', {
    body: { serviceId: 'home_unit_cleaning', durationHours: 2, quantity: 2 },
  });
  if (quote.status !== 200 || !quote.json?.quote?.quoteToken) {
    note(`quote FAIL ${quote.status}`);
    console.log(summary.join('\n'));
    process.exit(1);
  }
  const clientRequestId = crypto.randomUUID();
  const created = await req('POST', '/orders', {
    token: customer.token,
    body: {
      serviceId: 'home_unit_cleaning',
      serviceTitle: 'نظافت منزل',
      address: 'تهران، آزمون عمومی پاک‌شو',
      date: 'آزمون',
      time: '۱۰:۰۰',
      durationHours: 2,
      customerName: 'مشتری آزمون',
      customerPhone,
      pricing: { quoteToken: quote.json.quote.quoteToken },
      clientRequestId,
    },
  });
  const orderId = created.json?.order?.id;
  note(`create=${created.status} id=${orderId || '-'} status=${created.json?.order?.status || '-'}`);
  if (!orderId) {
    console.log(summary.join('\n'));
    process.exit(1);
  }

  const accepted = await req('PUT', `/orders/${orderId}/accept`, { token: worker.token, body: {} });
  note(`accept=${accepted.status} status=${accepted.json?.order?.status || accepted.json?.code || '-'}`);

  const started = await req('PUT', `/orders/${orderId}/start`, { token: worker.token, body: {} });
  note(`start=${started.status} status=${started.json?.order?.status || started.json?.code || '-'}`);

  // completion needs acceptanceKey from current order view
  const mine = await req('GET', '/orders', { token: worker.token });
  const live = (mine.json?.orders || []).find((o) => o.id === orderId) || accepted.json?.order || started.json?.order;
  const acceptanceKey = live?.completion?.acceptanceKey || live?.acceptanceKey;
  const completeBody = {
    acceptanceKey,
    actualHours: Number(live?.durationHours) > 0 ? Number(live.durationHours) : 2,
    finalAmount: live?.price ?? quote.json.quote.total,
  };
  const completed = await req('PUT', `/orders/${orderId}/complete`, { token: worker.token, body: completeBody });
  note(`complete=${completed.status} status=${completed.json?.order?.status || completed.json?.code || '-'}`);

  // separate cancel path on a second order
  const quote2 = await req('POST', '/pricing/quote', {
    body: { serviceId: 'home_unit_cleaning', durationHours: 2, quantity: 2 },
  });
  const cancelCreate = await req('POST', '/orders', {
    token: customer.token,
    body: {
      serviceId: 'home_unit_cleaning',
      serviceTitle: 'نظافت منزل',
      address: 'تهران، آزمون لغو',
      date: 'آزمون',
      time: '۱۱:۰۰',
      durationHours: 2,
      customerName: 'مشتری آزمون',
      customerPhone,
      pricing: { quoteToken: quote2.json?.quote?.quoteToken },
      clientRequestId: crypto.randomUUID(),
    },
  });
  const cancelId = cancelCreate.json?.order?.id;
  const cancelled = cancelId
    ? await req('PUT', `/orders/${cancelId}/cancel`, { token: customer.token, body: {} })
    : { status: 0, json: null };
  note(`cancel-create=${cancelCreate.status} id=${cancelId || '-'}; cancel=${cancelled.status} status=${cancelled.json?.order?.status || cancelled.json?.code || '-'}`);

  // worker offer + customer preferred-time request (best-effort)
  const offer = await req('POST', '/workers/me/offers', {
    token: worker.token,
    body: {
      serviceId: 'home_unit_cleaning',
      startAt: new Date(Date.now() + 36e5 * 24).toISOString(),
      durationHours: 2,
      pricePercent: 100,
    },
  });
  note(`offer=${offer.status} ${offer.json?.offer?.id || offer.json?.code || offer.json?.message || ''}`);

  const pref = await req('POST', '/customer/requests', {
    token: customer.token,
    body: {
      serviceId: 'home_unit_cleaning',
      address: 'تهران، درخواست ساعت دلخواه',
      startAt: new Date(Date.now() + 36e5 * 48).toISOString(),
      durationHours: 2,
      pricePercent: 100,
      genderPreference: 'NO_PREFERENCE',
    },
  });
  note(`customer-request=${pref.status} ${pref.json?.request?.id || pref.json?.code || pref.json?.message || ''}`);

  console.log(summary.join('\n'));
}

main().catch((err) => {
  console.log(`FATAL ${err.message || err}`);
  process.exit(1);
});
