/* ===========================================================================
   charts.js — loads data/performance.json and renders all charts.
   Chart.js v4 is loaded from CDN in each page that needs it.
   =========================================================================== */

const NERODYNE = (() => {
  const C = { accent: '#7aa5ec', accent2: '#4cc4a6', gold: '#c2a568', spy: '#6b7280', grid: 'rgba(255,255,255,.06)', text: '#9aa4b6' };
  // stable per-model line colour for multi-model views (muted, print-friendly set)
  const MCOL = { vortex: C.accent, apex: '#c489a4', anchor: '#9a90cc', nova: '#cf9e70', pulse: '#79b6c9', surge: C.gold };
  // which models are publicly shown (data file may hold more)
  const SHOW = ['vortex', 'apex', 'anchor', 'nova', 'pulse'];
  // one-line description of what each product is for (shown on the model cards)
  const BLURB = {
    'vortex-unhedged': 'The flagship at full strength. Five distinct businesses selected for growing revenue and mutual independence. The highest return profile, with the swings that come with concentration.',
    'vortex-hedged': 'The same portfolio with a permanent put option overlay. It gives up part of the return in calm markets; in the sample it turned the 2020 and 2022 declines into positive years.',
    'vortex-diversified': 'A broader book of quality companies with an index hedge, the largest stock in the world by market value, and a dividend ETF sleeve. The steadiest profile, with the shallowest drawdown of the lineup.',
    'apex-unhedged': 'The most aggressive single model: five momentum leaders. The highest raw return of the pure models, with the deepest drawdowns.',
    'anchor-unhedged': 'The steadiest single model: ten balanced holdings. The smallest worst year of the four pure models.',
    'nova-unhedged': 'Five holdings with optimised factor weights. Strong risk-adjusted returns, between Apex’s aggression and Anchor’s breadth.',
    'pulse-unhedged': 'Five holdings refreshed quarterly, so the portfolio stays current. The shallowest maximum drawdown of the pure models.'
  };
  let _data = null;

  async function load() {
    if (_data) return _data;
    // Prefer embedded data (works from file:// with no server); fall back to fetch.
    if (window.NERO_DATA) {
      _data = window.NERO_DATA;
    } else {
      const res = await fetch('data/performance.json', { cache: 'no-store' });
      _data = await res.json();
    }
    _data.models = _data.models.filter(m => SHOW.includes(m.id));
    return _data;
  }

  function baseOpts(log = true) {
    return {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: true, labels: { color: C.text, usePointStyle: true, boxWidth: 8, font: { size: 12 } } },
        tooltip: {
          backgroundColor: '#0c0e12', borderColor: 'rgba(255,255,255,.12)', borderWidth: 1,
          titleColor: '#e9ecf2', bodyColor: '#99a2b2', padding: 12, displayColors: true,
          callbacks: { label: (c) => ` ${c.dataset.label}: $${Math.round(c.parsed.y).toLocaleString()}` }
        }
      },
      scales: {
        x: { ticks: { color: C.text, maxTicksLimit: 7, font: { size: 11 } }, grid: { display: false } },
        y: {
          type: log ? 'logarithmic' : 'linear',
          beginAtZero: !log,
          ticks: { color: C.text, font: { size: 11 }, maxTicksLimit: 6, callback: (v) => '$' + Number(v).toLocaleString() },
          grid: { color: C.grid }
        }
      },
      elements: { point: { radius: 0, hoverRadius: 4 }, line: { borderWidth: 2, tension: .12 } },
      animation: { duration: 900, easing: 'easeOutCubic' }
    };
  }

  function ds(label, data, color, fill = false) {
    return {
      label, data, borderColor: color, backgroundColor: fill ? color + '22' : 'transparent',
      fill: fill ? 'origin' : false, pointHoverBackgroundColor: color
    };
  }

  function setText(id, txt) { const el = document.getElementById(id); if (el) el.textContent = txt; }
  function countTo(id, to, { dp = 0, pre = '', suf = '' } = {}) {
    const el = document.getElementById(id); if (!el) return;
    const dur = 1300, t0 = Date.now(), ease = t => 1 - Math.pow(1 - t, 3);
    (function tick() {
      const p = Math.min(1, (Date.now() - t0) / dur), v = to * ease(p);
      el.textContent = pre + (dp ? v.toFixed(dp) : Math.round(v).toLocaleString()) + suf;
      if (p < 1) requestAnimationFrame(tick);
    })();
  }

  // Hero: every shown model on one chart (plus S&P 500), with an unhedged/hedged toggle.
  async function hero(canvasId, toggleId) {
    const d = await load();

    // headline stats first, so they always populate regardless of the chart
    const flag = d.models.find(m => m.flagship) || d.models[0];
    countTo('hero-total', flag.unhedged.stats.total * 100, { pre: '+', suf: '%' });
    countTo('hero-ann', flag.unhedged.stats.ann, { dp: 1, pre: '+', suf: '%' });
    countTo('hero-sharpe', flag.unhedged.stats.sharpe, { dp: 2 });
    if (d.lastUpdated) setText('hero-updated', new Date(d.lastUpdated).toLocaleDateString());

    const ctx = document.getElementById(canvasId);
    if (!ctx) return;
    const labels = d.models[0].dates;
    let view = 'unhedged';

    const chart = new Chart(ctx, { type: 'line', data: { labels, datasets: [] }, options: baseOpts(true) });
    // the hero axis shows cumulative % return, not dollars
    const pct = (v) => (v >= 100 ? '+' : '') + Math.round((v / 100 - 1) * 100).toLocaleString() + '%';
    const HERO_TICKS = [100, 300, 1000, 3000, 10000, 30000];
    const hy = chart.options.scales.y;
    hy.ticks.callback = pct;
    hy.afterBuildTicks = (axis) => { axis.ticks = HERO_TICKS.filter(v => v >= axis.min && v <= axis.max).map(v => ({ value: v })); };
    chart.options.plugins.tooltip.callbacks.label = (c) => ` ${c.dataset.label}: ${pct(c.parsed.y)}`;

    function draw() {
      // pure models carry no hedged curve — only draw models that have the view
      const sets = d.models.filter(m => m[view]).map(m => {
        const col = MCOL[m.id] || C.accent;
        const fill = m.flagship;
        return { ...ds(`${m.name}`, m[view].curve, col, fill), borderWidth: m.flagship ? 2.6 : 1.8 };
      });
      sets.push(ds('S&P 500', d.spy, C.spy));
      chart.data.datasets = sets; chart.update();
    }
    draw();

    const tog = document.getElementById(toggleId);
    if (tog) tog.querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
      tog.querySelectorAll('button').forEach(x => x.classList.remove('active', 'hedged'));
      b.classList.add('active'); if (b.dataset.v === 'hedged') b.classList.add('hedged');
      view = b.dataset.v; draw();
    }));
  }

  // Scrolling ticker of real, honest backtest figures.
  async function ticker(elId) {
    const d = await load();
    const el = document.getElementById(elId); if (!el) return;
    const items = [];
    d.models.forEach(m => {
      const s = m.unhedged.stats;
      items.push(`<span class="ti"><b>${m.name}</b> <span class="up">+${s.ann.toFixed(1)}%</span> ann</span>`);
      items.push(`<span class="ti"><b>${m.name}</b> Sharpe ${s.sharpe.toFixed(2)}</span>`);
      items.push(`<span class="ti"><b>${m.name}</b> worst yr <span class="${s.worst < 0 ? 'down' : 'up'}">${s.worst >= 0 ? '+' : ''}${s.worst.toFixed(1)}%</span></span>`);
    });
    items.push(`<span class="ti"><b>S&P 500</b> +${d.spyStats.ann.toFixed(1)}% ann · Sharpe ${d.spyStats.sharpe.toFixed(2)}</span>`);
    items.push(`<span class="ti">Backtested 2012 to present · hedged &amp; unhedged</span>`);
    const html = items.join('');
    el.innerHTML = `<div class="ticker-track">${html}${html}</div>`; // duplicated for seamless loop
  }

  // Product cards: the flagship's three versions, then each pure underlying model.
  async function modelCards(containerId) {
    const d = await load();
    const wrap = document.getElementById(containerId);
    if (!wrap) return;
    const flag = d.models.find(x => x.flagship) || d.models[0];
    const variants = [
      { m: flag, key: 'unhedged', name: flag.name, tag: 'unhedged · concentrated · highest return', col: C.accent, badge: 'Pure' },
      { m: flag, key: 'hedged', name: `${flag.name} Shield`, tag: 'hedged · concentrated · convex protection', col: C.accent2, badge: 'Hedged' },
      { m: flag, key: 'diversified', name: 'Diversified Shield', tag: 'hedged · 15+ quality holdings · dividend ETF sleeve', col: C.gold, badge: 'Diversified' }
    ].filter(v => v.m[v.key]);
    d.models.filter(x => !x.flagship).forEach(pm => {
      variants.push({ m: pm, key: 'unhedged', name: pm.name, tag: pm.tagline || 'unhedged single model', col: MCOL[pm.id] || C.accent, badge: 'Model' });
    });
    variants.forEach((vt, i) => {
      const m = vt.m;
      const cid = `${m.id}-${vt.key}`;
      const card = document.createElement('div');
      card.className = 'panel model-card reveal';
      card.setAttribute('data-d', String(i + 1));
      const blurb = BLURB[cid] || '';
      card.innerHTML = `
        <div class="mc-head">
          <div>
            <div class="mc-name">${vt.name}</div>
            <div class="mc-tag">${vt.tag}</div>
          </div>
          <span class="badge">${vt.badge}</span>
        </div>
        ${blurb ? `<p class="mc-desc">${blurb}</p>` : ''}
        <div class="mc-spark"><canvas id="spark-${cid}"></canvas></div>
        <div class="stat-grid" id="stats-${cid}"></div>`;
      wrap.appendChild(card);
      if (window.NEROReveal) window.NEROReveal(card);

      new Chart(document.getElementById(`spark-${cid}`), {
        type: 'line',
        data: { labels: m.dates, datasets: [ds(vt.name, m[vt.key].curve, vt.col, true)] },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: false }, tooltip: { enabled: false } },
          scales: { x: { display: false }, y: { display: false, type: 'logarithmic' } },
          elements: { point: { radius: 0 }, line: { borderWidth: 2, tension: .15 } }
        }
      });

      const s = m[vt.key].stats;
      document.getElementById(`stats-${cid}`).innerHTML = `
        <div class="cell"><div class="v up">+${s.ann.toFixed(1)}%</div><div class="k">Annualised</div></div>
        <div class="cell"><div class="v">${s.sharpe.toFixed(2)}</div><div class="k">Sharpe</div></div>
        <div class="cell"><div class="v ${s.worst < 0 ? 'down' : 'up'}">${s.worst >= 0 ? '+' : ''}${s.worst.toFixed(1)}%</div><div class="k">Worst year</div></div>
        <div class="cell"><div class="v down">${s.maxdd.toFixed(1)}%</div><div class="k">Max drawdown</div></div>`;
    });
  }

  // Full performance page: switchable growth chart + log/linear toggle + year bars + stats table.
  async function performance(canvasId, tableId, selectId, yearChartId) {
    const d = await load();
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;
    let current = d.models[0].id;
    let showHedged = true, showUnhedged = true, showSpy = true, useLog = true;

    const chart = new Chart(ctx, { type: 'line', data: { labels: [], datasets: [] }, options: baseOpts(true) });

    // calendar-year returns bar chart (real per-year %, scale-independent)
    let yearChart = null;
    const yctx = yearChartId && document.getElementById(yearChartId);
    if (yctx) {
      yearChart = new Chart(yctx, {
        type: 'bar', data: { labels: d.years, datasets: [] },
        options: {
          responsive: true, maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          plugins: {
            legend: { labels: { color: C.text, usePointStyle: true, boxWidth: 8, font: { size: 12 } } },
            tooltip: {
              backgroundColor: '#0c0e12', borderColor: 'rgba(255,255,255,.12)', borderWidth: 1,
              titleColor: '#e9ecf2', bodyColor: '#99a2b2', padding: 12,
              callbacks: { label: (c) => ` ${c.dataset.label}: ${c.parsed.y >= 0 ? '+' : ''}${c.parsed.y}%` }
            }
          },
          scales: {
            x: { ticks: { color: C.text, font: { size: 11 } }, grid: { display: false } },
            y: { ticks: { color: C.text, font: { size: 11 }, callback: (v) => v + '%' }, grid: { color: C.grid } }
          },
          animation: { duration: 700 }
        }
      });
    }

    function drawYears() {
      if (!yearChart) return;
      const m = d.models.find(x => x.id === current);
      yearChart.data.datasets = [
        { label: `${m.name} · unhedged`, data: m.yearly.unhedged, backgroundColor: MCOL[m.id] || C.accent, borderRadius: 3 },
        ...(m.yearly.hedged ? [{ label: `${m.name} Shield`, data: m.yearly.hedged, backgroundColor: C.accent2, borderRadius: 3 }] : []),
        ...(m.yearly.diversified ? [{ label: 'Diversified Shield', data: m.yearly.diversified, backgroundColor: C.gold, borderRadius: 3 }] : []),
        { label: 'S&P 500', data: d.spyYearly, backgroundColor: C.spy, borderRadius: 3 }
      ];
      yearChart.update();
    }

    function draw() {
      const m = d.models.find(x => x.id === current);
      const sets = [];
      if (showUnhedged) sets.push(ds(`${m.name} · unhedged`, m.unhedged.curve, MCOL[m.id] || C.accent));
      if (showHedged && m.hedged) sets.push(ds(`${m.name} Shield`, m.hedged.curve, C.accent2));
      if (m.diversified) sets.push(ds('Diversified Shield', m.diversified.curve, C.gold));
      if (showSpy) sets.push(ds('S&P 500', d.spy, C.spy));
      chart.data.labels = m.dates; chart.data.datasets = sets; chart.update();
      drawYears();
      const tbl = document.getElementById(tableId);
      if (tbl) {
        const row = (lbl, s) => `<tr><td>${lbl}</td>
          <td class="up">+${s.ann.toFixed(1)}%</td><td>${s.vol.toFixed(1)}%</td>
          <td>${s.sharpe.toFixed(2)}</td><td class="down">${s.maxdd.toFixed(1)}%</td>
          <td class="${s.worst < 0 ? 'down' : 'up'}">${s.worst >= 0 ? '+' : ''}${s.worst.toFixed(1)}%</td>
          <td>+${Math.round(s.total * 100).toLocaleString()}%</td></tr>`;
        tbl.querySelector('tbody').innerHTML =
          row(`${m.name} (unhedged)`, m.unhedged.stats) +
          (m.hedged ? row(`${m.name} Shield`, m.hedged.stats) : '') +
          (m.diversified ? row('Diversified Shield', m.diversified.stats) : '') +
          `<tr><td>S&amp;P 500 (SPY)</td><td class="up">+${d.spyStats.ann.toFixed(1)}%</td>
            <td>${d.spyStats.vol.toFixed(1)}%</td><td>${d.spyStats.sharpe.toFixed(2)}</td>
            <td class="down">${d.spyStats.maxdd.toFixed(1)}%</td>
            <td class="down">${d.spyStats.worst.toFixed(1)}%</td><td>n/a</td></tr>`;
      }
    }

    const sel = document.getElementById(selectId);
    if (sel) {
      d.models.forEach((m, i) => {
        const b = document.createElement('button');
        b.className = 'btn ' + (i === 0 ? 'btn-primary' : 'btn-ghost');
        b.textContent = m.name;
        b.addEventListener('click', () => {
          current = m.id;
          sel.querySelectorAll('button').forEach(x => { x.classList.remove('btn-primary'); x.classList.add('btn-ghost'); });
          b.classList.remove('btn-ghost'); b.classList.add('btn-primary');
          draw();
        });
        sel.appendChild(b);
      });
    }
    document.querySelectorAll('[data-series]').forEach(cb => {
      cb.addEventListener('change', () => {
        const v = cb.dataset.series;
        if (v === 'hedged') showHedged = cb.checked;
        if (v === 'unhedged') showUnhedged = cb.checked;
        if (v === 'spy') showSpy = cb.checked;
        draw();
      });
    });

    // log view shows cumulative % return on the axis; $ view shows dollar value of $100
    const pct = (v) => (v >= 100 ? '+' : '') + Math.round((v / 100 - 1) * 100).toLocaleString() + '%';
    const LOG_TICKS = [100, 300, 1000, 3000, 10000];
    function applyScale() {
      const y = chart.options.scales.y;
      y.type = useLog ? 'logarithmic' : 'linear';
      y.beginAtZero = !useLog;
      y.ticks.callback = useLog ? pct : (v) => '$' + Number(v).toLocaleString();
      // log axis otherwise floods with labels — pin a clean handful of values
      y.afterBuildTicks = useLog
        ? (axis) => { axis.ticks = LOG_TICKS.filter(v => v >= axis.min && v <= axis.max).map(v => ({ value: v })); }
        : null;
      chart.options.plugins.tooltip.callbacks.label = useLog
        ? (c) => ` ${c.dataset.label}: ${pct(c.parsed.y)}`
        : (c) => ` ${c.dataset.label}: $${Math.round(c.parsed.y).toLocaleString()}`;
      chart.update();
    }
    document.querySelectorAll('[data-scale]').forEach(btn => {
      btn.addEventListener('click', () => {
        useLog = btn.dataset.scale === 'log';
        document.querySelectorAll('[data-scale]').forEach(b => b.classList.toggle('active', b === btn));
        applyScale();
      });
    });

    draw();
    applyScale();   // default = log → % return on the axis
  }


  // "How it's tested" page: stress-window and Monte Carlo tables
  async function testing(stressId, mcId) {
    const d = await load();
    const t = d.testing; if (!t) return;
    const cell = v => v == null ? '<td>n/a</td>'
      : `<td class="${v < 0 ? 'down' : 'up'}">${v >= 0 ? '+' : ''}${v.toFixed(1)}%</td>`;
    const st = document.getElementById(stressId);
    if (st) st.querySelector('tbody').innerHTML = t.stress.map(r =>
      `<tr><td>${r.name}<div class="note">${r.from} to ${r.to}</div></td>` +
      cell(r.vortex) + cell(r.hedged) + cell(r.diversified) + cell(r.spy) + '</tr>').join('');
    const NAMES = { vortex: 'Vortex', hedged: 'Vortex Shield', diversified: 'Diversified Shield', spy: 'S&P 500' };
    const mc = document.getElementById(mcId);
    if (mc) mc.querySelector('tbody').innerHTML = Object.entries(t.mc).map(([k, m]) =>
      `<tr><td>${NAMES[k] || k}</td>` + cell(m.p50) + cell(m.p5) + cell(m.p95) +
      `<td>${m.probLoss.toFixed(1)}%</td><td class="down">${m.medianMaxDD.toFixed(1)}%</td></tr>`).join('');
  }

  return { load, hero, ticker, modelCards, performance, testing };
})();
