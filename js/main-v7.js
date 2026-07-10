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

  // scene crossfade: scrolling through the pinned stage gently fades and
  // scales between the chapters (subtle, works on phones too).
  // The rendered position lerps toward the scroll target for an inertial glide.
  const track = document.getElementById('zoomTrack');
  const scenes = track ? Array.from(track.querySelectorAll('.scene')) : [];
  if (track && scenes.length > 1 && !reduceMotion) {
    document.documentElement.classList.add('zoom-on');
    track.style.height = (scenes.length * 140) + 'vh';

    const dots = document.createElement('div');
    dots.className = 'scene-dots';
    dots.innerHTML = scenes.map(() => '<span></span>').join('');
    document.body.appendChild(dots);
    const dotEls = Array.from(dots.children);

    let target = 0, shown = -1, raf = null;

    const render = (p) => {
      const vh = window.innerHeight;
      scenes.forEach((sc, i) => {
        const d = i - p;
        let op;
        if (d >= 0) op = 1 - Math.min(1, Math.max(0, (d - .12) / .75));
        else op = 1 - Math.min(1, -d * 1.7);
        // scenes ahead sit slightly smaller and settle to full size; passed
        // scenes drift a touch larger — a quiet zoom, not a camera dolly
        const sca = 1 - Math.max(-1, Math.min(1, d)) * .05;
        sc.style.transform = 'scale(' + sca.toFixed(4) + ')';
        sc.style.opacity = op.toFixed(3);
        sc.style.visibility = op <= 0.02 ? 'hidden' : 'visible';
        sc.style.pointerEvents = Math.abs(d) < .45 ? 'auto' : 'none';
      });
      const active = Math.round(p);
      dotEls.forEach((el, i) => el.classList.toggle('on', i === active));
      // the dots only belong to the pinned stage — hide them before and after it
      const r = track.getBoundingClientRect();
      dots.classList.toggle('gone', r.bottom < vh * .6 || r.top > vh * .4);
    };

    const targetP = () => {
      const vh = window.innerHeight;
      const span = (track.offsetHeight - vh) / (scenes.length - 1);
      return Math.max(0, Math.min(scenes.length - 1, (window.scrollY - track.offsetTop) / span));
    };
    const loop = () => {
      shown += (target - shown) * 0.14;
      if (Math.abs(target - shown) < 0.0015) shown = target;
      render(shown);
      raf = (shown !== target) ? requestAnimationFrame(loop) : null;
    };
    const kick = () => {
      target = targetP();
      if (raf === null) raf = requestAnimationFrame(loop);
    };
    document.addEventListener('scroll', kick, { passive: true });
    window.addEventListener('resize', kick);
    shown = targetP(); target = shown; render(shown);

    dotEls.forEach((el, i) => {
      el.style.cursor = 'pointer'; el.style.pointerEvents = 'auto';
      el.addEventListener('click', () => {
        const span = (track.offsetHeight - window.innerHeight) / (scenes.length - 1);
        window.scrollTo({ top: track.offsetTop + span * i, behavior: 'smooth' });
      });
    });
  }

  // constellation — a sparse, slowly drifting signal field behind every page
  const fx = document.createElement('canvas');
  fx.className = 'bg-fx';
  if (!reduceMotion && window.innerWidth > 720) {
    document.body.appendChild(fx);
    const ctx = fx.getContext('2d');
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let W, H, pts;
    const N = 48, LINK = 150;
    function resize() {
      W = window.innerWidth; H = window.innerHeight;
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


/* ===========================================================================
   EDITORIAL LAYER — intro veil, pill-header overlay menu, scroll-lit
   statements, pause-animations toggle (Optiver-inspired structure)
   =========================================================================== */
(function () {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---- intro veil: homepage only, once per session, skippable ---- */
  if (document.getElementById('zoomTrack') && !reduceMotion && !sessionStorage.getItem('neroIntroDone')) {
    const veil = document.createElement('div');
    veil.className = 'intro-veil';
    const letters = 'NERODYNE'.split('').map((c, i) =>
      '<span' + ((i === 0 || i === 4) ? ' class="b"' : '') +
      ' style="animation-delay:' + (0.5 + i * 0.07).toFixed(2) + 's">' + c + '</span>').join('');
    veil.innerHTML =
      '<img class="iv-mark" src="assets/logo.svg" alt="">' +
      '<div class="iv-word">' + letters + '</div>' +
      '<div class="iv-line"></div>' +
      '<div class="iv-tag">Systematic equity research</div>' +
      '<button class="iv-skip" type="button">Skip intro</button>';
    document.body.appendChild(veil);
    document.documentElement.classList.add('intro-lock');
    let closed = false;
    const close = () => {
      if (closed) return; closed = true;
      try { sessionStorage.setItem('neroIntroDone', '1'); } catch (e) {}
      veil.classList.add('out');
      document.documentElement.classList.remove('intro-lock');
      setTimeout(() => veil.remove(), 900);
    };
    veil.querySelector('.iv-skip').addEventListener('click', close);
    setTimeout(close, 3800);
  }

  /* ---- pill header: collapse page links into a full-screen menu ---- */
  const navEl = document.querySelector('.site-header .nav');
  const linksEl = navEl && navEl.querySelector('.nav-links');
  if (navEl && linksEl) {
    const oldBurger = navEl.querySelector('.hamburger');
    if (oldBurger) oldBurger.remove();
    const pageLinks = Array.from(linksEl.querySelectorAll('a:not(.nav-cta):not(.nav-social)'));
    const socials = Array.from(linksEl.querySelectorAll('.nav-social'));
    const cta = linksEl.querySelector('.nav-cta');

    const right = document.createElement('div');
    right.className = 'nav-right';
    if (cta) right.appendChild(cta);
    const btn = document.createElement('button');
    btn.className = 'menu-btn'; btn.type = 'button';
    btn.setAttribute('aria-expanded', 'false');
    btn.textContent = 'Menu';
    right.appendChild(btn);

    const mega = document.createElement('div'); mega.className = 'mega';
    const inner = document.createElement('div'); inner.className = 'mega-inner';
    inner.innerHTML = '<span class="eyebrow">Navigation</span>';
    const list = document.createElement('nav'); list.className = 'mega-links';
    pageLinks.forEach((a, i) => {
      const row = document.createElement('a');
      row.href = a.getAttribute('href');
      row.style.transitionDelay = (0.08 + i * 0.05).toFixed(2) + 's';
      row.innerHTML = '<span>' + a.textContent + '</span><em>&#8594;</em>';
      if (a.classList.contains('active')) row.classList.add('active');
      list.appendChild(row);
    });
    inner.appendChild(list);
    const foot = document.createElement('div'); foot.className = 'mega-foot';
    socials.forEach(s => foot.appendChild(s));
    const megaCta = document.createElement('a');
    megaCta.className = 'btn btn-primary';
    megaCta.href = cta ? cta.getAttribute('href') : 'signup.html';
    megaCta.textContent = cta ? cta.textContent : 'Request access';
    foot.appendChild(megaCta);
    inner.appendChild(foot);
    mega.appendChild(inner);

    linksEl.remove();
    navEl.appendChild(right);
    document.body.appendChild(mega);

    const setOpen = open => {
      document.documentElement.classList.toggle('menu-open', open);
      btn.textContent = open ? 'Close' : 'Menu';
      btn.setAttribute('aria-expanded', String(open));
    };
    btn.addEventListener('click', () => setOpen(!document.documentElement.classList.contains('menu-open')));
    document.addEventListener('keydown', e => { if (e.key === 'Escape') setOpen(false); });
    mega.addEventListener('click', e => { if (e.target.closest('a')) setOpen(false); });
  }

  /* ---- scroll-lit statements: words brighten as they pass through view ---- */
  const stmts = Array.from(document.querySelectorAll('.statement'));
  if (stmts.length) {
    stmts.forEach(el => {
      el.innerHTML = el.textContent.trim().split(/\s+/)
        .map(w => '<span class="sw">' + w + '</span>').join(' ');
    });
    const light = () => {
      const vh = window.innerHeight;
      stmts.forEach(el => {
        const r = el.getBoundingClientRect();
        if (r.bottom < 0 || r.top > vh) return;
        const p = Math.min(1, Math.max(0, (vh * 0.82 - r.top) / (r.height + vh * 0.35)));
        const ws = el.children, n = Math.round(p * ws.length);
        for (let i = 0; i < ws.length; i++) ws[i].classList.toggle('lit', i < n);
      });
    };
    document.addEventListener('scroll', light, { passive: true });
    window.addEventListener('resize', light);
    light();
  }

  /* ---- pause-animations toggle ---- */
  const animBtn = document.createElement('button');
  animBtn.className = 'anim-toggle'; animBtn.type = 'button';
  const setAnim = off => {
    document.documentElement.classList.toggle('anim-off', off);
    animBtn.textContent = off ? 'Play animations' : 'Pause animations';
    try { localStorage.setItem('neroAnimOff', off ? '1' : ''); } catch (e) {}
  };
  document.body.appendChild(animBtn);
  let animSaved = false;
  try { animSaved = !!localStorage.getItem('neroAnimOff'); } catch (e) {}
  setAnim(animSaved);
  animBtn.addEventListener('click', () => setAnim(!document.documentElement.classList.contains('anim-off')));
})();