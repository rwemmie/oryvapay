import { $, esc, usd, day, api, header, footer, eventLine, diffHTML, ICON } from './common.js';

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
resumeFromPayPal();

async function resumeFromPayPal() {
  const q = new URLSearchParams(location.search);
  const id = q.get('record');
  if (!id) return;
  history.replaceState(null, '', '/app');
  try {
    setRecord(await api('GET', `/api/records/${id}`));
    state.constraints = state.record.constraints; state.mode = state.record.mode;
    $('#req').value = state.record.request;
    mark('#s1', 'done'); $('#s1 .hd .sub').textContent = `"${state.record.request}" · ${state.record.mode} mode`;
    unlock('#s2'); renderCart(); renderStepper(2);
    const a = state.record.attempts.at(-1);
    if (q.get('paypal') === 'approved' && a.status === 'ORDER_CREATED') await afterApproval();
    else if (a.verification) { unlock('#s3'); renderVerdict(); }
    else if (q.get('paypal') === 'cancelled') showErr('#err2', 'PayPal approval was cancelled. Nothing was charged.');
  } catch (err) { showErr('#err1', err); }
}

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
  $('#parsedBy').textContent = c.parsedBy === 'ai' ? `Parsed by AI · ${cfg.aiModel}` : 'Parsed locally (demo mode)';
  $('#consWrap').style.display = 'block';
}

