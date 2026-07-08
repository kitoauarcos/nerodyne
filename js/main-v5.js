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
  // one-shot: reveal once and stop observing, so content never re-fades on scroll
  const io = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
    });
  }, { threshold: 0.12 });
  const observeAll = (root) => (root.querySelectorAll ? root.querySelectorAll('.reveal:not(.in)') : []).forEach(el => io.observe(el));
  observeAll(document);
  // re-observe anything injected later (e.g. model cards built by charts.js)
  new MutationObserver(muts => muts.forEach(m => m.addedNodes.forEach(n => {
    if (n.nodeType === 1) { if (n.classList && n.classList.contains('reveal')) io.observe(n); observeAll(n); }
  }))).observe(document.body, { childList: true, subtree: true });
  // expose so charts.js can register freshly-built cards immediately
  window.NEROReveal = observeAll;

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

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // scroll progress hairline
  const prog = document.createElement('div');
  prog.className = 'scroll-progress';
  document.body.appendChild(prog);
  const setProg = () => {
    const h = document.documentElement;
    const max = h.scrollHeight - h.clientHeight;
    prog.style.width = max > 0 ? (h.scrollTop / max * 100) + '%' : '0';
  };
  document.addEventListener('scroll', setProg, { passive: true });
  setProg();

  // pointer-lit panel borders (position vars consumed by .panel::after)
  if (!reduceMotion) document.addEventListener('pointermove', e => {
    const panel = e.target.closest && e.target.closest('.panel');
    if (!panel) return;
    const r = panel.getBoundingClientRect();
    panel.style.setProperty('--mx', (e.clientX - r.left) + 'px');
    panel.style.setProperty('--my', (e.clientY - r.top) + 'px');
  }, { passive: true });

  // pointer tilt on model cards + magnetic primary buttons (fine pointers only)
  if (!reduceMotion && matchMedia('(pointer:fine)').matches) {
    document.addEventListener('pointermove', e => {
      const card = e.target.closest && e.target.closest('.model-card');
      if (card) {
        const r = card.getBoundingClientRect();
        const rx = ((e.clientY - r.top) / r.height - .5) * -4;
        const ry = ((e.clientX - r.left) / r.width - .5) * 5;
        card.style.transform = `perspective(900px) rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg)`;
      }
      const btn = e.target.closest && e.target.closest('.btn-primary');
      if (btn) {
        const r = btn.getBoundingClientRect();
        btn.style.transform = `translate(${(((e.clientX - r.left) / r.width) - .5) * 6}px, ${(((e.clientY - r.top) / r.height) - .5) * 4}px)`;
      }
    }, { passive: true });
    document.addEventListener('pointerout', e => {
      const card = e.target.closest && e.target.closest('.model-card');
      if (card && !card.contains(e.relatedTarget)) card.style.transform = '';
      const btn = e.target.closest && e.target.closest('.btn-primary');
      if (btn && !btn.contains(e.relatedTarget)) btn.style.transform = '';
    }, true);
  }

  // z-axis fly-through: scroll dollies the camera through the homepage scenes
  const track = document.getElementById('zoomTrack');
  const scenes = track ? Array.from(track.querySelectorAll('.scene')) : [];
  if (track && scenes.length > 1 && !reduceMotion && window.innerWidth > 920) {
    document.documentElement.classList.add('zoom-on');
    track.style.height = (scenes.length * 130) + 'vh';

    // progress dots
    const dots = document.createElement('div');
    dots.className = 'scene-dots';
    dots.innerHTML = scenes.map(() => '<span></span>').join('');
    document.body.appendChild(dots);
    const dotEls = Array.from(dots.children);

    const SP = 1500;   // z distance between scenes, px
    let ticking = false;
    const update = () => {
      ticking = false;
      const vh = window.innerHeight;
      const top = track.offsetTop;
      const span = (track.offsetHeight - vh) / (scenes.length - 1);
      const p = Math.max(0, Math.min(scenes.length - 1, (window.scrollY - top) / span));
      scenes.forEach((sc, i) => {
        const d = i - p;                    // >0 still ahead (deep), <0 already passed
        const z = -d * SP;
        let op;
        if (d >= 0) op = 1 - Math.min(1, Math.max(0, (d - .1) / .8));
        else op = 1 - Math.min(1, -d * 2.6);
        sc.style.transform = 'translateZ(' + z.toFixed(1) + 'px)';
        sc.style.opacity = op.toFixed(3);
        sc.style.visibility = op <= 0.02 ? 'hidden' : 'visible';
        sc.style.pointerEvents = Math.abs(d) < .45 ? 'auto' : 'none';
      });
      const active = Math.round(p);
      dotEls.forEach((el, i) => el.classList.toggle('on', i === active));
      // hide the dots once the fly-through is behind us
      const r = track.getBoundingClientRect();
      dots.classList.toggle('gone', r.bottom < vh * .6);
    };
    document.addEventListener('scroll', () => {
      if (!ticking) { ticking = true; requestAnimationFrame(update); }
    }, { passive: true });
    window.addEventListener('resize', update);
    update();
    // clicking a dot flies to that scene
    dotEls.forEach((el, i) => {
      el.style.cursor = 'pointer'; el.style.pointerEvents = 'auto';
      el.addEventListener('click', () => {
        const span = (track.offsetHeight - window.innerHeight) / (scenes.length - 1);
        window.scrollTo({ top: track.offsetTop + span * i, behavior: 'smooth' });
      });
    });
  }

  // hero constellation — a sparse, slowly drifting signal field
  const fx = document.getElementById('heroFx');
  if (fx && !reduceMotion && window.innerWidth > 720) {
    const ctx = fx.getContext('2d');
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let W, H, pts;
    const N = 42, LINK = 150;
    function resize() {
      const r = fx.parentElement.getBoundingClientRect();
      W = r.width; H = r.height;
      fx.width = W * dpr; fx.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    function seed() {
      pts = Array.from({ length: N }, () => ({
        x: Math.random() * W, y: Math.random() * H,
        vx: (Math.random() - .5) * .18, vy: (Math.random() - .5) * .18,
        r: Math.random() * 1.4 + .5
      }));
    }
    resize(); seed();
    window.addEventListener('resize', () => { resize(); seed(); });
    let running = true;
    document.addEventListener('visibilitychange', () => { running = !document.hidden; });
    (function frame() {
      requestAnimationFrame(frame);
      if (!running) return;
      ctx.clearRect(0, 0, W, H);
      for (const p of pts) {
        p.x += p.vx; p.y += p.vy;
        if (p.x < -20) p.x = W + 20; if (p.x > W + 20) p.x = -20;
        if (p.y < -20) p.y = H + 20; if (p.y > H + 20) p.y = -20;
      }
      for (let i = 0; i < N; i++) {
        for (let j = i + 1; j < N; j++) {
          const a = pts[i], b = pts[j];
          const dx = a.x - b.x, dy = a.y - b.y;
          const d2 = dx * dx + dy * dy;
          if (d2 < LINK * LINK) {
            const t = 1 - Math.sqrt(d2) / LINK;
            ctx.strokeStyle = `rgba(122,165,236,${(t * .16).toFixed(3)})`;
            ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
          }
        }
      }
      for (const p of pts) {
        ctx.fillStyle = 'rgba(140,175,235,.5)';
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.2832); ctx.fill();
      }
    })();
  }
})();

/* shared formatting helpers (used by charts.js) */
const fmtPct = (v, dp = 1) => (v >= 0 ? '+' : '') + v.toFixed(dp) + '%';
const fmtX = (v) => (v).toLocaleString(undefined, { maximumFractionDigits: 0 });
