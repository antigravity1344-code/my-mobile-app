const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'paksho-start-merge-'));
process.env.PAKSHO_DATA_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString('base64');
process.env.PAKSHO_SQLITE_PATH = path.join(tmp, 'paksho.sqlite');
process.env.PAKSHO_WORKER_DOC_DIR = path.join(tmp, 'docs');
process.env.PAKSHO_ADMIN_PASSWORD = 'test-admin-start-policy';
process.env.NODE_ENV = 'test';
const { app, store } = require('./index.js');
after(() => { store.close(); fs.rmSync(tmp, { recursive: true, force: true }); });

function request(server, { method = 'GET', pathname, token, body }) {
  const payload = body === undefined ? null : JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname:'127.0.0.1', port:server.address().port, path:pathname, method,
      headers:{
        ...(payload ? {'Content-Type':'application/json','Content-Length':Buffer.byteLength(payload)} : {}),
        ...(token ? {Authorization:'Bearer '+token} : {})
      }
    }, res => {
      const chunks=[];
      res.on('data',c=>chunks.push(c));
      res.on('end',()=>resolve({status:res.statusCode,json:JSON.parse(Buffer.concat(chunks).toString('utf8'))}));
    });
    req.on('error',reject);
    if(payload)req.write(payload);
    req.end();
  });
}
async function login(server, phone, role) {
  const sent=await request(server,{method:'POST',pathname:'/api/auth/send-otp',body:{phone}});
  assert.equal(sent.status,200);
  const out=await request(server,{method:'POST',pathname:'/api/auth/verify-otp',body:{phone,code:store.getOtp(phone).code,role}});
  assert.equal(out.status,200);
  return out.json;
}
test('start workflow: ownership, independent status, idempotency, customer decision, admin authentication', async t => {
  const server=http.createServer(app);
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>server.close());
  const customer=await login(server,'09120006501','CUSTOMER');
  const stranger=await login(server,'09120006502','CUSTOMER');
  const worker=await login(server,'09120006503','WORKER');
  const otherWorker=await login(server,'09120006504','WORKER');
  for(const w of [worker,otherWorker]){
    const u=store.getUser(w.user.id);u.status='APPROVED';u.name='متخصص';store.updateUser(u);
  }
  const orderId='START-MERGE-ORDER-01';
  store.createOrder({
    id:orderId,customerId:customer.user.id,customerName:'مشتری',
    customerPhone:'09120006501',serviceTitle:'نظافت منزل',address:'تهران',
    date:'۱۴۰۵/۰۷/۲۰',time:'صبح',price:1000000,status:'PENDING',createdAt:new Date().toISOString()
  });
  const accept=store.tryAcceptOrder(orderId,store.getUser(worker.user.id));
  assert.equal(accept.code,'ok');
  const endpoint='/api/orders/'+orderId+'/start';
  assert.equal((await request(server,{method:'PUT',pathname:endpoint,body:{}})).status,401);
  assert.equal((await request(server,{method:'PUT',pathname:endpoint,token:customer.token,body:{}})).status,403);
  assert.equal((await request(server,{method:'PUT',pathname:endpoint,token:otherWorker.token,body:{}})).status,403);
  const started=await request(server,{method:'PUT',pathname:endpoint,token:worker.token,body:{}});
  assert.equal(started.status,200);
  assert.equal(started.json.order.startReported,true);
  assert.equal(store.getOrder(orderId).status,'ACCEPTED');
  assert.equal(store.getOrder(orderId).startStatus,'worker_reported');
  assert.equal(store.startPromptFor(store.getOrder(orderId)),'confirm_report');
  assert.equal((await request(server,{method:'PUT',pathname:endpoint,token:worker.token,body:{}})).status,200);
  assert.equal(store.listOrderEvents(orderId).filter(e=>e.kind==='START_REPORTED_BY_WORKER').length,1);
  const answer='/api/orders/'+orderId+'/start-response';
  assert.equal((await request(server,{method:'PUT',pathname:answer,token:stranger.token,body:{answer:'yes'}})).status,403);
  assert.equal((await request(server,{method:'PUT',pathname:answer,token:customer.token,body:{answer:'bad'}})).status,400);
  const accepted=await request(server,{method:'PUT',pathname:answer,token:customer.token,body:{answer:'yes'}});
  assert.equal(accepted.status,200);
  assert.equal(store.getOrder(orderId).status,'ACCEPTED');
  assert.equal(store.getOrder(orderId).startStatus,'customer_confirmed');
  assert.ok(store.getOrder(orderId).agreedStartAt);
  assert.equal((await request(server,{method:'PUT',pathname:answer,token:customer.token,body:{answer:'yes'}})).status,200);
  assert.equal((await request(server,{method:'PUT',pathname:answer,token:customer.token,body:{answer:'no'}})).status,409);
  const admin='/api/admin/orders/'+orderId+'/start-decision';
  assert.equal((await request(server,{method:'PUT',pathname:admin,body:{started:true}})).status,401);
  const auth=await request(server,{method:'POST',pathname:'/api/admin/login',body:{password:'test-admin-start-policy'}});
  assert.equal(auth.status,200);
  const decision=await request(server,{method:'PUT',pathname:admin,token:auth.json.token,body:{started:true}});
  assert.equal(decision.status,200);
  assert.equal(store.getOrder(orderId).startStatus,'admin_resolved');
});
