// End to end test of the OryvaPay flow against a running server.
// Usage: BASE=http://localhost:3000 npm test
const BASE = process.env.BASE || 'http://localhost:3000';
const REQUEST = 'Black running shoes, size 10, under $80, one pair, from StrideLab, no subscriptions, deliver by Friday';
let failures = 0;

async function call(method, path, body) {
  const res = await fetch(BASE + path, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const json = await res.json();
  if (!res.ok) throw new Error(`${method} ${path}: ${json.error}`);
  return json;
}
function expect(cond, msg) { console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`); if (!cond) failures++; }
const last = r => r.attempts[r.attempts.length - 1];

async function pay(id) {
  await call('POST', `/api/records/${id}/order`);
  await call('POST', `/api/records/${id}/authorize`);
  return call('POST', `/api/records/${id}/verify`);
}

const { constraints } = await call('POST', '/api/intent', { request: REQUEST });
expect(constraints.product.attributes.color === 'black' && constraints.product.attributes.size === '10', 'intent parsed color and size');
expect(constraints.maxBudget === 80 && constraints.quantity === 1, 'intent parsed budget 80 and quantity 1');
expect(constraints.recurringAllowed === false && constraints.deliveryDeadline, `intent: no subscriptions, deadline ${constraints.deliveryDeadline}`);

// Main demo: warranty sneaked in, strict mode -> block -> void -> fix -> pass -> capture
let r = await call('POST', '/api/records', { request: REQUEST, constraints, mode: 'strict', scenario: 'warranty' });
r = await pay(r.id);
expect(last(r).verification.verdict === 'BLOCK', `warranty scenario blocked: ${last(r).verification.failedChecks.join(', ')}`);
expect(last(r).status === 'VOIDED', 'authorization voided');
expect(last(r).verification.sneakyCharges.some(x => x.id === 'addons'), 'sneaky charges detector flagged the add-on warranty');
r = await call('POST', `/api/records/${r.id}/fix`);
expect(last(r).cart.items.length === 1, 'agent removed the protection plan');
r = await pay(r.id);
expect(last(r).verification.verdict === 'PASS' && last(r).status === 'CAPTURED', 'fixed order passed and captured');
expect(r.chain.valid && r.events.length >= 9, `hash chain valid over ${r.events.length} events, head ${r.chain.headHash.slice(0, 12)}`);
console.log('      events:', r.events.map(e => e.type).join(' > '));

// Every scenario in strict mode should block, except clean
const cfg = await call('GET', '/api/config');
for (const s of Object.keys(cfg.scenarios)) {
  const x = await call('POST', '/api/records', { request: REQUEST, constraints, mode: 'strict', scenario: s });
  const v = await pay(x.id);
  const want = s === 'clean' ? 'PASS' : 'BLOCK';
  expect(last(v).verification.verdict === want, `strict ${s}: ${last(v).verification.verdict} [${last(v).verification.failedChecks.join(', ')}]`);
}

// Flexible: $5 price rise within $5 tolerance passes; warranty still blocks
let f = await call('POST', '/api/records', { request: REQUEST, constraints, mode: 'flexible', tolerance: 5, scenario: 'price_change' });
f = await pay(f.id);
expect(last(f).verification.verdict === 'PASS', 'flexible price_change within tolerance passes');
f = await call('POST', '/api/records', { request: REQUEST, constraints, mode: 'flexible', tolerance: 5, scenario: 'warranty' });
f = await pay(f.id);
expect(last(f).verification.verdict === 'BLOCK', 'flexible warranty still blocks');

// Approval: flags then asks, buyer rejects -> void; buyer approves -> capture
let a = await call('POST', '/api/records', { request: REQUEST, constraints, mode: 'approval', scenario: 'subscription' });
a = await pay(a.id);
expect(last(a).status === 'AWAITING_APPROVAL', 'approval mode waits for buyer');
a = await call('POST', `/api/records/${a.id}/decision`, { approve: false });
expect(last(a).status === 'VOIDED', 'buyer rejected -> voided');
a = await call('POST', '/api/records', { request: REQUEST, constraints, mode: 'approval', scenario: 'quantity' });
a = await pay(a.id);
a = await call('POST', `/api/records/${a.id}/decision`, { approve: true });
expect(last(a).status === 'CAPTURED', 'buyer approved -> captured');

const list = await call('GET', '/api/records');
expect(list.length > 0, `records list returns ${list.length} records`);
const dl = await fetch(`${BASE}/api/records/${r.id}/download`);
expect(dl.ok && (dl.headers.get('content-disposition') || '').includes('.json'), 'record downloads as JSON');

const ev = await fetch(`${BASE}/record/${r.id}/evidence`);
const evHtml = await ev.text();
expect(ev.ok && evHtml.includes('Dispute Evidence Pack') && evHtml.includes(last(r).authorizationId) && evHtml.includes(r.chain.headHash), 'Dispute Evidence Pack has PayPal IDs and head hash');
const rp = await fetch(`${BASE}/record/${r.id}`);
expect(rp.ok && (await rp.text()).includes('Merchant view'), 'record page has Merchant view');

console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
process.exit(failures ? 1 : 0);
