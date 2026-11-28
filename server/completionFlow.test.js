const {test,after}=require('node:test');
const assert=require('node:assert/strict');
const {createTestHarness}=require('./testAuthHarness');
const h=createTestHarness('paksho-completion-policy-flow-');
const {store,request}=h;
after(()=>h.close());
let sequence=9100;
async function fixture(t, orderOverrides = {}) {
 const server=await h.serverFor(t);
 const customer=await h.login(server,'0912'+String(sequence++).padStart(7,'0'));
 const worker=await h.login(server,'0912'+String(sequence++).padStart(7,'0'),'WORKER');
 store.updateUser({...store.getUser(worker.user.id),status:'APPROVED'});
 const admin=await h.adminLogin(server);
 store.completionPolicy.publish({mode:'customer_confirmation',expectedVersion:store.completionPolicy.read().version});
 const id='COMPLETION-'+sequence++;
 store.createOrder({id,customerId:customer.user.id,customerName:'test',customerPhone:'09120000000',date:'1405/08/01',time:'10:00',serviceTitle:'hourly',durationHours:2,address:'محله آزمون، نشانی خصوصی پلاک ۲',price:100,status:'PENDING',createdAt:new Date().toISOString(),...orderOverrides});
 store.tryAcceptOrder(id,store.getUser(worker.user.id));
 const put=(suffix,body,token=worker.token)=>request(server,{method:'PUT',pathname:'/api/orders/'+id+suffix,token,body});
 const body=()=>({acceptanceKey:store.completionAcceptanceKey(store.getOrder(id)),actualHours:3.5,finalAmount:150});
 const decide=(requestId,approve)=>request(server,{method:'PUT',pathname:'/api/admin/orders/'+id+'/completion-decision',token:admin,body:{requestId,approve}});
 return {server,customer,worker,admin,id,put,body,decide};
}
test('staircase completion takes the booked total for new and older worker clients', async t => {
 const f = await fixture(t, { serviceId: 'staircase_common_areas', price: 1177000 });
 const acceptanceKey = f.body().acceptanceKey;
 const sent = await f.put('/complete', { acceptanceKey, actualHours: 3.5, finalAmount: 1 });
 assert.equal(sent.status, 200);
 assert.equal(sent.json.completion.actualHours, null);
 assert.equal(sent.json.completion.finalAmount, 1177000);
 const repeat = await f.put('/complete', { acceptanceKey });
 assert.equal(repeat.status, 200);
 assert.deepEqual(repeat.json.completion, sent.json.completion);
 const privatePath = '/api/orders/' + f.id + '/customer-actions';
 assert.equal((await request(f.server, { pathname: privatePath })).status, 401);
 assert.equal((await request(f.server, { pathname: privatePath, token: f.worker.token })).status, 403);
 const stranger = await h.login(f.server, '0912' + String(sequence++).padStart(7, '0'));
 assert.equal((await request(f.server, { pathname: privatePath, token: stranger.token })).status, 404);
 const owned = await request(f.server, { pathname: privatePath, token: f.customer.token });
 assert.equal(owned.status, 200);
 assert.equal(owned.json.details.completion.finalAmount, 1177000);
 assert.equal(Object.hasOwn(owned.json.details, 'customerPhone'), false);
 assert.equal(Object.hasOwn(owned.json.details, 'address'), false);
 const answer = { requestId: sent.json.completion.requestId, answer: 'yes' };
 assert.equal((await f.put('/completion-response', answer, f.customer.token)).status, 200);
 assert.equal(store.getOrder(f.id).status, 'COMPLETED');
 assert.equal(store.getOrder(f.id).price, 1177000);
});
test('confirmed extra hour adds exactly one rate to a booking that includes detergent', async t => {
 const f = await fixture(t, { serviceId: 'home_unit_cleaning', durationHours: 4, price: 950000,
   pricing: { source: 'server', currencyUnit: 'تومان', extraHourlyRate: 250000, surcharges: [{ id: 'detergent', amount: 150000 }] } });
 const acceptanceKey = f.body().acceptanceKey;
 const submission = { version: store.extensionFor(store.getOrder(f.id)).version, expectedTotal: 1200000 };
 assert.equal((await f.put('/extension-request', submission)).status, 403);
 assert.equal((await f.put('/extension-request', submission, f.customer.token)).status, 409);
 const startKey = store.startAcceptanceKey(store.getOrder(f.id));
 assert.equal((await f.put('/start', { acceptanceKey: startKey })).status, 200);
 const promptEventId = store.startPromptEventId(store.getOrder(f.id));
 assert.equal((await f.put('/start-response', { answer: 'yes', promptEventId }, f.customer.token)).status, 200);
 assert.equal((await f.put('/extension-request', { ...submission, expectedTotal: 1 }, f.customer.token)).status, 409);
 const result = await f.put('/extension-request', submission, f.customer.token);
 assert.equal(result.status, 200);
 const pending = result.json.order.extension.pending;
 assert.equal(pending.amount, 250000);
 assert.equal(pending.total, 1200000);
 assert.equal((await f.put('/extension-request', submission, f.customer.token)).json.order.extension.pending.id, pending.id);
 assert.equal((await f.put('/complete', { acceptanceKey, actualHours: 5 })).status, 409);
 const answer = { requestId: pending.id, answer: 'yes' };
 assert.equal((await f.put('/extension-response', answer, f.customer.token)).status, 403);
 assert.equal((await f.put('/extension-response', answer)).json.order.extension.approvedHours, 1);
 assert.equal((await f.put('/extension-response', answer)).json.order.extension.approvedHours, 1);
 assert.equal((await f.put('/extension-request', submission, f.customer.token)).status, 409);
 const completed = await f.put('/complete', { acceptanceKey, actualHours: 5, finalAmount: 1 });
 assert.equal(completed.status, 200);
 assert.equal(completed.json.completion.finalAmount, 1200000);
 assert.equal((await f.put('/completion-response', { requestId: completed.json.completion.requestId, answer: 'yes' }, f.customer.token)).status, 200);
});
test('a declined extra hour and an unanswered request do not increase the booked total', async t => {
 const f = await fixture(t, { serviceId: 'home_unit_cleaning', durationHours: 4, price: 950000,
   pricing: { source: 'server', currencyUnit: 'تومان', extraHourlyRate: 250000 } });
 await f.put('/start', { acceptanceKey: store.startAcceptanceKey(store.getOrder(f.id)) });
 await f.put('/start-response', { answer: 'yes', promptEventId: store.startPromptEventId(store.getOrder(f.id)) }, f.customer.token);
 const acceptanceKey = f.body().acceptanceKey;
 const ask = () => f.put('/extension-request', { version: store.extensionFor(store.getOrder(f.id)).version, expectedTotal: 1200000 }, f.customer.token);
 const first = (await ask()).json.order.extension.pending;
 assert.equal((await f.put('/extension-response', { requestId: first.id, answer: 'no' })).status, 200);
 const second = (await ask()).json.order.extension.pending;
 const sent = await f.put('/complete', { acceptanceKey, actualHours: 4 });
 assert.equal(sent.json.completion.finalAmount, 950000);
 assert.equal(sent.json.order.extension.pending, null);
 assert.equal((await f.put('/extension-response', { requestId: second.id, answer: 'yes' })).status, 409);
});

