# الگوی Ledger برای رویدادهای سفارش پاکشو

**نسخه:** 1.0  
**آخرین به‌روزرسانی:** 13 اکتبر 2026  
**وضعیت:** قطعی (D-52 در ARCHITECTURE_DECISIONS.md)

---

## چرا Ledger؟

هر تغییر وضعیت سفارش، پذیرش‌ها، شروع/پایان کار و اختلاف‌ها باید **بازنویسی‌ناپذیر** و **بررسی‌پذیر** باشند. Ledger یک دفتر حساب نامتغیر است که:
- هیچ رکورد حذف یا تغییر نمی‌شود
- هر رویداد تاریخچه‌ای دارد
- درخواست‌های تکراری (idempotency) از تکراری شدن پیشگیری می‌کنند
- تراکنش‌های race condition تضمین‌شده‌اند

---

## معماری

### جدول `order_events`

```sql
CREATE TABLE order_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  orderId TEXT NOT NULL,
  actorId TEXT,               -- null برای رویدادهای سیستم/مدیر
  actorRole TEXT NOT NULL,    -- 'customer' | 'worker' | 'admin' | 'system'
  kind TEXT NOT NULL,         -- نوع رویداد (آنومی تعریف‌شده)
  claimedAt TEXT,            -- زمانی که صدور‌کننده ادعا می‌کند رخ داده
  recordedAt TEXT NOT NULL,   -- زمان ثبت دقیق سرور
  correctsEventId INTEGER,    -- رفع‌خط: رویدادی که این اصلاح می‌کند
  note TEXT,                  -- متن توضیح (نه داده ساختاریافته)
  idempotencyKey TEXT UNIQUE, -- کلید یکتا برای جلوگیری تکرار
  workerId TEXT,             -- متخصص مرتبط (برای ORDER_ACCEPTED/ORDER_RETURNED_TO_PENDING)
  FOREIGN KEY (orderId) REFERENCES orders(id) ON DELETE CASCADE,
  INDEX idx_order (orderId),
  INDEX idx_actor (actorId),
  INDEX idx_idempotency (idempotencyKey)
);
```

#### ویژگی‌های محافظتی

```sql
-- جدول فقط برای Insert است؛ UPDATE/DELETE/REPLACE ممنوع
CREATE TRIGGER order_events_no_update
BEFORE UPDATE ON order_events BEGIN SELECT RAISE(ABORT, 'order_events is append-only'); END;

CREATE TRIGGER order_events_no_delete
BEFORE DELETE ON order_events BEGIN SELECT RAISE(ABORT, 'order_events is append-only'); END;

-- REPLACE/INSERT OR IGNORE جلوگیری‌شده
CREATE TRIGGER order_events_no_replace
BEFORE REPLACE ON order_events BEGIN SELECT RAISE(ABORT, 'cannot replace'); END;
```

---

## انواع رویدادها

### رویدادهای پذیرش و وضعیت

| نوع | صدور‌کننده | معنی |
|---|---|---|
| `ORDER_ACCEPTED` | worker / admin | سفارش پذیرفته شد. `workerId` متخصص پذیرنده را نگاه می‌دارد. |
| `ORDER_RETURNED_TO_PENDING` | admin | سفارش به PENDING برگردانده شد. `workerId` متخصص کنارگذاشته‌شده. |
| `CANCEL_REQUESTED` | customer | مشتری لغو خواست. |
| `ORDER_CANCELLED` | customer / admin | سفارش نهایی لغو شد. |

### رویدادهای شروع و پایان

| نوع | صدور‌کننده | معنی |
|---|---|---|
| `START_REPORTED_BY_WORKER` | worker | متخصص شروع را ثبت کرد. |
| `START_CONFIRMED_BY_CUSTOMER` | customer | مشتری شروع را تأیید کرد. |
| `START_DENIED_BY_CUSTOMER` | customer | مشتری انکار کرد شروع شده. |
| `START_PROMPT_SENT` | system | درخواست خودکار شروع فرستاده شد. |
| `START_PROMPT_ANSWERED` | customer | مشتری به درخواست پاسخ داد. |
| `END_REPORTED_BY_WORKER` | worker | متخصص پایان را ثبت کرد. |
| `END_CONFIRMED_BY_CUSTOMER` | customer | مشتری پایان را تأیید کرد. |
| `END_DENIED_BY_CUSTOMER` | customer | مشتری انکار کرد پایان شده. |

### رویدادهای مدیریت

| نوع | صدور‌کننده | معنی |
|---|---|---|
| `DISPUTE_OPENED` | customer / worker | اختلاف باز شد. |
| `ADMIN_DECISION` | admin | تصمیم مدیر در اختلاف. |
| `WORKER_CANNOT_CONTINUE` | worker | متخصص نتوانست ادامه دهد. |
| `EXPECTED_TIME_CHANGED` | customer / admin | زمان مورد انتظار تغییر کرد. |

---

## Idempotency و Race Condition‌ها

### کلید Idempotency

