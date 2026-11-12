import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './lib/config.js';
import { parseIntent } from './lib/ai.js';
import { agentBuildCart, SCENARIOS, CATALOG, MERCHANTS } from './lib/catalog.js';
import * as paypal from './lib/paypal.js';
import { verify, MODES } from './lib/verify.js';
import { renderEvidencePack } from './lib/evidence.js';
import { createRecord, getRecord, listRecords, appendEvent, updateRecord, verifyChain } from './lib/records.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.set('trust proxy', true);
app.use(express.json({ limit: '200kb' }));
app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));

const wrap = fn => (req, res) => Promise.resolve(fn(req, res)).catch(e => {
  console.error(e);
  res.status(e.status || 500).json({ error: e.message });
});
const bad = (msg, status = 400) => Object.assign(new Error(msg), { status });
const lastAttempt = r => r.attempts[r.attempts.length - 1];
const cartTotal = c => Math.round((c.items.reduce((s, i) => s + (i.chargedUnitPrice ?? i.unitPrice) * i.quantity, 0) + (c.shipping?.price || 0) + (c.serviceFee?.amount || 0)) * 100) / 100;
const quotedTotal = c => Math.round((c.items.reduce((s, i) => s + i.quotedUnitPrice * i.quantity, 0) + (c.shipping?.price || 0)) * 100) / 100;

function load(id) {
  const r = getRecord(id);
  if (!r) throw bad('Record not found', 404);
  return r;
}

app.get('/api/config', (req, res) => res.json({
  paypalLive: config.paypalLive,
  aiLive: config.aiLive,
  demoMode: config.demoMode,
  paypalEnv: config.paypal.env,
  paypalClientId: config.paypalLive ? config.paypal.clientId : null,
  aiModel: config.aiLive ? config.ai.model : 'local heuristic',
  aiHost: config.aiLive ? new URL(config.ai.baseUrl).host : null,
  scenarios: SCENARIOS,
  modes: MODES,
  demoVideo: demoVideo(),
}));

// DEMO_VIDEO_URL: any YouTube link (watch, youtu.be, shorts, embed). Served as a privacy friendly youtube-nocookie embed.
function demoVideo() {
  const u = (process.env.DEMO_VIDEO_URL || '').trim();
  if (!u) return null;
  const m = u.match(/(?:youtu\.be\/|v=|\/embed\/|\/shorts\/|\/live\/)([A-Za-z0-9_-]{11})/);
  if (!m) return null;
  return { id: m[1], embed: `https://www.youtube-nocookie.com/embed/${m[1]}?rel=0&modestbranding=1&autoplay=1`, thumb: `https://i.ytimg.com/vi/${m[1]}/maxresdefault.jpg`, url: u };
}

app.get('/api/catalog', (req, res) => res.json({ merchants: MERCHANTS, products: CATALOG }));

app.get('/api/health', (req, res) => res.json({ ok: true }));

// Step 1: AI turns a plain English request into purchase constraints.
app.post('/api/intent', wrap(async (req, res) => {
  const request = String(req.body.request || '').trim();
  if (!request) throw bad('Tell OryvaPay what you want to buy.');
  res.json({ constraints: await parseIntent(request) });
}));

// Step 2: buyer approves the constraints, the shopping agent builds a cart.
app.post('/api/records', wrap(async (req, res) => {
  const { request, constraints, mode = 'strict', tolerance = 5, scenario = 'warranty' } = req.body;
  if (!request || !constraints) throw bad('request and constraints are required');
  if (!MODES[mode]) throw bad('mode must be strict, flexible or approval');
  const rec = createRecord({ request, constraints, mode, tolerance: Number(tolerance), scenario });
  appendEvent(rec.id, 'request_received', { request });
  appendEvent(rec.id, 'constraints_approved', { constraints, mode, tolerance: Number(tolerance) });
  const cart = agentBuildCart(constraints, scenario);
  updateRecord(rec.id, r => r.attempts.push({ n: 1, cart, cartTotal: cartTotal(cart), quotedTotal: quotedTotal(cart), status: 'CART_BUILT' }));
  appendEvent(rec.id, 'agent_cart_built', { attempt: 1, merchant: cart.merchant, items: cart.items, shipping: cart.shipping, serviceFee: cart.serviceFee, agentSteps: cart.agentSteps });
  res.json(getRecord(rec.id));
}));

