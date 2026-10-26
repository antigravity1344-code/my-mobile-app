'use strict';
const {test,after}=require('node:test');
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {createCommissionPolicy}=require('./commissionPolicy');
const {createWorkerWallet}=require('./workerWallet');
function memory() {
  const db=new DatabaseSync(':memory:');
  let depth=0;const transaction=fn=>{if(depth>0)return fn();db.exec('BEGIN IMMEDIATE');depth+=1;try{const result=fn();depth-=1;db.exec('COMMIT');return result;}catch(error){depth=0;try{db.exec('ROLLBACK');}catch{}throw error;}};
  // chargeCompletion invokes transaction exactly once; policy publishing is separate.
  const commissionPolicy=createCommissionPolicy({database:db,transaction});
  const wallet=createWorkerWallet({database:db,transaction,commissionPolicy});
  return {db,wallet,commissionPolicy};
}
function charge(wallet,id,amount,unit='تومان',workerId='worker') {
  return wallet.chargeCompletion({id,cleanerId:workerId,pricing:{currencyUnit:unit}},
    {id:'request:'+id,workerId,finalAmount:amount,actualHours:2});
}
function credit(db,workerId,amount,unit='تومان',key='synthetic-credit') {
  db.prepare(`INSERT INTO worker_wallet_entries
    (id,workerId,sourceKey,type,amount,currencyUnit,orderId,createdAt) VALUES (?,?,?,'TOPUP',?,?,NULL,?)`)
    .run(key,workerId,key,amount,unit,new Date().toISOString());
}
test('integer half-up commission, independent currency balances, and frozen policy snapshots',t=>{
  const {db,wallet,commissionPolicy}=memory();t.after(()=>db.close());
  const first=charge(wallet,'first',150);
  assert.equal(first.commissionAmount,38);assert.equal(first.netAmount,112);assert.equal(first.policyVersion,0);
  commissionPolicy.publish({ratePercent:40,expectedVersion:0});
  const repeated=charge(wallet,'first',150);assert.deepEqual(repeated,first);
  const second=charge(wallet,'second',100,'ریال');assert.equal(second.commissionAmount,40);
  credit(db,'worker',100,'ریال');
  const view=wallet.read('worker');
  assert.deepEqual(new Map(view.balances.map(x=>[x.currencyUnit,x.balance])),new Map([['تومان',-38],['ریال',60]]));
  assert.equal(view.canAcceptNewOrders,false,'positive credit in a different unit cannot cancel debt');
  assert.equal(view.transactions.length,3);assert.deepEqual(wallet.read('other').balances,[]);
});
test('verified topup credits once for the same source key and rejects conflicting reuse',t=>{
  const {db,wallet}=memory();t.after(()=>db.close());
  assert.equal(wallet.creditVerifiedTopup({workerId:'worker',amount:500,currencyUnit:'تومان',sourceKey:'topup:intent-1'}).code,'invalid');
  assert.deepEqual(wallet.read('worker').balances,[]);
  const first=wallet.creditVerifiedTopup({workerId:'worker',amount:500,currencyUnit:'تومان',sourceKey:'topup:fixture:intent-1'});
  const again=wallet.creditVerifiedTopup({workerId:'worker',amount:500,currencyUnit:'تومان',sourceKey:'topup:fixture:intent-1'});
  assert.equal(first.code,'ok');assert.equal(again.code,'duplicate');assert.equal(wallet.read('worker').balances[0].balance,500);
  assert.equal(wallet.creditVerifiedTopup({workerId:'other',amount:500,currencyUnit:'تومان',sourceKey:'topup:fixture:intent-1'}).code,'conflict');
  assert.equal(wallet.read('worker').balances[0].balance,500);
});
test('zero and positive balances allow acceptance; debt is blocked until synthetic verified credit covers it',t=>{
  const {db,wallet}=memory();t.after(()=>db.close());
  assert.equal(wallet.read('worker').canAcceptNewOrders,true);
  credit(db,'worker',500);charge(wallet,'a',1000);charge(wallet,'b',1200);
  assert.equal(wallet.read('worker').balances[0].balance,-50);assert.equal(wallet.read('worker').canAcceptNewOrders,false);
  credit(db,'worker',50,'تومان','synthetic-cover');
  assert.equal(wallet.read('worker').balances[0].balance,0);assert.equal(wallet.read('worker').canAcceptNewOrders,true);
});
test('financial history rejects update, delete and replacement through either unique key',t=>{
  const {db,wallet}=memory();t.after(()=>db.close());charge(wallet,'a',100);
  for(const table of ['worker_wallet_entries','worker_commission_snapshots']) {
    assert.throws(()=>db.exec('DELETE FROM '+table));
    assert.throws(()=>db.exec('UPDATE '+table+' SET workerId=workerId'));
  }
  assert.throws(()=>db.exec(`INSERT OR REPLACE INTO worker_wallet_entries SELECT 'new-id',workerId,sourceKey,type,amount,currencyUnit,orderId,createdAt FROM worker_wallet_entries`));
  assert.throws(()=>db.exec(`INSERT OR REPLACE INTO worker_commission_snapshots SELECT 'other-order',requestId,workerId,grossAmount,actualHours,currencyUnit,policyVersion,rateBps,commissionAmount,netAmount,createdAt FROM worker_commission_snapshots`));
  assert.equal(wallet.read('worker').transactions.length,1);
});
function snapshot(db,{orderId,workerId='worker',amount=1000,unit='تومان',createdAt}) {
  const fee=Number((BigInt(amount)*2500n+5000n)/10000n);
  db.prepare(`INSERT INTO worker_commission_snapshots
    (orderId,requestId,workerId,grossAmount,actualHours,currencyUnit,policyVersion,rateBps,commissionAmount,netAmount,createdAt)
    VALUES (?,?,?,?,2,?,0,2500,?,?,?)`)
    .run(orderId,'request:'+orderId,workerId,amount,unit,fee,amount-fee,createdAt);
}
test('monthly income uses finalized snapshots only and keeps currencies and Jalali months separate',t=>{
  const {db,wallet}=memory();t.after(()=>db.close());
  snapshot(db,{orderId:'mehr-1',amount:1000,createdAt:'2026-10-08T20:29:00.000Z'});
  snapshot(db,{orderId:'mehr-2',amount:400,unit:'ریال',createdAt:'2026-10-08T20:30:00.000Z'});
  snapshot(db,{orderId:'aban-1',amount:2000,createdAt:'2026-10-22T20:30:00.000Z'});
  credit(db,'worker',500000);
  db.prepare(`INSERT INTO worker_commission_snapshots
    (orderId,requestId,workerId,grossAmount,actualHours,currencyUnit,policyVersion,rateBps,commissionAmount,netAmount,createdAt)
    VALUES ('other-job','request:other-job','other',9000,2,'تومان',0,2500,2250,6750,'2026-10-22T20:30:00.000Z')`).run();
  const report=wallet.readMonthlyIncome('worker');
  assert.deepEqual(report,{months:[
    {calendar:'jalali',year:1405,month:8,totals:[{currencyUnit:'تومان',jobCount:1,grossAmount:2000,commissionAmount:500,netAmount:1500}]},
    {calendar:'jalali',year:1405,month:7,totals:[
      {currencyUnit:'تومان',jobCount:1,grossAmount:1000,commissionAmount:250,netAmount:750},
      {currencyUnit:'ریال',jobCount:1,grossAmount:400,commissionAmount:100,netAmount:300},
    ]},
  ]});
  assert.deepEqual(wallet.readMonthlyIncome('other').months[0].totals[0].grossAmount,9000);
  assert.equal(JSON.stringify(report).includes('TOPUP'),false);
  assert.equal(JSON.stringify(report).includes('500000'),false);
});
test('safe-integer boundary stays exact and a ledger insert failure rolls back the snapshot',t=>{
  const {db,wallet}=memory();t.after(()=>db.close());
  const large=charge(wallet,'large',Number.MAX_SAFE_INTEGER);
  assert.equal(large.commissionAmount,Number((BigInt(Number.MAX_SAFE_INTEGER)*2500n+5000n)/10000n));
  db.exec("CREATE TRIGGER fail_wallet BEFORE INSERT ON worker_wallet_entries BEGIN SELECT RAISE(ABORT,'fixture failure'); END;");
  assert.throws(()=>charge(wallet,'failed',100));
  assert.equal(db.prepare('SELECT COUNT(*) n FROM worker_commission_snapshots WHERE orderId=?').get('failed').n,0);
});