$('#shopBtn').addEventListener('click', e => busy(e.currentTarget, 'Agent is shopping...', async () => {
  showErr('#err1');
  try {
    const rec = await api('POST', '/api/records', { request: $('#req').value, constraints: state.constraints, mode: state.mode, tolerance: Number($('#tol').value || 0), scenario: $('#scenario').value });
    setRecord(rec);
    mark('#s1', 'done'); unlock('#s2'); lock('#s3');
    $('#s1 .hd .sub').textContent = `"${$('#req').value}" · ${state.mode} mode`;
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
    return `<tr><td><div class="nm">${esc(it.name)}${tag}</div><div class="ds">${esc(it.description || '')} · SKU ${esc(it.sku)}</div></td><td class="n">${it.quantity}</td><td class="n">${usd(price)}</td><td class="n">${usd(price * it.quantity)}</td></tr>`;
  }).join('');
  const itemsTotal = c.items.reduce((s, i) => s + (i.chargedUnitPrice ?? i.unitPrice) * i.quantity, 0);
  $('#cartTotals').innerHTML = `<tr><td>Items</td><td>${usd(itemsTotal)}</td></tr><tr><td>Shipping</td><td>${c.shipping.price ? usd(c.shipping.price) : 'Free'}</td></tr>${c.serviceFee ? `<tr><td>${esc(c.serviceFee.label)}</td><td>${usd(c.serviceFee.amount)}</td></tr>` : ''}<tr class="grand"><td>Total</td><td>${usd(a.cartTotal)}</td></tr>`;
  renderPay();
}

function renderPay() {
  const area = $('#payArea');
  if (cfg.paypalLive) {
    area.innerHTML = '<div id="paypal-buttons"></div><a href="#" class="altpay" id="altPay">Popup blocked? Open PayPal in this tab</a>';
    $('#altPay').addEventListener('click', async e => {
      e.preventDefault();
      try { const o = await api('POST', `/api/records/${state.record.id}/order`); location.href = o.approveUrl; } catch (err) { showErr('#err2', err); }
    });
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
    $('#payArea').innerHTML = '<span class="pill live"><span class="dot"></span>Authorized in PayPal</span>';
    await refresh();
    mark('#s2', 'done'); unlock('#s3'); renderStepper(3);
    const a = state.record.attempts.at(-1);
    const steps = ['Reading the order PayPal received', 'Hidden fees, add-ons and surprise subscriptions', 'Price change after approval and delivery terms', 'Quantity, merchant and budget', 'AI review: does the product match what you asked for?'];
    $('#verifyBody').innerHTML = `<div class="scan fade">
      <div class="head">${ICON.lock.replace('<svg', '<svg width="18" height="18"')}<span><b>Authorized, not captured.</b> PayPal authorization <code>${esc(a.authorizationId)}</code> holds ${usd(a.authorization.amount.value)}.</span></div>
      ${steps.map((t, i) => `<div class="ln ${i ? 'queued' : 'wait'}" data-i="${i}"><span class="ic"></span>${t}</div>`).join('')}</div>`;
    $('#s3').scrollIntoView({ behavior: 'smooth', block: 'start' });
    const tick = i => { const el = $(`.scan .ln[data-i="${i}"]`); if (!el) return; el.className = 'ln done'; el.querySelector('.ic').innerHTML = '&#10003;'; const nx = $(`.scan .ln[data-i="${i + 1}"]`); if (nx) nx.className = 'ln wait'; };
    let i = 0; const timer = setInterval(() => { if (i < steps.length - 1) tick(i++); }, 380);
    let rec;
    try { [rec] = await Promise.all([api('POST', `/api/records/${state.record.id}/verify`), new Promise(r => setTimeout(r, 2000))]); }
    finally { clearInterval(timer); }
    for (; i < steps.length; i++) tick(i);
    await new Promise(r => setTimeout(r, 300));
    setRecord(rec);
    renderVerdict();
  } catch (err) { showErr('#err2', err); }
}

function renderVerdict() {
  const r = state.record;
  const a = r.attempts.at(-1);
  const v = a.verification;
  const icon = { PASS: '&#10003;', BLOCK: '&#10005;', NEEDS_APPROVAL: '?' }[v.verdict];
  const label = { PASS: 'Verdict · Pass', BLOCK: 'Verdict · Block', NEEDS_APPROVAL: 'Verdict · Review' }[v.verdict];
  const checks = [...v.checks].sort((x, y) => ({ fail: 0, warn: 1, pass: 2 }[x.status] - { fail: 0, warn: 1, pass: 2 }[y.status]));
  let outcome = '';
  if (a.status === 'CAPTURED') outcome = `<div class="outcome ok"><div class="txt"><b>Payment captured: ${usd(a.finalEvent?.amount?.value)}</b><div class="hint">Capture <code>${esc(a.captureId)}</code> · the Intent Record is sealed.</div></div><a class="btn ok" href="/record/${r.id}">View Intent Record</a><a class="btn ghost" href="/record/${r.id}/evidence" target="_blank">Evidence Pack</a><button class="btn ghost" onclick="location.href='/app'">New purchase</button></div>`;
  else if (a.status === 'VOIDED') outcome = `<div class="outcome bad"><div class="txt"><b>Authorization voided. ${usd(a.authorization?.amount?.value)} released back to you.</b><div class="hint">Nothing was charged. Ask the agent to fix the order, then approve the corrected one.</div></div><button class="btn primary" id="fixBtn">Fix order</button><a class="btn ghost" href="/record/${r.id}/evidence" target="_blank">Evidence Pack</a></div>`;
  else if (a.status === 'AWAITING_APPROVAL') outcome = `<div class="outcome rev"><div class="txt"><b>Your call.</b><div class="hint">Funds are still only authorized. Approve to capture anyway, or reject to void.</div></div><button class="btn ok" id="apBtn">Approve and pay</button><button class="btn bad" id="rjBtn">Reject and void</button></div>`;

  $('#verifyBody').innerHTML = `<div>
    <div class="verdict ${v.verdict}"><div class="ic">${icon}</div><div><div class="lbl2">${label}</div><h3>${esc(v.headline)}</h3><p>Mode <b>${esc(r.mode)}</b>${r.mode === 'flexible' ? ` · tolerance ${usd(r.tolerance)}` : ''} · merchant charged ${usd(v.order.total)}${v.riskScore != null ? ` · risk ${v.riskScore}/100` : ''}</p></div></div>
    ${v.sneakyCharges?.length ? `<div class="sneakhit"><b>Sneaky charge${v.sneakyCharges.length > 1 ? 's' : ''} caught:</b> ${v.sneakyCharges.map(x => esc(x.label)).join(', ')}. The PayPal payment was valid, but this is not what you agreed to buy.</div>` : ''}
    <div class="why"><div class="k">${ICON.spark}AI explanation, in plain words</div>${esc(v.explanation)}<div class="hint">Reviewed by ${esc(v.reviewedBy)}</div></div>
    ${diffHTML(r.constraints, v, a.cart)}
    ${checkGroups(checks)}
    ${outcome}</div>`;
  if (a.status === 'CAPTURED') { mark('#s3', 'done'); renderStepper(5); }
  else if (a.status === 'VOIDED') renderStepper(6);
  else renderStepper(4);
  $('#fixBtn')?.addEventListener('click', e => busy(e.currentTarget, 'Agent is fixing the order...', fixOrder));
  $('#apBtn')?.addEventListener('click', e => busy(e.currentTarget, 'Capturing...', () => decide(true)));
  $('#rjBtn')?.addEventListener('click', e => busy(e.currentTarget, 'Voiding...', () => decide(false)));
}

function checkGroups(checks) {
  const card = c => `<div class="check ${c.status}"><span class="st">${c.status === 'pass' ? '&#10003;' : c.status === 'warn' ? '!' : '&#10005;'}</span><div><div class="t">${esc(c.label)} <span class="src ${c.source === 'ai' ? 'ai' : ''}">${c.source === 'ai' ? 'AI' : 'Rule'}</span></div><div class="d">${esc(c.detail)}</div></div></div>`;
  const grp = (title, list) => {
    const bad = list.filter(c => c.status === 'fail').length;
    return `<div class="grouphd">${title}<span class="cnt ${bad ? 'bad' : 'ok'}">${bad ? bad + ' caught' : 'all clear'}</span></div><div class="checks">${list.map(card).join('')}</div>`;
  };
  return grp(ICON.search + 'Sneaky charges detector', checks.filter(c => c.group === 'sneaky')) + grp(ICON.target + 'Intent match', checks.filter(c => c.group !== 'sneaky'));
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
  $('#recLink').textContent = 'Open ›'; $('#recLink').title = rec.id;
  const ch = rec.chain;
  $('#chainBox').innerHTML = ch ? `<div class="chainok ${ch.valid ? '' : 'chainbad'}">${ICON.shield}${ch.valid ? 'Hash chain intact' : 'Chain broken'} · ${rec.events.length} events</div>` : '';
}

// ---------- ui helpers ----------
function mark(sel, cls) { const el = $(sel); el.classList.remove('active', 'locked'); el.classList.add(cls); }
function unlock(sel) { const el = $(sel); el.classList.remove('locked', 'done'); el.classList.add('active'); }
function lock(sel) { const el = $(sel); el.classList.remove('active', 'done'); el.classList.add('locked'); }
function renderStepper(n) {
  // n: 1 intent, 2 cart and authorize, 3 verifying, 4 waiting for review, 5 captured, 6 voided
  const steps = ['Buyer intent', 'Agent builds cart', 'PayPal authorize', 'AI verifies', n === 6 ? 'Voided' : 'Capture or Void'];
  const cur = { 1: 0, 2: 2, 3: 3, 4: 4, 5: 5, 6: 4 }[n];
  $('#stepper').innerHTML = steps.map((s, i) => {
    const cls = n === 6 && i === 4 ? 'badst' : i < cur ? 'ok' : i === cur ? 'on' : '';
    return `<div class="s ${cls}"><b>${cls === 'ok' ? '&#10003;' : cls === 'badst' ? '&#10005;' : i + 1}</b>${s}</div>`;
  }).join('');
}