// Step 3a: create a PayPal order with intent AUTHORIZE for the agent's cart.
app.post('/api/records/:id/order', wrap(async (req, res) => {
  const r = load(req.params.id);
  const a = lastAttempt(r);
  if (a.orderId && a.status === 'ORDER_CREATED') return res.json({ id: a.orderId, approveUrl: a.approveUrl });
  if (a.status !== 'CART_BUILT') throw bad('This attempt already has a payment. Use Fix order to start a new attempt.');
  const origin = `${req.protocol}://${req.get('host')}`;
  const order = await paypal.createOrder(a.cart, `${r.id}-${a.n}`, { returnUrl: `${origin}/app?record=${r.id}&paypal=approved`, cancelUrl: `${origin}/app?record=${r.id}&paypal=cancelled` });
  const approveUrl = order.links?.find(l => l.rel === 'approve' || l.rel === 'payer-action')?.href;
  updateRecord(r.id, x => Object.assign(lastAttempt(x), { orderId: order.id, approveUrl, status: 'ORDER_CREATED' }));
  appendEvent(r.id, 'paypal_order_created', { attempt: a.n, orderId: order.id, intent: 'AUTHORIZE', amount: order.purchase_units?.[0]?.amount || null, simulated: !config.paypalLive });
  res.json({ id: order.id, approveUrl });
}));

// Step 3b: after the buyer approves in PayPal, authorize (funds held, not taken).
app.post('/api/records/:id/authorize', wrap(async (req, res) => {
  const r = load(req.params.id);
  const a = lastAttempt(r);
  if (!a.orderId) throw bad('Create the PayPal order first.');
  if (a.authorizationId) return res.json({ authorizationId: a.authorizationId });
  const out = await paypal.authorizeOrder(a.orderId);
  const auth = out.purchase_units?.[0]?.payments?.authorizations?.[0];
  if (!auth) throw bad('PayPal did not return an authorization.', 502);
  updateRecord(r.id, x => Object.assign(lastAttempt(x), { authorizationId: auth.id, authorization: { status: auth.status, amount: auth.amount, expiration_time: auth.expiration_time }, status: 'AUTHORIZED', payer: out.payer?.email_address || null }));
  appendEvent(r.id, 'buyer_approved_authorization', { attempt: a.n, orderId: a.orderId, authorizationId: auth.id, amount: auth.amount, payer: out.payer?.email_address || null, simulated: !config.paypalLive });
  res.json({ authorizationId: auth.id, status: auth.status, amount: auth.amount });
}));

async function capture(r, a, reason) {
  const cap = await paypal.captureAuthorization(a.authorizationId);
  updateRecord(r.id, x => { Object.assign(lastAttempt(x), { status: 'CAPTURED', captureId: cap.id, finalEvent: { type: 'CAPTURED', at: new Date().toISOString(), captureId: cap.id, amount: cap.amount } }); x.status = 'CAPTURED'; });
  appendEvent(r.id, 'payment_captured', { attempt: a.n, authorizationId: a.authorizationId, captureId: cap.id, status: cap.status, amount: cap.amount, reason });
}
async function voidIt(r, a, reason) {
  const v = await paypal.voidAuthorization(a.authorizationId);
  updateRecord(r.id, x => { Object.assign(lastAttempt(x), { status: 'VOIDED', finalEvent: { type: 'VOIDED', at: new Date().toISOString(), authorizationId: a.authorizationId } }); x.status = 'BLOCKED'; });
  appendEvent(r.id, 'authorization_voided', { attempt: a.n, authorizationId: a.authorizationId, status: v.status || 'VOIDED', reason });
}

