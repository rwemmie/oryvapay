import { setTheme } from '/common.js';
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];

$('#themeBtn').addEventListener('click', () => setTheme(document.documentElement.dataset.theme === 'light' ? 'dark' : 'light'));

// marquee: duplicate content for a seamless loop
const mq = $('#mq'); mq.innerHTML += mq.innerHTML;

// hero verdict animation
const stage = $('#heroVisual');
requestAnimationFrame(() => stage.classList.add('play'));
if (!reduce) setInterval(() => { if (document.hidden) return; stage.classList.remove('play'); void stage.offsetWidth; stage.classList.add('play'); }, 12000);

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
  strict: ['BLOCK', '✕', 'Blocked · authorization voided', 'The price rose $5.00 after you approved. Strict mode allows no difference.'],
  flex: ['PASS', '✓', 'Passed · payment captured', 'A $5.00 change is within the $5.00 tolerance you set in Flexible mode.'],
  approval: ['REVIEW', '?', 'Waiting for you', 'The price rose $5.00. Approve to capture, or decline to void.'],
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
  
}

// Watch the demo: embed DEMO_VIDEO_URL (youtube-nocookie) when configured, otherwise a clear "coming soon" state.
fetch('/api/config').then(r => r.json()).then(cfg => {
  const v = cfg.demoVideo; if (!v) return;
  const player = $('#player'), poster = $('#poster'), btn = $('#playBtn');
  player.classList.add('ready');
  poster.classList.add('has-thumb'); poster.style.backgroundImage = `url("${v.thumb}")`;
  $('#pTitle').textContent = 'Watch the OryvaPay demo';
  $('#pSub').textContent = 'A guided walkthrough of a blocked sneaky charge, the fix and the capture.';
  $('#pCta').style.display = 'none'; $('#pLen').textContent = 'Play video';
  btn.removeAttribute('aria-disabled'); btn.setAttribute('role', 'button'); btn.setAttribute('tabindex', '0'); btn.setAttribute('aria-label', 'Play demo video');
  const play = () => { player.innerHTML = `<iframe src="${v.embed}" title="OryvaPay demo video" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen loading="lazy"></iframe>`; };
  btn.addEventListener('click', play);
  btn.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); play(); } });
}).catch(() => {});
