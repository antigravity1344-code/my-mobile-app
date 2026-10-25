const crypto = require('node:crypto');
const ACTIVE = ['ACCEPTED', 'CONFIRMED', 'ASSIGNED', 'IN_PROGRESS'];
function createOrderCompletion({ database, transaction, getOrder, updateOrder, policy, appendOrderEvent, addNotification, onCompleted }) {
  database.exec(`CREATE TABLE IF NOT EXISTS completion_requests (
    id TEXT PRIMARY KEY, orderId TEXT NOT NULL, acceptanceNo INTEGER NOT NULL, workerId TEXT NOT NULL,
    mode TEXT NOT NULL, policyVersion INTEGER NOT NULL, actualHours REAL, finalAmount INTEGER NOT NULL,
    status TEXT NOT NULL, customerAnswer TEXT, adminAnswer INTEGER, createdAt TEXT NOT NULL,
    submissionKey TEXT NOT NULL
  );`);
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
    onCompleted(getOrder(order.id));
    addNotification(order.customerId, order.id, 'ORDER_COMPLETED', 'سفارش تکمیل شد', 'پایان کار سفارش تأیید شد.');
    addNotification(row.workerId, order.id, 'ORDER_COMPLETED', 'تکمیل سفارش', 'پایان کار سفارش تأیید شد.');
  }
  const result = orderId => ({code:'ok', order:getOrder(orderId), completion:completionFor(getOrder(orderId))});
  function reportCompletion(orderId, worker, input) {
    return transaction(() => {
      const order = getOrder(orderId);
      if (!order) return {code:'missing'};
      if (order.cleanerId !== worker.id) return {code:'forbidden'};
      if (!input || Object.keys(input).sort().join(',') !== 'acceptanceKey,actualHours,finalAmount' ||
          typeof input.acceptanceKey !== 'string' || !Number.isSafeInteger(input.finalAmount) || input.finalAmount < 0) return {code:'invalid'};
      const hourly = Number(order.durationHours) > 0;
      if (hourly ? !(typeof input.actualHours === 'number' && input.actualHours > 0 && Number.isSafeInteger(Math.round(input.actualHours * 100)) && Math.abs(input.actualHours * 100 - Math.round(input.actualHours * 100)) < 1e-7) : input.actualHours !== null) return {code:'invalid'};
      if (input.acceptanceKey !== key(order)) return {code:'stale'};
      const prior = rowFor(order);
      if (prior && prior.status !== 'rejected') {
        if (prior.actualHours !== input.actualHours || prior.finalAmount !== input.finalAmount) return {code:'conflict'};
        if (!ACTIVE.includes(order.status) && !(order.status === 'COMPLETED' && prior.status === 'completed')) return {code:'bad-status'};
        return result(orderId);
      }
      if (!ACTIVE.includes(order.status)) return {code:'bad-status'};
      if (order.startStatus === 'disputed') return {code:'start-disputed'};
      const captured = policy.read();
      const id = crypto.randomUUID();
      insert.run(id,order.id,number(order.id),worker.id,captured.mode,captured.version,input.actualHours,input.finalAmount,'pending',new Date().toISOString(),input.acceptanceKey);
      const row = rowFor(order);
      event(order,row,'END_REPORTED_BY_WORKER','worker',worker.id,'report', {mode:captured.mode,policyVersion:captured.version,actualHours:input.actualHours,finalAmount:input.finalAmount});
      if (row.mode === 'worker_only') finalize(order,row);
      else addNotification(order.customerId,order.id,'END_REPORTED','تأیید پایان کار','ساعات و مبلغ نهایی را در جزئیات سفارش بررسی و تأیید کنید.');
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
  return {completionFor,completionAcceptanceKey,reportCompletion,respondCompletion,decideCompletion};
}
module.exports = {createOrderCompletion};
