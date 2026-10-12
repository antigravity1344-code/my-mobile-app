// Resource controls only. None of these functions authenticates a caller.
export const MAX_INPUT_BYTES = 262144;
export const MAX_DEPTH = 32;
export const READ_TIMEOUT_MS = 5000;
export const MAX_MEMBERS = 10000;
const fail = code => { throw new Error(code); };

export function readBounded(stream, { timeoutMs = READ_TIMEOUT_MS } = {}) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    const done = (error, value) => {
      clearTimeout(timer);
      stream.off('data', data); stream.off('end', end); stream.off('error', errorHandler);
      if (error) { stream.destroy(); reject(error); } else resolve(value);
    };
    const data = chunk => {
      // Reject before retaining a chunk that crosses the cap. Raw bytes only.
      if (!Buffer.isBuffer(chunk)) return done(new Error('BYTE_STREAM_REQUIRED'));
      size += chunk.length;
      if (size > MAX_INPUT_BYTES) return done(new Error('INPUT_TOO_LARGE'));
      chunks.push(chunk);
    };
    const end = () => done(null, Buffer.concat(chunks, size));
    const errorHandler = () => done(new Error('INPUT_READ_FAILED'));
    const timer = setTimeout(() => done(new Error('INPUT_TIMEOUT')), timeoutMs);
    stream.on('data', data); stream.once('end', end); stream.once('error', errorHandler);
  });
}

export function parseBounded(bytes) {
  if (!Buffer.isBuffer(bytes)) fail('BYTE_INPUT_REQUIRED');
  if (bytes.length > MAX_INPUT_BYTES) fail('INPUT_TOO_LARGE');
  let text;
  try { text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes); }
  catch { fail('INVALID_UTF8'); }
  // Lexical nesting before JSON.parse. Quoted brackets and escaped quotes do
  // not change depth. JSON.parse subsequently validates the complete grammar.
  const stack = [];
  let quoted = false, escaped = false;
  for (const ch of text) {
    if (quoted) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') quoted = false;
    } else if (ch === '"') quoted = true;
    else if (ch === '{' || ch === '[') {
      stack.push(ch);
      if (stack.length > MAX_DEPTH) fail('INPUT_TOO_DEEP');
    } else if (ch === '}' || ch === ']') {
      if (stack.pop() !== (ch === '}' ? '{' : '[')) fail('INVALID_JSON');
    }
  }
  if (quoted || stack.length) fail('INVALID_JSON');
  let value;
  try { value = JSON.parse(text); } catch { fail('INVALID_JSON'); }
  canonicalBounded(value); // Member/shape budget before any canonical hash.
  return value;
}

// Also guards in-process callers before hashing. Plain data only; no getters,
// custom prototypes, toJSON, cycles or non-JSON values. Hostile JS proxies are
// outside this same-process trust boundary; use the byte ingress for data.
export function canonicalBounded(value) {
  const parts = [], seen = new Set();
  let bytes = 0, members = 0;
  const append = text => {
    bytes += Buffer.byteLength(text, 'utf8');
    if (bytes > MAX_INPUT_BYTES) fail('INPUT_TOO_LARGE');
    parts.push(text);
  };
  const string = v => {
    if (v.length > MAX_INPUT_BYTES) fail('INPUT_TOO_LARGE');
    append(JSON.stringify(v));
  };
  function visit(v, depth) {
    if (typeof v === 'string') return string(v);
    if (v === null || typeof v === 'boolean' || (typeof v === 'number' && Number.isFinite(v))) return append(JSON.stringify(v));
    if (!v || typeof v !== 'object') fail('INVALID_JSON');
    if (depth > MAX_DEPTH) fail('INPUT_TOO_DEEP');
    if (seen.has(v)) fail('INVALID_JSON');
    const array = Array.isArray(v);
    if (Object.getPrototypeOf(v) !== (array ? Array.prototype : Object.prototype) && !(Object.getPrototypeOf(v) === null && !array)) fail('PLAIN_JSON_REQUIRED');
    const keys = Object.keys(v);
    if (Object.getOwnPropertyNames(v).length !== keys.length + (array ? 1 : 0)) fail('PLAIN_JSON_REQUIRED');
    members += keys.length;
    if (members > MAX_MEMBERS) fail('TOO_MANY_MEMBERS');
    if (array && (v.length !== keys.length || keys.some((k, i) => k !== String(i)))) fail('INVALID_JSON');
    if (Object.getOwnPropertySymbols(v).length) fail('INVALID_JSON');
    seen.add(v); append(array ? '[' : '{');
    if (!array) keys.sort();
    keys.forEach((key, i) => {
      const descriptor = Object.getOwnPropertyDescriptor(v, key);
      if (!descriptor || !('value' in descriptor)) fail('PLAIN_JSON_REQUIRED');
      if (i) append(',');
      if (!array) { string(key); append(':'); }
      visit(descriptor.value, depth + 1);
    });
    append(array ? ']' : '}'); seen.delete(v);
  }
  visit(value, 1);
  return parts.join('');
}

const fields = {
  register: ['actor','ownerApproved','spec'],
  claim: ['taskId','role','agentId','runId','ttlMs','epoch'],
  start: ['taskId','agentId','runId','epoch','role'],
  heartbeat: ['taskId','agentId','runId','epoch','role','ttlMs'],
  finish: ['taskId','agentId','runId','epoch','role','status','report'],
  decide: ['taskId','actor','expectedRevision','status','reason'],
  retry: ['taskId','actor','expectedRevision','reason'],
  'report-receipt': ['actor','reportId','receipt'],
  get: ['taskId'], events: ['taskId','limit','cursor'], 'pending-reports': ['limit','cursor'],
};
export function validateCommand(c, { reads = false } = {}) {
  if (!c || Array.isArray(c) || typeof c !== 'object' || typeof c.type !== 'string') fail('INVALID_COMMAND');
  if (!Object.hasOwn(fields, c.type) || (!reads && ['get','events','pending-reports'].includes(c.type))) fail('UNKNOWN_COMMAND');
  const allowed = new Set(['type','commandId', ...fields[c.type]]);
  if (Object.keys(c).some(key => !allowed.has(key))) fail('UNKNOWN_COMMAND_FIELD');
  const strings = ['commandId','taskId','actor','agentId','runId','role','status','reason','receipt'];
  if (strings.some(key => Object.hasOwn(c, key) && typeof c[key] !== 'string')) fail('INVALID_COMMAND_FIELD');
  for (const key of ['epoch','ttlMs','expectedRevision','reportId','limit']) {
    if (Object.hasOwn(c, key) && !Number.isSafeInteger(c[key])) fail('INVALID_COMMAND_FIELD');
  }
  if (Object.hasOwn(c, 'ownerApproved') && typeof c.ownerApproved !== 'boolean') fail('INVALID_COMMAND_FIELD');
  if (c.type === 'register' && (!c.spec || Array.isArray(c.spec) || typeof c.spec !== 'object')) fail('INVALID_SPEC');
}
