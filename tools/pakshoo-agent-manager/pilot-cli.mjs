import { initPilot, health, PilotSession, backupPilot, restorePilot } from './offline-pilot.mjs';

function args(values) {
  const [command, ...rest] = values;
  if (!['init','run','health','backup','restore'].includes(command)) throw Error('INVALID_PILOT_COMMAND');
  const result = { command };
  for (let i = 0; i < rest.length; i++) {
    const key = rest[i];
    if (!['--offline-demo','--data-dir','--snapshot-dir','--duration-seconds'].includes(key) || Object.hasOwn(result, key)) throw Error('INVALID_PILOT_ARGUMENT');
    result[key] = key === '--offline-demo' ? true : rest[++i];
    if (result[key] === undefined) throw Error('INVALID_PILOT_ARGUMENT');
  }
  if (result['--offline-demo'] !== true) throw Error('OFFLINE_DEMO_REQUIRED');
  if (!result['--data-dir']) throw Error('DATA_DIRECTORY_REQUIRED');
  if (['backup','restore'].includes(command) !== Object.hasOwn(result, '--snapshot-dir')) throw Error('INVALID_PILOT_ARGUMENT');
  if (Object.hasOwn(result, '--duration-seconds') && command !== 'run') throw Error('INVALID_PILOT_ARGUMENT');
  const duration = result['--duration-seconds'] ?? '60';
  if (!/^\d+$/.test(duration) || +duration < 1 || +duration > 300) throw Error('INVALID_DURATION');
  return { ...result, duration: +duration };
}
try {
  const a = args(process.argv.slice(2)), data = a['--data-dir'];
  let result;
  if (a.command === 'init') result = initPilot(data);
  if (a.command === 'health') result = health(data);
  if (a.command === 'backup') result = backupPilot(data, a['--snapshot-dir']);
  if (a.command === 'restore') result = restorePilot(a['--snapshot-dir'], data);
  if (a.command === 'run') {
    const session = new PilotSession(data);
    process.stdout.write(JSON.stringify({ ...health(data), foreground: true, durationSeconds: a.duration }) + '\n');
    await new Promise((resolve, reject) => {
      let stopped = false;
      const stop = error => {
        if (stopped) return; stopped = true;
        clearInterval(heartbeat); clearTimeout(deadline);
        process.off('SIGINT', interrupt); process.off('SIGTERM', interrupt);
        try { session.close(); } catch (closeError) { error ??= closeError; }
        if (error) reject(error); else resolve();
      };
      const interrupt = () => stop();
      const heartbeat = setInterval(() => { try { session.heartbeat(); } catch (error) { stop(error); } }, 500);
      const deadline = setTimeout(() => stop(), a.duration * 1000);
      process.on('SIGINT', interrupt); process.on('SIGTERM', interrupt);
    });
    result = { mode: 'OFFLINE_DEMO', stopped: true, realAuth: 'BLOCKED_FOR_REAL_AUTH' };
  }
  process.stdout.write(JSON.stringify(result) + '\n');
} catch (error) {
  // Never echo arbitrary paths, payloads, environment or raw filesystem errors.
  const code = /^[A-Z][A-Z0-9_]{1,80}$/.test(error.message) ? error.message : 'PILOT_OPERATION_FAILED';
  process.stderr.write(JSON.stringify({ error: code, mode: 'OFFLINE_DEMO' }) + '\n');
  process.exitCode = 1;
}
