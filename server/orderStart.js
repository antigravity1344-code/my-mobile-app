// ثبت و تأیید شروع کار (مرحله ۲، زیرمرحله ۲؛ D-01، D-50، D-51، D-52، D-53).
// شروع کار وضعیت سفارش را عوض نمی‌کند؛ فقط startStatus (خلاصه قابل بازسازی از رویدادها) و رویدادهای فقط‌درج.
// همه کلیدهای یکتا به شماره پذیرش فعلی سفارش بسته‌اند، پس هر پذیرش (و اختصاص دوباره) از نو شمرده می‌شود.
const START_ACTIVE_STATUSES = ['ACCEPTED', 'CONFIRMED', 'ASSIGNED', 'IN_PROGRESS'];
const STARTED_STATUSES = ['customer_confirmed', 'customer_reported'];

function createOrderStart({ database, transaction, getOrder, appendOrderEvent, addNotification, rulesFor, nowMs = () => Date.now() }) {
  const eventByKey = database.prepare('SELECT * FROM order_events WHERE idempotencyKey = ?');
  const countAcceptances = database.prepare(
    "SELECT COUNT(*) AS n FROM order_events WHERE orderId = ? AND kind = 'ORDER_ACCEPTED'"
  );
  const setStartStatus = database.prepare('UPDATE orders SET startStatus = ? WHERE id = ?');
  const setStartAgreed = database.prepare('UPDATE orders SET startStatus = ?, agreedStartAt = ? WHERE id = ?');
  const latestAdminStart = database.prepare(
    "SELECT * FROM order_events WHERE orderId = ? AND kind = 'ADMIN_DECISION' AND idempotencyKey LIKE ? ORDER BY recordedAt DESC, rowid DESC LIMIT 1"
  );
  const countAdminStart = database.prepare(
    "SELECT COUNT(*) AS n FROM order_events WHERE orderId = ? AND kind = 'ADMIN_DECISION' AND idempotencyKey LIKE ?"
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
  const dataOf = (row) => (row && row.dataJson ? JSON.parse(row.dataJson) : null);

  function mustOk(result) {
    if (!result || (result.code !== 'ok' && result.code !== 'duplicate')) {
      throw new Error('START_EVENT_NOT_RECORDED:' + (result && result.code));
    }
    return result.event;
  }

  /** متخصص پذیرنده «شروع کار» را ثبت می‌کند. ادعای یک‌طرفه است (D-51)، نه حقیقت قطعی. */
  function reportStart(orderId, worker) {
    return transaction(() => {
      const order = getOrder(orderId);
      if (!order) return { code: 'missing' };
      if (order.cleanerId !== worker.id) return { code: 'forbidden' };
      if (!START_ACTIVE_STATUSES.includes(order.status)) return { code: 'bad-status' };
      const k = keys(orderId);
      if (has(k.report)) return { code: 'duplicate', order: getOrder(orderId) };
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
  function respondStart(orderId, customerId, answer) {
    if (answer !== 'yes' && answer !== 'no') return { code: 'invalid' };
    return transaction(() => {
      const order = getOrder(orderId);
      if (!order) return { code: 'missing' };
      if (order.customerId !== customerId) return { code: 'forbidden' };
      if (!START_ACTIVE_STATUSES.includes(order.status)) return { code: 'bad-status' };
      const k = keys(orderId);
      const report = eventByKey.get(k.report);
      if (report) {
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
          if (order.startStatus === 'worker_reported') setStartAgreed.run('customer_confirmed', report.claimedAt, orderId);
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
      if (!has(k.prompt)) return { code: 'no-question', order };
      const priorAnswer = eventByKey.get(k.promptAnswer);
      if (priorAnswer) {
        return dataOf(priorAnswer).answer === answer ? { code: 'duplicate', order } : { code: 'already-answered', order };
      }
      if (order.startStatus === 'admin_resolved') return { code: 'resolved', order };
      mustOk(appendOrderEvent({
        orderId,
        actorId: customerId,
        actorRole: 'customer',
        kind: 'START_PROMPT_ANSWERED',
        claimedAt: new Date(nowMs()).toISOString(),
        idempotencyKey: k.promptAnswer,
        data: { answer },
      }));
      // پاسخ «بله» تأیید مشتری است، نه اثبات لحظه دقیق شروع؛ پس agreedStartAt پر نمی‌شود (D-51 بند ۵).
      if (answer === 'yes' && order.startStatus === 'not_recorded') setStartStatus.run('customer_reported', orderId);
      return { code: 'ok', order: getOrder(orderId) };
    });
  }

  /** تصمیم مدیر درباره شروع (D-53). تصمیم بعدی رکورد جدید با ارجاع به قبلی است. */
  function adminStartDecision(orderId, started) {
    if (typeof started !== 'boolean') return { code: 'invalid' };
    return transaction(() => {
      const order = getOrder(orderId);
      if (!order) return { code: 'missing' };
      if (!order.acceptedAt || !START_ACTIVE_STATUSES.concat(['CANCELLED', 'COMPLETED']).includes(order.status)) {
        return { code: 'bad-status' };
      }
      const k = keys(orderId);
      const previous = latestAdminStart.get(orderId, k.adminPrefix + '%');
      const n = countAdminStart.get(orderId, k.adminPrefix + '%').n + 1;
      mustOk(appendOrderEvent({
        orderId,
        actorRole: 'admin',
        kind: 'ADMIN_DECISION',
        claimedAt: new Date(nowMs()).toISOString(),
        correctsEventId: previous ? previous.id : null,
        idempotencyKey: k.adminPrefix + n,
        data: { subject: 'start', started },
      }));
      setStartStatus.run('admin_resolved', orderId);
      return { code: 'ok', order: getOrder(orderId) };
    });
  }

  /** پرسش خودکار «آیا متخصص کار را شروع کرده است؟» بعد از expectedStartAt + تأخیر (قانون start.promptDelayMinutes). */
  function sweepStartPrompts() {
    const rule = rulesFor('start.promptDelayMinutes');
    const minutes = rule && Number.isFinite(rule.value.minutes) ? rule.value.minutes : null;
    if (minutes == null) return 0;
    let sent = 0;
    for (const { id } of dueOrders.all()) {
      transaction(() => {
        const order = getOrder(id);
        if (!order || order.startStatus !== 'not_recorded' || !START_ACTIVE_STATUSES.includes(order.status)) return;
        const due = Date.parse(order.expectedStartAt) + minutes * 60000;
        if (!Number.isFinite(due) || due > nowMs()) return;
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
    if (!order || !START_ACTIVE_STATUSES.includes(order.status)) return null;
    const k = keys(order.id);
    if (order.startStatus === 'worker_reported' && has(k.report) && !has(k.confirm)) return 'confirm_report';
    if (order.startStatus === 'not_recorded' && has(k.prompt) && !has(k.promptAnswer) && !has(k.report)) return 'ask_started';
    return null;
  }

  function workerStartReported(order) {
    if (!order || !order.acceptedAt) return false;
    return has(keys(order.id).report);
  }

  /** برای سطح جریمه لغو (D-51): فقط تأیید مشتری یا تصمیم مدیر «شروع‌شده» شروع حساب می‌شود. */
  function startCountsAsStarted(order) {
    if (!order) return false;
    if (STARTED_STATUSES.includes(order.startStatus)) return true;
    if (order.startStatus === 'admin_resolved') {
      const latest = latestAdminStart.get(order.id, keys(order.id).adminPrefix + '%');
      return Boolean(latest && dataOf(latest).started === true);
    }
    return false;
  }

  return { reportStart, respondStart, adminStartDecision, sweepStartPrompts, startPromptFor, workerStartReported, startCountsAsStarted };
}

module.exports = { createOrderStart, START_ACTIVE_STATUSES };
