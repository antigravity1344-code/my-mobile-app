// ثبت و تأیید شروع کار (مرحله ۲، زیرمرحله ۲؛ D-01، D-50، D-51، D-52، D-53).
// شروع کار وضعیت سفارش را عوض نمی‌کند؛ فقط startStatus (خلاصه قابل بازسازی از رویدادها) و رویدادهای فقط‌درج.
// همه کلیدهای یکتا به شماره پذیرش فعلی سفارش بسته‌اند، پس هر پذیرش (و اختصاص دوباره) از نو شمرده می‌شود.
const START_ACTIVE_STATUSES = ['ACCEPTED', 'CONFIRMED', 'ASSIGNED', 'IN_PROGRESS'];

function createOrderStart({ database, transaction, getOrder, appendOrderEvent, addNotification, rulesFor,
  readEventData = () => null, nowMs = () => Date.now() }) {
  const eventByKey = database.prepare('SELECT * FROM order_events WHERE idempotencyKey = ?');
  const countAcceptances = database.prepare(
    "SELECT COUNT(*) AS n FROM order_events WHERE orderId = ? AND kind = 'ORDER_ACCEPTED'"
  );
  const setStartStatus = database.prepare('UPDATE orders SET startStatus = ? WHERE id = ?');
  const setStartAgreed = database.prepare('UPDATE orders SET startStatus = ?, agreedStartAt = ? WHERE id = ?');
  const latestAdminStart = database.prepare(
    // The append sequence determines authority; audit timestamps can move backwards.
    "SELECT * FROM order_events WHERE orderId = ? AND kind = 'ADMIN_DECISION' AND idempotencyKey LIKE ? ORDER BY rowid DESC LIMIT 1"
  );
  const dueOrders = database.prepare(
    "SELECT id FROM orders WHERE status IN ('ACCEPTED','CONFIRMED','ASSIGNED','IN_PROGRESS') AND startStatus = 'not_recorded' AND expectedStartAt IS NOT NULL AND acceptedAt IS NOT NULL"
  );

  const acceptanceNo = (orderId) => countAcceptances.get(orderId).n;
  const keys = (orderId) => {
    const n = acceptanceNo(orderId);
    const base = orderId + ':' + n;
    return {
      report: 'start-report:' + base,
      confirm: 'start-confirm:' + base,
      prompt: 'start-prompt:' + base,
      promptAnswer: 'start-prompt-answer:' + base,
      dispute: 'start-dispute:' + base,
      adminPrefix: 'admin-start:' + base + ':',
    };
  };
  const has = (key) => Boolean(eventByKey.get(key));
  const dataOf = (row) => row ? readEventData(row.dataJson) : null;

  function mustOk(result) {
    if (!result || (result.code !== 'ok' && result.code !== 'duplicate')) {
      throw new Error('START_EVENT_NOT_RECORDED:' + (result && result.code));
    }
    return result.event;
  }

  /** متخصص پذیرنده «شروع کار» را ثبت می‌کند. ادعای یک‌طرفه است (D-51)، نه حقیقت قطعی. */
  function reportStart(orderId, worker, acceptanceKey) {
    if (typeof acceptanceKey !== 'string' || !acceptanceKey.trim() || acceptanceKey.length > 128) {
      return { code: 'invalid' };
    }
    return transaction(() => {
      const order = getOrder(orderId);
      if (!order) return { code: 'missing' };
      if (order.cleanerId !== worker.id) return { code: 'forbidden' };
      if (!START_ACTIVE_STATUSES.includes(order.status)) return { code: 'bad-status' };
      const k = keys(orderId);
      if (acceptanceKey !== k.adminPrefix) return { code: 'stale-acceptance', order };
      if (has(k.report)) return { code: 'duplicate', order: getOrder(orderId) };
      if (order.startStatus === 'admin_resolved') return { code: 'resolved', order };
      mustOk(appendOrderEvent({
        orderId,
        actorId: worker.id,
        actorRole: 'worker',
        kind: 'START_REPORTED_BY_WORKER',
        claimedAt: new Date(nowMs()).toISOString(),
        workerId: worker.id,
        idempotencyKey: k.report,
      }));
      if (order.startStatus === 'not_recorded') setStartStatus.run('worker_reported', orderId);
      addNotification(order.customerId, orderId, 'START_REPORTED', 'شروع کار ثبت شد',
        'متخصص شروع کار سفارش «' + order.serviceTitle + '» را ثبت کرد. لطفاً تأیید کنید که کار شروع شده است.');
      return { code: 'ok', order: getOrder(orderId) };
    });
  }

  /**
   * پاسخ مشتری: به ثبت شروع متخصص (تأیید/رد) یا به پرسش خودکار (بله/خیر).
   * پاسخ دوباره با همان جواب بی‌اثر است؛ جواب متفاوت رد می‌شود (سابقه حذف یا بازنویسی نمی‌شود).
   */
  function respondStart(orderId, customerId, answer, promptEventId) {
    if ((answer !== 'yes' && answer !== 'no') || typeof promptEventId !== 'string' ||
      !promptEventId.trim() || promptEventId.length > 128) return { code: 'invalid' };
    return transaction(() => {
      const order = getOrder(orderId);
      if (!order) return { code: 'missing' };
      if (order.customerId !== customerId) return { code: 'forbidden' };
      if (!START_ACTIVE_STATUSES.includes(order.status)) return { code: 'bad-status' };
      const k = keys(orderId);
      const report = eventByKey.get(k.report);
      const prompt = eventByKey.get(k.prompt);
      const respondingToReport = report && report.id === promptEventId;
      const respondingToPrompt = prompt && prompt.id === promptEventId;
      // The exact event reference is checked under the same lock as the response.
      // A delayed answer about another acceptance must never confirm the new worker.
      if (!respondingToReport && !respondingToPrompt) return { code: 'stale-prompt', order };
      if (respondingToReport) {
        const prior = eventByKey.get(k.confirm);
        if (prior) {
          const priorAnswer = prior.kind === 'START_CONFIRMED_BY_CUSTOMER' ? 'yes' : 'no';
          return priorAnswer === answer ? { code: 'duplicate', order } : { code: 'already-answered', order };
        }
        if (order.startStatus === 'admin_resolved') return { code: 'resolved', order };
        mustOk(appendOrderEvent({
          orderId,
          actorId: customerId,
          actorRole: 'customer',
          kind: answer === 'yes' ? 'START_CONFIRMED_BY_CUSTOMER' : 'START_DENIED_BY_CUSTOMER',
          claimedAt: new Date(nowMs()).toISOString(),
          idempotencyKey: k.confirm,
          data: { reportEventId: report.id },
        }));
        if (answer === 'yes') {
          // هر دو طرف هم‌نظرند: زمان ادعاشده متخصص زمان توافقی است (D-50).
          setStartAgreed.run('customer_confirmed', report.claimedAt, orderId);
        } else {
          // اختلاف: هر دو گزارش حفظ می‌شوند و هیچ‌کدام خودکار حقیقت نیست (D-53).
          setStartStatus.run('disputed', orderId);
          mustOk(appendOrderEvent({
            orderId,
            actorRole: 'system',
            kind: 'DISPUTE_OPENED',
            idempotencyKey: k.dispute,
            data: { subject: 'start' },
          }));
          addNotification(order.cleanerId, orderId, 'START_DENIED', 'اعلام مشتری درباره شروع کار',
            'مشتری اعلام کرد کار سفارش «' + order.serviceTitle + '» هنوز شروع نشده است. پشتیبانی موضوع را بررسی می‌کند.');
        }
        return { code: 'ok', order: getOrder(orderId) };
      }
      const priorAnswer = eventByKey.get(k.promptAnswer);
      if (priorAnswer) {
        const data = dataOf(priorAnswer);
        return data && data.answer === answer
          ? { code: 'duplicate', order } : { code: 'already-answered', order };
      }
      if (order.startStatus === 'admin_resolved') return { code: 'resolved', order };
      if (report) return { code: 'stale-prompt', order };
      mustOk(appendOrderEvent({
        orderId,
        actorId: customerId,
        actorRole: 'customer',
        kind: 'START_PROMPT_ANSWERED',
        claimedAt: new Date(nowMs()).toISOString(),
        idempotencyKey: k.promptAnswer,
        data: { answer, promptEventId: prompt.id },
      }));
      // پاسخ «بله» تأیید مشتری است، نه اثبات لحظه دقیق شروع؛ پس agreedStartAt پر نمی‌شود (D-51 بند ۵).
      if (answer === 'yes' && order.startStatus === 'not_recorded') setStartStatus.run('customer_reported', orderId);
      return { code: 'ok', order: getOrder(orderId) };
    });
  }

  function startDecisionContext(order) {
    if (!order) return null;
    const k = keys(order.id);
    const previous = latestAdminStart.get(order.id, k.adminPrefix + '%');
    return { acceptanceKey: k.adminPrefix, expectedDecisionEventId: previous ? previous.id : null };
  }

  function startAcceptanceKey(order) {
    return order && START_ACTIVE_STATUSES.includes(order.status) && order.cleanerId
      ? keys(order.id).adminPrefix : null;
  }

  /** A command identifies one admin intent; stale retries cannot undo a later correction. */
  function adminStartDecision(orderId, started, options) {
    if (typeof started !== 'boolean' || !options || typeof options !== 'object' || Array.isArray(options) ||
      typeof options.requestId !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(options.requestId) ||
      typeof options.acceptanceKey !== 'string' || !options.acceptanceKey.trim() || options.acceptanceKey.length > 128 ||
      !Object.hasOwn(options, 'expectedDecisionEventId') ||
      (options.expectedDecisionEventId !== null && (typeof options.expectedDecisionEventId !== 'string' ||
        !options.expectedDecisionEventId.trim() || options.expectedDecisionEventId.length > 128))) return { code: 'invalid' };
    return transaction(() => {
      const order = getOrder(orderId);
      if (!order) return { code: 'missing' };
      const k = keys(orderId);
      // Legacy active assignments have no invented acceptedAt. An actual report by
      // their current worker is sufficient evidence to let admin resolve this cycle.
      const report = eventByKey.get(k.report);
      const hasLegacyReport = order.cleanerId && report && report.kind === 'START_REPORTED_BY_WORKER' &&
        report.actorRole === 'worker' && report.actorId === order.cleanerId && report.workerId === order.cleanerId;
      if ((!order.acceptedAt && !hasLegacyReport) ||
        !START_ACTIVE_STATUSES.concat(['CANCELLED', 'COMPLETED']).includes(order.status)) {
        return { code: 'bad-status' };
      }
      const context = startDecisionContext(order);
      if (options.acceptanceKey !== context.acceptanceKey) return { code: 'stale-decision', order, context };
      const commandKey = k.adminPrefix + options.requestId;
      if (commandKey.length > 128) return { code: 'invalid' };
      const existing = eventByKey.get(commandKey);
      if (existing) {
        const data = dataOf(existing);
        const same = existing.kind === 'ADMIN_DECISION' && data && data.subject === 'start' &&
          data.started === started && data.acceptanceKey === options.acceptanceKey && data.requestId === options.requestId;
        return { code: same ? 'duplicate' : 'key-conflict', order, context };
      }
      if (options.expectedDecisionEventId !== context.expectedDecisionEventId) {
        return { code: 'stale-decision', order, context };
      }
      const previous = latestAdminStart.get(orderId, k.adminPrefix + '%');
      mustOk(appendOrderEvent({
        orderId,
        actorRole: 'admin',
        kind: 'ADMIN_DECISION',
        claimedAt: new Date(nowMs()).toISOString(),
        correctsEventId: previous ? previous.id : null,
        idempotencyKey: commandKey,
        data: { subject: 'start', started, acceptanceKey: options.acceptanceKey, requestId: options.requestId },
      }));
      setStartStatus.run('admin_resolved', orderId);
      return { code: 'ok', order: getOrder(orderId) };
    });
  }

  /** پرسش خودکار «آیا متخصص کار را شروع کرده است؟» بعد از expectedStartAt + تأخیر (قانون start.promptDelayMinutes). */
  function sweepStartPrompts() {
    const rule = rulesFor('start.promptDelayMinutes');
    const minutes = rule && rule.active === true && rule.value &&
      Number.isFinite(rule.value.minutes) && rule.value.minutes >= 0 ? rule.value.minutes : null;
    if (minutes == null || !Number.isFinite(minutes * 60000)) return 0;
    let sent = 0;
    for (const { id } of dueOrders.all()) {
      transaction(() => {
        const order = getOrder(id);
        if (!order || order.startStatus !== 'not_recorded' || !START_ACTIVE_STATUSES.includes(order.status)) return;
        const due = Date.parse(order.expectedStartAt) + minutes * 60000;
        // This is a technical Date representability check, not a maximum business delay.
        if (!Number.isFinite(due) || !Number.isFinite(new Date(due).getTime()) || due > nowMs()) return;
        const k = keys(id);
        if (has(k.prompt) || has(k.report)) return;
        mustOk(appendOrderEvent({
          orderId: id,
          actorRole: 'system',
          kind: 'START_PROMPT_SENT',
          claimedAt: new Date(nowMs()).toISOString(),
          idempotencyKey: k.prompt,
        }));
        addNotification(order.customerId, id, 'START_PROMPT', 'آیا کار شروع شده است؟',
          'آیا متخصص کار سفارش «' + order.serviceTitle + '» را شروع کرده است؟ لطفاً از جزئیات سفارش پاسخ دهید.');
        sent += 1;
      });
    }
    return sent;
  }

  /** سؤالی که الان از مشتری پرسیده می‌شود: confirm_report | ask_started | null. */
  function startPromptFor(order) {
    if (!order || !START_ACTIVE_STATUSES.includes(order.status) || order.startStatus === 'admin_resolved') return null;
    const k = keys(order.id);
    if (has(k.report) && !has(k.confirm)) return 'confirm_report';
    if (order.startStatus === 'not_recorded' && has(k.prompt) && !has(k.promptAnswer) && !has(k.report)) return 'ask_started';
    return null;
  }

  function startPromptEventId(order) {
    const prompt = startPromptFor(order);
    if (!prompt) return null;
    const k = keys(order.id);
    const event = eventByKey.get(prompt === 'confirm_report' ? k.report : k.prompt);
    return event ? event.id : null;
  }

  function workerStartReported(order) {
    if (!order) return false;
    return has(keys(order.id).report);
  }

  /** برای سطح جریمه لغو (D-51): فقط تأیید مشتری یا تصمیم مدیر «شروع‌شده» شروع حساب می‌شود. */
  function startCountsAsStarted(order) {
    if (!order) return false;
    const k = keys(order.id);
    if (order.startStatus === 'customer_confirmed') {
      const report = eventByKey.get(k.report);
      const confirmation = eventByKey.get(k.confirm);
      const data = dataOf(confirmation);
      return Boolean(report && confirmation && confirmation.kind === 'START_CONFIRMED_BY_CUSTOMER' &&
        data && data.reportEventId === report.id);
    }
    if (order.startStatus === 'customer_reported') {
      const prompt = eventByKey.get(k.prompt);
      const data = dataOf(eventByKey.get(k.promptAnswer));
      return Boolean(prompt && data && data.answer === 'yes' && data.promptEventId === prompt.id);
    }
    if (order.startStatus === 'admin_resolved') {
      const latest = latestAdminStart.get(order.id, k.adminPrefix + '%');
      const data = dataOf(latest);
      return Boolean(data && data.subject === 'start' && data.started === true);
    }
    return false;
  }

  return { reportStart, respondStart, adminStartDecision, sweepStartPrompts, startPromptFor, startPromptEventId,
    startAcceptanceKey, startDecisionContext,
    workerStartReported, startCountsAsStarted };
}

module.exports = { createOrderStart, START_ACTIVE_STATUSES };
