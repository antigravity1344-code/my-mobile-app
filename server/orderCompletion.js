const crypto = require('node:crypto');
const { STAIR_SERVICE } = require('./pricing/staircase');
const ACTIVE = ['ACCEPTED', 'CONFIRMED', 'ASSIGNED', 'IN_PROGRESS'];
function createOrderCompletion({ database, transaction, getOrder, updateOrder, policy, appendOrderEvent, addNotification, onCompleted }) {
  database.exec(`CREATE TABLE IF NOT EXISTS completion_requests (
    id TEXT PRIMARY KEY, orderId TEXT NOT NULL, acceptanceNo INTEGER NOT NULL, workerId TEXT NOT NULL,
    mode TEXT NOT NULL, policyVersion INTEGER NOT NULL, actualHours REAL, finalAmount INTEGER NOT NULL,
    status TEXT NOT NULL, customerAnswer TEXT, adminAnswer INTEGER, createdAt TEXT NOT NULL,
    submissionKey TEXT NOT NULL
  );`);
  database.exec(`CREATE TABLE IF NOT EXISTS order_time_extensions (
    id TEXT PRIMARY KEY, orderId TEXT NOT NULL, acceptanceNo INTEGER NOT NULL, workerId TEXT NOT NULL,
    amount INTEGER NOT NULL, status TEXT NOT NULL
  );`);
  database.exec("CREATE INDEX IF NOT EXISTS order_time_extensions_owner ON order_time_extensions(orderId,acceptanceNo,workerId)");
  const extensions = database.prepare("SELECT * FROM order_time_extensions WHERE orderId=? AND acceptanceNo=? AND workerId=? ORDER BY rowid");
  const addExtension = database.prepare("INSERT INTO order_time_extensions (id,orderId,acceptanceNo,workerId,amount,status) VALUES (?,?,?,?,?,'customer_pending')");
  const setExtension = database.prepare("UPDATE order_time_extensions SET status=? WHERE id=?");
  const count = database.prepare("SELECT COUNT(*) AS n FROM order_events WHERE orderId=? AND kind='ORDER_ACCEPTED'");
  const current = database.prepare('SELECT * FROM completion_requests WHERE orderId=? AND acceptanceNo=? ORDER BY rowid DESC LIMIT 1');
  const insert = database.prepare('INSERT INTO completion_requests (id,orderId,acceptanceNo,workerId,mode,policyVersion,actualHours,finalAmount,status,createdAt,submissionKey) VALUES (?,?,?,?,?,?,?,?,?,?,?)');
  const setStatus = database.prepare('UPDATE completion_requests SET status=? WHERE id=?');
  const setCustomer = database.prepare('UPDATE completion_requests SET customerAnswer=? WHERE id=?');
  const setAdmin = database.prepare('UPDATE completion_requests SET adminAnswer=? WHERE id=?');
  const number = id => count.get(id).n;
  const key = order => {
    const prior = rowFor(order);
    if (prior && prior.status !== 'rejected') return prior.submissionKey;
    return 'end:' + order.id + ':' + number(order.id) + ':' + order.cleanerId + (prior ? ':' + prior.id : '');
  };
  function completionAcceptanceKey(order) { return order && order.cleanerId && ACTIVE.includes(order.status) ? key(order) : null; }
  function rowFor(order) {
    if (!order || !order.cleanerId) return null;
    const row = current.get(order.id, number(order.id));
    return row && row.workerId === order.cleanerId ? row : null;
  }
  function completionFor(order) {
    const row = rowFor(order);
    return row ? {requestId: row.id, status: row.status, mode: row.mode, policyVersion: row.policyVersion,
      actualHours: row.actualHours, finalAmount: row.finalAmount} : null;
  }
  function event(order, row, kind, actorRole, actorId, suffix, data = {}) {
    const result = appendOrderEvent({orderId:order.id, workerId:row.workerId, kind, actorRole, actorId,
      idempotencyKey: 'end-event:' + row.id + ':' + suffix,
      data: {subject:'completion', requestId:row.id, ...data}});
    if (result.code !== 'ok') throw new Error('COMPLETION_EVENT_FAILED');
  }
  function finalize(order, row) {
    if (row.status === 'completed') return;
    order.status = 'COMPLETED'; order.completedAt = new Date().toISOString();
    updateOrder(order);
    setStatus.run('completed', row.id);
    onCompleted(getOrder(order.id), row);
    addNotification(order.customerId, order.id, 'ORDER_COMPLETED', 'سفارش تکمیل شد', 'پایان کار سفارش تأیید شد.');
    addNotification(row.workerId, order.id, 'ORDER_COMPLETED', 'تکمیل سفارش', 'پایان کار سفارش تأیید شد.');
  }
  const result = orderId => ({code:'ok', order:getOrder(orderId), completion:completionFor(getOrder(orderId))});
  function extensionFor(order) {
    const rate = order?.pricing?.extraHourlyRate;
    if (order?.pricing?.source !== "server" || order.serviceId === STAIR_SERVICE || !Number.isSafeInteger(rate) || rate <= 0
      || !Number.isFinite(order.durationHours) || order.durationHours <= 0 || !Number.isSafeInteger(order.price) || order.price < 0) return null;
    const acceptanceNo = number(order.id);
    const rows = order.cleanerId ? extensions.all(order.id, acceptanceNo, order.cleanerId) : [];
    const approved = rows.filter(row => row.status === "approved");
    const active = ACTIVE.includes(order.status) && order.startStatus === "customer_confirmed";
    const pending = active ? rows.find(row => row.status === "customer_pending") : null;
    const last = rows.at(-1);
    const completion = rowFor(order);
    const total = approved.reduce((amount, row) => amount + row.amount, order.price);
    return { rate, version: acceptanceNo + ":" + rows.length, approvedHours: approved.length, total,
      pending: pending ? { id: pending.id, amount: pending.amount, total: total + pending.amount } : null,
      lastStatus: last?.status === "customer_pending" ? "pending" : last?.status === "pending" ? null : last?.status ?? null,
      canRequest: Boolean(order.cleanerId && active && !pending && (!completion || completion.status === "rejected")),
    };
  }
  function requestExtension(orderId, customerId, input) {
    return transaction(() => {
      const order = getOrder(orderId);
      if (!order) return {code:"missing"};
      if (order.customerId !== customerId) return {code:"forbidden"};
      if (Object.keys(input ?? {}).sort().join(",") !== "expectedTotal,version" || typeof input.version !== "string"
        || !Number.isSafeInteger(input.expectedTotal)) return {code:"invalid"};
      const state = extensionFor(order);
      if (state?.pending && input.expectedTotal === state.pending.total) {
        const [acceptance, revision] = state.version.split(":");
        if (input.version === acceptance + ":" + (Number(revision) - 1)) return result(orderId);
      }
      if (input.version !== state?.version) return {code:"stale"};
      if (!state?.canRequest || !Number.isSafeInteger(state.total + state.rate)) return {code:"bad-status"};
      if (input.expectedTotal !== state.total + state.rate) return {code:"stale"};
      addExtension.run(crypto.randomUUID(), order.id, number(order.id), order.cleanerId, state.rate);
      addNotification(order.cleanerId, order.id, "ORDER_EXTENSION_REQUESTED", "درخواست یک ساعت اضافه", "مشتری یک ساعت اضافه خواسته است. درخواست را بررسی کنید و پاسخ دهید.");
      return result(orderId);
    });
  }
  function respondExtension(orderId, workerId, input) {
    return transaction(() => {
      const order = getOrder(orderId);
      if (!order) return {code:"missing"};
      if (order.cleanerId !== workerId) return {code:"forbidden"};
      if (Object.keys(input ?? {}).sort().join(",") !== "answer,requestId" || !["yes","no"].includes(input.answer)) return {code:"invalid"};
      if (!order.cleanerId) return {code:"stale"};
      const row = extensions.all(order.id, number(order.id), order.cleanerId).find(item => item.id === input.requestId);
      if (!row) return {code:"stale"};
      const status = input.answer === "yes" ? "approved" : "denied";
      if (row.status === status) return result(orderId);
      if (row.status !== "customer_pending" || !ACTIVE.includes(order.status) || order.startStatus !== "customer_confirmed") return {code:"bad-status"};
      setExtension.run(status, row.id);
      const message = status === "approved" ? "متخصص یک ساعت اضافه را پذیرفت." : "متخصص ساعت اضافه را نپذیرفت.";
      addNotification(order.customerId, order.id, "ORDER_EXTENSION_RESPONSE", "پاسخ تمدید سفارش", message);
      return result(orderId);
    });
  }
  function reportCompletion(orderId, worker, input) {
    return transaction(() => {
      const order = getOrder(orderId);
      if (!order) return {code:'missing'};
      if (order.cleanerId !== worker.id) return {code:'forbidden'};
      const fixedStaircase = order.serviceId === STAIR_SERVICE;
      if (!input || typeof input.acceptanceKey !== 'string') return {code:'invalid'};
      const fields = Object.keys(input).sort().join(',');
      const extension = extensionFor(order);
      const validFields = extension ? ["acceptanceKey,actualHours","acceptanceKey,actualHours,finalAmount"]
        : fixedStaircase ? ["acceptanceKey","acceptanceKey,actualHours,finalAmount"] : ["acceptanceKey,actualHours,finalAmount"];
      if (!validFields.includes(fields)) return {code:"invalid"};
      const actualHours = fixedStaircase ? null : input.actualHours;
      const finalAmount = extension ? extension.total : fixedStaircase ? order.price : input.finalAmount;
      if (!Number.isSafeInteger(finalAmount) || finalAmount < 0) return {code:'invalid'};
      const hourly = !fixedStaircase && Number(order.durationHours) > 0;
      if (hourly ? !(typeof actualHours === 'number' && actualHours > 0 && Number.isSafeInteger(Math.round(actualHours * 100)) && Math.abs(actualHours * 100 - Math.round(actualHours * 100)) < 1e-7) : actualHours !== null) return {code:'invalid'};
      if (extension && actualHours > order.durationHours + extension.approvedHours) return {code:"unapproved-hours"};
      if (input.acceptanceKey !== key(order)) return {code:'stale'};
      const prior = rowFor(order);
      if (prior && prior.status !== 'rejected') {
        if (!fixedStaircase && (prior.actualHours !== actualHours || prior.finalAmount !== finalAmount)) return {code:'conflict'};
        if (!ACTIVE.includes(order.status) && !(order.status === 'COMPLETED' && prior.status === 'completed')) return {code:'bad-status'};
        return result(orderId);
      }
      if (!ACTIVE.includes(order.status)) return {code:'bad-status'};
      if (order.startStatus === 'disputed') return {code:'start-disputed'};
      if (extension?.pending) setExtension.run("expired", extension.pending.id);
      const captured = policy.read();
      const id = crypto.randomUUID();
      insert.run(id,order.id,number(order.id),worker.id,captured.mode,captured.version,actualHours,finalAmount,'pending',new Date().toISOString(),input.acceptanceKey);
      const row = rowFor(order);
      event(order,row,'END_REPORTED_BY_WORKER','worker',worker.id,'report', {mode:captured.mode,policyVersion:captured.version,actualHours,finalAmount});
      if (row.mode === 'worker_only') finalize(order,row);
      else addNotification(order.customerId,order.id,'END_REPORTED','تأیید پایان کار',fixedStaircase ? 'پایان کار و مبلغ ثبت‌شدهٔ سفارش را بررسی و تأیید کنید.' : 'ساعات و مبلغ نهایی را در جزئیات سفارش بررسی و تأیید کنید.');
      return result(orderId);
    });
  }
  function respondCompletion(orderId, customerId, input) {
    return transaction(() => {
      const order = getOrder(orderId);
      if (!order) return {code:'missing'};
      if (order.customerId !== customerId) return {code:'forbidden'};
      if (!input || Object.keys(input).sort().join(',') !== 'answer,requestId' || !['yes','no'].includes(input.answer)) return {code:'invalid'};
      const row = rowFor(order);
      if (!row || row.id !== input.requestId) return {code:'stale'};
      if (row.customerAnswer) return row.customerAnswer === input.answer ? result(orderId) : {code:'conflict'};
      if (!ACTIVE.includes(order.status) || row.status !== 'pending' || row.mode !== 'customer_confirmation') return {code:'bad-status'};
      if (order.startStatus === 'disputed') return {code:'start-disputed'};
      setCustomer.run(input.answer,row.id);
      event(order,row,input.answer === 'yes' ? 'END_CONFIRMED_BY_CUSTOMER' : 'END_DENIED_BY_CUSTOMER','customer',customerId,'answer');
      if (input.answer === 'yes') finalize(order,row);
      else {
        setStatus.run('disputed',row.id);
        event(order,row,'DISPUTE_OPENED','system',null,'dispute');
        addNotification(row.workerId,order.id,'END_DISPUTED','اختلاف پایان کار','مشتری پایان کار یا مبلغ را تأیید نکرد؛ موضوع نیازمند بررسی مدیریت است.');
      }
      return result(orderId);
    });
  }
  function decideCompletion(orderId,input) {
    return transaction(() => {
      if (!input || Object.keys(input).sort().join(',') !== 'approve,requestId' || typeof input.approve !== 'boolean') return {code:'invalid'};
      const order = getOrder(orderId);
      if (!order) return {code:'missing'};
      const row = rowFor(order);
      if (!row || row.id !== input.requestId) return {code:'stale'};
      if (row.adminAnswer !== null) return row.adminAnswer === Number(input.approve) ? result(orderId) : {code:'conflict'};
      if (!ACTIVE.includes(order.status) || row.status !== 'disputed') return {code:'bad-status'};
      if (order.startStatus === 'disputed') return {code:'start-disputed'};
      setAdmin.run(Number(input.approve),row.id);
      event(order,row,'ADMIN_DECISION','admin',null,'admin',{approve:input.approve});
      if (input.approve) finalize(order,row);
      else setStatus.run('rejected',row.id);
      return result(orderId);
    });
  }
  return {completionFor,completionAcceptanceKey,reportCompletion,respondCompletion,decideCompletion,extensionFor,requestExtension,respondExtension};
}
module.exports = {createOrderCompletion};