هر درخواست تازه‌ای باید کلید یکتایی داشته باشد:

```javascript
// مثال: متخصص شروع را ثبت می‌کند
const idempotencyKey = `start:${orderId}:${workerId}`;
const event = {
  orderId,
  actorId: workerId,
  actorRole: 'worker',
  kind: 'START_REPORTED_BY_WORKER',
  claimedAt: '2026-10-13T14:30:00+03:30',
  recordedAt: new Date().toISOString(),
  idempotencyKey,
  // ...
};
```

### تضمین Append-Only تحت Race

```javascript
// appendOrderEvent() — تنها تابع قانونی
function appendOrderEvent(event) {
  const result = db.exec(
    `INSERT INTO order_events 
     (orderId, actorId, actorRole, kind, claimedAt, recordedAt, 
      correctsEventId, note, idempotencyKey, workerId)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      event.orderId,
      event.actorId || null,
      event.actorRole,
      event.kind,
      event.claimedAt || null,
      event.recordedAt,
      event.correctsEventId || null,
      event.note || null,
      event.idempotencyKey,
      event.workerId || null,
    ]
  );
  
  if (result.changes === 0) {
    // کلید یکتا تکراری است = رویداد هم‌زمان
    const existing = db.prepare(`SELECT * FROM order_events WHERE idempotencyKey = ?`).get(event.idempotencyKey);
    return { code: 'IDEMPOTENT_DUPLICATE', event: existing };
  }
  
  return { code: 'APPENDED', event: /* inserted row */ };
}
```

### تست Race Condition

```javascript
// دو worker هم‌زمان سفارش را می‌پذیرند
const orderId = 'ORD-TEST-001';
const worker1Key = `accept:${orderId}:worker1`;
const worker2Key = `accept:${orderId}:worker2`;

// اگر هر دو به‌طور هم‌زمان رویداد بفرستند:
const result1 = appendOrderEvent({ idempotencyKey: worker1Key, ... });
const result2 = appendOrderEvent({ idempotencyKey: worker2Key, ... });

// نتیجه: هر دو رویداد ثبت می‌شوند (هر کدام اول است)
// اما فقط یکی از آن‌ها می‌تواند پذیرش‌گر باشد (تعیین در لایه بالاتر)
assert.equal(
  [result1.code, result2.code],
  ['APPENDED', 'APPENDED']
);
```

---

## Acceptance: تنها یک تابع

### `recordAcceptance()`

سفارش فقط با **یک** تابع متمرکز می‌شود:

```javascript
function recordAcceptance(orderId, workerId, now = new Date().toISOString()) {
  return db.transaction(() => {
    // 1. شماره ترتیب پذیرش برای idempotency
    const sequence = getAcceptanceSequenceForOrder(orderId);
    const idempotencyKey = `accept:${orderId}:seq${sequence}`;
    
    // 2. ثبت رویداد
    const event = appendOrderEvent({
      orderId,
      actorId: workerId,
      actorRole: 'worker',
      kind: 'ORDER_ACCEPTED',
      recordedAt: now,
      workerId,
      idempotencyKey,
      claimedAt: now,
    });
    
    if (event.code === 'IDEMPOTENT_DUPLICATE') {
      return { success: false, reason: 'already_accepted' };
    }
    
    // 3. به‌روزرسانی acceptedAt و cleanerId روی orders
    db.prepare(`
      UPDATE orders 
      SET acceptedAt = ?, cleanerId = ?
      WHERE id = ?
    `).run(now, workerId, orderId);
    
    return { success: true, event: event.event, acceptedAt: now };
  })();
}
```

### مسیرهای پذیرش

تمام این مسیرها از **همین** تابع استفاده می‌کنند:

1. متخصص سفارش را می‌پذیرد: `POST /api/orders/:id/accept`
2. مدیر سفارش را فعال می‌کند: `PUT /api/admin/orders/:id` با status فعال
3. مدیر متخصص دیگری را اختصاص می‌دهد

---

## Reset به PENDING

### `clearAcceptanceForReturnToPending()`

```javascript
function clearAcceptanceForReturnToPending(orderId, workerId, now) {
  return db.transaction(() => {
    // 1. رویداد رجوع
    const event = appendOrderEvent({
      orderId,
      actorRole: 'admin',
      kind: 'ORDER_RETURNED_TO_PENDING',
      recordedAt: now,
      workerId,  // متخصصی که دور شد
      idempotencyKey: `return:${orderId}:${now}`,
      note: null,
    });
    
    if (event.code !== 'APPENDED') {
      return { success: false };
    }
    
    // 2. پاک کردن acceptedAt و متخصص
    db.prepare(`
      UPDATE orders
      SET acceptedAt = null, cleanerId = null, cleanerName = null, cleanerPhone = null
      WHERE id = ?
    `).run(orderId);
    
    // 3. اعلان متخصص کنارگذاشته
    notifyWorker(workerId, orderId, 'وضعیت سفارش تغییر کرد: در انتظار متخصص');
    
    return { success: true };
  })();
}
```

---

## تاریخچه و Corrections

### اصلاح رویداد (Correction)

اگر یک رویداد **اشتباه** بود (مثل زمان غلط)، نه حذف یا بازنویسی می‌کنیم، بلکه رویداد جدیدی اضافه می‌کنیم:

```javascript
const correction = appendOrderEvent({
  orderId: 'ORD-001',
  kind: 'START_REPORTED_BY_WORKER',
  claimedAt: '2026-10-13T15:00:00+03:30',  // زمان صحیح
  idempotencyKey: `correction:start:ORD-001:worker123`,
  correctsEventId: 123,  // رویداد غلط را نشان می‌دهد
  note: 'اصلاح: زمان غلط ثبت شده بود',
});
```

### خواندن تاریخچه

```javascript
function getOrderTimeline(orderId) {
  const events = db.prepare(`
    SELECT * FROM order_events
    WHERE orderId = ?
    ORDER BY recordedAt ASC
  `).all(orderId);
  
  return events.map(event => ({
    ...event,
    corrected: event.correctsEventId ? true : false,
  }));
}
```

---

## Tests و Race Condition‌ها

### Test 9: دو ثبت هم‌زمان

```javascript
test('two concurrent appends with one idempotency key leave exactly one event', async (t) => {
  const { db } = freshStore();
  db.createOrder(sampleOrder('ORD-RACE-001'));
  
  // دو worker تقریباً هم‌زمان درخواست می‌فرستند
  const results = await Promise.all([
    new Promise(resolve => {
      const worker = new Worker(/* ... */, {
        workerData: { event: { ... }, sqlite: dbPath }
      });
      worker.on('message', resolve);
    }),
    new Promise(resolve => {
      const worker = new Worker(/* ... */, {
        workerData: { event: { ... }, sqlite: dbPath }
      });
      worker.on('message', resolve);
    }),
  ]);
  
  // نتیجه: دقیقاً یک رویداد ثبت شد
  const events = db.listOrderEvents('ORD-RACE-001');
  assert.equal(events.length, 1);
});
```

### Test 19: Re-check متخصص در تراکنش

```javascript
test('admin activation re-checks the order\'s current worker inside the transaction', async (t) => {
  // مدیر سفارش را فعال می‌کند
  // اما یک race condition: متخصص مسدود شد!
  // تضمین: transaction در سرور هم‌زمان می‌بیند
  
  const order = await adminPut({ status: 'ACCEPTED', cleanerId: blockedWorker.id });
  assert.equal(order.status, 400);
  assert.ok(order.message.includes('تأییدشده'));
});
```

---

## Best Practices

### 1. همیشه از `appendOrderEvent()` استفاده کنید

```javascript
// ✅ درست
const event = appendOrderEvent({ idempotencyKey, ... });

