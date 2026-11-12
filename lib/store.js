import { MERCHANTS, CATALOG, EXTRAS, productUrl } from './catalog.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const usd = n => '$' + Number(n).toFixed(2);

// A product page for the StrideLab demo store. Shares the OryvaPay theme, header and footer.
export function storePage(p) {
  const m = MERCHANTS[p.merchant] || { name: p.merchant };
  const isExtra = p.kind === 'warranty' || p.kind === 'subscription';
  const price = p.price ?? p.unitPrice;
  const attrs = p.attributes ? Object.entries(p.attributes).map(([k, v]) => `<div class="pa"><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join('') : '';
  const more = [...CATALOG, ...Object.values(EXTRAS)].filter(x => x.merchant === p.merchant && x.slug !== p.slug && x.slug).slice(0, 4);
  return `<!doctype html><html lang="en" data-theme="dark"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<script>(function(){var t;try{t=localStorage.getItem('oryva-theme')}catch(e){}if(t!=='light'&&t!=='dark'){t=window.matchMedia&&matchMedia('(prefers-color-scheme: light)').matches?'light':'dark'}document.documentElement.setAttribute('data-theme',t)})();</script>
<link rel="icon" href="/favicon.png" type="image/png">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;650;700;800&family=Inter+Tight:wght@600;700;800&family=Poppins:wght@600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/styles.css">
<title>${esc(p.name)} · ${esc(m.name)} demo store</title>
<meta property="og:image" content="${esc(p.image)}">
<style>
.store{display:grid;grid-template-columns:1fr 1fr;gap:40px;padding:32px 0 72px;align-items:start}
@media(max-width:860px){.store{grid-template-columns:1fr;gap:24px}}
.ph{border-radius:20px;overflow:hidden;background:#ece9e4;border:1px solid var(--line)}.ph img{width:100%;display:block;aspect-ratio:1/1;object-fit:cover}
.crumb{font-size:13px;color:var(--muted);margin-bottom:12px}.crumb a{color:var(--muted)}
.store h1{font-family:"Inter Tight",Inter,sans-serif;font-size:44px;line-height:1.04;letter-spacing:-.035em;margin:8px 0 12px;font-weight:800}
.pr{font-size:32px;font-weight:750;letter-spacing:-.03em;font-variant-numeric:tabular-nums;margin:8px 0 16px}
.pr small{font-size:15px;color:var(--muted);font-weight:500}
.ds{color:var(--ink2);font-size:16.5px;line-height:1.6;margin:0 0 20px}
.pas{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:8px;margin-bottom:20px}
.pa{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:10px 12px}.pa span{display:block;font-size:12px;color:var(--muted);text-transform:capitalize}.pa b{text-transform:capitalize}
.sku{font-family:"JetBrains Mono",monospace;font-size:12.5px;color:var(--muted)}
.note{border-radius:14px;padding:14px 16px;font-size:14px;line-height:1.5;margin:16px 0;border:1px solid var(--line);background:var(--surface)}
.note.warn{background:var(--bad-bg);border-color:var(--bad-line)}
.more{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-top:8px}@media(max-width:700px){.more{grid-template-columns:1fr 1fr}}
.mi{background:var(--surface);border:1px solid var(--line);border-radius:14px;overflow:hidden;color:var(--ink);transition:transform .2s}.mi:hover{transform:translateY(-3px)}
.mi img{width:100%;aspect-ratio:1/1;object-fit:cover;display:block;background:#ece9e4}.mi div{padding:10px 12px;font-size:13px}.mi b{display:block}
</style></head><body>
<main class="wrap">
  <div class="store">
    <div class="ph"><img src="${esc(p.image)}" alt="${esc(p.name)}"></div>
    <div>
      <div class="crumb"><a href="/">OryvaPay</a> · ${esc(m.name)} demo store</div>
      <span class="pill ${m.verified ? 'live' : 'demo'}"><span class="dot"></span>${esc(m.name)}${m.verified ? ' · verified merchant' : ''}</span>
      <h1>${esc(p.name)}</h1>
      <div class="pr">${usd(price)}${p.recurring ? ' <small>per month</small>' : ''}</div>
      <p class="ds">${esc(p.blurb || p.description || '')}</p>
      ${attrs ? `<div class="pas">${attrs}</div>` : ''}
      <div class="sku">SKU ${esc(p.sku)}</div>
      ${isExtra ? `<div class="note warn"><b>Optional extra.</b> This item is often added at checkout. OryvaPay blocks it unless the buyer asked for it.</div>` : ''}
      <div class="note">This is a demo product in the StrideLab sandbox store used by the OryvaPay demo. Orders are paid with PayPal sandbox money only.</div>
      <a class="btn primary" href="/app">Try the live demo</a>
    </div>
  </div>
  ${more.length ? `<h2 style="font-size:20px;margin:0 0 4px">More from ${esc(m.name)}</h2><div class="more">${more.map(x => `<a class="mi" href="${productUrl(x)}"><img src="${esc(x.image)}" alt="" loading="lazy"><div><b>${esc(x.name)}</b>${usd(x.price ?? x.unitPrice)}</div></a>`).join('')}</div>` : ''}
  <div style="height:56px"></div>
</main>
<script type="module">import { header, footer } from '/common.js'; header(''); footer();</script>
</body></html>`;
}