test('default waits for customer; captured policy survives admin switch; repeated approval earns once',async t=>{
 const f=await fixture(t);const draft=f.body();
 const sent=await f.put('/complete',draft);assert.equal(sent.status,200);assert.equal(sent.json.completion.status,'pending');
 assert.equal(store.getOrder(f.id).status,'ACCEPTED');assert.equal(store.listLedger().filter(x=>x.orderId===f.id).length,0);
 const policy=store.completionPolicy.read();store.completionPolicy.publish({mode:'worker_only',expectedVersion:policy.version});
 const repeat=await f.put('/complete',draft);assert.equal(repeat.json.completion.mode,'customer_confirmation');
 const answer={requestId:sent.json.completion.requestId,answer:'yes'};
 for(let i=0;i<2;i++)assert.equal((await f.put('/completion-response',answer,f.customer.token)).status,200);
 assert.equal(store.getOrder(f.id).status,'COMPLETED');
 assert.equal(store.getOrder(f.id).price,100);assert.equal(store.getOrder(f.id).durationHours,2);
 assert.equal(store.listNotifications(f.worker.user.id).filter(n=>n.orderId===f.id&&n.kind==='ORDER_COMPLETED').length,1);
 assert.equal(store.listLedger().filter(x=>x.orderId===f.id&&x.reasonCode==='order_completed').length,2);
 assert.equal((await f.put('/completion-response',{...answer,answer:'no'},f.customer.token)).status,409);
});
test('worker-only finalizes immediately; lost response retry preserves timestamp and points',async t=>{
 const f=await fixture(t);store.completionPolicy.publish({mode:'worker_only',expectedVersion:store.completionPolicy.read().version});
 const body=f.body();
 const sent=await f.put('/complete',body);assert.equal(sent.status,200);assert.equal(sent.json.order.status,'COMPLETED');
 assert.equal(sent.json.order.address,'محله آزمون');
 const before=store.getOrder(f.id).completedAt;
 assert.equal((await f.put('/complete',body)).status,200);assert.equal(store.getOrder(f.id).completedAt,before);
 assert.equal(store.listLedger().filter(x=>x.orderId===f.id&&x.reasonCode==='order_completed').length,2);
});
test('dispute needs admin; rejection permits new revision and stale responses cannot approve it',async t=>{
 const f=await fixture(t);const first=(await f.put('/complete',f.body())).json.completion;
 assert.equal((await f.put('/completion-response',{requestId:first.requestId,answer:'no'},f.customer.token)).status,200);
 assert.equal(store.completionFor(store.getOrder(f.id)).status,'disputed');
 assert.equal((await f.decide(first.requestId,false)).status,200);
 const corrected={...f.body(),finalAmount:140};const second=await f.put('/complete',corrected);
 assert.equal(second.status,200);assert.notEqual(second.json.completion.requestId,first.requestId);
 assert.equal((await f.decide(first.requestId,true)).status,409);
 assert.equal((await f.put('/completion-response',{requestId:first.requestId,answer:'yes'},f.customer.token)).status,409);
 assert.equal((await f.put('/completion-response',{requestId:second.json.completion.requestId,answer:'no'},f.customer.token)).status,200);
 assert.equal((await f.decide(second.json.completion.requestId,true)).status,200);
 assert.equal(store.getOrder(f.id).status,'COMPLETED');
 assert.equal(store.listOrderEvents(f.id).filter(e=>e.kind==='END_REPORTED_BY_WORKER').length,2);
});
test('the assigned specialist sees only the customer tier badge allowed by their own level', async t => {
 const f = await fixture(t);
 const level = tierKey => ({ levels: [{ tierKey, minPoints: 0, minCompleted: 0 }] });
 store.ensureAccount(f.customer.user.id);
 store.ensureAccount(f.worker.user.id);
 assert.equal(store.publishRule({ ruleKey: 'tiers.customer', value: level('silver'), actor: 'system' }).code, 'ok');
 assert.equal(store.recomputeTier(f.customer.user.id).tierKey, 'silver');
 const job = async () => (await request(f.server, { pathname: '/api/orders', token: f.worker.token })).json.orders.find(row => row.id === f.id);
 assert.equal((await job()).publicTierBadge, undefined);
 assert.equal(store.publishRule({ ruleKey: 'tiers.worker', value: level('silver'), actor: 'system' }).code, 'ok');
 assert.equal(store.recomputeTier(f.worker.user.id).tierKey, 'silver');
 assert.deepEqual((await job()).publicTierBadge, { tier: 'silver', label: 'نقره‌ای' });
 assert.equal(store.publishRule({ ruleKey: 'tiers.worker', value: level('gold'), actor: 'system' }).code, 'ok');
 assert.equal(store.recomputeTier(f.worker.user.id).tierKey, 'gold');
 const badge = (await job()).publicTierBadge;
 assert.deepEqual(Object.keys(badge).sort(), ['label', 'summary', 'tier']);
});

