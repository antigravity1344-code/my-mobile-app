import { createReadStream } from 'node:fs';
import { Manager } from './manager.mjs';
import { readBounded, parseBounded, validateCommand } from './input.mjs';
import { boundedResponse } from './pagination.mjs';

// Explicit local DB and trusted supervisor configuration; no environment secrets.
const [database, configPath] = process.argv.slice(2);
let manager;
try {
  if (!database || !configPath) throw new Error('Usage: node cli.mjs DATABASE CONFIG.json < COMMAND.json');
  const config = parseBounded(await readBounded(createReadStream(configPath, { highWaterMark: 16384 })));
  if (!config || Array.isArray(config) || Object.keys(config).some(k => k !== 'supervisors')) throw new Error('INVALID_CONFIG');
  const command = parseBounded(await readBounded(process.stdin));
  validateCommand(command, { reads: true });
  // Rejected byte/JSON/schema input cannot even open or initialize the DB.
  manager = new Manager(database, { supervisors: config.supervisors });
  const result = command.type === 'get' ? manager.get(command.taskId)
    : command.type === 'events' ? manager.eventsPage(command.taskId, { limit: command.limit, cursor: command.cursor })
      : command.type === 'pending-reports' ? manager.pendingReportsPage({ limit: command.limit, cursor: command.cursor }) : manager.execute(command);
  process.stdout.write(boundedResponse(result));
} catch (error) {
  process.stderr.write(`${JSON.stringify({ error: error.message })}\n`);
  process.exitCode = 1;
} finally {
  manager?.close();
}
