export const DEFAULT_PAGE_SIZE = 100;
export const MAX_PAGE_SIZE = 500;
export const MAX_RESPONSE_BYTES = 1048576;
const fail = code => { throw new Error(code); };

// Keyset pagination with an immutable upper sequence bound, not OFFSET.
export function page(db, kind, taskId, options = {}) {
  if (!options || Array.isArray(options) || typeof options !== 'object' ||
      Object.keys(options).some(k => !['limit','cursor'].includes(k))) fail('INVALID_PAGE');
  const { limit = DEFAULT_PAGE_SIZE, cursor = null } = options;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_PAGE_SIZE) fail('INVALID_PAGE_LIMIT');
  const events = kind === 'events';
  const table = events ? 'events' : 'outbox', key = events ? 'seq' : 'id';
  const scope = events ? taskId : null;
  let after = 0, snapshot;
  if (cursor !== null) {
    if (!cursor || Array.isArray(cursor) || typeof cursor !== 'object' ||
        Object.keys(cursor).sort().join(',') !== 'after,kind,snapshot,taskId' ||
        cursor.kind !== kind || cursor.taskId !== scope ||
        !Number.isSafeInteger(cursor.after) || !Number.isSafeInteger(cursor.snapshot) ||
        cursor.after < 0 || cursor.snapshot < cursor.after) fail('INVALID_CURSOR');
    ({ after, snapshot } = cursor);
  } else {
    snapshot = db.prepare(`SELECT COALESCE(MAX(${key}),0) AS value FROM ${table}`).get().value;
  }
  const makeCursor = last => ({ kind, taskId: scope, after: last, snapshot });
  const items = [];
  let itemBytes = 0, last = after;
  const envelope = nextCursor => ({ items, snapshot, nextCursor });
  const where = events ? 'task_id=?' : 'receipt IS NULL';
  const args = events ? [taskId, after, snapshot, limit + 1] : [after, snapshot, limit + 1];
  const dataColumn = events ? 'data' : 'payload';
  // Check legacy payload size in SQLite before bringing/parsing it into JS.
  const columns = events ? 'seq,task_id,kind,at' : 'id,task_id,marker,receipt';
  const rows = db.prepare(`SELECT ${columns},
    CASE WHEN length(CAST(${dataColumn} AS BLOB)) > ${MAX_RESPONSE_BYTES} THEN NULL ELSE ${dataColumn} END AS ${dataColumn}
    FROM ${table} WHERE ${where} AND ${key}>? AND ${key}<=? ORDER BY ${key} LIMIT ?`).iterate(...args);
  for (const row of rows) {
    if (items.length === limit) return envelope(makeCursor(last));
    if (row[dataColumn] === null) {
      if (!items.length) fail(`PAGE_ITEM_TOO_LARGE:${row[key]}`);
      return envelope(makeCursor(last));
    }
    const item = events ? { ...row, data: JSON.parse(row.data) } : { ...row, payload: JSON.parse(row.payload) };
    const size = Buffer.byteLength(JSON.stringify(item), 'utf8');
    // Reserve the exact envelope with a continuation cursor, plus CLI newline.
    const overhead = Buffer.byteLength(JSON.stringify({ items: [], snapshot, nextCursor: makeCursor(row[key]) }), 'utf8') + 1;
    if (overhead + itemBytes + size + items.length > MAX_RESPONSE_BYTES) {
      if (!items.length) fail(`PAGE_ITEM_TOO_LARGE:${row[key]}`);
      return envelope(makeCursor(last));
    }
    items.push(item); itemBytes += size; last = row[key];
  }
  return envelope(null);
}

export function boundedResponse(value) {
  const text = JSON.stringify(value) + '\n';
  if (Buffer.byteLength(text, 'utf8') > MAX_RESPONSE_BYTES) fail('RESPONSE_TOO_LARGE');
  return text;
}
