import { $, esc, usd, day, api, header, footer, eventLine } from './common.js';

const EXAMPLES = [
  'Black running shoes, size 10, under $80, one pair, from StrideLab, no subscriptions, deliver by Friday',
  'One black water bottle under $30, no add-ons',
  'Black wireless earbuds under $65, no subscriptions, deliver by Monday',
];
const state = { cfg: null, constraints: null, mode: 'strict', record: null, sdkLoaded: false };

const cfg = await header('verify');
state.cfg = cfg;
footer();

// ---------- step 1 ----------
$('#examples').innerHTML = EXAMPLES.map(e => `<button class="chip">${esc(e)}</button>`).join('');
$('#examples').addEventListener('click', e => { if (e.target.classList.contains('chip')) $('#req').value = e.target.textContent; });
$('#scenario').innerHTML = Object.entries(cfg.scenarios).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('');
setMode('strict');
$('#modeSeg').addEventListener('click', e => { if (e.target.dataset.m) setMode(e.target.dataset.m); });
renderStepper(1);

function setMode(m) {
  state.mode = m;
  document.querySelectorAll('#modeSeg button').forEach(b => b.classList.toggle('on', b.dataset.m === m));
  $('#modeHint').textContent = cfg.modes[m];
  $('#tolWrap').style.display = m === 'flexible' ? 'block' : 'none';
}

function showErr(id, e) { const el = $(id); el.textContent = e ? (e.message || e) : ''; el.style.display = e ? 'block' : 'none'; }
async function busy(btn, label, fn) {
  const old = btn.innerHTML; btn.disabled = true; btn.innerHTML = `<span class="spin"></span>${label}`;
  try { return await fn(); } finally { btn.disabled = false; btn.innerHTML = old; }
}

$('#parseBtn').addEventListener('click', e => busy(e.currentTarget, 'Reading your request...', async () => {
  showErr('#err1');
  try {
    const { constraints } = await api('POST', '/api/intent', { request: $('#req').value });
    state.constraints = constraints;
    renderConstraints(constraints);
  } catch (err) { showErr('#err1', err); }
}));

function renderConstraints(c) {
  const attrs = Object.entries(c.product.attributes || {}).map(([k, v]) => `${k}: ${v}`).join(', ') || 'any';
  const yn = (v, yes, no) => `<div class="v ${v ? 'yes' : 'no'}">${v ? yes : no}</div>`;
  const items = [
    ['Product', `<div class="v">${esc(c.product.category || 'any')}</div>`],
    ['Must have', `<div class="v">${esc(attrs)}</div>`],
    ['Quantity', `<div class="v">${c.quantity}</div>`],
    ['Max total', `<div class="v">${c.maxBudget != null ? usd(c.maxBudget) : 'no limit'}</div>`],
    ['Merchant', `<div class="v">${esc(c.allowedMerchants.length ? c.allowedMerchants.join(', ') : 'any verified store')}</div>`],
    ['Deliver by', `<div class="v">${c.deliveryDeadline ? day(c.deliveryDeadline) : 'no deadline'}</div>`],
    ['Subscriptions', yn(c.recurringAllowed, 'Allowed', 'Not allowed')],
    ['Add-ons, warranties', yn(c.extrasAllowed, 'Allowed', 'Not allowed')],
    ['Service fees', yn(c.serviceFeesAllowed, 'Allowed', 'Not allowed')],
  ];
  $('#cons').innerHTML = items.map(([k, v]) => `<div class="con"><div class="k">${k}</div>${v}</div>`).join('');
  $('#parsedBy').textContent = c.parsedBy === 'ai' ? `Parsed by AI (${cfg.aiModel})` : 'Parsed by local heuristic (demo mode)';
  $('#consWrap').style.display = 'block';
}

