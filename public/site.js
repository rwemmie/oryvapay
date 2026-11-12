import { setTheme } from '/common.js';
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];

$('#themeBtn').addEventListener('click', () => setTheme(document.documentElement.dataset.theme === 'light' ? 'dark' : 'light'));

// marquee: duplicate content for a seamless loop
const mq = $('#mq'); mq.innerHTML += mq.innerHTML;

// hero verdict animation
requestAnimationFrame(() => $('#heroVisual').classList.add('play'));

// scroll reveals
const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { const t = e.target; t.classList.add('in'); io.unobserve(t); setTimeout(() => t.classList.remove('rv', 'in'), 900 + (+getComputedStyle(t).getPropertyValue('--i') || 0) * 90); } }), { threshold: 0.14, rootMargin: '0px 0px -40px 0px' });
$$('.rv').forEach(el => reduce ? el.classList.add('in') : io.observe(el));

// sequential light up (flow steps and hash chain)
function sequence(container, items, cls = 'lit', gap = 420) {
  const ob = new IntersectionObserver(es => es.forEach(e => {
    if (!e.isIntersecting) return; ob.disconnect();
    items.forEach((el, i) => setTimeout(() => el.classList.add(cls), reduce ? 0 : 200 + i * gap));
  }), { threshold: 0.35 });
  ob.observe(container);
}
sequence($('#flow'), $$('#flow .fs'));
sequence($('#chain'), $$('#chain .blk'), 'lit', 320);
$$('#flow .fs').forEach((el, i) => { el.classList.add('rv'); el.style.setProperty('--i', i); io.observe(el); });

// counters
$$('[data-count]').forEach(el => {
  const to = +el.dataset.count, pre = el.dataset.prefix || '';
  const ob = new IntersectionObserver(es => { if (!es[0].isIntersecting) return; ob.disconnect();
    if (reduce || !to) { el.textContent = pre + to; return; }
    const t0 = performance.now(), d = 1100;
    const tick = t => { const p = Math.min(1, (t - t0) / d); el.textContent = pre + Math.round(to * (1 - Math.pow(1 - p, 3))); if (p < 1) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  }, { threshold: 0.5 }); ob.observe(el);
});

// modes tabs
const MODES = {
  strict: ['BLOCK', '✕', 'Blocked · authorization voided', 'Price is $4.00 over your $350 budget. Strict mode allows no difference.'],
  flex: ['PASS', '✓', 'Passed · payment captured', '$4.00 over budget is within the small difference Flexible mode tolerates.'],
  approval: ['REVIEW', '?', 'Waiting for you', 'The price moved $4.00 above budget. Approve to capture, or decline to void.'],
};
function showMode(m) {
  $$('#mtabs .mtab').forEach(b => b.classList.toggle('on', b.dataset.m === m));
  const [s, ic, t, d] = MODES[m];
  $('#mres').innerHTML = `<div class="res ${s}"><span class="ic">${ic}</span><div><b>${t}</b><span>${d}</span></div></div>`;
}
$$('#mtabs .mtab').forEach(b => b.addEventListener('click', () => showMode(b.dataset.m)));
showMode('strict');

if (!reduce && matchMedia('(pointer:fine)').matches) {
  // magnetic buttons
  $$('.magnet').forEach(b => {
    b.addEventListener('pointermove', e => { const r = b.getBoundingClientRect(); const x = e.clientX - r.left - r.width / 2, y = e.clientY - r.top - r.height / 2; b.style.transform = `translate(${x * 0.18}px, ${y * 0.28}px)`; });
    b.addEventListener('pointerleave', () => { b.style.transform = ''; });
  });
  // subtle parallax on hero photo
  const img = $('#parallax'); let ticking = false;
  addEventListener('scroll', () => { if (ticking) return; ticking = true; requestAnimationFrame(() => { const y = Math.min(scrollY, 800); img.style.transform = `scale(1.06) translateY(${y * 0.06}px)`; ticking = false; }); }, { passive: true });
}
