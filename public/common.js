// Shared helpers for every OryvaPay page.
export const $ = (s, el = document) => el.querySelector(s);
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const usd = n => n == null ? '' : '$' + Number(n).toFixed(2);
export const when = iso => iso ? new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '';
export const day = iso => iso ? new Date(iso + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }) : 'none';

export async function api(method, path, body) {
  const res = await fetch(path, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `Request failed (${res.status})`);
  return json;
}

export const EVENT_LABELS = {
  request_received: 'Buyer request received',
  constraints_approved: 'Purchase constraints approved',
  agent_cart_built: 'Shopping agent built a cart',
  paypal_order_created: 'PayPal order created (AUTHORIZE)',
  buyer_approved_authorization: 'Buyer approved in PayPal, funds authorized',
  verification_result: 'OryvaPay verification',
  authorization_voided: 'Authorization voided, money released',
  agent_cart_rebuilt: 'Agent rebuilt the cart',
  buyer_decision: 'Buyer decision',
  payment_captured: 'Payment captured',
};

export function eventLine(ev) {
  const d = ev.data || {};
  let extra = '';
  if (ev.type === 'verification_result') extra = ` : ${d.verdict}`;
  if (ev.type === 'buyer_decision') extra = d.approve ? ' : approved' : ' : rejected';
  if (ev.type === 'payment_captured') extra = ` : ${usd(d.amount?.value)}`;
  const cls = ev.type === 'payment_captured' || (ev.type === 'verification_result' && d.verdict === 'PASS') ? 'good'
    : ev.type === 'authorization_voided' || (ev.type === 'verification_result' && d.verdict !== 'PASS') ? 'badev' : '';
  return `<li class="${cls}"><div class="et">${esc((EVENT_LABELS[ev.type] || ev.type) + extra)}</div>
    <div class="ea">#${ev.seq} . ${when(ev.at)}</div><div class="eh">${ev.hash.slice(0, 32)}...</div></li>`;
}

export async function header(active) {
  const cfg = await api('GET', '/api/config');
  const el = document.createElement('header');
  el.className = 'top';
  el.innerHTML = `<div class="wrap">
    <a class="logo" href="/"><span class="mark"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg></span>OryvaPay</a>
    <nav class="links"><a href="/" class="${active === 'verify' ? 'on' : ''}">Verify a purchase</a><a href="/records" class="${active === 'records' ? 'on' : ''}">Intent Records</a></nav>
    <div class="spacer"></div>
    <span class="pill ${cfg.paypalLive ? 'live' : 'demo'}"><span class="dot"></span>PayPal ${cfg.paypalLive ? cfg.paypalEnv : 'demo mode'}</span>
    <span class="pill ${cfg.aiLive ? 'live' : 'demo'}"><span class="dot"></span>AI ${cfg.aiLive ? esc(cfg.aiModel) : 'demo mode'}</span>
  </div>`;
  document.body.prepend(el);
  return cfg;
}

export function footer() {
  const f = document.createElement('footer');
  f.className = 'ft';
  f.innerHTML = `<div class="wrap">OryvaPay verifies intent before payment. Built with PayPal Orders v2 and Payments v2 (authorize, capture, void) and an AI verification agent. Open source under the MIT license.</div>`;
  document.body.append(f);
}
