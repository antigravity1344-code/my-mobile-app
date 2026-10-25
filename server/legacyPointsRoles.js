'use strict';

// Older local databases constrained these roles to lowercase. Keep every stored
// row unchanged, while allowing the uppercase roles used by the current API.
function migrateLegacyPointsRoles(database, transaction) {
  const legacyCheck = /CHECK\s*\(\s*role\s+IN\s*\(\s*'customer'\s*,\s*'worker'\s*\)\s*\)/i;
  const tables = ['user_points', 'points_ledger'].map(name => ({
    name,
    sql: database.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name=?").get(name)?.sql,
  })).filter(table => table.sql && legacyCheck.test(table.sql));
  if (!tables.length) return;
  const foreignKeys = database.prepare('PRAGMA foreign_keys').get().foreign_keys;
  database.exec('PRAGMA foreign_keys=OFF');
  try {
    transaction(() => {
      for (const {name, sql} of tables) {
        const temporary = '_paksho_roles_' + name;
        const objects = database.prepare("SELECT sql FROM sqlite_master WHERE tbl_name=? AND type IN ('trigger','index') AND sql IS NOT NULL").all(name);
        const create = sql.replace(/^(CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?)(?:"[^"]+"|`[^`]+`|\[[^\]]+\]|\w+)/i, '$1' + temporary)
          .replace(legacyCheck, "CHECK (role IN ('customer', 'worker', 'CUSTOMER', 'WORKER'))");
        database.exec(create);
        const columns = database.prepare(`PRAGMA table_info(${name})`).all()
          .map(column => '"' + column.name.replaceAll('"', '""') + '"').join(',');
        database.exec(`INSERT INTO ${temporary} (rowid,${columns}) SELECT rowid,${columns} FROM ${name}`);
        database.exec(`DROP TABLE ${name}`);
        database.exec(`ALTER TABLE ${temporary} RENAME TO ${name}`);
        for (const object of objects) database.exec(object.sql);
      }
      for (const {name} of tables) {
        if (database.prepare(`PRAGMA foreign_key_check(${name})`).all().length) throw new Error('LEGACY_POINTS_FOREIGN_KEY_CHECK');
      }
    });
  } finally {
    database.exec('PRAGMA foreign_keys=' + (foreignKeys ? 'ON' : 'OFF'));
  }
}

module.exports = {migrateLegacyPointsRoles};
