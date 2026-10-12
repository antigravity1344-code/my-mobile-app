import { readFileSync } from 'node:fs';
import { Manager } from './manager.mjs';

// Explicit local DB and trusted supervisor configuration; no environment secrets.
const [database, configPath] = process.argv.slice(2);
let manager;
try {
  if (!database || !configPath) throw new Error('Usage: node cli.mjs DATABASE CONFIG.json < COMMAND.json');
  const config = JSON.parse(readFileSync(configPath, 'utf8'));
  manager = new Manager(database, { supervisors: config.supervisors });
  const command = JSON.parse(readFileSync(0, 'utf8'));
  const result = command.type === 'get' ? manager.get(command.taskId)
    : command.type === 'events' ? manager.events(command.taskId)
      : command.type === 'pending-reports' ? manager.pendingReports() : manager.execute(command);
  process.stdout.write(`${JSON.stringify(result)}\n`);
} catch (error) {
  process.stderr.write(`${JSON.stringify({ error: error.message })}\n`);
  process.exitCode = 1;
} finally {
  manager?.close();
}