test('auth, strict payloads, legacy clients and generic admin bypass fail without mutations',async t=>{
 const f=await fixture(t);const initial=store.getOrder(f.id);
 assert.equal((await f.put('/complete',{},f.worker.token)).status,409);
 assert.equal((await f.put('/complete',f.body(),f.customer.token)).status,403);
 assert.equal((await f.put('/complete',f.body(),'invalid')).status,401);
 for(const invalid of [{...f.body(),cleanerId:'other'},{...f.body(),finalAmount:-1},{...f.body(),actualHours:0},{...f.body(),actualHours:'3'},{...f.body(),actualHours:1.001}])assert.equal((await f.put('/complete',invalid)).status,400);
 assert.equal((await request(f.server,{method:'PUT',pathname:'/api/admin/orders/'+f.id,token:f.admin,body:{status:'COMPLETED'}})).status,409);
 assert.deepEqual(store.getOrder(f.id),initial);assert.equal(store.completionFor(initial),null);
 const other=await h.login(f.server,'0912'+String(sequence++).padStart(7,'0'),'WORKER');store.updateUser({...store.getUser(other.user.id),status:'APPROVED'});
 assert.equal((await f.put('/complete',f.body(),other.token)).status,403);
 const sent=(await f.put('/complete',f.body())).json.completion;
 assert.equal((await f.put('/completion-response',{requestId:sent.requestId,answer:'yes'},other.token)).status,403);
 const stranger=await h.login(f.server,'0912'+String(sequence++).padStart(7,'0'));
 assert.equal((await f.put('/completion-response',{requestId:sent.requestId,answer:'yes'},stranger.token)).status,403);
});
test('reassignment invalidates earlier request and acceptance key even for same worker',async t=>{
 const f=await fixture(t);const body=f.body();const first=(await f.put('/complete',body)).json.completion;
 store.recordAcceptance(f.id,{actorRole:'admin'});
 assert.equal(store.completionFor(store.getOrder(f.id)),null);
 assert.equal((await f.put('/complete',body)).status,409);
 assert.equal((await f.put('/completion-response',{requestId:first.requestId,answer:'yes'},f.customer.token)).status,409);
 assert.equal((await f.put('/complete',f.body())).status,200);
});
test('admin policy requires admin and version; selector is actually present',async t=>{
 const f=await fixture(t);const url='/api/admin/completion-policy';
 assert.equal((await request(f.server,{pathname:url,token:f.worker.token})).status,401);
 const current=await request(f.server,{pathname:url,token:f.admin});assert.equal(current.status,200);
 const body={mode:'worker_only',expectedVersion:current.json.policy.version};
 assert.equal((await request(f.server,{method:'PUT',pathname:url,token:f.admin,body})).status,200);
 assert.equal((await request(f.server,{method:'PUT',pathname:url,token:f.admin,body})).status,409);
 assert.equal((await request(f.server,{method:'PUT',pathname:url,token:f.admin,body:{...body,companyId:'x'}})).status,400);
 const page=await request(f.server,{pathname:'/admin'});assert.ok(page.text.includes('completionMode'));assert.ok(page.text.includes('worker_only'));
});
test('SQLite write failure rolls back order, request, events and points; retry succeeds',async t=>{
 const f=await fixture(t);store.completionPolicy.publish({mode:'worker_only',expectedVersion:store.completionPolicy.read().version});
 const {DatabaseSync}=require('node:sqlite');const database=new DatabaseSync(process.env.PAKSHO_SQLITE_PATH);
 const before=store.getOrder(f.id),events=store.listOrderEvents(f.id);
 try {
  database.exec("CREATE TRIGGER test_completion_failure BEFORE INSERT ON notifications WHEN NEW.kind='ORDER_COMPLETED' BEGIN SELECT RAISE(ABORT,'injected'); END");
  assert.equal((await f.put('/complete',f.body())).status,500);
  assert.deepEqual(store.getOrder(f.id),before);assert.deepEqual(store.listOrderEvents(f.id),events);
  assert.equal(store.completionFor(before),null);assert.equal(store.listLedger().filter(x=>x.orderId===f.id).length,0);
 } finally {database.exec('DROP TRIGGER IF EXISTS test_completion_failure');database.close();}
 assert.equal((await f.put('/complete',f.body())).status,200);
});
test('start disputes block both new completion and pending confirmation',async t=>{
 const f=await fixture(t);const sent=(await f.put('/complete',f.body())).json.completion;
 const key=store.startAcceptanceKey(store.getOrder(f.id));store.reportStart(f.id,f.worker.user,key);
 store.respondStart(f.id,f.customer.user.id,'no',store.startPromptEventId(store.getOrder(f.id)));
 assert.equal((await f.put('/completion-response',{requestId:sent.requestId,answer:'yes'},f.customer.token)).status,409);
 assert.equal(store.getOrder(f.id).status,'ACCEPTED');
});