$('#shopBtn').addEventListener('click', e => busy(e.currentTarget, 'Agent is shopping...', async () => {
  showErr('#err1');
  try {
    const rec = await api('POST', '/api/records', { request: $('#req').value, constraints: state.constraints, mode: state.mode, tolerance: Number($('#tol').value || 0), scenario: $('#scenario').value });
    setRecord(rec);
    mark('#s1', 'done'); unlock('#s2'); lock('#s3');
    $('#s1 .hd .sub').textContent = `"${$('#req').value}" . ${state.mode} mode`;
    $('#s1').addEventListener('click', () => $('#s1').classList.remove('done'), { once: true });
    renderCart();
    renderStepper(2);
    $('#s2').scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (err) { showErr('#err1', err); }
}));

// ---------- step 2 ----------
function renderCart() {
  const r = state.record;
  const a = r.attempts[r.attempts.length - 1];
  const c = a.cart;
  $('#attemptPill').textContent = `Attempt ${a.n}`;
  const sneakWords = /(added|slipped|bundle|repriced|redirected|economy|switched|service fee|pre-selected|recommended)/i;
  $('#agentlog').innerHTML = c.agentSteps.map(s => `<li class="${a.n === 1 && sneakWords.test(s) ? 'sneak' : ''}">${esc(s)}</li>`).join('');
  $('#cartMeta').innerHTML = `<span>Merchant <b>${esc(c.merchant.name)}</b></span><span>Shipping <b>${esc(c.shipping.method)}</b></span><span>Arrives <b>${day(c.shipping.eta)}</b></span>`;
  $('#cartItems').innerHTML = c.items.map(it => {
    const tag = it.kind === 'subscription' ? '<span class="tag sub">Recurring</span>' : it.kind === 'warranty' ? '<span class="tag war">Add-on</span>' : '';
    const price = it.chargedUnitPrice ?? it.unitPrice;
    return `<tr><td><div class="nm">${esc(it.name)}${tag}</div><div class="ds">${esc(it.description || '')} . SKU ${esc(it.sku)}</div></td><td class="n">${it.quantity}</td><td class="n">${usd(price)}</td><td class="n">${usd(price * it.quantity)}</td></tr>`;
  }).join('');
  const itemsTotal = c.items.reduce((s, i) => s + (i.chargedUnitPrice ?? i.unitPrice) * i.quantity, 0);
  $('#cartTotals').innerHTML = `<tr><td>Items</td><td>${usd(itemsTotal)}</td></tr><tr><td>Shipping</td><td>${c.shipping.price ? usd(c.shipping.price) : 'Free'}</td></tr>${c.serviceFee ? `<tr><td>${esc(c.serviceFee.label)}</td><td>${usd(c.serviceFee.amount)}</td></tr>` : ''}<tr class="grand"><td>Total</td><td>${usd(a.cartTotal)}</td></tr>`;
  renderPay();
}

function renderPay() {
  const area = $('#payArea');
  if (cfg.paypalLive) {
    area.innerHTML = '<div id="paypal-buttons"></div>';
    loadSdk().then(() => {
      window.paypal.Buttons({
        style: { layout: 'horizontal', color: 'gold', shape: 'pill', label: 'paypal', tagline: false, height: 45 },
        createOrder: async () => (await api('POST', `/api/records/${state.record.id}/order`)).id,
        onApprove: async () => { await afterApproval(); },
        onCancel: () => showErr('#err2', 'PayPal approval was cancelled. Nothing was charged.'),
        onError: err => showErr('#err2', err),
      }).render('#paypal-buttons');
    }).catch(err => showErr('#err2', err));
  } else {
    area.innerHTML = '<button class="btn pp" id="demoPay"><b style="font-style:italic;color:#003087">Pay</b><b style="font-style:italic;color:#0070e0;margin-left:-6px">Pal</b>&nbsp;Authorize</button>';
    $('#demoPay').addEventListener('click', e => busy(e.currentTarget, 'Opening PayPal...', openDemoPayPal));
  }
}

function loadSdk() {
  if (state.sdkLoaded) return Promise.resolve();
  return new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(cfg.paypalClientId)}&currency=USD&intent=authorize&components=buttons`;
    s.onload = () => { state.sdkLoaded = true; res(); };
    s.onerror = () => rej(new Error('Could not load the PayPal SDK'));
    document.head.append(s);
  });
}

async function openDemoPayPal() {
  showErr('#err2');
  try {
    const order = await api('POST', `/api/records/${state.record.id}/order`);
    await refresh();
    const a = state.record.attempts.at(-1);
    $('#ppUrl').textContent = order.approveUrl || 'https://www.sandbox.paypal.com/checkoutnow';
    $('#ppAmt').textContent = usd(a.cartTotal) + ' USD';
    $('#ppMerchant').textContent = `to ${a.cart.merchant.name}`;
    $('#ppLines').innerHTML = a.cart.items.map(i => `<div class="li"><span>${esc(i.name)} x${i.quantity}</span><span>${usd((i.chargedUnitPrice ?? i.unitPrice) * i.quantity)}</span></div>`).join('') + (a.cart.serviceFee ? `<div class="li"><span>${esc(a.cart.serviceFee.label)}</span><span>${usd(a.cart.serviceFee.amount)}</span></div>` : '');
    $('#ppModal').classList.add('on');
  } catch (err) { showErr('#err2', err); }
}
$('#ppCancel').addEventListener('click', () => { $('#ppModal').classList.remove('on'); showErr('#err2', 'PayPal approval was cancelled. Nothing was charged.'); });
$('#ppApprove').addEventListener('click', async () => { $('#ppModal').classList.remove('on'); await afterApproval(); });

// ---------- step 3 ----------
async function afterApproval() {
  showErr('#err2');
  try {
    await api('POST', `/api/records/${state.record.id}/authorize`);
    await refresh();
    mark('#s2', 'done'); unlock('#s3'); renderStepper(3);
    const a = state.record.attempts.at(-1);
    $('#verifyBody').innerHTML = `<div class="scan fade">
      <div class="ln"><span class="tag" style="background:var(--okbg);color:var(--ok)">AUTHORIZED</span> PayPal authorization <code>${esc(a.authorizationId)}</code> for ${usd(a.authorization.amount.value)}. Funds are held, nothing captured.</div>
      ${['Reading the order PayPal received', 'Checking quantity, fees, subscriptions, add-ons', 'Checking merchant, delivery date, price changes, budget', 'AI review: does the product match what you asked for?'].map(t => `<div class="ln"><span class="spin"></span>${t}</div>`).join('')}</div>`;
    $('#s3').scrollIntoView({ behavior: 'smooth', block: 'start' });
    const [rec] = await Promise.all([api('POST', `/api/records/${state.record.id}/verify`), new Promise(r => setTimeout(r, 1600))]);
    setRecord(rec);
    renderVerdict();
  } catch (err) { showErr('#err2', err); }
}

function renderVerdict() {
  const r = state.record;
  const a = r.attempts.at(-1);
  const v = a.verification;
  const icon = { PASS: '&#10003;', BLOCK: '&#10005;', NEEDS_APPROVAL: '!' }[v.verdict];
  const checks = [...v.checks].sort((x, y) => ({ fail: 0, warn: 1, pass: 2 }[x.status] - { fail: 0, warn: 1, pass: 2 }[y.status]));
  let outcome = '';
  if (a.status === 'CAPTURED') outcome = `<div class="outcome" style="background:var(--okbg);border-color:#bfe8d3"><div class="txt"><b>Payment captured: ${usd(a.finalEvent?.amount?.value)}</b><div class="hint">Capture ID <code>${esc(a.captureId)}</code>. The Intent Record is sealed.</div></div><a class="btn ok" href="/record/${r.id}">View Intent Record</a><button class="btn ghost" onclick="location.reload()">New purchase</button></div>`;
  else if (a.status === 'VOIDED') outcome = `<div class="outcome" style="background:var(--badbg);border-color:#f6c5c7"><div class="txt"><b>Authorization voided. ${usd(a.authorization?.amount?.value)} released back to you.</b><div class="hint">Nothing was charged. Ask the agent to fix the order, and you will approve the corrected one.</div></div><button class="btn primary" id="fixBtn">Fix order</button><a class="btn ghost" href="/record/${r.id}">View record</a></div>`;
  else if (a.status === 'AWAITING_APPROVAL') outcome = `<div class="outcome" style="background:var(--warnbg);border-color:#f3dca5"><div class="txt"><b>Your call.</b><div class="hint">Funds are still only authorized. Approve to capture anyway, or reject to void.</div></div><button class="btn ok" id="apBtn">Approve and pay</button><button class="btn bad" id="rjBtn">Reject and void</button></div>`;

  $('#verifyBody').innerHTML = `<div class="fade">
    <div class="verdict ${v.verdict}"><div class="ic">${icon}</div><div><h3>${esc(v.headline)}</h3><p>Mode: <b>${esc(r.mode)}</b>${r.mode === 'flexible' ? ` (tolerance ${usd(r.tolerance)})` : ''} . Merchant charged ${usd(v.order.total)}${v.riskScore != null ? ` . Risk ${v.riskScore}/100` : ''}</p></div></div>
    <div class="why"><div class="k">Why, in plain words</div>${esc(v.explanation)}<div class="hint">Reviewed by ${esc(v.reviewedBy)}</div></div>
    <div class="checks">${checks.map(c => `<div class="check ${c.status}"><span class="st">${c.status === 'pass' ? '&#10003;' : c.status === 'warn' ? '!' : '&#10005;'}</span><div><div class="t">${esc(c.label)} <span class="src ${c.source === 'ai' ? 'ai' : ''}">${c.source === 'ai' ? 'AI' : 'Rule'}</span></div><div class="d">${esc(c.detail)}</div></div></div>`).join('')}</div>
    ${outcome}</div>`;
  if (a.status === 'CAPTURED') { mark('#s3', 'done'); renderStepper(4); }
  $('#fixBtn')?.addEventListener('click', e => busy(e.currentTarget, 'Agent is fixing the order...', fixOrder));
  $('#apBtn')?.addEventListener('click', e => busy(e.currentTarget, 'Capturing...', () => decide(true)));
  $('#rjBtn')?.addEventListener('click', e => busy(e.currentTarget, 'Voiding...', () => decide(false)));
}

async function decide(approve) {
  try { setRecord(await api('POST', `/api/records/${state.record.id}/decision`, { approve })); renderVerdict(); }
  catch (err) { alert(err.message); }
}

async function fixOrder() {
  try {
    setRecord(await api('POST', `/api/records/${state.record.id}/fix`));
    lock('#s3'); unlock('#s2'); renderCart(); renderStepper(2);
    $('#s2').scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (err) { alert(err.message); }
}

// ---------- record side panel ----------
async function refresh() { setRecord(await api('GET', `/api/records/${state.record.id}`)); }
function setRecord(rec) {
  state.record = rec;
  $('#timeline').innerHTML = rec.events.map(eventLine).join('');
  $('#recLink').href = `/record/${rec.id}`; $('#recLink').style.display = 'inline';
  $('#recLink').textContent = `${rec.id} >`;
  const ch = rec.chain;
  $('#chainBox').innerHTML = ch ? `<div class="chainok ${ch.valid ? '' : 'chainbad'}">${ch.valid ? '&#128274; Hash chain intact' : '&#9888; Chain broken'} . ${rec.events.length} events</div>` : '';
}

// ---------- ui helpers ----------
function mark(sel, cls) { const el = $(sel); el.classList.remove('active', 'locked'); el.classList.add(cls); }
function unlock(sel) { const el = $(sel); el.classList.remove('locked', 'done'); el.classList.add('active'); }
function lock(sel) { const el = $(sel); el.classList.remove('active', 'done'); el.classList.add('locked'); }
function renderStepper(n) {
  const steps = ['Intent', 'Agent cart', 'PayPal authorize', 'Verify', 'Capture'];
  const cur = n === 1 ? 0 : n === 2 ? 2 : n === 3 ? 3 : 5;
  $('#stepper').innerHTML = steps.map((s, i) => `<div class="s ${i < cur ? 'ok' : i === cur ? 'on' : ''}"><b>${i < cur ? '&#10003;' : i + 1}</b>${s}</div>`).join('');
}
