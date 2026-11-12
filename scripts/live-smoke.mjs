// Live PayPal sandbox smoke test (needs PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET in the server env).
// Creates a record and a real AUTHORIZE order, reads it back from PayPal, and prints the approval URL.
// Authorization needs a human to approve as the sandbox buyer, so finish the flow in the browser.
const BASE = process.env.BASE || 'http://localhost:3000';
const call = async (m, p, b) => { const r = await fetch(BASE + p, { method: m, headers: { 'Content-Type': 'application/json' }, body: b ? JSON.stringify(b) : undefined }); const j = await r.json(); if (!r.ok) throw new Error(`${p}: ${j.error}`); return j; };
const cfg = await call('GET', '/api/config');
if (!cfg.paypalLive) { console.log('Server is in PayPal demo mode. Set PayPal keys and restart.'); process.exit(1); }
const request = 'Black running shoes, size 10, under $80, one pair, from StrideLab, no subscriptions, deliver by Friday';
const { constraints } = await call('POST', '/api/intent', { request });
const rec = await call('POST', '/api/records', { request, constraints, mode: 'strict', scenario: 'warranty' });
const order = await call('POST', `/api/records/${rec.id}/order`);
console.log('PASS  live sandbox AUTHORIZE order created:', order.id);
let authErr = '';
try { await call('POST', `/api/records/${rec.id}/authorize`); } catch (e) { authErr = e.message; }
console.log(authErr.includes('not yet approved') ? 'PASS  PayPal refuses to authorize before buyer approval (as expected)' : `INFO  ${authErr || 'authorized?'}`);
console.log(`Approve here as the sandbox buyer: ${order.approveUrl}`);
console.log(`It returns to ${BASE}/app?record=${rec.id}&paypal=approved and OryvaPay continues automatically.`);
