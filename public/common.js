// Shared helpers for every OryvaPay page.
export const $ = (s, el = document) => el.querySelector(s);
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const usd = n => n == null || n === '' ? '' : '$' + Number(n).toFixed(2);
export const when = iso => iso ? new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '';
export const day = iso => iso ? new Date(iso + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }) : 'none';

export const ICON = {
  lock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="11" width="16" height="10" rx="2.5"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>',
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
  target: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/></svg>',
  spark: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l2.2 6.3L20.5 10l-6.3 2.2L12 18.5l-2.2-6.3L3.5 10l6.3-1.7z"/></svg>',
  shield: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="m9 12 2 2 4-4"/></svg>',
  chain: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/></svg>',
  store: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l1.5-5h15L21 9"/><path d="M4 9v11h16V9"/><path d="M3 9a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0"/></svg>',
};

export async function api(method, path, body) {
  const res = await fetch(path, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `Request failed (${res.status})`);
  return json;
}

export const EVENT_LABELS = {
  request_received: 'Buyer request received',
  constraints_approved: 'Purchase rules approved',
  agent_cart_built: 'Shopping agent built a cart',
  paypal_order_created: 'PayPal order created (AUTHORIZE)',
  buyer_approved_authorization: 'Buyer approved in PayPal, funds held',
  verification_result: 'OryvaPay verification',
  authorization_voided: 'Authorization voided, money released',
  agent_cart_rebuilt: 'Agent rebuilt the cart',
  buyer_decision: 'Buyer decision',
  payment_captured: 'Payment captured',
};

export function eventLine(ev) {
  const d = ev.data || {};
  let extra = '';
  if (ev.type === 'verification_result') extra = `: ${d.verdict === 'NEEDS_APPROVAL' ? 'REVIEW' : d.verdict}`;
  if (ev.type === 'buyer_decision') extra = d.approve ? ': approved' : ': rejected';
  if (ev.type === 'payment_captured') extra = `: ${usd(d.amount?.value)}`;
  const cls = ev.type === 'payment_captured' || (ev.type === 'verification_result' && d.verdict === 'PASS') ? 'good'
    : ev.type === 'authorization_voided' || (ev.type === 'verification_result' && d.verdict !== 'PASS') ? 'badev' : '';
  return `<li class="${cls}"><div class="et">${esc((EVENT_LABELS[ev.type] || ev.type) + extra)}</div>
    <div class="ea">#${ev.seq} · ${when(ev.at)}</div><div class="eh">${ev.hash.slice(0, 28)}…</div></li>`;
}

export function brandHTML() {
  return `<img src="/brand/mark-128.png" alt="" width="42" height="34"><span class="wm">Oryva<b>Pay</b></span>`;
}

export function setTheme(t) {
  document.documentElement.dataset.theme = t;
  try { localStorage.setItem('oryva-theme', t); } catch {}
}

export async function header(active) {
  const cfg = await api('GET', '/api/config');
  const el = document.createElement('header');
  el.className = 'top';
  el.innerHTML = `<div class="wrap">
    <a class="brand" href="/" aria-label="OryvaPay home">${brandHTML()}</a>
    <nav class="links"><a href="/app" class="${active === 'verify' ? 'on' : ''}">Verify a purchase</a><a href="/records" class="${active === 'records' ? 'on' : ''}">Intent Records</a></nav>
    <div class="spacer"></div>
    <span class="pill hidesm ${cfg.paypalLive ? 'live' : 'demo'}"><span class="dot"></span>Payments by PayPal (${cfg.paypalLive ? esc(cfg.paypalEnv) : 'demo'})</span>
    <span class="pill hidesm ${cfg.aiLive ? 'live' : 'demo'}"><span class="dot"></span>AI ${cfg.aiLive ? esc(cfg.aiModel) : 'demo'}</span>
    <button class="themebtn" id="themeBtn" title="Switch light or dark mode" aria-label="Switch light or dark mode">
      <svg class="moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>
      <svg class="sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4.5"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>
    </button>
  </div>`;
  document.body.prepend(el);
  $('#themeBtn').addEventListener('click', () => setTheme(document.documentElement.dataset.theme === 'light' ? 'dark' : 'light'));
  return cfg;
}

export function footer() {
  const f = document.createElement('footer');
  f.className = 'ft';
  f.innerHTML = `<div class="wrap"><a class="brand" href="/">${brandHTML()}</a><span>Verify intent before payment · PayPal Orders v2 and Payments v2 · AI verification · MIT license</span></div>`;
  document.body.append(f);
}

export function statusLabel(s) {
  return { CAPTURED: 'Captured', BLOCKED: 'Blocked', AWAITING_APPROVAL: 'Review', OPEN: 'Open', VOIDED: 'Voided', PASS: 'Pass', BLOCK: 'Block', NEEDS_APPROVAL: 'Review' }[s] || s;
}