// Step 4: OryvaPay verifies the PayPal order against the intent, then captures, voids or asks.
app.post('/api/records/:id/verify', wrap(async (req, res) => {
  const r = load(req.params.id);
  const a = lastAttempt(r);
  if (a.status !== 'AUTHORIZED') throw bad(`Nothing to verify (attempt status is ${a.status}).`);
  const paypalOrder = await paypal.getOrder(a.orderId);
  const result = await verify({ constraints: r.constraints, paypalOrder, cart: a.cart, mode: r.mode, tolerance: r.tolerance });
  updateRecord(r.id, x => Object.assign(lastAttempt(x), { verification: result }));
  appendEvent(r.id, 'verification_result', { attempt: a.n, verdict: result.verdict, mode: r.mode, failedChecks: result.failedChecks, checks: result.checks.map(c => ({ id: c.id, status: c.status, detail: c.detail, source: c.source })), explanation: result.explanation, reviewedBy: result.reviewedBy, merchantChargedTotal: result.order.total });
  if (result.verdict === 'PASS') await capture(r, a, 'Verification passed');
  else if (result.verdict === 'BLOCK') await voidIt(r, a, `Blocked by OryvaPay (${result.failedChecks.join(', ')})`);
  else updateRecord(r.id, x => { lastAttempt(x).status = 'AWAITING_APPROVAL'; x.status = 'AWAITING_APPROVAL'; });
  res.json(withChain(getRecord(r.id)));
}));

// Approval mode: the buyer decides.
app.post('/api/records/:id/decision', wrap(async (req, res) => {
  const r = load(req.params.id);
  const a = lastAttempt(r);
  if (a.status !== 'AWAITING_APPROVAL') throw bad('No decision is pending.');
  const approve = Boolean(req.body.approve);
  appendEvent(r.id, 'buyer_decision', { attempt: a.n, approve, flagged: a.verification?.failedChecks || [] });
  if (approve) await capture(r, a, 'Buyer approved despite flagged issues');
  else await voidIt(r, a, 'Buyer rejected flagged issues');
  res.json(withChain(getRecord(r.id)));
}));

// Fix order: the agent rebuilds the cart without what OryvaPay flagged. New PayPal order, new approval.
app.post('/api/records/:id/fix', wrap(async (req, res) => {
  const r = load(req.params.id);
  const a = lastAttempt(r);
  if (a.status !== 'VOIDED') throw bad('Only a blocked (voided) attempt can be fixed.');
  const flagged = a.verification?.failedChecks || [];
  const cart = agentBuildCart(r.constraints, r.scenario, flagged.length ? flagged : ['buyer rejection']);
  const n = a.n + 1;
  updateRecord(r.id, x => { x.attempts.push({ n, cart, cartTotal: cartTotal(cart), quotedTotal: quotedTotal(cart), status: 'CART_BUILT' }); x.status = 'OPEN'; });
  appendEvent(r.id, 'agent_cart_rebuilt', { attempt: n, removedOrFixed: flagged, merchant: cart.merchant, items: cart.items, shipping: cart.shipping, agentSteps: cart.agentSteps });
  res.json(getRecord(r.id));
}));

function withChain(r) { return { ...r, chain: verifyChain(r) }; }

app.get('/api/records', (req, res) => res.json(listRecords()));
app.get('/api/records/:id', wrap(async (req, res) => res.json(withChain(load(req.params.id)))));
app.get('/api/records/:id/download', wrap(async (req, res) => {
  const r = withChain(load(req.params.id));
  res.setHeader('Content-Disposition', `attachment; filename="${r.id}.json"`);
  res.type('application/json').send(JSON.stringify({ format: 'oryvapay.intent-record.v1', hashAlgorithm: 'sha256(prevHash + canonicalJSON({seq,type,at,data}))', ...r }, null, 2));
}));

app.get('/record/:id/evidence', wrap(async (req, res) => {
  res.type('html').send(renderEvidencePack(withChain(load(req.params.id))));
}));

app.get('/record/:id', (req, res) => res.sendFile(path.join(__dirname, 'public', 'record.html')));

app.listen(config.port, () => {
  console.log(`OryvaPay running on http://localhost:${config.port}`);
  console.log(`PayPal: ${config.paypalLive ? `LIVE ${config.paypal.env} API` : 'DEMO_MODE (simulated, no keys)'} | AI: ${config.aiLive ? `${config.ai.model} @ ${config.ai.baseUrl}` : 'DEMO_MODE (local heuristic, no key)'}`);
});
