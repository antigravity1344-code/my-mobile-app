'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { corsOptionsFromEnv } = require('./corsConfig');
const { createTestHarness } = require('./testAuthHarness');

test('CORS remains compatible when unset and rejects malformed configured origins', () => {
  assert.deepEqual(corsOptionsFromEnv({}), {});
  assert.deepEqual(corsOptionsFromEnv({ PAKSHO_CORS_ORIGINS: ' ' }), {});
  for (const value of ['*', 'https://frontend.example/', 'https://frontend.example/path', 'https://frontend.example,']) {
    assert.throws(() => corsOptionsFromEnv({ PAKSHO_CORS_ORIGINS: value }), /PAKSHO_CORS_ORIGINS/);
  }
});

test('browser CORS headers and preflight use the configured origin list', async (t) => {
  const allowed = ['https://frontend.example', 'http://localhost:5173'];
  const previous = process.env.PAKSHO_CORS_ORIGINS;
  process.env.PAKSHO_CORS_ORIGINS = allowed.join(', ');
  t.after(() => {
    if (previous === undefined) delete process.env.PAKSHO_CORS_ORIGINS;
    else process.env.PAKSHO_CORS_ORIGINS = previous;
  });
  const harness = createTestHarness('paksho-cors-');
  t.after(() => harness.close());
  const server = await harness.serverFor(t);
  const url = 'http://127.0.0.1:' + server.address().port + '/api/site/features';

  for (const origin of allowed) {
    const response = await fetch(url, { headers: { Origin: origin } });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('access-control-allow-origin'), origin);
    assert.match(response.headers.get('vary'), /Origin/i);
    await response.json();
  }
  const denied = await fetch(url, { headers: { Origin: 'https://frontend.example.evil.test' } });
  assert.equal(denied.headers.get('access-control-allow-origin'), null);
  await denied.json();
  const sameOrigin = await fetch(url);
  assert.equal(sameOrigin.status, 200);
  await sameOrigin.json();
  const preflight = await fetch(url, { method: 'OPTIONS', headers: {
    Origin: allowed[0], 'Access-Control-Request-Method': 'POST',
    'Access-Control-Request-Headers': 'content-type, authorization',
  } });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('access-control-allow-origin'), allowed[0]);
  assert.match(preflight.headers.get('access-control-allow-headers'), /authorization/i);
});