// "What you asked for" vs "What the merchant charged", built from the constraints and the PayPal order.
export function diffHTML(c, v, cart) {
  const st = id => v.checks.find(x => x.id === id)?.status || 'pass';
  const worst = (...ids) => ids.map(st).includes('fail') ? 'fail' : ids.map(st).includes('warn') ? 'warn' : 'pass';
  const lines = v.order.lines;
  const main = lines.find(l => l.kind === 'product') || lines[0];
  const extras = lines.filter(l => l.kind === 'warranty' || l.kind === 'addon');
  const subs = lines.filter(l => l.recurring || l.kind === 'subscription');
  const attrs = Object.entries(c.product?.attributes || {}).map(([k, val]) => `${k} ${val}`).join(', ');
  const priceNote = lines.filter(l => l.quotedUnitPrice != null && Math.abs(l.unitPrice - l.quotedUnitPrice) > 0.001).map(l => ` (quoted ${usd(l.quotedUnitPrice)})`).join('');
  const rows = [
    ['Product', `${esc(c.product?.category || 'any')}${attrs ? ` · ${esc(attrs)}` : ''}`, esc(main?.name || ''), worst('product_match', 'attributes')],
    ['Quantity', c.quantity, main?.quantity, st('quantity')],
    ['Add-ons', c.extrasAllowed ? 'Allowed' : 'None', extras.length ? extras.map(l => `${esc(l.name)} ${usd(l.unitPrice)}`).join(', ') : 'None', st('addons')],
    ['Subscriptions', c.recurringAllowed ? 'Allowed' : 'None', subs.length ? subs.map(l => `${esc(l.name)} ${usd(l.unitPrice)}/mo`).join(', ') : 'None', st('recurring')],
    ['Fees', c.serviceFeesAllowed ? 'Allowed' : 'None', v.order.handling > 0 ? `Service fee ${usd(v.order.handling)}` : 'None', st('service_fees')],
    ['Unit price', main?.quotedUnitPrice != null ? `${usd(main.quotedUnitPrice)} as quoted` : 'as quoted', `${usd(main?.unitPrice)}${priceNote}`, st('price_change')],
    ['Merchant', esc(c.allowedMerchants?.join(', ') || 'Any verified store'), esc(v.order.merchant?.name || cart?.merchant?.name || ''), st('merchant')],
    ['Delivery', c.deliveryDeadline ? `By ${day(c.deliveryDeadline)}` : 'Any time', v.order.delivery ? `${esc(v.order.delivery.method)} · ${day(v.order.delivery.eta)}` : '', st('delivery')],
    ['Total', c.maxBudget != null ? `Up to ${usd(c.maxBudget)}` : 'No limit', usd(v.order.total), st('budget')],
  ];
  const mk = s => s === 'fail' ? '<span class="mk bad">MISMATCH</span>' : s === 'warn' ? '<span class="mk warn">TOLERATED</span>' : '<span class="mk ok">MATCH</span>';
  return `<div class="diff"><div class="dh"><div></div><div class="a">What you asked for</div><div>What the merchant charged</div></div>
    ${rows.map(([f, a, b, s], i) => `<div class="dr ${s === 'fail' ? 'bad' : s === 'warn' ? 'warn' : ''}" style="animation-delay:${i * 40}ms"><div class="f">${f}</div><div>${a}</div><div class="ch"><span>${b}</span>${mk(s)}</div></div>`).join('')}</div>`;
}

// Order lines with product photo and a link to the product page on the StrideLab demo store.
export function thumbHTML(it, size = 44) {
  return it.image ? `<img class="thumb" src="${esc(it.image)}" alt="" width="${size}" height="${size}" loading="lazy">` : `<span class="thumb ph" style="width:${size}px;height:${size}px"></span>`;
}
export function viewLink(it) {
  return it.url ? `<a class="viewp" href="${esc(it.url)}" target="_blank" rel="noopener">View product</a>` : '';
}
export function linesHTML(items, flagged = []) {
  return `<div class="olines">${items.map(it => {
    const price = it.chargedUnitPrice ?? it.unitPrice;
    const bad = flagged.includes(it.sku);
    return `<div class="oline ${bad ? 'bad' : ''}">${thumbHTML(it)}<div class="ot"><b>${esc(it.name)}</b><span>SKU ${esc(it.sku)} · qty ${it.quantity}${bad ? ' · <em>flagged</em>' : ''}</span>${viewLink(it)}</div><div class="op">${usd(price * it.quantity)}</div></div>`;
  }).join('')}</div>`;
}
export function chargedLinesHTML(v, cart) {
  const bySku = Object.fromEntries((cart?.items || []).map(i => [i.sku, i]));
  const items = v.order.lines.map(l => ({ ...l, url: l.url || bySku[l.sku]?.url, image: l.image || bySku[l.sku]?.image, chargedUnitPrice: l.unitPrice }));
  return `<div class="olh">What PayPal is holding, line by line</div>${linesHTML(items, v.offendingSkus || [])}`;
}
