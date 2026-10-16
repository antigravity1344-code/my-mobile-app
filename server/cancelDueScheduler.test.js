const { test } = require('node:test');
const assert = require('node:assert/strict');
const { startCancelDueScheduler } = require('./cancelDueScheduler');

test('scheduler does not start in ordinary tests', () => {
  let ticks = 0;
  const handle = startCancelDueScheduler({
    finalizeDueCancelRequests() { ticks += 1; },
  });
  handle.stop();
  assert.equal(ticks, 0);
});

test('scheduler ticks finalize due cancel requests when allowed', async () => {
  let ticks = 0;
  const handle = startCancelDueScheduler({
    finalizeDueCancelRequests() { ticks += 1; },
  }, { allowInTest: true, intervalMs: 20 });
  await new Promise((resolve) => setTimeout(resolve, 55));
  handle.stop();
  assert.equal(ticks >= 1, true);
});
