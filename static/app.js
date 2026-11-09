'use strict';
/* Cockpit v2 — vanilla JS + SVG, no external code (CSP: self only, no inline styles in markup). */
(() => {
const $ = (s, r = document) => r.querySelector(s);
const NS = 'http://www.w3.org/2000/svg';
const LOC = 'de-DE';
let S = null, lastLoad = 0, FOCUS = 'Hauptkunde';

/* ---------- formatting ---------- */
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const isNum = v => typeof v === 'number' && isFinite(v);
const nf = (d = 0) => new Intl.NumberFormat(LOC, {minimumFractionDigits: d, maximumFractionDigits: d});
const num = (v, d = 0) => isNum(v) ? nf(d).format(v) : '–';
const compact = v => !isNum(v) ? '–' : Math.abs(v) >= 1e6 ? nf(1).format(v / 1e6) + ' Mio.' : Math.abs(v) >= 1e4 ? nf(0).format(v / 1e3) + ' Tsd.' : nf(0).format(v);
const eur = (v, d) => isNum(v) ? nf(d ?? (Math.abs(v) < 100 ? 2 : 0)).format(v) + ' €' : '–';
const pct = (v, d = 1) => isNum(v) ? nf(d).format(v * 100) + ' %' : '–';
const ms = v => !isNum(v) ? '–' : v >= 1000 ? nf(2).format(v / 1000) + ' s' : nf(0).format(v) + ' ms';
const D = v => v ? new Date(v) : null;
function ago(iso) {
  const d = D(iso); if (!d || isNaN(d)) return 'unbekannt';
  const s = (Date.now() - d) / 1000;
  if (s < 90) return 'gerade eben';
  if (s < 3600) return `vor ${Math.round(s / 60)} min`;
  if (s < 48 * 3600) return `vor ${nf(s < 36000 ? 1 : 0).format(s / 3600)} h`;
  return `vor ${Math.round(s / 86400)} Tagen`;
}
const hhmm = d => d.toLocaleTimeString(LOC, {hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin'});
const dshort = d => d.toLocaleDateString(LOC, {day: 'numeric', month: 'numeric', timeZone: 'UTC'});
const wd = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

/** delta: signed change vs a named period; colour = direction × whether up is good; never colour alone (arrow + sign). */
function delta(cur, prev, {upGood = true, label = '', abs = false} = {}) {
  if (!isNum(cur) || !isNum(prev)) return `<span class="delta flat">– ${esc(label)}</span>`;
  if (prev === 0 && cur === 0) return `<span class="delta flat">± 0 ${esc(label)}</span>`;
  let txt, ch;
  if (abs || prev === 0) { ch = cur - prev; txt = (ch >= 0 ? '+' : '−') + num(Math.abs(ch), Math.abs(ch) < 10 && ch % 1 ? 1 : 0); }
  else { ch = (cur - prev) / Math.abs(prev); txt = (ch >= 0 ? '+' : '−') + nf(Math.abs(ch) < .1 ? 1 : 0).format(Math.abs(ch) * 100) + ' %'; }
  const flat = Math.abs(abs || prev === 0 ? ch : ch * 100) < 0.5;
  const cls = flat ? 'flat' : (ch > 0) === upGood ? 'good' : 'bad';
  const arrow = flat ? '→' : ch > 0 ? '↑' : '↓';
  return `<span class="delta ${cls}">${arrow} ${txt} ${esc(label)}</span>`;
}

/* ---------- section meta: age + stale ---------- */
const STALE_MIN = {traffic: 30, money: 75, capacity: 30, sn92: 60 * 36, ops: 45};
function meta(name) {
  const s = S?.sections?.[name];
  if (!s) return {missing: true, data: null, stale: true, as_of: null};
  const d = s.data || null;
  const age = s.as_of ? (Date.now() - new Date(s.as_of)) / 60000 : Infinity;
  return {data: d, as_of: s.as_of, ok: s.ok !== false, error: s.error, stale: !s.as_of || age > (STALE_MIN[name] || 60) || s.ok === false};
}
function subAge(block, maxMin) {
  if (!block || !block.as_of) return {stale: true, txt: 'Stand unbekannt'};
  const m = (Date.now() - new Date(block.as_of)) / 60000;
  return {stale: m > maxMin, txt: 'Stand ' + ago(block.as_of)};
}
const ageTag = (iso, maxMin) => {
  const m = iso ? (Date.now() - new Date(iso)) / 60000 : Infinity;
  const st = m > maxMin;
  return `<span class="age${st ? ' stale' : ''}" title="${esc(iso || '')}">${st ? '⚠ veraltet · ' : ''}${iso ? ago(iso) : 'kein Stand'}</span>`;
};

/* ---------- card shell ---------- */
function card({title, sub = '', as_of, maxAge = 60, body, cls = '', error, id = ''}) {
  const m = as_of ? (Date.now() - new Date(as_of)) / 60000 : Infinity;
  const stale = m > maxAge;
  return `<article class="card ${cls}${stale ? ' stale' : ''}"${id ? ` id="${id}"` : ''}>
    <div class="card-head"><div><h3>${title}</h3>${sub ? `<p class="sub">${sub}</p>` : ''}</div>${ageTag(as_of, maxAge)}</div>
    ${stale && as_of ? `<p class="stale-note">Daten älter als ${maxAge >= 120 ? Math.round(maxAge / 60) + ' h' : maxAge + ' min'} — nicht als aktuell lesen.</p>` : ''}
    ${error ? `<p class="err-note">Quelle nicht erreichbar: ${esc(error)}</p>` : ''}
    ${body}
  </article>`;
}
const noData = (what = 'Keine Daten') => `<p class="muted">${esc(what)}</p>`;

/* ---------- SVG kit ---------- */
const el = (tag, attrs = {}, parent) => { const n = document.createElementNS(NS, tag); for (const k in attrs) n.setAttribute(k, attrs[k]); if (parent) parent.appendChild(n); return n; };
const cssVar = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
function divs(mx) { const m = mx / Math.pow(10, Math.floor(Math.log10(mx))); return Math.abs(m - 2) < 1e-9 || Math.abs(m - 4) < 1e-9 ? 4 : 5; }
function niceMax(v) { if (!(v > 0)) return 1; const p = Math.pow(10, Math.floor(Math.log10(v))); for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= v) return m * p; return 10 * p; }
const tick = v => Math.abs(v) >= 1e6 ? nf(Math.abs(v) % 1e6 ? 1 : 0).format(v / 1e6) + 'M' : Math.abs(v) >= 1e4 ? nf(0).format(v / 1e3) + 'K' : nf(Math.abs(v) < 10 && v % 1 ? 1 : 0).format(v);

const tip = $('#tip');
function showTip(html, ev) {
  tip.innerHTML = html; tip.hidden = false;
  const r = tip.getBoundingClientRect(), x = ev.clientX, y = ev.clientY;
  let L = x + 14, T = y - r.height - 12;
  if (L + r.width > innerWidth - 8) L = x - r.width - 14;
  if (L < 8) L = 8;
  if (T < 8) T = y + 16;
  tip.style.left = L + 'px'; tip.style.top = T + 'px';
}
const hideTip = () => { tip.hidden = true; };
const tipRow = (color, name, val) => `<div class="row"><span>${color ? `<i data-c="${color}"></i>` : ''}${esc(name)}</span><b class="num">${val}</b></div>`;
function paintTipSwatches() { tip.querySelectorAll('i[data-c]').forEach(i => { i.style.background = cssVar(i.dataset.c); }); }

function legend(items) {
  return `<div class="legend">${items.map(it => `<span><i class="${it.kind || ''}" data-c="${it.color}"></i>${esc(it.name)}</span>`).join('')}</div>`;
}
function paintLegends(root) { root.querySelectorAll('.legend i[data-c], .needs i[data-c], .rl i[data-c]').forEach(i => { if (!i.classList.contains('dash')) i.style.background = cssVar(i.dataset.c); }); }

const charts = []; // {node, draw}
function mount(id, draw) { charts.push({id, draw}); }
function drawAll() { for (const c of charts) { const n = document.getElementById(c.id); if (n) { n.innerHTML = ''; try { c.draw(n); } catch (e) { n.textContent = 'Diagramm konnte nicht gezeichnet werden.'; console.error(e); } } } }

/** Column chart, optionally stacked. cats: [{label, date?, partial?}], series: [{name, color, values}] */
function columns(node, {cats, series, height = 180, yfmt = tick, tipfmt = v => num(v), labelEvery, partialNote = true}) {
  const W = node.clientWidth || 320, H = height, padL = 34, padR = 4, padT = 8, padB = 20;
  const n = cats.length; if (!n) { node.innerHTML = noData(); return; }
  const totals = cats.map((_, i) => series.reduce((a, s) => a + (s.values[i] || 0), 0));
  const ymax = niceMax(Math.max(...totals));
  const svg = el('svg', {viewBox: `0 0 ${W} ${H}`, height: H, role: 'img'}, node);
  const iw = W - padL - padR, ih = H - padT - padB, band = iw / n, bw = Math.max(1, Math.min(24, band - (band > 6 ? 2 : 0.5)));
  const y = v => padT + ih - (v / ymax) * ih;
  const dv = divs(ymax);
  for (let k = 0; k <= dv; k++) { const v = ymax * k / dv, yy = Math.round(y(v)) + .5; el('line', {x1: padL, x2: W - padR, y1: yy, y2: yy, class: k ? 'grid-l' : 'base-l'}, svg); const t = el('text', {x: padL - 6, y: yy + 3.5, 'text-anchor': 'end'}, svg); t.textContent = yfmt(v); }
  const every = labelEvery || Math.ceil(n / Math.max(2, Math.floor(iw / 52)));
  cats.forEach((c, i) => {
    const x = padL + i * band + (band - bw) / 2;
    let acc = 0;
    series.forEach((s, si) => {
      const v = s.values[i] || 0; if (v <= 0) return;
      const y0 = y(acc), y1 = y(acc + v); acc += v;
      const top = si === series.length - 1 || series.slice(si + 1).every(t => !(t.values[i] > 0));
      const h = Math.max(0, y0 - y1 - (acc > v ? 1 : 0)); // 1px surface gap between stacked segments (thin bars)
      const r = top ? Math.min(4, bw / 2, h) : 0;
      const p = el('path', {d: roundTop(x, y1, bw, h, r), fill: `var(${s.color})`}, svg);
      if (c.partial) p.setAttribute('fill-opacity', '.45');
    });
    if (i % every === 0 || i === n - 1) { const t = el('text', {x: x + bw / 2, y: H - 5, 'text-anchor': i === n - 1 ? 'end' : 'middle'}, svg); t.textContent = c.label; if (i !== n - 1 && i > n - 1 - every) t.remove(); }
    const hit = el('rect', {x: padL + i * band, y: padT, width: band, height: ih, class: 'hit'}, svg);
    const show = ev => { showTip(`<b>${esc(c.long || c.label)}${c.partial ? ' (laufend)' : ''}</b>` + series.slice().reverse().map(s => tipRow(s.color, s.name, tipfmt(s.values[i] || 0))).join('') + (series.length > 1 ? tipRow('', 'Summe', tipfmt(totals[i])) : ''), ev); paintTipSwatches(); };
    hit.addEventListener('pointermove', show); hit.addEventListener('pointerleave', hideTip);
  });
}
function roundTop(x, y, w, h, r) {
  if (h <= 0) return '';
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

/** Line chart with crosshair tooltip. series: [{name, color, pts:[[Date, v]], dash?, area?}] */
function lines(node, {series, height = 170, yfmt = tick, tipfmt = v => num(v), xfmt = hhmm, tipx = d => d.toLocaleString(LOC, {weekday: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin'}), ymin0 = true}) {
  const all = series.flatMap(s => s.pts); if (!all.length) { node.innerHTML = noData(); return; }
  const W = node.clientWidth || 320, H = height, padL = 34, padR = 8, padT = 8, padB = 20;
  const xs = all.map(p => +p[0]), x0 = Math.min(...xs), x1 = Math.max(...xs);
  const ymax = niceMax(Math.max(...all.map(p => p[1] || 0)));
  const svg = el('svg', {viewBox: `0 0 ${W} ${H}`, height: H, role: 'img'}, node);
  const iw = W - padL - padR, ih = H - padT - padB;
  const X = t => padL + (x1 === x0 ? iw / 2 : (t - x0) / (x1 - x0) * iw), Y = v => padT + ih - (v / ymax) * ih;
  const dv = divs(ymax);
  for (let k = 0; k <= dv; k++) { const v = ymax * k / dv, yy = Math.round(Y(v)) + .5; el('line', {x1: padL, x2: W - padR, y1: yy, y2: yy, class: k ? 'grid-l' : 'base-l'}, svg); const t = el('text', {x: padL - 6, y: yy + 3.5, 'text-anchor': 'end'}, svg); t.textContent = yfmt(v); }
  const nt = Math.max(2, Math.min(6, Math.floor(iw / 70)));
  for (let k = 0; k < nt; k++) { const t = x0 + (x1 - x0) * k / (nt - 1); const tx = el('text', {x: X(t), y: H - 5, 'text-anchor': k === 0 ? 'start' : k === nt - 1 ? 'end' : 'middle'}, svg); tx.textContent = xfmt(new Date(t)); }
  series.slice().reverse().forEach(s => {
    if (!s.pts.length) return;
    const d = s.pts.map((p, i) => `${i ? 'L' : 'M'}${X(+p[0]).toFixed(1)},${Y(p[1] || 0).toFixed(1)}`).join('');
    if (s.area) el('path', {d: d + `L${X(+s.pts.at(-1)[0])},${Y(0)}L${X(+s.pts[0][0])},${Y(0)}Z`, fill: `var(${s.color})`, 'fill-opacity': '.10'}, svg);
    el('path', {d, fill: 'none', stroke: s.dash ? 'var(--muted)' : `var(${s.color})`, 'stroke-width': s.dash ? 1.5 : 2, 'stroke-dasharray': s.dash ? '4 3' : '', 'stroke-linejoin': 'round', 'stroke-linecap': 'round'}, svg);
  });
  const main = series[0]; const last = main.pts.at(-1);
  if (last) el('circle', {cx: X(+last[0]), cy: Y(last[1] || 0), r: 4, fill: `var(${main.color})`, stroke: 'var(--surface)', 'stroke-width': 2}, svg);
  const xh = el('line', {y1: padT, y2: padT + ih, class: 'xh', visibility: 'hidden'}, svg);
  const dots = series.map(s => el('circle', {r: 4, fill: s.dash ? 'var(--muted)' : `var(${s.color})`, stroke: 'var(--surface)', 'stroke-width': 2, visibility: 'hidden'}, svg));
  const hit = el('rect', {x: padL, y: padT, width: iw, height: ih, class: 'hit'}, svg);
  hit.addEventListener('pointermove', ev => {
    const r = svg.getBoundingClientRect(), px = (ev.clientX - r.left) * W / r.width;
    const t = x0 + (px - padL) / iw * (x1 - x0);
    const near = main.pts.reduce((b, p) => Math.abs(+p[0] - t) < Math.abs(+b[0] - t) ? p : b, main.pts[0]);
    const idx = main.pts.indexOf(near);
    xh.setAttribute('x1', X(+near[0])); xh.setAttribute('x2', X(+near[0])); xh.setAttribute('visibility', 'visible');
    let html = `<b>${esc(tipx(near[0]))}</b>`;
    series.forEach((s, i) => { const p = s.pts[idx] || s.pts.reduce((b, q) => Math.abs(+q[0] - +near[0]) < Math.abs(+b[0] - +near[0]) ? q : b, s.pts[0]); if (!p) return; dots[i].setAttribute('cx', X(+near[0])); dots[i].setAttribute('cy', Y(p[1] || 0)); dots[i].setAttribute('visibility', 'visible'); html += tipRow(s.dash ? '--muted' : s.color, s.name, tipfmt(p[1])); });
    showTip(html, ev); paintTipSwatches();
  });
  hit.addEventListener('pointerleave', () => { hideTip(); xh.setAttribute('visibility', 'hidden'); dots.forEach(d => d.setAttribute('visibility', 'hidden')); });
}

function sparkSVG(vals, color = '--s1') {
  const v = vals.filter(isNum); if (v.length < 2) return '';
  const W = 120, H = 26, mx = Math.max(...v), mn = Math.min(...v, 0), rng = mx - mn || 1;
  const pts = vals.map((x, i) => [i / (vals.length - 1) * (W - 4) + 2, H - 3 - ((isNum(x) ? x : mn) - mn) / rng * (H - 6)]);
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join('');
  const l = pts.at(-1);
  return `<svg class="spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true"><path d="${d}" fill="none" stroke="var(${color})" stroke-width="1.5" vector-effect="non-scaling-stroke" stroke-linejoin="round"/><circle cx="${l[0]}" cy="${l[1]}" r="2.5" fill="var(${color})"/></svg>`;
}
function hbar(share, color = '--s1') {
  const w = Math.max(0, Math.min(1, share || 0)) * 100;
  return `<svg viewBox="0 0 100 6" preserveAspectRatio="none" aria-hidden="true"><rect x="0" y="0" width="100" height="6" rx="3" fill="var(--surface-2)"/>${w > 0 ? `<rect x="0" y="0" width="${Math.max(w, 1.5).toFixed(2)}" height="6" rx="3" fill="var(${color})"/>` : ''}</svg>`;
}
function meterSVG(frac, warnAt = .8, critAt = .9, pace) {
  const f = Math.max(0, Math.min(1, frac || 0));
  const c = isNum(pace) ? (f > pace + .15 || f >= .97 ? '--crit' : f > pace ? '--warn' : '--s1') : f >= critAt ? '--crit' : f >= warnAt ? '--warn' : '--s1';
  const mark = isNum(pace) ? `<rect x="${(Math.min(1, pace) * 100 - .4).toFixed(2)}" y="0" width=".8" height="8" fill="var(--ink-2)"/>` : '';
  return `<svg viewBox="0 0 100 8" preserveAspectRatio="none" aria-hidden="true"><rect width="100" height="8" rx="4" fill="var(--surface-2)"/><rect width="${(f * 100).toFixed(2)}" height="8" rx="4" fill="var(${c})"/>${mark}</svg>`;
}

function heatmap(node, cells) {
  if (!cells?.length) { node.innerHTML = noData(); return; }
  const W = node.clientWidth || 320, padL = 22, padT = 4, padB = 16, cw = (W - padL) / 24, ch = Math.min(22, Math.max(14, cw * 1.1)), H = padT + ch * 7 + padB;
  const svg = el('svg', {viewBox: `0 0 ${W} ${H}`, height: H, role: 'img'}, node);
  const grid = Array.from({length: 7}, () => Array(24).fill(0));
  cells.forEach(([w, h, v]) => { grid[w][h] = v; });
  const mx = Math.max(...cells.map(c => c[2])) || 1;
  const ramp = ['--seq0', '--seq1', '--seq2', '--seq3', '--seq4', '--seq5', '--seq6', '--seq7'];
  for (let w = 0; w < 7; w++) {
    const t = el('text', {x: 0, y: padT + w * ch + ch / 2 + 3.5}, svg); t.textContent = wd[w];
    for (let h = 0; h < 24; h++) {
      const v = grid[w][h], k = v <= 0 ? 0 : Math.min(7, 1 + Math.floor(Math.sqrt(v / mx) * 6.999));
      const r = el('rect', {x: padL + h * cw + 1, y: padT + w * ch + 1, width: Math.max(1, cw - 2), height: ch - 2, rx: 3, fill: `var(${ramp[k]})`}, svg);
      r.addEventListener('pointermove', ev => showTip(`<b>${wd[w]} ${String(h).padStart(2, '0')}–${String(h + 1).padStart(2, '0')} Uhr UTC</b>${tipRow('', 'Anfragen (Summe 4 Wochen)', num(v))}${tipRow('', 'pro Woche Ø', num(v / 4))}`, ev));
      r.addEventListener('pointerleave', hideTip);
    }
  }
  for (const h of [0, 6, 12, 18, 23]) { const t = el('text', {x: padL + h * cw + cw / 2, y: H - 3, 'text-anchor': 'middle'}, svg); t.textContent = h; }
}

/* ---------- model colours: fixed by entity, never by rank ---------- */
const MODEL_ORDER = ['s1-pro', 's1-fast', 's1-vision', 'mammoth-1', 's1-mini', 's1-max'];
const modelName = m => ({none: '(ohne Modell)', other: 'Sonstige', unknown: '(unbekannt)'})[m] || m;
const shortNode = n => String(n || '').replace(/^upcloud-fihel2-/, '').replace(/^gpuserverhub-eupl-/, 'kat·').replace(/^euburst-([0-9a-f]{8})[0-9a-f-]*-(\w+)$/, 'burst-$1 ($2)');
const custLabel = l => String(l || '').replace(/^acct /, 'Konto ');
function modelColor(m) { const i = MODEL_ORDER.indexOf(m); return i >= 0 && i < 6 ? ['--s1', '--s2', '--s3', '--s7', '--s5', '--s6'][i] : '--s-other'; }

/* ================= sections ================= */
function renderHero() {
  const st = S.status || {level: 'warn', headline: 'Status unbekannt', reasons: []};
  const t = meta('traffic').data?.now || {}, cap = meta('capacity').data || {}, ops = meta('ops').data || {}, mon = meta('money').data || {};
  const tr = meta('traffic');
  const needsN = (ops.needs?.cards || []).filter(c => c.age_h <= 168).length + (ops.needs?.due?.length || 0);
  const icon = {ok: '✓', warn: '!', crit: '×'}[st.level] || '?';
  const levelWord = {ok: 'Grün', warn: 'Gelb', crit: 'Rot'}[st.level] || '';
  const mini = (S.history?.points || []).slice(-96);
  const gwOk = cap.gateway?.ok, att = cap.attesters || {};
  const kpi = (label, value, sub, extra = '', href = '', attn = false) => `<a class="kpi${attn === 'warn' ? ' attn-warn' : attn ? ' attn' : ''}" href="${href}"><span class="k-label">${label}</span><span class="k-value">${value}</span><span class="k-sub">${sub}</span>${extra}</a>`;
  const rpmSpark = (meta('traffic').data?.minutely_2h || []).map(r => r[1]);
  return `<section class="hero lvl-${st.level}" id="lage" aria-labelledby="verdict-h">
    <div>
      <div class="verdict"><div class="verdict-icon" aria-hidden="true">${icon}</div>
        <div><h1 id="verdict-h"><span class="sr">${levelWord}: </span>${esc(st.headline)}</h1><p>${esc(st.summary || '')}</p></div></div>
      ${st.reasons?.length ? `<ul class="reasons">${st.reasons.map(r => `<li><span class="dot ${r.level}" aria-hidden="true"></span><span><span class="sr">${({ok: 'OK', warn: 'Achtung', crit: 'Kritisch'})[r.level]}: </span>${esc(r.text)}</span></li>`).join('')}</ul>` : ''}
    </div>
    <div class="kpis">
      ${kpi('Anfragen / min', num(t.req_per_min_5m, t.req_per_min_5m < 10 ? 1 : 0), `Ø 1 h: ${num(t.req_per_min_1h, 0)} · ${tr.stale ? '⚠ veraltet' : ago(tr.as_of)}`, sparkSVG(rpmSpark), '#kunden')}
      ${kpi('Fehlerrate 1 h', pct(t.error_rate_1h), `24 h: ${pct(t.error_rate_24h)}`, '', '#kunden', t.error_rate_1h > .05)}
      ${kpi('Latenz p50 / p95', `${ms(t.p50_ms_1h)} <small>/ ${ms(t.p95_ms_1h)}</small>`, 'letzte Stunde, erfolgreiche Anfragen', '', '#kunden', t.p95_ms_1h > 5000)}
      ${kpi('Gateway · Attester', `${gwOk === true ? '<span class="dot ok"></span> online' : gwOk === false ? '<span class="dot crit"></span> gestört' : '–'}`, isNum(att.total) ? `Attester ${att.up}/${att.total} aktiv` : 'Attester: kein Stand', '', '#kapazitaet', gwOk === false)}
      ${kpi('Umsatz heute', eur(mon.revenue?.today), `gestern ${eur(mon.revenue?.yesterday)} · 7 T ${eur(mon.revenue?.d7, 0)}`, sparkSVG((mon.revenue?.daily_60d || []).slice(-14).map(d => d.net), '--s3'), '#geld')}
      ${kpi('Braucht dich', needsN ? `${needsN} offen` : 'Nichts offen', needsN ? 'Karten &amp; fällige Entscheidungen' : 'keine offenen Karten', '', '#dich', needsN > 0 ? 'warn' : false)}
    </div>
  </section>`;
}

function renderNeeds() {
  const m = meta('ops'), n = m.data?.needs;
  const all = (n?.cards || []).slice().sort((a, b) => a.age_h - b.age_h);
  const cards = all.filter(c => c.age_h <= 168), older = all.filter(c => !(c.age_h <= 168)), due = n?.due || [];
  const li = c => `<li><span class="pill ${c.age_h > 24 ? 'warn' : ''}">#${esc(c.card)}</span><div><div class="n-title">${esc(c.title)}</div><div class="n-meta">${c.source && c.source !== 'unknown' ? esc(c.source) + ' · ' : ''}${c.buttons ? 'mit Knöpfen' : 'Antwort per Text'}</div></div><span class="age">${ageH(c.age_h)}</span></li>`;
  let body;
  if (!n) body = noData('Keine Daten zu offenen Karten.');
  else if (!cards.length && !due.length) body = `<div class="empty"><span class="big" aria-hidden="true">✓</span><div><b>Nichts offen.</b><div class="muted">Keine Karte der letzten 7 Tage wartet auf deine Antwort.</div></div></div>`;
  else body = `<ul class="needs">${cards.map(li).join('')}
    ${due.map(d => `<li><span class="pill warn">fällig</span><div><div class="n-title">${esc(d.title)}</div><div class="n-meta">${esc(d.owner || '')}${d.due ? ' · bis ' + esc(new Date(d.due).toLocaleString(LOC, {day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin'})) : ''}</div></div><span class="age">${esc(d.id)}</span></li>`).join('')}</ul>`;
  if (older.length) body += `<details class="more"><summary>${older.length} ältere offene Karte${older.length === 1 ? '' : 'n'} (über 7 Tage, vermutlich überholt)</summary><ul class="needs">${older.map(li).join('')}</ul></details>`;
  return `<section class="sec" id="dich"><header><h2>Braucht dich</h2><span class="sec-sum">${cards.length + due.length ? `${cards.length} Karte${cards.length === 1 ? ' wartet' : 'n warten'} auf dich${due.length ? `, ${due.length} fällige Entscheidung${due.length === 1 ? '' : 'en'}` : ''}.` : 'Gerade wartet nichts auf dich.'}</span></header>
    ${card({title: 'Offene Telegram-Karten &amp; Entscheidungen', sub: 'Nur Karten mit Frage an dich, unbeantwortet und nicht erledigt', as_of: n?.as_of || m.as_of, maxAge: 45, body, error: m.error})}</section>`;
}
const ageH = h => !isNum(h) ? '' : h < 1 ? `${Math.round(h * 60)} min` : h < 48 ? `${nf(h < 10 ? 1 : 0).format(h)} h` : `${Math.round(h / 24)} T`;

function renderMoney() {
  const m = meta('money'), d = m.data || {}, r = d.revenue || {}, sp = d.spend || {}, mg = d.margin || {};
  const ra = r.as_of, sa = sp.as_of;
  const daily0 = (r.daily_60d || []).slice(-60), fi = daily0.findIndex(x => x.net > 0), daily = fi > 3 ? daily0.slice(fi - 1) : daily0;
  const wizShare = r.wizville_share_30d;
  const top = r.top_customers_30d || [];
  // takeaway headline
  const d7c = isNum(r.d7) && isNum(r.d7_prev) && r.d7_prev > 0 ? (r.d7 - r.d7_prev) / r.d7_prev : null;
  const exWiz7 = daily.slice(-7).reduce((a, x) => a + (x.net - (x.wizville || 0)), 0), exWizPrev = daily.slice(-14, -7).reduce((a, x) => a + (x.net - (x.wizville || 0)), 0);
  const revTitle = !daily.length ? 'Tagesumsatz' : `Umsatz 7 Tage ${d7c === null ? '' : d7c >= 0 ? `+${nf(0).format(d7c * 100)} %` : `−${nf(0).format(-d7c * 100)} %`} — ohne ${esc(FOCUS)} ${exWizPrev > 0 ? (exWiz7 >= exWizPrev ? '+' : '−') + nf(0).format(Math.abs(exWiz7 - exWizPrev) / exWizPrev * 100) + ' %' : eur(exWiz7, 0)}`;
  mount('ch-rev', n => columns(n, {cats: daily.map(x => ({label: dshort(new Date(x.date)), long: new Date(x.date).toLocaleDateString(LOC, {weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC'}), partial: x.date === daily.at(-1)?.date})), series: [{name: FOCUS, color: '--s2', values: daily.map(x => x.wizville || 0)}, {name: 'Alle anderen', color: '--s1', values: daily.map(x => Math.max(0, x.net - (x.wizville || 0)))}], tipfmt: v => eur(v), yfmt: v => tick(v) + ' €'}));
  const revenueCard = card({title: 'Umsatz', sub: 'Netto-Aufladungen externer Kunden, ohne interne Konten', as_of: ra, maxAge: 75, error: r.ok === false ? r.error : null, body: `
    <div class="stats">
      <div class="stat"><div class="s-label">Heute</div><div class="s-value">${eur(r.today)}</div><div class="s-delta">${delta(r.today, r.yesterday, {label: 'vs. gestern', abs: true})}</div></div>
      <div class="stat"><div class="s-label">7 Tage</div><div class="s-value">${eur(r.d7)}</div><div class="s-delta">${delta(r.d7, r.d7_prev, {label: 'vs. Vorwoche'})}</div></div>
      <div class="stat"><div class="s-label">30 Tage</div><div class="s-value">${eur(r.d30)}</div><div class="s-delta">${delta(r.d30, r.d30_prev, {label: 'vs. Vormonat'})}</div></div>
      <div class="stat"><div class="s-label">Zahlende Kunden 30 T</div><div class="s-value">${num(r.payers_30d)}</div><div class="s-delta">${delta(r.payers_30d, r.payers_30d_prev, {label: 'vs. davor', abs: true})}</div></div>
      <div class="stat"><div class="s-label">Neue Zahler 7 T</div><div class="s-value">${num(r.new_payers_7d)}</div><div class="s-delta">${delta(r.new_payers_7d, r.new_payers_prev_7d, {label: 'vs. Vorwoche', abs: true})}</div></div>
      <div class="stat"><div class="s-label">${esc(FOCUS)}-Anteil 30 T</div><div class="s-value">${pct(wizShare, 0)}</div><div class="s-delta muted">Monat bisher ${eur(r.mtd, 0)}</div></div>
    </div>`});
  const chartCard = card({title: esc(revTitle), sub: `Netto pro Tag seit ${daily.length ? dshort(new Date(daily[0].date)) : '–'} · heutiger Tag läuft noch (blass)`, as_of: ra, maxAge: 75, body: `${legend([{name: 'Alle anderen', color: '--s1'}, {name: FOCUS, color: '--s2'}])}<div class="chart" id="ch-rev"></div>`});
  const custCard = card({title: top.length ? `Top-Kunden 30 Tage — ${esc(top[0].label)} ${pct(top[0].share, 0)}` : 'Top-Kunden 30 Tage', sub: 'Netto-Aufladungen, Anteil am 30-Tage-Umsatz', as_of: ra, maxAge: 75, body: top.length ? `<div class="bars">${top.map(c => `<div class="bar-row"><span class="bl">${esc(c.label)}</span><span class="bv">${eur(c.net)} · ${pct(c.share, 0)}</span>${hbar(c.share)}</div>`).join('')}</div>
      ${(r.new_payers || []).length ? `<details class="more"><summary>Neue Zahler (14 Tage): ${r.new_payers.length}</summary><div class="tbl-wrap"><table><thead><tr><th>Kunde</th><th class="r">Erste Zahlung</th><th class="r">Netto</th></tr></thead><tbody>${r.new_payers.map(p => `<tr><td>${esc(p.label)}</td><td class="r">${new Date(p.first_paid).toLocaleDateString(LOC, {day: 'numeric', month: 'short'})}</td><td class="r">${eur(p.net)}</td></tr>`).join('')}</tbody></table></div></details>` : ''}` : noData()});
  const burn = sp.burn_eur_per_h, allIn = isNum(sp.burn_all_in_eur_per_h) ? sp.burn_all_in_eur_per_h : burn;
  const dv = S.derived?.spend || {};
  const now_ = new Date(), dim = new Date(Date.UTC(now_.getUTCFullYear(), now_.getUTCMonth() + 1, 0)).getUTCDate();
  const runRateMonth = isNum(allIn) ? allIn * 24 * dim : null;
  const revDay = isNum(r.d7) ? r.d7 / 7 : null, costDay = isNum(allIn) ? allIn * 24 : null;
  const bal = isNum(revDay) && isNum(costDay) ? revDay - costDay : null;
  const runway = sp.upcloud_runway_days;
  const spendCard = card({title: isNum(allIn) ? `GPU-Kosten ${eur(allIn, 2)}/h — im Monatstempo ${eur(runRateMonth, 0)}` : 'GPU-Kosten', sub: 'Live aus dem Kosten-Monitor (nur gelesen) · nur GPU, ohne CPU-Server, Werbung, Gebühren · USD→EUR fix 1,20', as_of: sa, maxAge: 45, error: sp.ok === false ? sp.error : null, body: `
    <div class="stats">
      <div class="stat"><div class="s-label">Burn jetzt (alles)</div><div class="s-value">${eur(allIn, 2)}<small class="muted">/h</small></div><div class="s-delta muted">davon Kundenbetrieb ${eur(burn, 2)}/h</div></div>
      <div class="stat"><div class="s-label">Heute bisher</div><div class="s-value">${eur(sp.today_eur, 0)}</div><div class="s-delta muted">≈ ${eur(costDay, 0)} pro vollem Tag</div></div>
      <div class="stat"><div class="s-label">Monat bisher</div><div class="s-value">${isNum(dv.mtd_tracked_eur) ? eur(dv.mtd_tracked_eur, 0) : '–'}</div><div class="s-delta muted">${dv.tracked_since ? 'erfasst seit ' + new Date(dv.tracked_since).toLocaleDateString(LOC, {day: 'numeric', month: 'numeric', timeZone: 'UTC'}) : 'noch keine Erfassung'}</div></div>
      <div class="stat"><div class="s-label">Tagesbilanz (Ø 7 T)</div><div class="s-value">${isNum(bal) ? (bal >= 0 ? '+' : '−') + eur(Math.abs(bal), 0) : '–'}</div><div class="s-delta muted">Umsatz ${eur(revDay, 0)} − GPU ${eur(costDay, 0)} pro Tag</div></div>
      <div class="stat"><div class="s-label">UpCloud-Guthaben</div><div class="s-value">${eur(sp.upcloud_credit_eur, 0)}</div><div class="s-delta ${isNum(runway) && runway < .75 ? 'delta bad' : 'muted'}">${isNum(runway) ? `reicht ${runway < 2 ? nf(0).format(runway * 24) + ' h' : nf(1).format(runway) + ' Tage'} · wird laufend aufgeladen` : 'Reichweite unbekannt'}</div></div>
      <div class="stat"><div class="s-label">Burn-Verlauf</div>${sparkSVG((S.history?.points || []).map(p => p.burn), '--s2') || '<div class="s-value muted">–</div>'}<div class="s-delta muted">Kundenbetrieb €/h, 8 Tage</div></div>
    </div>
    ${(sp.by_provider || []).length ? `<details class="more"><summary>Nach Anbieter</summary><div class="tbl-wrap"><table><thead><tr><th>Anbieter</th><th class="r">Knoten</th><th class="r">€/h</th></tr></thead><tbody>${sp.by_provider.map(p => `<tr><td>${esc(p.provider)}</td><td class="r">${num(p.nodes)}</td><td class="r">${eur(p.eur_per_h, 2)}</td></tr>`).join('')}</tbody></table></div></details>` : ''}
    `});
  const hl = isNum(r.d30) ? `${eur(r.d30, 0)} Umsatz in 30 Tagen${isNum(wizShare) ? ` (${esc(FOCUS)} ${pct(wizShare, 0)})` : ''}${isNum(bal) ? `; pro Tag ${eur(revDay, 0)} Umsatz gegen ${eur(costDay, 0)} GPU-Kosten` : ''}.` : 'Umsatzdaten fehlen.';
  return `<section class="sec" id="geld"><header><h2>Geld</h2><span class="sec-sum">${esc(hl)}</span></header>
    ${m.error && !d.revenue ? `<p class="err-note">${esc(m.error)}</p>` : ''}
    <div class="grid g12">${revenueCard}${chartCard}</div>
    <div class="grid g12">${custCard}${spendCard}</div></section>`;
}

function renderTraffic() {
  const m = meta('traffic'), t = m.data || {}, now = t.now || {};
  const raw = t.daily_60d || [], first = raw.findIndex(d => isNum(d.total) && d.total > 0);
  const days = first > 0 ? raw.slice(first) : raw;
  const models = (() => { const tot = {}; days.forEach(d => Object.entries(d.by_model || {}).forEach(([k, v]) => tot[k] = (tot[k] || 0) + v)); return Object.keys(tot).sort((a, b) => (MODEL_ORDER.indexOf(a) + 1 || 99) - (MODEL_ORDER.indexOf(b) + 1 || 99)); })();
  const shown = models.filter(x => MODEL_ORDER.slice(0, 6).includes(x)).slice(0, 5), other = models.filter(x => !shown.includes(x));
  const series = shown.map(x => ({name: x, color: modelColor(x), values: days.map(d => d.by_model?.[x] || 0)}));
  if (other.length) series.push({name: 'Andere', color: '--s-other', values: days.map(d => other.reduce((a, k) => a + (d.by_model?.[k] || 0), 0))});
  mount('ch-daily', n => columns(n, {cats: days.map(d => ({label: dshort(new Date(d.date)), long: new Date(d.date).toLocaleDateString(LOC, {weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC'}), partial: d.partial})), series, tipfmt: v => num(v)}));
  const curve = t.curve_24h_vs_last_week || [];
  mount('ch-curve', n => lines(n, {series: [{name: 'Letzte 24 h', color: '--s1', area: true, pts: curve.map(r => [new Date(r[0]), r[1]])}, {name: 'Gleiche Zeit vor 7 Tagen', color: '--muted', dash: true, pts: curve.map(r => [new Date(r[0]), r[2]])}]}));
  mount('ch-heat', n => heatmap(n, t.heatmap_28d));
  const d24 = isNum(now.requests_24h) && isNum(now.requests_prev_24h) && now.requests_prev_24h ? (now.requests_24h - now.requests_prev_24h) / now.requests_prev_24h : null;
  const wk = curve.reduce((a, r) => a + (r[1] || 0), 0), wkPrev = curve.reduce((a, r) => a + (r[2] || 0), 0);
  const curveTitle = wkPrev ? `Letzte 24 h ${wk >= wkPrev ? '+' : '−'}${nf(0).format(Math.abs(wk - wkPrev) / wkPrev * 100)} % gegenüber der Vorwoche` : 'Letzte 24 h gegenüber der Vorwoche';
  const last7 = days.filter(d => !d.partial).slice(-7).reduce((a, d) => a + d.total, 0), prev7 = days.filter(d => !d.partial).slice(-14, -7).reduce((a, d) => a + d.total, 0);
  const wiz7 = days.filter(d => !d.partial).slice(-7).reduce((a, d) => a + (d.wizville || 0), 0);
  const dailyTitle = prev7 ? `${compact(last7)} Anfragen in 7 Tagen (${last7 >= prev7 ? '+' : '−'}${nf(0).format(Math.abs(last7 - prev7) / prev7 * 100)} %), ${pct(last7 ? wiz7 / last7 : null, 0)} von ${esc(FOCUS)}` : 'Anfragen pro Tag nach Modell';
  const peak = (t.heatmap_28d || []).reduce((b, c) => c[2] > (b?.[2] || 0) ? c : b, null);
  const mt = t.models_24h || [];
  const cust = t.customers_7d || {};
  const sig = meta('money').data?.revenue?.signups || {};
  const sigDaily = sig.daily_30d || [];
  mount('ch-sig', n => columns(n, {height: 120, cats: sigDaily.map(r => ({label: dshort(new Date(r[0])), long: new Date(r[0]).toLocaleDateString(LOC, {weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC'})})), series: [{name: 'Registrierungen', color: '--s1', values: sigDaily.map(r => r[1])}]}));
  return `<section class="sec" id="kunden"><header><h2>Kunden &amp; Traffic</h2><span class="sec-sum">${isNum(now.requests_24h) ? `${compact(now.requests_24h)} Anfragen in 24 h ${d24 !== null ? `(${d24 >= 0 ? '+' : '−'}${nf(0).format(Math.abs(d24) * 100)} % zum Vortag)` : ''}, ${num(cust.active_accounts)} aktive Konten in 7 Tagen.` : 'Keine Traffic-Daten.'}</span></header>
    ${m.error ? `<p class="err-note">Traffic-Quelle: ${esc(m.error)}</p>` : ''}
    <div class="grid g21">
      ${card({title: esc(dailyTitle), sub: `${days.length < raw.length ? 'Seit Beginn der Log-Aufbewahrung (' + dshort(new Date(days[0].date)) + ')' : '60 Tage'}, nach Modell · Tag in UTC`, as_of: m.as_of, maxAge: 30, body: `${legend(series.map(s => ({name: s.name, color: s.color})))}<div class="chart" id="ch-daily"></div>`})}
      ${card({title: esc(curveTitle), sub: 'Anfragen pro Stunde, Uhrzeit Berlin', as_of: m.as_of, maxAge: 30, body: `${legend([{name: 'Letzte 24 h', color: '--s1', kind: 'line'}, {name: 'Vor 7 Tagen', color: '--muted', kind: 'dash'}])}<div class="chart" id="ch-curve"></div>`})}
    </div>
    <div class="grid g21">
      ${card({title: mt.length ? `Modelle 24 h — ${esc(modelName(mt[0].model))} trägt ${pct(mt[0].requests / mt.reduce((a, x) => a + x.requests, 0), 0)}` : 'Modelle 24 h', sub: 'Latenz über erfolgreiche Anfragen', as_of: m.as_of, maxAge: 30, body: mt.length ? `<div class="tbl-wrap"><table><thead><tr><th>Modell</th><th class="r">Anfragen</th><th class="r hide-sm">Δ Vortag</th><th class="r">Fehler</th><th class="r hide-sm">p50</th><th class="r">p95</th></tr></thead><tbody>${mt.map(x => `<tr><td><span class="legend"><span><i data-c="${modelColor(x.model)}"></i>${esc(modelName(x.model))}</span></span></td><td class="r">${num(x.requests)}</td><td class="r hide-sm">${delta(x.requests, x.requests_prev_24h)}</td><td class="r">${x.error_rate > .05 ? '⚠ ' : ''}${pct(x.error_rate)}</td><td class="r hide-sm">${ms(x.p50_ms)}</td><td class="r">${ms(x.p95_ms)}</td></tr>`).join('')}</tbody></table></div>` : noData()})}
      ${card({title: peak ? `Spitze: ${wd[peak[0]]} ${peak[1]}–${peak[1] + 1} Uhr UTC` : 'Wochentag × Stunde', sub: 'Anfragen der letzten 4 Wochen, Uhrzeit UTC, dunkler = mehr', as_of: m.as_of, maxAge: 30, body: `<div class="chart" id="ch-heat"></div>`})}
    </div>
    <div class="grid g2">
      ${card({title: cust.top?.length ? `Aktivste Konten 7 Tage — ${esc(custLabel(cust.top[0].label))} ${pct(cust.top[0].share, 0)}` : 'Aktivste Konten 7 Tage', sub: `${num(cust.active_accounts)} aktive Konten ${delta(cust.active_accounts, cust.active_accounts_prev_7d, {label: 'vs. Vorwoche', abs: true})}`, as_of: m.as_of, maxAge: 30, body: cust.top?.length ? `<div class="bars">${cust.top.map(c => `<div class="bar-row"><span class="bl">${esc(custLabel(c.label))}</span><span class="bv">${compact(c.requests)} · ${pct(c.share, c.share < .01 ? 1 : 0)}</span>${hbar(c.share)}</div>`).join('')}</div>` : noData()})}
      ${card({title: `Registrierungen: ${num(sig.d7)} in 7 Tagen`, sub: `${delta(sig.d7, sig.d7_prev, {label: 'vs. Vorwoche', abs: true})} · heute ${num(sig.today)} · Erstzahler 30 T: ${num(sigDaily.reduce((a, r) => a + (r[2] || 0), 0))}`, as_of: meta('money').data?.revenue?.as_of, maxAge: 75, body: sigDaily.length ? '<div class="chart" id="ch-sig"></div>' : noData()})}
    </div></section>`;
}

function renderCapacity() {
  const m = meta('capacity'), c = m.data || {};
  const nodes = c.nodes || [], models = c.models || [], sat = c.saturation || {};
  const serving = nodes.filter(n => n.state === 'serving').length;
  const stateWord = {serving: 'bedient', idle: 'leer', starting: 'startet', draining: 'fährt runter', down: 'aus'};
  const stateLvl = {serving: 'ok', idle: 'warn', starting: 'warn', draining: 'warn', down: 'crit'};
  const kindWord = {base: 'Basis', burst: 'Burst', rental: 'Miete'};
  const maxReq = Math.max(1, ...nodes.map(n => n.req_15m || 0));
  const hl = nodes.length ? `${serving} von ${nodes.length} Knoten bedienen Anfragen; ${num(sat.capacity_rejections_1h)} Kapazitäts-Ablehnungen in der letzten Stunde.` : 'Keine Flottendaten.';
  return `<section class="sec" id="kapazitaet"><header><h2>Kapazität</h2><span class="sec-sum">${esc(hl)}</span></header>
    ${m.error ? `<p class="err-note">${esc(m.error)}</p>` : ''}
    <div class="grid g21">
      ${card({title: `Flotte: ${serving} von ${nodes.length} Knoten bedienen${c.burst?.active ? `, ${c.burst.active} Burst aktiv` : ''}`, sub: 'Auslastung = Anfragen der letzten 15 min je Knoten; „leer“ = bereit, aber ohne Anfragen', as_of: m.as_of, maxAge: 30, body: nodes.length ? (() => {
        const order = {serving: 0, starting: 1, draining: 2, idle: 3, down: 4};
        const sorted = nodes.slice().sort((a, b) => (order[a.state] ?? 5) - (order[b.state] ?? 5) || (b.req_15m || 0) - (a.req_15m || 0));
        const row = n => `<li><span class="t"><span class="dot ${stateLvl[n.state] || 'off'}" aria-hidden="true"></span><span title="${esc(n.name)}">${esc(shortNode(n.name))}</span></span><span class="v">${isNum(n.req_15m) ? num(n.req_15m) : '–'}</span><span class="m">${esc([(n.models || []).join(', '), n.provider, kindWord[n.kind] || n.kind, n.gpu].filter(Boolean).join(' · '))}</span><span class="vm muted">${n.state ? esc(stateWord[n.state] || n.state) : 'Maschine'}</span>${isNum(n.req_15m) && n.req_15m > 0 ? `<span class="full">${hbar(n.req_15m / maxReq)}</span>` : ''}</li>`;
        return `<ul class="rl">${sorted.slice(0, 10).map(row).join('')}</ul>${sorted.length > 10 ? `<details class="more"><summary>Weitere ${sorted.length - 10} Knoten</summary><ul class="rl">${sorted.slice(10).map(row).join('')}</ul></details>` : ''}`; })() : noData()})}
      ${card({title: 'Sättigung', sub: 'Gateway, Attester und Warteschlange', as_of: m.as_of, maxAge: 30, body: `
        <dl class="kv">
          <dt>Gateway</dt><dd>${c.gateway ? `<span class="pill ${c.gateway.ok ? 'ok' : 'crit'}"><span class="dot ${c.gateway.ok ? 'ok' : 'crit'}"></span>${c.gateway.ok ? 'online' : 'gestört'}</span>` : '–'}</dd>
          <dt>Attester</dt><dd>${isNum(c.attesters?.total) ? `${c.attesters.up} / ${c.attesters.total} aktiv` : '–'}</dd>
          <dt>Kapazitäts-Ablehnungen 1 h</dt><dd>${num(sat.capacity_rejections_1h)}</dd>
          <dt>Wartezeit p95 1 h</dt><dd>${ms(sat.queue_wait_p95_ms_1h)}</dd>
          <dt>Burst-Knoten aktiv</dt><dd>${num(c.burst?.active)}</dd>
          <dt>Freie Angebote am Markt</dt><dd>${isNum(c.market?.available_offers) ? `${c.market.available_offers} von ${c.market.checked}` : '–'}</dd>
        </dl>
        <p class="sub">Attester gilt als aktiv, wenn er in den letzten 3 Minuten bestätigt hat. Marktangebote = freie GPU-Angebote je Modell/Region/GPU-Typ.</p>`})}
    </div>
    ${card({title: 'Wo läuft welches Modell', sub: 'Lineup-Modelle, Knoten und Anfragen der letzten 15 min', as_of: m.as_of, maxAge: 30, body: models.length ? `<ul class="rl">${models.slice().sort((a, b) => (b.req_15m || 0) - (a.req_15m || 0)).map(x => `<li><span class="t"><i class="sw" data-c="${modelColor(x.model)}"></i><span>${esc(x.model)}</span></span><span class="v">${num(x.req_15m)} <span class="muted">Anfr.</span></span><span class="m full">${(x.nodes || []).length ? `${x.nodes.length} Knoten: ${esc(x.nodes.map(shortNode).join(', '))}` : ''}</span>${(x.nodes || []).length ? '' : '<span class="full"><span class="pill crit"><span class="dot crit"></span>auf keinem Knoten</span></span>'}</li>`).join('')}</ul>` : noData()})}
  </section>`;
}

function renderSN92() {
  const m = meta('sn92'), s = m.data || {};
  const rk = s.rankings || [], sub = s.subnet || {};
  const best = rk.filter(x => isNum(x.rank)).sort((a, b) => a.rank / (a.of || 1) - b.rank / (b.of || 1))[0];
  const hl = best ? `Bestes Ergebnis: ${best.model} auf Platz ${best.rank} von ${best.of} im ${best.index}.` : 'Keine Ranking-Daten.';
  const subRows = [];
  if (sub.validator) subRows.push(['Validator', `Block ${num(sub.validator.block)} · v${sub.validator.version || '?'}`]);
  if (sub.weights) subRows.push(['Gewicht Owner-UID ' + (sub.weights.owner_uid ?? '?'), pct(sub.weights.owner_weight, 1)], ['Gewicht Anker-UID ' + (sub.weights.anchor_uid ?? '?'), pct(sub.weights.anchor_weight, 2)]);
  (sub.engine_tracks?.list || []).forEach(t => subRows.push([`Engine-Track ${t.track}`, `Champion UID ${t.champion_uid ?? '–'}${t.challenger_uid != null ? ' · Herausforderer ' + t.challenger_uid : ''}`]));
  (sub.miner_tracks?.list || []).forEach(t => { subRows.push([`Miner-Track ${t.track}`, `Champion UID ${t.champion_uid ?? '–'}${t.since ? ' seit ' + new Date(t.since).toLocaleDateString(LOC, {day: 'numeric', month: 'short'}) : ''}`]); const b = t.miners_by_status || {}; subRows.push(['Einreichungen', `${num(Object.values(b).reduce((a, x) => a + x, 0))} gesamt · ${num(b.pending_confirm || 0)} in Prüfung · Warteschlange ${num(t.queue_len)}`]); });
  subRows.push(['Emissionen', sub.emissions?.ok === false ? 'kein aktueller Stand' : '–']);
  return `<section class="sec" id="sn92"><header><h2>SN92 &amp; Modelle</h2><span class="sec-sum">${esc(hl)}</span></header>
    <div class="grid g21">
      ${card({title: 'Unsere Modelle in den Rankings', sub: 'HF Decision Index und AA DI v2 · Platz = Rang unter allen gelisteten Modellen', as_of: m.as_of, maxAge: 60 * 36, error: m.error, body: rk.length ? `<ul class="rl">${rk.slice().sort((a, b) => (a.index < b.index ? 1 : a.index > b.index ? -1 : 0) || (a.rank ?? 999) - (b.rank ?? 999)).map(x => `<li><span class="t"><span>${esc(x.model)}</span></span><span class="v">${isNum(x.rank) ? `<span class="rank">${num(x.rank)}</span> <span class="muted">/ ${num(x.of)}</span>` : '<span class="muted">nicht gelistet</span>'}</span><span class="m">${esc(x.index)} · Score ${isNum(x.score) ? num(x.score, 1) : '–'} · Spitze ${esc(x.leader || '–')} · ${x.as_of ? ago(x.as_of) : ''}</span><span class="vm">${isNum(x.previous_rank) && isNum(x.rank) ? delta(-x.rank, -x.previous_rank, {abs: true, label: 'Plätze'}) : ''}</span></li>`).join('')}</ul>` : noData()})}
      ${card({title: 'Subnetz 92', sub: 'Champion, Miner und Emissionen (Zahlen ohne Bewertung)', as_of: sub.as_of || m.as_of, maxAge: 60 * 36, body: subRows.length ? `<dl class="kv">${subRows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl><p class="sub">Gewichte = Anteil im Gewichtsvektor unseres Validators, keine ausgezahlten Emissionen.</p>` : noData()})}
    </div></section>`;
}

function renderOps() {
  const m = meta('ops'), o = m.data || {};
  const q0 = o.quota || [], quota = q0.some(q => /^claude-/.test(q.engine)) ? q0.filter(q => q.engine !== 'claude') : q0;
  const u = o.urgent_7d || {}, jobs = o.jobs || {}, disk = o.disk || [], h = o.health || {};
  const fu = h.failed_units || {};
  const fuN = Object.values(fu).reduce((a, b) => a + (b || 0), 0);
  const fullest = disk.slice().sort((a, b) => b.used_pct - a.used_pct)[0];
  const hl = `${num(jobs.running)} Agenten-Jobs laufen; ${num(u.forwarded)} dringende Meldungen an dich in 7 Tagen, ${num(u.absorbed)} vom Filter abgefangen${fullest ? `; vollster Server ${fullest.server} mit ${nf(0).format(fullest.used_pct)} %` : ''}.`;
  const ud = u.daily || [];
  mount('ch-urg', n => columns(n, {height: 110, cats: ud.map(r => ({label: new Date(r[0]).toLocaleDateString(LOC, {weekday: 'short', timeZone: 'UTC'}), long: new Date(r[0]).toLocaleDateString(LOC, {weekday: 'long', day: 'numeric', month: 'short', timeZone: 'UTC'})})), series: [{name: 'Abgefangen', color: '--s-other', values: ud.map(r => r[2])}, {name: 'An dich weitergeleitet', color: '--s1', values: ud.map(r => r[1])}]}));
  return `<section class="sec" id="betrieb"><header><h2>Betrieb</h2><span class="sec-sum">${esc(hl)}</span></header>
    ${m.error ? `<p class="err-note">${esc(m.error)}</p>` : ''}
    <div class="grid g3">
      ${card({title: `Dringend 7 Tage: ${num(u.forwarded)} weitergeleitet`, sub: `${num(u.absorbed)} vom Dringend-Filter abgefangen`, as_of: u.as_of || m.as_of, maxAge: 180, body: ud.length ? `${legend([{name: 'An dich', color: '--s1'}, {name: 'Abgefangen', color: '--s-other'}])}<div class="chart" id="ch-urg"></div>` : noData()})}
      ${card({title: 'Server-Speicher', sub: 'Belegung der Systemplatte', as_of: disk[0]?.as_of || m.as_of, maxAge: 45, body: disk.length ? `<div class="bars">${disk.map(d => `<div class="meter-row"><span>${d.used_pct >= 85 ? '⚠ ' : ''}${esc(d.server)}</span><span class="num muted">${nf(0).format(d.used_pct)} % · ${num(d.free_gb)} GB frei</span>${meterSVG(d.used_pct / 100, .85, .92)}</div>`).join('')}</div>` : noData()})}
      ${card({title: 'Kontingente der Agenten', sub: 'Verbrauch; Strich = Soll-Tempo bis zum Reset (darunter = im Plan)', as_of: m.as_of, maxAge: 45, body: quota.length ? `<div class="bars">${quota.map(q => `<div class="meter-row"><span>${esc(q.engine)}</span><span class="num muted">${pct(q.used_pct / 100, 0)}${isNum(q.pace_pct) ? ` · Soll ${pct(q.pace_pct / 100, 0)}` : ''}</span>${meterSVG(q.used_pct / 100, .8, .95, isNum(q.pace_pct) ? q.pace_pct / 100 : undefined)}</div>`).join('')}</div>` : noData()})}
    </div>
    <div class="grid g2">
      ${card({title: `${num(jobs.running)} Agenten-Jobs laufen`, sub: 'Jobs mit aktivem Prozess', as_of: jobs.as_of || m.as_of, maxAge: 45, body: (jobs.list || []).length ? `<div class="tbl-wrap"><table><thead><tr><th>Job</th><th>Engine</th><th class="r">seit</th></tr></thead><tbody>${jobs.list.slice(0, 8).map(j => `<tr><td>${esc(j.name)}</td><td>${esc(j.engine || '')}</td><td class="r">${j.started ? ago(j.started).replace('vor ', '') : '–'}</td></tr>`).join('')}</tbody></table></div>${jobs.list.length > 8 ? `<details class="more"><summary>Alle ${jobs.list.length} anzeigen</summary><div class="tbl-wrap"><table><tbody>${jobs.list.slice(8).map(j => `<tr><td>${esc(j.name)}</td><td>${esc(j.engine || '')}</td><td class="r">${j.started ? ago(j.started).replace('vor ', '') : '–'}</td></tr>`).join('')}</tbody></table></div></details>` : ''}` : noData('Keine laufenden Jobs gefunden.')})}
      ${card({title: fuN ? `${fuN} fehlgeschlagene Dienste` : 'Alle Dienste laufen', sub: `Sandy ${num(fu.Sandy)} · LeChonk ${num(fu.LeChonk)} · sandy-prod ${num(fu['sandy-prod'])}`, as_of: h.as_of, maxAge: 90, body: (h.findings || []).length ? `<ul class="reasons">${h.findings.slice(0, 6).map(f => `<li><span class="dot warn" aria-hidden="true"></span><span>${esc(f)}</span></li>`).join('')}</ul>` : `<div class="empty"><span class="big" aria-hidden="true">✓</span><span>Keine offenen Befunde.</span></div>`})}
    </div></section>`;
}

/* ---------- render ---------- */
function render() {
  if (!S) return;
  charts.length = 0;
  const parts = [renderHero, renderNeeds, renderMoney, renderTraffic, renderCapacity, renderSN92, renderOps];
  $('#app').innerHTML = parts.map(f => { try { return f(); } catch (e) { console.error(e); return `<p class="err-note">Bereich konnte nicht angezeigt werden (${esc(e.message)}).</p>`; } }).join('');
  paintLegends(document);
  drawAll();
  const a = S.as_of ? new Date(S.as_of) : null;
  $('#stand').textContent = a ? `Stand ${hhmm(a)} Uhr · ${ago(S.as_of)}` : 'Kein Stand';
  // status dot on chips
  const lvl = {}; (S.status?.sections ? Object.entries(S.status.sections) : []).forEach(([k, v]) => lvl[k] = v);
  document.querySelectorAll('.chips a').forEach(a => { const k = {'#geld': 'money', '#kunden': 'traffic', '#kapazitaet': 'capacity', '#sn92': 'sn92', '#betrieb': 'ops'}[a.getAttribute('href')]; a.querySelector('.dot')?.remove(); if (k && lvl[k] && lvl[k] !== 'ok') a.insertAdjacentHTML('afterbegin', `<span class="dot ${lvl[k]}" aria-label="${lvl[k] === 'crit' ? 'Kritisch' : 'Achtung'}"></span>`); });
}
async function load() {
  try {
    const r = await fetch('/api/data', {cache: 'no-store', credentials: 'same-origin'});
    if (r.status === 401) { location.reload(); return; }
    if (!r.ok) throw new Error('HTTP ' + r.status);
    S = await r.json(); FOCUS = S.focus_label || 'Hauptkunde'; lastLoad = Date.now(); render();
  } catch (e) { $('#stand').textContent = 'Laden fehlgeschlagen — zeige letzten Stand'; }
}
/* theme toggle: OS default, explicit choice wins */
const root = document.documentElement, saved = localStorage.getItem('theme');
if (saved) root.dataset.theme = saved;
$('#theme').addEventListener('click', () => { const dark = root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches; root.dataset.theme = dark ? 'light' : 'dark'; localStorage.setItem('theme', root.dataset.theme); render(); });
let rt; addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(drawAll, 120); });
document.addEventListener('scroll', hideTip, {passive: true});
document.addEventListener('visibilitychange', () => { if (!document.hidden && Date.now() - lastLoad > 60000) load(); });
setInterval(() => { if (!document.hidden) load(); }, 60000);
load();
})();
