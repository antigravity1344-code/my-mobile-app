import test from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough, Readable } from 'node:stream';
import { spawnSync, spawn } from 'node:child_process';
import { once } from 'node:events';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { MAX_INPUT_BYTES, parseBounded, readBounded, canonicalBounded } from '../input.mjs';
import { fixture } from './security-helpers.mjs';

for (const [name, glyph] of [['ASCII','a'], ['Persian','ژ'], ['emoji','😀']]) {
  test(`input bytes: ${name} exact 262144 accepted, 262145 rejected before parse`, async () => {
    const width = Buffer.byteLength(glyph);
    const make = size => Buffer.from('"' + glyph.repeat(Math.floor((size - 2) / width)) + 'a'.repeat((size - 2) % width) + '"');
    const accepted = make(MAX_INPUT_BYTES), rejected = make(MAX_INPUT_BYTES + 1);
    assert.equal(accepted.length, MAX_INPUT_BYTES);
    assert.equal(rejected.length, MAX_INPUT_BYTES + 1);
    assert.equal(Buffer.byteLength(JSON.stringify(parseBounded(accepted))), MAX_INPUT_BYTES);
    assert.throws(() => parseBounded(rejected), /INPUT_TOO_LARGE/);
    assert.deepEqual(await readBounded(Readable.from([accepted.subarray(0, 13), accepted.subarray(13)])), accepted);
    await assert.rejects(readBounded(Readable.from([accepted, Buffer.from('x')])), /INPUT_TOO_LARGE/);
  });
}
test('depth 32 accepted, depth 33 rejected; quoted braces and escaped quotes are not nesting', () => {
  assert.ok(parseBounded(Buffer.from('['.repeat(32) + '0' + ']'.repeat(32))));
  assert.throws(() => parseBounded(Buffer.from('['.repeat(33) + '0' + ']'.repeat(33))), /INPUT_TOO_DEEP/);
  const value = { text: ('{[\\"}]}\n').repeat(1000) };
  assert.deepEqual(parseBounded(Buffer.from(JSON.stringify(value))), value);
  for (const malformed of ['[}', '{"x":"unterminated', '[1,]', '{}{}']) {
    assert.throws(() => parseBounded(Buffer.from(malformed)), /INVALID_JSON/);
  }
});
test('invalid UTF-8 is rejected, including overlong, truncated and surrogate byte encodings', () => {
  for (const bad of [[0xc0,0xaf], [0xf0,0x9f,0x98], [0xed,0xa0,0x80], [0xff]]) {
    assert.throws(() => parseBounded(Buffer.from([34,...bad,34])), /INVALID_UTF8/);
  }
  // A transport split within a multibyte character is valid after bounded collection.
  assert.equal(parseBounded(Buffer.from('"😀ژ"')), '😀ژ');
});
test('stream cap rejects without EOF and stalled input has an absolute deadline', async () => {
  const tooLarge = new PassThrough();
  const result = readBounded(tooLarge);
  tooLarge.write(Buffer.alloc(MAX_INPUT_BYTES + 1));
  await assert.rejects(result, /INPUT_TOO_LARGE/);
  assert.equal(tooLarge.destroyed, true);
  const stalled = new PassThrough();
  const deadline = readBounded(stalled, { timeoutMs: 30 });
  stalled.write(Buffer.from('{'));
  await assert.rejects(deadline, /INPUT_TIMEOUT/);
  assert.equal(stalled.destroyed, true);
});
test('member limit and plain JSON guard precede hashing; cycles/getters never execute', () => {
  assert.doesNotThrow(() => canonicalBounded(Array(10000).fill(0)));
  assert.throws(() => canonicalBounded(Array(10001).fill(0)), /TOO_MANY_MEMBERS/);
  const cycle = {}; cycle.self = cycle;
  assert.throws(() => canonicalBounded(cycle), /INVALID_JSON/);
  let invoked = false;
  const getter = { get value() { invoked = true; return 1; } };
  assert.throws(() => canonicalBounded(getter), /PLAIN_JSON_REQUIRED/);
  assert.equal(invoked, false);
  const hidden = Object.defineProperty({}, 'actor', { get() { invoked = true; return 'SUPERVISOR'; } });
  assert.throws(() => canonicalBounded(hidden), /PLAIN_JSON_REQUIRED/);
  assert.equal(invoked, false);
  assert.throws(() => canonicalBounded(new Date()), /PLAIN_JSON_REQUIRED/);
});
test('direct command shape, unknown fields, depth and byte rejection preserve every durable row', t => {
  const f = fixture(t); f.start();
  const before = f.snapshot();
  assert.equal(before.resources.length, 1);
  let deep = {}; for (let i = 0; i < 33; i++) deep = { x: deep };
  const command = { commandId: 'bad', type: 'heartbeat', ...f.owner(), ttlMs: 60000 };
  for (const bad of [[], null, { ...command, injected: true }, { ...command, ttlMs: '60000' },
    { ...command, extra: deep }, { ...command, extra: 'ژ'.repeat(MAX_INPUT_BYTES) }]) {
    assert.throws(() => f.manager.execute(bad));
    assert.deepEqual(f.snapshot(), before);
  }
});
test('CLI malformed/oversize/UTF-8/config input fails before creating a database', t => {
  const f = fixture(t);
  const cli = new URL('../cli.mjs', import.meta.url).pathname;
  const config = new URL('../examples/supervisors.json', import.meta.url).pathname;
  const path = join(f.directory, 'must-not-exist.sqlite');
  for (const input of [Buffer.from('{'), Buffer.alloc(MAX_INPUT_BYTES + 1, 32), Buffer.from([0xff]),
    Buffer.from('{"type":"get","taskId":"SECURITY","actor":"spoof"}')]) {
    const result = spawnSync(process.execPath, [cli, path, config], { input });
    assert.equal(result.status, 1); assert.equal(result.stdout.length, 0);
    assert.equal(existsSync(path), false);
  }
  const result = spawnSync(process.execPath, [cli, path, cli], { input: '{}' });
  assert.equal(result.status, 1); assert.equal(existsSync(path), false);
});
test('CLI actual 5000ms timeout terminates an open stdin without database creation', { timeout: 10000 }, async t => {
  const f = fixture(t), path = join(f.directory, 'timeout.sqlite');
  const child = spawn(process.execPath, [new URL('../cli.mjs', import.meta.url).pathname,
    path, new URL('../examples/supervisors.json', import.meta.url).pathname]);
  t.after(() => { if (child.exitCode === null) child.kill(); });
  let stderr = ''; child.stderr.on('data', chunk => { stderr += chunk; });
  child.stdin.write('{');
  const [code] = await once(child, 'close');
  assert.equal(code, 1); assert.match(stderr, /INPUT_TIMEOUT/);
  assert.equal(existsSync(path), false);
});

