const {test}=require('node:test');
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {migrateLegacyPointsRoles}=require('./legacyPointsRoles');

test('legacy role constraints accept current roles without rewriting history, indexes or guards',()=>{
 const d=new DatabaseSync(':memory:');
 try{
  d.exec(`CREATE TABLE user_points(userId TEXT PRIMARY KEY,role TEXT NOT NULL CHECK (role IN ('customer', 'worker')),balance INTEGER CHECK(balance>=0));
   CREATE TABLE points_ledger(id TEXT PRIMARY KEY,role TEXT NOT NULL CHECK (role IN ('customer', 'worker')),reversalOf TEXT REFERENCES points_ledger(id));
   CREATE INDEX old_points_role ON points_ledger(role);
   INSERT INTO user_points VALUES ('old','worker',17);
   INSERT INTO points_ledger(rowid,id,role,reversalOf) VALUES (17,'old-entry','customer',NULL),(42,'reversal','customer','old-entry');
   CREATE TRIGGER old_points_no_update BEFORE UPDATE ON points_ledger BEGIN SELECT RAISE(ABORT,'immutable'); END;`);
  const rows=()=>({accounts:d.prepare('SELECT rowid,* FROM user_points ORDER BY rowid').all(),ledger:d.prepare('SELECT rowid,* FROM points_ledger ORDER BY rowid').all()});
  const before=rows();
  const tx=fn=>{d.exec('BEGIN');try{const r=fn();d.exec('COMMIT');return r}catch(e){d.exec('ROLLBACK');throw e}};
  migrateLegacyPointsRoles(d,tx);
  assert.deepEqual(rows(),before);
  assert.equal(d.prepare('PRAGMA foreign_keys').get().foreign_keys,1);
  assert.equal(d.prepare('PRAGMA foreign_key_check').all().length,0);
  assert.ok(d.prepare("SELECT name FROM sqlite_master WHERE name='old_points_role'").get());
  assert.throws(()=>d.exec("UPDATE points_ledger SET role='worker'"),/immutable/);
  d.exec("INSERT INTO user_points VALUES ('new','WORKER',0);INSERT INTO points_ledger VALUES ('new-entry','CUSTOMER',NULL)");
  assert.throws(()=>d.exec("INSERT INTO user_points VALUES ('bad','ADMIN',0)"));
  assert.throws(()=>d.exec("INSERT INTO user_points VALUES ('negative','WORKER',-1)"));
  const once=rows();migrateLegacyPointsRoles(d,tx);assert.deepEqual(rows(),once);
 }finally{d.close()}
});

test('failed compatibility migration rolls back every table and restores foreign keys',()=>{
 const d=new DatabaseSync(':memory:');
 try{
  d.exec("CREATE TABLE user_points(userId TEXT PRIMARY KEY,role TEXT CHECK (role IN ('customer', 'worker')));INSERT INTO user_points VALUES ('old','worker')");
  const schema=d.prepare("SELECT sql FROM sqlite_master WHERE name='user_points'").get().sql;
  const tx=fn=>{d.exec('BEGIN');try{fn();throw Error('simulated failure')}catch(e){d.exec('ROLLBACK');throw e}};
  assert.throws(()=>migrateLegacyPointsRoles(d,tx),/simulated failure/);
  assert.equal(d.prepare("SELECT sql FROM sqlite_master WHERE name='user_points'").get().sql,schema);
  assert.equal(d.prepare('PRAGMA foreign_keys').get().foreign_keys,1);
  assert.equal(d.prepare("SELECT count(*) AS n FROM sqlite_master WHERE name LIKE '_paksho_roles_%'").get().n,0);
 }finally{d.close()}
});
