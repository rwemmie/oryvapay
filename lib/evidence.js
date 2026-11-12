// Dispute Evidence Pack: a clean, printable, self contained HTML page for one Intent Record.
// A buyer or merchant can print it to PDF and attach it to a PayPal dispute.
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const usd = n => (n == null || Number.isNaN(Number(n))) ? '' : '$' + Number(n).toFixed(2);
const ts = iso => iso ? new Date(iso).toISOString().replace('T', ' ').slice(0, 19) + ' UTC' : '';
const LABEL = {
  request_received: 'Buyer request received', constraints_approved: 'Purchase constraints approved', agent_cart_built: 'Shopping agent built a cart',
  paypal_order_created: 'PayPal order created (intent AUTHORIZE)', buyer_approved_authorization: 'Buyer approved in PayPal, funds authorized',
  verification_result: 'OryvaPay verification', authorization_voided: 'Authorization voided', agent_cart_rebuilt: 'Agent rebuilt the cart',
  buyer_decision: 'Buyer decision', payment_captured: 'Payment captured',
};

export function renderEvidencePack(r) {
  const c = r.constraints;
  const attrs = Object.entries(c.product?.attributes || {}).map(([k, v]) => `${k}: ${v}`).join(', ');
  const final = r.attempts.at(-1);
  const summary = r.status === 'CAPTURED'
    ? `Payment of ${usd(final?.finalEvent?.amount?.value)} was captured only after the charged order matched the buyer's stated intent.`
    : r.status === 'BLOCKED' ? 'The authorization was voided because the charged order did not match the buyer\'s stated intent. No money was captured.'
      : 'A decision is still pending.';
  const blocked = r.attempts.filter(a => a.status === 'VOIDED');
  const kv = rows => `<table class="kv">${rows.map(([k, v]) => `<tr><th>${k}</th><td>${v}</td></tr>`).join('')}</table>`;

  const attempts = r.attempts.map(a => {
    const v = a.verification;
    const lines = v ? v.order.lines : a.cart.items.map(i => ({ ...i, unitPrice: i.chargedUnitPrice ?? i.unitPrice }));
    return `<section class="att">
      <h3>Attempt ${a.n}: ${esc(v ? v.verdict.replace('_', ' ') : a.status)}${a.finalEvent ? ` . ${esc(a.finalEvent.type)}` : ''}</h3>
      ${kv([
        ['Merchant', esc(a.cart.merchant.name)],
        ['Shipping', `${esc(a.cart.shipping.method)}, estimated ${esc(a.cart.shipping.eta)}`],
        ['PayPal order ID', `<code>${esc(a.orderId || 'none')}</code>`],
        ['PayPal authorization ID', `<code>${esc(a.authorizationId || 'none')}</code>`],
        ['PayPal capture ID', `<code>${esc(a.captureId || 'none')}</code>`],
        ['Final payment event', a.finalEvent ? `${esc(a.finalEvent.type)} at ${ts(a.finalEvent.at)}` : 'pending'],
      ])}
      <table class="lines"><thead><tr><th>SKU</th><th>Item charged</th><th>Qty</th><th>Quoted</th><th>Charged</th><th>Flag</th></tr></thead><tbody>
      ${lines.map(l => `<tr class="${v?.offendingSkus.includes(l.sku) ? 'bad' : ''}"><td><code>${esc(l.sku)}</code></td><td>${esc(l.name)}</td><td>${l.quantity}</td><td>${usd(l.quotedUnitPrice)}</td><td>${usd(l.unitPrice)}</td><td>${v?.offendingSkus.includes(l.sku) ? 'Not authorized by buyer' : ''}</td></tr>`).join('')}
      </tbody></table>
      ${v ? `<p class="why"><b>Verification (${esc(v.mode)} mode, reviewed by ${esc(v.reviewedBy)} at ${ts(v.verifiedAt)}):</b> ${esc(v.explanation)}</p>
      <table class="lines"><thead><tr><th>Check</th><th>Result</th><th>Finding</th></tr></thead><tbody>
      ${v.checks.map(ch => `<tr class="${ch.status === 'fail' ? 'bad' : ''}"><td>${esc(ch.label)}${ch.group === 'sneaky' ? ' *' : ''}</td><td>${esc(ch.status.toUpperCase())}</td><td>${esc(ch.detail)}</td></tr>`).join('')}
      </tbody></table>` : ''}
    </section>`;
  }).join('');

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><link rel="icon" href="/favicon.svg"><title>Dispute Evidence Pack ${esc(r.id)}</title>
<style>
  body{font-family:Inter,system-ui,Segoe UI,Arial,sans-serif;color:#111827;max-width:900px;margin:32px auto;padding:0 28px;font-size:13px;line-height:1.5}
  h1{font-size:24px;margin:0} h2{font-size:15px;margin:26px 0 8px;padding-bottom:4px;border-bottom:2px solid #111827} h3{font-size:14px;margin:18px 0 6px}
  .top{display:flex;justify-content:space-between;align-items:flex-start;gap:20px;border-bottom:1px solid #e5e7eb;padding-bottom:14px}
  .brand{font-weight:800;color:#3b4cff} .muted{color:#6b7280}
  .status{display:inline-block;padding:3px 10px;border-radius:999px;font-weight:700;font-size:12px;background:#eef1f7}
  .CAPTURED{background:#e7f7ef;color:#0f7a4d} .BLOCKED{background:#fdecec;color:#b42318}
  .summary{background:#f8fafc;border:1px solid #e5e7eb;border-radius:10px;padding:12px 14px;margin-top:14px;font-size:14px}
  table{border-collapse:collapse;width:100%;margin:6px 0} th,td{text-align:left;padding:5px 8px;border-bottom:1px solid #eef0f4;vertical-align:top}
  table.kv th{width:210px;color:#6b7280;font-weight:600} table.lines thead th{background:#f3f4f6;font-size:11.5px;text-transform:uppercase;letter-spacing:.04em}
  tr.bad td{background:#fff1f1} code{font-family:ui-monospace,Menlo,monospace;font-size:11.5px;word-break:break-all}
  .why{background:#fafafa;border-left:3px solid #3b4cff;padding:8px 12px}
  .att{page-break-inside:avoid} .chain td{font-family:ui-monospace,Menlo,monospace;font-size:10.5px}
  .bar{position:sticky;top:0;background:#fff;padding:10px 0;display:flex;gap:10px;justify-content:flex-end}
  .bar button,.bar a{font:inherit;font-weight:700;border:0;border-radius:9px;padding:9px 14px;background:#111827;color:#fff;cursor:pointer;text-decoration:none}
  .bar a{background:#eef1f7;color:#111827}
  @media print{.bar{display:none} body{margin:0}}
</style></head><body>
<div class="bar"><a href="/record/${esc(r.id)}">Back to record</a><a href="/api/records/${esc(r.id)}/download">Download JSON</a><button onclick="window.print()">Print or save as PDF</button></div>
<div class="top"><div><div class="brand">OryvaPay</div><h1>Dispute Evidence Pack</h1><div class="muted">Intent Record <code>${esc(r.id)}</code> . generated ${ts(new Date().toISOString())}</div></div>
<div style="text-align:right"><span class="status ${esc(r.status)}">${esc(r.status.replace('_', ' '))}</span><div class="muted" style="margin-top:6px">Hash chain: <b>${r.chain.valid ? 'VERIFIED' : 'BROKEN'}</b><br>${r.events.length} events</div></div></div>
<div class="summary"><b>Summary.</b> ${esc(summary)}${blocked.length ? ` ${blocked.length} earlier attempt${blocked.length > 1 ? 's were' : ' was'} voided before any capture.` : ''}</div>

<h2>1. What the buyer asked for</h2>
<p style="font-size:14px">"${esc(r.request)}"</p>
<h2>2. What the agent was allowed to do (approved constraints)</h2>
${kv([
  ['Product', `${esc(c.product?.category || 'any')}${attrs ? ` (${esc(attrs)})` : ''}`], ['Quantity', c.quantity], ['Maximum total', c.maxBudget != null ? usd(c.maxBudget) : 'no limit'],
  ['Allowed merchants', esc(c.allowedMerchants?.join(', ') || 'any verified store')], ['Delivery deadline', esc(c.deliveryDeadline || 'none')],
  ['Subscriptions', c.recurringAllowed ? 'allowed' : 'not allowed'], ['Add-ons and warranties', c.extrasAllowed ? 'allowed' : 'not allowed'], ['Service fees', c.serviceFeesAllowed ? 'allowed' : 'not allowed'],
  ['Verification mode', esc(r.mode) + (r.mode === 'flexible' ? `, tolerance ${usd(r.tolerance)}` : '')],
])}
<h2>3. What the merchant charged and 4. why it was allowed or blocked</h2>
<p class="muted">Order lines are read back from the PayPal Orders API after buyer approval. Checks marked * are sneaky charge checks.</p>
${attempts}

<h2>5. Timeline and tamper evidence</h2>
<p class="muted">Each hash = SHA-256(previous hash + canonical JSON of {seq, type, at, data}). Recomputing the chain from the attached JSON proves no event was altered after the fact.</p>
<table class="lines chain"><thead><tr><th>#</th><th>Time (UTC)</th><th>Event</th><th>Hash</th></tr></thead><tbody>
${r.events.map(e => `<tr><td>${e.seq}</td><td>${ts(e.at)}</td><td style="font-family:inherit;font-size:12px">${esc(LABEL[e.type] || e.type)}${e.data?.verdict ? `: ${esc(e.data.verdict)}` : ''}</td><td>${esc(e.hash)}</td></tr>`).join('')}
</tbody></table>
<p class="muted">Head hash: <code>${esc(r.chain.headHash || '')}</code></p>
<p class="muted" style="margin-top:24px">Prepared by OryvaPay, an independent intent verification layer. This pack documents what the buyer authorized and what was charged. It is supporting evidence, not a ruling on any dispute.</p>
</body></html>`;
}
