/* shared UI behaviour: mobile nav, scroll reveals, count-ups, footer year, active link */
(function () {
  // mobile nav
  const burger = document.querySelector('.hamburger');
  const links = document.querySelector('.nav-links');
  if (burger && links) burger.addEventListener('click', () => links.classList.toggle('open'));

  // footer year
  document.querySelectorAll('[data-year]').forEach(el => el.textContent = new Date().getFullYear());

  // active nav link by filename
  const page = (location.pathname.split('/').pop() || 'index.html');
  document.querySelectorAll('.nav-links a').forEach(a => {
    if (a.getAttribute('href') === page) a.classList.add('active');
  });

  // ---- scroll reveal that also catches dynamically-added nodes ----
  const io = new IntersectionObserver(entries => {
    entries.forEach(e => e.target.classList.toggle('in', e.isIntersecting));
  }, { threshold: 0.12 });
  const observeAll = (root) => (root.querySelectorAll ? root.querySelectorAll('.reveal:not(.in)') : []).forEach(el => io.observe(el));
  observeAll(document);
  // re-observe anything injected later (e.g. model cards built by charts.js)
  new MutationObserver(muts => muts.forEach(m => m.addedNodes.forEach(n => {
    if (n.nodeType === 1) { if (n.classList && n.classList.contains('reveal')) io.observe(n); observeAll(n); }
  }))).observe(document.body, { childList: true, subtree: true });
  // expose so charts.js can register freshly-built cards immediately
  window.NEROReveal = observeAll;

  // pointer-tracked glow on feature cards
  document.addEventListener('pointermove', e => {
    const card = e.target.closest && e.target.closest('.feature');
    if (!card) return;
    const r = card.getBoundingClientRect();
    card.style.setProperty('--mx', (e.clientX - r.left) + 'px');
    card.style.setProperty('--my', (e.clientY - r.top) + 'px');
  });

  // ---- count-up animation for [data-count] ----
  function countUp(el) {
    const to = parseFloat(el.dataset.count);
    const dp = el.dataset.dp != null ? +el.dataset.dp : 0;
    const pre = el.dataset.pre || '', suf = el.dataset.suf || '';
    const dur = 1400, t0 = performance.now();
    const ease = t => 1 - Math.pow(1 - t, 3);
    function tick(now) {
      const p = Math.min(1, (now - t0) / dur), v = to * ease(p);
      el.textContent = pre + (dp ? v.toFixed(dp) : Math.round(v).toLocaleString()) + suf;
      if (p < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }
  const cio = new IntersectionObserver(es => es.forEach(e => {
    if (e.isIntersecting) { countUp(e.target); cio.unobserve(e.target); }
  }), { threshold: 0.5 });
  document.querySelectorAll('[data-count]').forEach(el => cio.observe(el));

  // animate compare bars when in view
  const bio = new IntersectionObserver(es => es.forEach(e => {
    if (e.isIntersecting) { e.target.querySelectorAll('.bar-fill').forEach(f => f.style.width = f.dataset.w + '%'); bio.unobserve(e.target); }
  }), { threshold: 0.4 });
  document.querySelectorAll('.bars').forEach(el => bio.observe(el));

  // cursor spotlight — ambient glow follows pointer
  const spot = document.createElement('div');
  spot.className = 'cursor-spot';
  document.body.appendChild(spot);
  let _cx = -9999, _cy = -9999;
  document.addEventListener('pointermove', e => { _cx = e.clientX; _cy = e.clientY; });
  (function frame() {
    spot.style.transform = `translate(${_cx}px,${_cy}px)`;
    requestAnimationFrame(frame);
  })();
})();

/* shared formatting helpers (used by charts.js) */
const fmtPct = (v, dp = 1) => (v >= 0 ? '+' : '') + v.toFixed(dp) + '%';
const fmtX = (v) => (v).toLocaleString(undefined, { maximumFractionDigits: 0 });