// ❌ غلط
db.prepare('INSERT INTO order_events ...').run(...);
```

### 2. کلیدهای Idempotency منحصر‌به‌فرد

```javascript
// ✅ درست: هر درخواست منحصر است
`accept:${orderId}:${workerId}:${timestamp}`

// ❌ غلط: تکراری‌شده‌ای دارد
`accept:${orderId}`
```

### 3. رویدادها را هرگز حذف نکنید

```javascript
// ❌ ممنوع
db.prepare('DELETE FROM order_events WHERE id = ?').run(eventId);

// ✅ درست: اصلاح با رویداد جدید
appendOrderEvent({
  correctsEventId: eventId,
  note: 'اصلاح: ...',
  ...
});
```

### 4. Transactions برای تغییرات چندگانه

```javascript
db.transaction(() => {
  // رویداد
  appendOrderEvent({ ... });
  
  // به‌روزرسانی جدول orders
  db.prepare('UPDATE orders SET ... WHERE id = ?').run(...);
  
  // اعلان
  notifyUsers(...);
  
  // اگر exception: همه rollback
})();
```

---

## نمودار وضعیت

```
PENDING
  ↓ (متخصص پذیرش می‌کند)
ACCEPTED → CONFIRMED → ASSIGNED → IN_PROGRESS → COMPLETED
  ↓ (دوباره سفارش انجام‌نشده)
PENDING
  
درهر لحظه:
  → CANCELLED (لغو)
```

---

## فایل‌های مرتبط

- **server/dataStore.js** — پیاده‌سازی Ledger
- **server/orderEvents.test.js** — 26 تست Ledger و race condition
- **docs/ARCHITECTURE_DECISIONS.md** — D-50، D-51، D-52: طراحی‌های قطعی
- **server/index.js** — API endpoints

---

## نتیجه‌گیری

Ledger Pattern اطمینان می‌دهد که:
- ✅ **تمام تغییرات قابل بررسی‌اند**
- ✅ **Race condition‌ها ایمن هستند**
- ✅ **Idempotency تضمین‌شده**
- ✅ **تاریخچه حذف‌ناپذیر**
- ✅ **تراکنش‌های واقعی**
