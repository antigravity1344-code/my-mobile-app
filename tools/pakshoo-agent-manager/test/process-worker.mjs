import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { Manager } from '../manager.mjs';

const [database, mode] = process.argv.slice(2);
const command = JSON.parse(readFileSync(0, 'utf8'));
if (mode === 'crash-transaction') {
  const db = new DatabaseSync(database);
  db.exec('PRAGMA busy_timeout=5000; BEGIN IMMEDIATE');
  db.prepare("UPDATE tasks SET status='RUNNING',revision=revision+1 WHERE id=?").run(command.taskId);
  process.stdout.write('UNCOMMITTED\n');
  setInterval(() => {}, 1000);
} else {
  let manager;
  try {
    manager = new Manager(database, { supervisors: ['SUPERVISOR'] });
    const result = manager.execute(command);
    process.stdout.write(`${JSON.stringify({ ok: true, result })}\n`);
    if (mode === 'crash-after-claim') setInterval(() => {}, 1000);
    else manager.close();
  } catch (error) {
    manager?.close();
    process.stdout.write(`${JSON.stringify({ ok: false, error: error.message })}\n`);
    process.exitCode = 1;
  }
}