const {createTestHarness}=require('./testAuthHarness');
const h=createTestHarness('paksho-worker-wallet-');
after(()=>h.close());
let seq=16000;
async function fixture(t) {
  const server=await h.serverFor(t);
  const customer=await h.login(server,'0912'+String(seq++).padStart(7,'0'));
  const worker=await h.login(server,'0912'+String(seq++).padStart(7,'0'),'WORKER');
  h.store.updateUser({...h.store.getUser(worker.user.id),status:'APPROVED'});
  h.store.completionPolicy.publish({mode:'customer_confirmation',expectedVersion:h.store.completionPolicy.read().version});
  h.store.commissionPolicy.publish({ratePercent:25,expectedVersion:h.store.commissionPolicy.read().version});
  const admin=await h.adminLogin(server);
  const create=()=>{const id='WALLET-'+seq++;h.store.createOrder({id,customerId:customer.user.id,customerName:'Fixture customer',customerPhone:'09120000000',serviceTitle:'Fixture service',date:'1405/08/03',time:'10:00',address:'آدرس آزمایشی',price:1000,durationHours:2,status:'PENDING',createdAt:new Date().toISOString()});return id;};
  const request=(pathname,token=worker.token,method='GET',body)=>h.request(server,{pathname,token,method,body});
  const submit=id=>request('/api/orders/'+id+'/complete',worker.token,'PUT',{acceptanceKey:h.store.completionAcceptanceKey(h.store.getOrder(id)),actualHours:2,finalAmount:1000});
  const approve=(id,requestId)=>request('/api/orders/'+id+'/completion-response',customer.token,'PUT',{requestId,answer:'yes'});
  return {server,customer,worker,admin,create,request,submit,approve};
}
test('only final completion charges once; debt blocks new worker/admin acceptance but leaves active jobs and account intact',async t=>{
  const f=await fixture(t);const first=f.create(),alreadyAccepted=f.create();
  for(const id of [first,alreadyAccepted])assert.equal(h.store.tryAcceptOrder(id,h.store.getUser(f.worker.user.id)).code,'ok');
  const userBefore=h.store.getUser(f.worker.user.id);
  const report=await f.submit(first);assert.equal(report.status,200);
  assert.deepEqual(h.store.workerWallet.read(f.worker.user.id).balances,[]);
  const answer=()=>f.approve(first,report.json.completion.requestId);
  assert.equal((await answer()).status,200);assert.equal((await answer()).status,200);
  const wallet=(await f.request('/api/workers/me/wallet')).json.wallet;
  assert.equal(wallet.balances[0].balance,-250);assert.equal(wallet.transactions.length,1);
  assert.equal(wallet.topUpAvailable,false);
  assert.equal(wallet.transactions[0].grossAmount,1000);assert.equal(wallet.transactions[0].netAmount,750);
  const next=f.create();const before=h.store.getOrder(next);
  const denied=await f.request('/api/orders/'+next+'/accept',f.worker.token,'PUT',{});
  assert.equal(denied.status,409);assert.equal(denied.json.code,'WORKER_WALLET_DEBT');
  const adminDenied=await f.request('/api/admin/orders/'+next,f.admin,'PUT',{cleanerId:f.worker.user.id});
  assert.equal(adminDenied.status,409);assert.deepEqual(h.store.getOrder(next),before);
  assert.equal(h.store.listOrderEvents(next).length,0);assert.deepEqual(h.store.getUser(f.worker.user.id),userBefore);
  const activeReport=await f.submit(alreadyAccepted);assert.equal(activeReport.status,200);
  assert.equal((await f.approve(alreadyAccepted,activeReport.json.completion.requestId)).status,200);
  const db=new DatabaseSync(process.env.PAKSHO_SQLITE_PATH);try{credit(db,f.worker.user.id,500,'تومان','fixture-clear-'+seq++);}finally{db.close();}
  assert.equal((await f.request('/api/orders/'+next+'/accept',f.worker.token,'PUT',{})).status,200);
});
test('wallet access is session-owned; no caller can forge a topup or use customer funds',async t=>{
  const f=await fixture(t);
  assert.equal((await f.request('/api/workers/me/wallet',f.customer.token)).status,403);
  assert.equal((await f.request('/api/workers/me/wallet','bad')).status,401);
  assert.equal((await f.request('/api/workers/me/wallet?workerId=other')).status,400);
  assert.equal((await f.request('/api/workers/me/wallet/topup',f.worker.token,'POST',{amount:100000,verified:true})).status,501);
  assert.deepEqual(h.store.workerWallet.read(f.worker.user.id).balances,[]);
  assert.equal((await f.request('/api/wallet',f.customer.token)).status,200);
  assert.equal((await f.request('/api/workers/me/income-report',f.customer.token)).status,403);
  assert.equal((await f.request('/api/workers/me/income-report','bad')).status,401);
  assert.equal((await f.request('/api/workers/me/income-report?workerId=other')).status,400);
  h.store.updateUser({...h.store.getUser(f.worker.user.id),status:'BLOCKED'});
  assert.equal((await f.request('/api/workers/me/wallet')).status,403);
  assert.equal((await f.request('/api/workers/me/income-report')).status,403);
});
test('wallet failure rolls back completion, events, points, timestamp and snapshot; safe retry charges once',async t=>{
  const f=await fixture(t);const id=f.create();h.store.tryAcceptOrder(id,h.store.getUser(f.worker.user.id));
  const sent=await f.submit(id);const initial=h.store.getOrder(id);
  const events=h.store.listOrderEvents(id),points=h.store.listLedger();
  const db=new DatabaseSync(process.env.PAKSHO_SQLITE_PATH);
  try {
    db.exec("CREATE TRIGGER wallet_failure BEFORE INSERT ON worker_wallet_entries BEGIN SELECT RAISE(ABORT,'synthetic failure'); END;");
    assert.equal((await f.approve(id,sent.json.completion.requestId)).status,500);
    assert.deepEqual(h.store.getOrder(id),initial);assert.deepEqual(h.store.listOrderEvents(id),events);assert.deepEqual(h.store.listLedger(),points);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM worker_commission_snapshots WHERE orderId=?').get(id).n,0);
    db.exec('DROP TRIGGER wallet_failure');
    assert.equal((await f.approve(id,sent.json.completion.requestId)).status,200);
    assert.equal(h.store.workerWallet.read(f.worker.user.id).transactions.length,1);
  } finally {db.close();}
});
function insertSnapshot(db, {orderId, workerId='worker', gross, commission, net, unit='تومان', createdAt}) {
  db.prepare(`INSERT INTO worker_commission_snapshots
    (orderId,requestId,workerId,grossAmount,actualHours,currencyUnit,policyVersion,rateBps,commissionAmount,netAmount,createdAt)
    VALUES (?,?,?,?,2,?,0,2500,?,?,?)`)
    .run(orderId, 'request:'+orderId, workerId, gross, unit, commission, net, createdAt);
}
test('weekly income uses finalized snapshots in the Tehran Saturday week and ignores top-ups', t=>{
  const {db,wallet}=memory();t.after(()=>db.close());
  const now=new Date('2026-10-25T10:00:00.000Z');
  insertSnapshot(db,{orderId:'in-week-toman',gross:4000,commission:1000,net:3000,createdAt:'2026-10-24T08:00:00.000Z'});
  insertSnapshot(db,{orderId:'in-week-rial',gross:800,commission:200,net:600,unit:'ریال',createdAt:'2026-10-26T09:00:00.000Z'});
  insertSnapshot(db,{orderId:'previous-friday',gross:90000,commission:22500,net:67500,createdAt:'2026-10-23T20:29:00.000Z'});
  credit(db,'worker',5000,'تومان','topup-not-income');
  const report=wallet.readWeeklyIncome('worker',now);
  assert.deepEqual(report.weekStart,{year:1405,month:8,day:2});
  assert.deepEqual(report.weekEnd,{year:1405,month:8,day:8});
  assert.deepEqual(report.totals,[
    {currencyUnit:'تومان',jobCount:1,grossAmount:4000,commissionAmount:1000,netAmount:3000},
    {currencyUnit:'ریال',jobCount:1,grossAmount:800,commissionAmount:200,netAmount:600},
  ]);
  assert.deepEqual(wallet.readWeeklyIncome('other',now).totals,[]);
});
test('weekly income endpoint is session-owned and excludes extra query selectors', async t=>{
  const f=await fixture(t);
  const empty=await f.request('/api/workers/me/weekly-income');
  assert.equal(empty.status,200);
  assert.equal(empty.json.success,true);
  assert.equal(empty.json.report.calendar,'jalali');
  assert.deepEqual(empty.json.report.totals,[]);
  assert.equal((await f.request('/api/workers/me/weekly-income',f.customer.token)).status,403);
  assert.equal((await f.request('/api/workers/me/weekly-income','bad')).status,401);
  assert.equal((await f.request('/api/workers/me/weekly-income?workerId=other')).status,400);
});
test('historical completed orders gain no guessed debt; wallet survives reopening the database',async t=>{
  const f=await fixture(t);const id=f.create();h.store.updateOrder({...h.store.getOrder(id),status:'COMPLETED',cleanerId:f.worker.user.id});
  assert.deepEqual(h.store.workerWallet.read(f.worker.user.id).balances,[]);
  assert.deepEqual(h.store.workerWallet.readMonthlyIncome(f.worker.user.id).months,[]);
  const next=f.create();h.store.tryAcceptOrder(next,h.store.getUser(f.worker.user.id));
  const sent=await f.submit(next);await f.approve(next,sent.json.completion.requestId);
  const report=await f.request('/api/workers/me/income-report');
  assert.equal(report.status,200);
  assert.equal(report.json.report.months.length,1);
  assert.equal(report.json.report.months[0].totals[0].jobCount,1);
  assert.equal(report.json.report.months[0].totals[0].grossAmount,1000);
  assert.equal(report.json.report.months[0].totals[0].commissionAmount,250);
  assert.equal(report.json.report.months[0].totals[0].netAmount,750);
  assert.equal(String(report.json.message).includes('شارژ'),true);
  const db=new DatabaseSync(process.env.PAKSHO_SQLITE_PATH);
  try{
    const reopened=createWorkerWallet({database:db,transaction:fn=>fn(),commissionPolicy:h.store.commissionPolicy});
    assert.deepEqual(reopened.read(f.worker.user.id),h.store.workerWallet.read(f.worker.user.id));
    assert.deepEqual(reopened.readMonthlyIncome(f.worker.user.id),h.store.workerWallet.readMonthlyIncome(f.worker.user.id));
  }finally{db.close();}
});