test('CLI exact raw byte boundary and page cursor round-trip preserve existing locked task', t => {
  const f = fixture(t); f.start();
  const cli = new URL('../cli.mjs', import.meta.url).pathname;
  const config = new URL('../examples/supervisors.json', import.meta.url).pathname;
  const invoke = input => spawnSync(process.execPath, [cli, f.path, config], { input, encoding: 'utf8' });
  const before = f.snapshot();
  const command = JSON.stringify({ type: 'events', taskId: 'SECURITY', limit: 1 });
  const accepted = invoke(command + ' '.repeat(MAX_INPUT_BYTES - Buffer.byteLength(command)));
  assert.equal(accepted.status, 0, accepted.stderr);
  const first = JSON.parse(accepted.stdout);
  assert.equal(first.items.length, 1); assert.ok(first.nextCursor);
  const next = invoke(JSON.stringify({ type: 'events', taskId: 'SECURITY', limit: 2, cursor: first.nextCursor }));
  assert.equal(next.status, 0, next.stderr);
  assert.deepEqual(JSON.parse(next.stdout).items.map(x => x.seq), [2,3]);
  assert.equal(JSON.parse(next.stdout).nextCursor, null);
  const rejected = invoke(command + ' '.repeat(MAX_INPUT_BYTES + 1 - Buffer.byteLength(command)));
  assert.equal(rejected.status, 1); assert.match(rejected.stderr, /INPUT_TOO_LARGE/);
  assert.deepEqual(f.snapshot(), before);
});
