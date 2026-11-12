import { STRINGS } from './i18n.js';
import { TODAY, PREINDUSTRIAL, RANGES, PRESETS, SOURCES, computeClimate, co2FromEnergy, co2FromTransport, methaneFromLivestock, co2e, splitGhg } from './model.js';
import { Globe } from './globe.js';

// ---------------- State ----------------
// CO2 and methane are tracked separately inside; the learner sees one "greenhouse gases"
// slider (CO2-equivalent). Energy and transport push CO2; livestock pushes methane.
const state = {
  co2Base: TODAY.co2,
  ch4Base: TODAY.methane,
  clean: TODAY.clean,
  transport: TODAY.transport,
  livestock: TODAY.livestock,
  lang: 'en',
  heatMap: false,
  labels: false,  // labels on the globe start hidden
  more: false,    // cards under "What is happening?" are hidden until "Show more"
};
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
// CO2 and methane, each inside its own range, and together never past the ends of the greenhouse-gas slider
function gasNow() {
  const co2 = clamp(state.co2Base + co2FromEnergy(state.clean) + co2FromTransport(state.transport), RANGES.co2.min, RANGES.co2.max);
  const ch4 = clamp(state.ch4Base + methaneFromLivestock(state.livestock), RANGES.methane.min, RANGES.methane.max);
  const e = co2e(co2, ch4), g = RANGES.ghg;
  if (e > g.max || e < g.min) { const s = splitGhg(clamp(e, g.min, g.max), co2, ch4); return { co2: s.co2, ch4: s.methane }; }
  return { co2, ch4 };
}
const co2Now = () => gasNow().co2;
const ch4Now = () => gasNow().ch4;
const ghgNow = () => co2e(co2Now(), ch4Now());
const t = (k) => STRINGS[state.lang][k];
const fmt = (n, d = 0) => Number(n).toFixed(d);
const GHG_TODAY = co2e(TODAY.co2, TODAY.methane);

// ---------------- Vertical sliders ----------------
const SLIDERS = {
  ghg:       { side: 'left',  key: 'ghg',       label: 's_ghg',       sub: 's_ghg_sub',       unit: 's_ghg_unit',       help: 's_ghg_help',       color: '#6b7783', marks: [{ v: GHG_TODAY, k: 'todayMark' }, { v: PREINDUSTRIAL.co2, k: 'm1750' }, { v: 176, k: 'mIceAge' }] },
  clean:     { side: 'left',  key: 'clean',     label: 's_clean',     sub: 's_clean_sub',     unit: 's_clean_unit',     help: 's_clean_help',     color: '#e8b923', marks: [{ v: TODAY.clean, k: 'todayMark' }] },
  transport: { side: 'right', key: 'transport', label: 's_transport', sub: 's_transport_sub', unit: 's_transport_unit', help: 's_transport_help', color: '#28A8E0', marks: [{ v: TODAY.transport, k: 'todayMark' }] },
  livestock: { side: 'right', key: 'livestock', label: 's_livestock', sub: 's_livestock_sub', unit: 's_livestock_unit', help: 's_livestock_help', color: '#a08a5b', marks: [{ v: TODAY.livestock, k: 'todayMark' }] },
};
const ICONS = {
  ghg: '<svg viewBox="0 0 32 32"><path d="M9 24h15a6 6 0 0 0 0-12 8 8 0 0 0-15-1 6 6 0 0 0 0 13z" fill="#8a96a3"/><text x="16" y="21" font-size="8" font-weight="800" text-anchor="middle" fill="#fff">CO₂</text></svg>',
  livestock: '<svg viewBox="0 0 32 32"><ellipse cx="15" cy="19" rx="10" ry="6" fill="#fff" stroke="#14146C" stroke-width="2"/><circle cx="11" cy="18" r="2" fill="#14146C"/><circle cx="18" cy="21" r="2.4" fill="#14146C"/><circle cx="25" cy="14" r="4" fill="#fff" stroke="#14146C" stroke-width="2"/><path d="M7 25v4M21 25v4" stroke="#14146C" stroke-width="2.4" stroke-linecap="round"/><path d="M27 6c1 1.5 2.5 2 3 1.5M27 4c.8 1 2 1.2 2.4.8" stroke="#8a96a3" stroke-width="1.4" fill="none" stroke-linecap="round"/></svg>',
  clean: '<svg viewBox="0 0 32 32"><circle cx="11" cy="11" r="5" fill="#f5c518"/><g stroke="#f5c518" stroke-width="2" stroke-linecap="round"><path d="M11 2v2M11 18v2M2 11h2M18 11h2M4.6 4.6l1.4 1.4M16 16l1.4 1.4M4.6 17.4 6 16M16 6l1.4-1.4"/></g><path d="M23 14v16" stroke="#14146C" stroke-width="2"/><path d="M23 14l-6-3M23 14l6-3M23 14v-7" stroke="#14146C" stroke-width="2" stroke-linecap="round"/></svg>',
  transport: '<svg viewBox="0 0 32 32"><path d="M5 20l2.5-7c.4-1.2 1.5-2 2.8-2h11.4c1.3 0 2.4.8 2.8 2L27 20v5a1 1 0 0 1-1 1h-2a1 1 0 0 1-1-1v-1H9v1a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1z" fill="#28A8E0"/><path d="M8.5 18l1.8-5h11.4l1.8 5z" fill="#fff"/><circle cx="9.5" cy="21" r="1.6" fill="#fff"/><circle cx="22.5" cy="21" r="1.6" fill="#fff"/><path d="M17 3l-3 5h3l-2 4 5-6h-3l2-3z" fill="#f5c518"/></svg>',
};

function buildSlider(cfg) {
  const r = RANGES[cfg.key];
  const el = document.createElement('div');
  el.className = 'vslider';
  el.innerHTML = `
    <div class="vs-value"><b></b> <span class="vs-unit"></span></div>
    <div class="vs-track" role="slider" tabindex="0" aria-valuemin="${r.min}" aria-valuemax="${r.max}">
      <div class="vs-fill" style="--c:${cfg.color}"></div>
      ${cfg.marks.map((m, i) => `<div class="vs-mark" data-m="${i}"><span></span></div>`).join('')}
      <div class="vs-knob"></div>
    </div>
    <div class="vs-label"><span class="vs-icon">${ICONS[cfg.key]}</span><span class="vs-name"></span></div>
    <div class="vs-detail"></div>
    <button class="vs-help" aria-expanded="false">?</button>
    <div class="vs-tip" role="tooltip"></div>
    <div class="vs-linked"></div>`;
  const track = el.querySelector('.vs-track');
  const setFromY = (clientY) => {
    const rect = track.getBoundingClientRect();
    const knobR = 28;
    const f = clamp((rect.bottom - knobR - clientY) / (rect.height - 2 * knobR), 0, 1);
    setValue(cfg.key, r.min + f * (r.max - r.min));
  };
  track.addEventListener('pointerdown', (e) => {
    track.setPointerCapture(e.pointerId); track.classList.add('dragging'); setFromY(e.clientY);
  });
  track.addEventListener('pointermove', (e) => { if (track.hasPointerCapture(e.pointerId)) setFromY(e.clientY); });
  track.addEventListener('pointerup', () => track.classList.remove('dragging'));
  track.addEventListener('keydown', (e) => {
    const big = (r.max - r.min) / 10, small = (r.max - r.min) / 50;
    const map = { ArrowUp: small, ArrowRight: small, ArrowDown: -small, ArrowLeft: -small, PageUp: big, PageDown: -big };
    if (e.key in map) { e.preventDefault(); setValue(cfg.key, getValue(cfg.key) + map[e.key]); }
    if (e.key === 'Home') setValue(cfg.key, r.min);
    if (e.key === 'End') setValue(cfg.key, r.max);
  });
  const help = el.querySelector('.vs-help');
  help.addEventListener('click', () => {
    const open = el.classList.toggle('tip-open');
    help.setAttribute('aria-expanded', open);
  });
  cfg.el = el;
  return el;
}

function pct(key, v) { const r = RANGES[key]; return clamp((v - r.min) / (r.max - r.min), 0, 1) * 100; }
function getValue(key) { return key === 'ghg' ? ghgNow() : state[key]; }
function setGhg(target) {
  const s = splitGhg(target, co2Now(), ch4Now());
  state.co2Base = s.co2 - co2FromEnergy(state.clean) - co2FromTransport(state.transport);
  state.ch4Base = s.methane - methaneFromLivestock(state.livestock);
}
function setValue(key, v, quiet) {
  const r = RANGES[key];
  v = clamp(Math.round(v / r.step) * r.step, r.min, r.max);
  if (key === 'ghg') setGhg(v);
  else {
    const before = ghgNow();
    state[key] = v;
    setGhg(ghgNow()); // if the total hit the top or bottom of its slider, it stays there instead of piling up
    if (Math.abs(ghgNow() - before) > 0.5 && !quiet) flashLinked(key);
  }
  render();
}

let linkTimer;
function flashLinked(key) {
  const el = SLIDERS.ghg.el;
  el.querySelector('.vs-linked').textContent = t('linked_' + key);
  el.classList.add('linked');
  clearTimeout(linkTimer);
  linkTimer = setTimeout(() => el.classList.remove('linked'), 1600);
}

function renderSliders() {
  for (const cfg of Object.values(SLIDERS)) {
    const el = cfg.el, v = getValue(cfg.key), p = pct(cfg.key, v);
    const track = el.querySelector('.vs-track');
    el.querySelector('.vs-knob').style.bottom = `calc(${p / 100} * (100% - 56px) + 0px)`;
    el.querySelector('.vs-fill').style.height = `calc(${p / 100} * (100% - 56px) + 28px)`;
    cfg.marks.forEach((m, i) => {
      const mk = el.querySelector(`[data-m="${i}"]`);
      mk.style.bottom = `calc(${pct(cfg.key, m.v) / 100} * (100% - 56px) + 28px)`;
      mk.querySelector('span').textContent = t(m.k);
    });
    el.querySelector('.vs-value b').textContent = fmt(v);
    el.querySelector('.vs-unit').textContent = t(cfg.unit);
    el.querySelector('.vs-name').innerHTML = t(cfg.label) + (cfg.sub ? `<small>${t(cfg.sub)}</small>` : '');
    el.querySelector('.vs-tip').textContent = t(cfg.help);
    if (cfg.key === 'ghg') el.querySelector('.vs-detail').innerHTML = `<bdi dir="ltr">CO₂ ${fmt(co2Now())}</bdi> · <bdi dir="ltr">CH₄ ${fmt(ch4Now())}</bdi>`;
    track.setAttribute('aria-valuenow', fmt(v));
    track.setAttribute('aria-valuetext', `${fmt(v)} ${t(cfg.unit)}`);
    track.setAttribute('aria-label', t(cfg.label));
  }
}


// ---------------- Cards, grouped under the 4 consequences ----------------
const GROUPS = [
  { id: 'temp',    cards: ['temp', 'regional'] },
  { id: 'ice',     cards: ['sea', 'arctic', 'iceSheets'] },
  { id: 'weather', cards: ['heat', 'drought', 'fire', 'storms', 'rain'] },
  { id: 'bio',     cards: ['coral', 'ocean', 'species', 'animals', 'ecoTips'] },
];
const GROUP_ICONS = {
  temp: '<svg viewBox="0 0 24 24"><path d="M10 3a2 2 0 0 1 4 0v10.3a4.5 4.5 0 1 1-4 0z" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="17" r="2.4" fill="currentColor"/><path d="M12 8v8" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>',
  ice: '<svg viewBox="0 0 24 24"><path d="M3 15c2 0 2-2 4.5-2S10 15 12 15s2-2 4.5-2S19 15 21 15M3 20c2 0 2-2 4.5-2S10 20 12 20s2-2 4.5-2S19 20 21 20" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/><path d="M8 11 12 3l4 8z" fill="currentColor"/></svg>',
  weather: '<svg viewBox="0 0 24 24"><path d="M6 14h11a4 4 0 0 0 0-8 5.5 5.5 0 0 0-10.6 1.4A3.4 3.4 0 0 0 6 14z" fill="currentColor"/><path d="M12 15l-2.5 4h3l-2 4" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  bio: '<svg viewBox="0 0 24 24"><path d="M4 20c0-8 6-14 16-15-1 10-7 16-15 16" fill="currentColor"/><path d="M4 20 14 10" stroke="#fff" stroke-width="1.6" stroke-linecap="round"/></svg>',
};
function buildCards() {
  const wrap = document.getElementById('cards');
  wrap.innerHTML = GROUPS.map((g, gi) => `
    <section class="group group-${g.id}" id="group-${g.id}">
      <header class="group-head">
        <span class="group-num">${gi + 1}</span>
        <span class="group-icon">${GROUP_ICONS[g.id]}</span>
        <div><h2></h2><p class="group-intro"></p></div>
      </header>
      <div class="group-grid">
        ${g.cards.map(id => `<article class="card card-${id}" id="card-${id}"><h3></h3><div class="card-body"></div></article>`).join('')}
      </div>
    </section>`).join('');
}
function setGroup(id) {
  const s = document.getElementById('group-' + id);
  s.querySelector('h2').textContent = t('grp_' + id);
  s.querySelector('.group-intro').textContent = t('grp_' + id + '_intro');
}
const card = (id) => document.getElementById('card-' + id);
function setCard(id, title, html) {
  const c = card(id);
  c.querySelector('h3').textContent = title;
  c.querySelector('.card-body').innerHTML = html;
}

function tempColor(T) {
  const stops = [[-6, [110, 170, 240]], [0, [70, 150, 220]], [1.0, [120, 190, 120]], [1.5, [245, 196, 60]], [2.5, [240, 120, 40]], [4, [200, 40, 40]]];
  let a = stops[0], b = stops[stops.length - 1];
  for (let i = 1; i < stops.length; i++) if (T <= stops[i][0]) { a = stops[i - 1]; b = stops[i]; break; }
  if (T > stops[stops.length - 1][0]) a = b;
  const f = a === b ? 0 : clamp((T - a[0]) / (b[0] - a[0]), 0, 1);
  const c = a[1].map((x, i) => Math.round(x + (b[1][i] - x) * f));
  return `rgb(${c.join(',')})`;
}

function thermometer(T) {
  const min = -7, max = 5, y0 = 150, y1 = 14;
  const y = (v) => y0 - (clamp(v, min, max) - min) / (max - min) * (y0 - y1);
  const ticks = [-6, -4, -2, 0, 2, 4].map(v => `<line x1="44" x2="52" y1="${y(v)}" y2="${y(v)}" stroke="#0d2b3e" stroke-width="2"/><text x="56" y="${y(v) + 4}" font-size="13">${v}°</text>`).join('');
  return `<svg viewBox="0 0 150 190" class="thermo" aria-hidden="true">
    <rect x="22" y="8" width="20" height="150" rx="10" fill="#eef2f5" stroke="#0d2b3e" stroke-width="2.5"/>
    <rect x="27" y="${y(T)}" width="10" height="${y0 + 14 - y(T)}" rx="5" fill="${tempColor(T)}"/>
    <circle cx="32" cy="170" r="16" fill="${tempColor(T)}" stroke="#0d2b3e" stroke-width="2.5"/>
    <line x1="14" x2="70" y1="${y(1.5)}" y2="${y(1.5)}" stroke="#d04040" stroke-width="2" stroke-dasharray="4 3"/>
    <text x="72" y="${y(1.5) - 4}" font-size="12" fill="#d04040" font-weight="700">${t('paris')} 1.5°</text>
    ${ticks}
  </svg>`;
}

function iceAgeCoast(drop) {
  // side view: the beach goes on and on because the sea is far below today's shoreline
  const W = 480, H = 170, top = 40, s = 110 / 130; // px per metre (130 m scale)
  const lvl = top + drop * s;
  return `<svg viewBox="0 0 ${W} ${H}" class="coast" aria-hidden="true">
    <rect width="${W}" height="${H}" fill="#eaf3fb"/>
    <path d="M0 ${top} L180 ${top} L${W} ${top + 120} L${W} ${H} L0 ${H}z" fill="#c9b07e"/>
    <path d="M0 ${top} L180 ${top} L${W} ${top + 120}" fill="none" stroke="#9c8456" stroke-width="2"/>
    <line x1="0" x2="${W}" y1="${top}" y2="${top}" stroke="#14146C" stroke-dasharray="4 4" opacity=".6"/>
    <text x="8" y="${top - 6}" font-size="12">${t('todaySea')}</text>
    <rect x="0" y="${lvl}" width="${W}" height="${H - lvl}" fill="#1e7fb0" opacity=".62"/>
    <path d="M300 ${top + 4} v${lvl - top - 8}" stroke="#14146C" stroke-width="2" marker-end="url(#ar)"/>
    <defs><marker id="ar" markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto"><path d="M0 0 L8 4 L0 8z" fill="#14146C"/></marker></defs>
    <text x="310" y="${(top + lvl) / 2}" font-size="14" font-weight="700">−${Math.round(drop)} m</text>
  </svg>`;
}
function coastScene(slr, far) {
  if (slr < -0.5) return iceAgeCoast(-slr);
  const W = 480, H = 170, ground = 140;
  const maxM = far ? 26 : 1.6;
  const s = (ground - 20) / maxM; // px per metre
  const lvl = ground - slr * s;
  let objects = '';
  if (!far) {
    // child for scale (1.5 m)
    const h = 1.5 * s, x = 320;
    objects += `<g transform="translate(${x},${ground})"><circle cx="0" cy="${-h + 9}" r="9" fill="#f2c9a0" stroke="#0d2b3e" stroke-width="2"/>
      <path d="M-10 ${-h + 20} h20 l3 ${h * 0.45} h-26z" fill="#1e7fb0" stroke="#0d2b3e" stroke-width="2"/>
      <path d="M-6 ${-h + 20 + h * 0.45} v${h * 0.55 - 20} M6 ${-h + 20 + h * 0.45} v${h * 0.55 - 20}" stroke="#0d2b3e" stroke-width="5" stroke-linecap="round"/></g>
      <text x="${x + 18}" y="${ground - h + 12}" font-size="11">${t('kidHeight')}</text>`;
    objects += `<g transform="translate(180,${ground})"><rect x="-26" y="${-1.0 * s}" width="52" height="${1.0 * s}" fill="#e9d6b5" stroke="#0d2b3e" stroke-width="2"/></g>`;
  } else {
    const house = 6 * s, bld = 20 * s;
    objects += `<g transform="translate(170,${ground})"><rect x="-22" y="${-house * 0.65}" width="44" height="${house * 0.65}" fill="#f4e1c1" stroke="#0d2b3e" stroke-width="2"/><path d="M-28 ${-house * 0.65} L0 ${-house} L28 ${-house * 0.65}z" fill="#c8553d" stroke="#0d2b3e" stroke-width="2"/></g>
      <text x="146" y="${ground - house - 6}" font-size="11">${t('house')} 6 m</text>
      <g transform="translate(320,${ground})"><rect x="-22" y="${-bld}" width="44" height="${bld}" fill="#cfd8df" stroke="#0d2b3e" stroke-width="2"/>
      ${Array.from({ length: 6 }, (_, i) => `<rect x="-14" y="${-bld + 8 + i * bld / 6.4}" width="10" height="6" fill="#7fb6d6"/><rect x="4" y="${-bld + 8 + i * bld / 6.4}" width="10" height="6" fill="#7fb6d6"/>`).join('')}</g>
      <text x="348" y="${ground - bld + 10}" font-size="11">${t('building')} 20 m</text>`;
  }
  const rulerTicks = (far ? [0, 5, 10, 15, 20, 25] : [0, 0.5, 1, 1.5]).map(m => `<line x1="${W - 14}" x2="${W - 6}" y1="${ground - m * s}" y2="${ground - m * s}" stroke="#0d2b3e"/><text x="${W - 16}" y="${ground - m * s + 4}" font-size="10" text-anchor="end">${m} m</text>`).join('');
  return `<svg viewBox="0 0 ${W} ${H}" class="coast" aria-hidden="true">
    <rect width="${W}" height="${H}" fill="#e8f4fb"/>
    <path d="M0 ${ground + 4} Q40 ${ground + 6} 60 ${ground} L${W} ${ground} L${W} ${H} L0 ${H}z" fill="#d9c49a"/>
    <rect x="0" y="${ground}" width="${W}" height="${H - ground}" fill="#c9b07e"/>
    ${objects}
    <path d="M0 ${lvl} ${Array.from({ length: 16 }, (_, i) => `q ${W / 32} ${i % 2 ? 3 : -3} ${W / 16} 0`).join(' ')} V ${H} H0z" fill="#1e7fb0" opacity="0.62"/>
    <line x1="0" x2="${W}" y1="${ground}" y2="${ground}" stroke="#0d2b3e" stroke-dasharray="3 4" opacity="0.6"/>
    ${rulerTicks}
  </svg>`;
}

function arcticMap(area) {
  const R = 64, rOf = (a) => Math.min(74, R * Math.sqrt(a / 7.8));
  const blob = area < 0.05 ? '' : `<path d="${blobPath(80, 80, rOf(area))}" fill="#f4f9ff" stroke="#9cc3dd" stroke-width="1.5"/>`;
  return `<svg viewBox="0 0 160 160" class="arctic" aria-hidden="true">
    <circle cx="80" cy="80" r="76" fill="#1b4f72" stroke="#0d2b3e" stroke-width="2.5"/>
    <circle cx="80" cy="80" r="${rOf(7.0)}" fill="none" stroke="#fff" stroke-width="1.5" stroke-dasharray="4 4" opacity="0.8"/>
    <text x="80" y="${80 - rOf(7.0) - 4}" font-size="10" fill="#fff" text-anchor="middle">${t('was1979')}</text>
    ${blob}
    <path d="M18 120 q20-6 30 8 l-10 14z M128 30 q16 10 18 26 l-14-4z M120 128 q10 4 22-6 l2 14z" fill="#7a9b6a"/>
  </svg>`;
}
function blobPath(cx, cy, r) {
  const pts = [];
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2;
    const rr = r * (1 + 0.1 * Math.sin(a * 3 + 1) + 0.06 * Math.cos(a * 5));
    pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
  }
  return 'M' + pts.map(p => p.map(n => n.toFixed(1)).join(' ')).join(' L') + 'Z';
}

function decadeBoxes(x, cls) {
  // 10 boxes = 10 years. Filled boxes = events per 10 years.
  return `<div class="decade ${cls}">${Array.from({ length: 10 }, (_, i) => {
    const f = clamp(x - i, 0, 1);
    return `<span style="--f:${f}"></span>`;
  }).join('')}</div>`;
}

function coralRow(pctAlive) {
  const n = 10, alive = Math.round(pctAlive / 10);
  return `<div class="corals">${Array.from({ length: n }, (_, i) => `<svg viewBox="0 0 30 30" class="${i < alive ? 'alive' : 'bleached'}"><path d="M15 28v-9M15 19l-6-6v-6M15 19l6-5v-7M9 13l-4-3M21 14l4-4M15 22l-5-3" stroke-width="3.2" stroke-linecap="round" fill="none"/></svg>`).join('')}</div>`;
}

function phBar(pH) {
  const min = 7.6, max = 8.3, x = (v) => 8 + (clamp(v, min, max) - min) / (max - min) * 224;
  return `<svg viewBox="0 0 240 68" class="ph" aria-hidden="true">
    <defs><linearGradient id="phg"><stop offset="0" stop-color="#e2733d"/><stop offset="0.5" stop-color="#e8c84a"/><stop offset="1" stop-color="#2f8fc5"/></linearGradient></defs>
    <rect x="8" y="30" width="224" height="16" rx="8" fill="url(#phg)" stroke="#0d2b3e" stroke-width="2"/>
    <line x1="${x(8.17)}" x2="${x(8.17)}" y1="26" y2="50" stroke="#0d2b3e" stroke-width="2" stroke-dasharray="3 2"/><text x="${x(8.17)}" y="63" font-size="10" text-anchor="middle">1750</text>
    <line x1="${x(8.05)}" x2="${x(8.05)}" y1="26" y2="50" stroke="#0d2b3e" stroke-width="2" stroke-dasharray="3 2"/><text x="${x(8.05)}" y="63" font-size="10" text-anchor="middle">${t('todayMark')}</text>
    <path d="M${x(pH)} 29 l-7 -11 h14z" fill="#0d2b3e"/>
    <text x="8" y="12" font-size="10">${state.lang === 'ar' ? 'حمضي أكثر' : 'more acidic'}</text>
    <text x="232" y="12" font-size="10" text-anchor="end">${state.lang === 'ar' ? 'قاعدي أكثر' : 'less acidic'}</text>
  </svg>`;
}

const PAW = '<svg viewBox="0 0 24 24"><ellipse cx="12" cy="16" rx="5.5" ry="4.5"/><circle cx="5.5" cy="10" r="2.4"/><circle cx="9.5" cy="6" r="2.4"/><circle cx="14.5" cy="6" r="2.4"/><circle cx="18.5" cy="10" r="2.4"/></svg>';
function speciesGrid(p) {
  const n = 20, risk = Math.round(p / 5);
  return `<div class="paws">${Array.from({ length: n }, (_, i) => `<span class="${i < risk ? 'risk' : ''}">${PAW}</span>`).join('')}</div>`;
}

function tipList(c, ids) {
  return `<ul class="tips">${c.tipping.filter(tp => ids.includes(tp.id)).map(tp => `<li><span>${t('tp_' + tp.id)}</span><b class="lvl lvl-${tp.level}">${t('tpLevels')[tp.level]}</b></li>`).join('')}</ul>`;
}
// Regional pattern (IPCC AR6 SPM.5 / Atlas; Rantanen et al. 2022): ocean ≈ 0.8×, land ≈ 1.5×, Arctic ≈ 3× the global mean.
function regionalBars(T) {
  const rows = [['r_ocean', 0.82, '#28A8E0'], ['r_world', 1, '#6b7783'], ['r_land', 1.45, '#e8973c'], ['r_arctic', 3, '#c8372a']];
  const max = Math.max(6, T * 3);
  return `<div class="rbars">${rows.map(([k, f, col]) => {
    const v = T * f;
    return `<div class="rbar"><span class="rbar-name">${t(k)}</span><span class="rbar-track"><i style="width:${clamp(v / max * 100, 0, 100)}%;background:${col}"></i></span><b>${v >= 0 ? '+' : ''}${fmt(v, 1)}°</b></div>`;
  }).join('')}</div>`;
}
function animalList(c) {
  return `<ul class="animals">${Object.keys(ANIMAL_PLACES).map(k => {
    const lv = c.animals[k];
    return `<li><span class="gi lv${lv}">${ANIMAL_ICONS[k]}</span><span class="an-name"><b>${t('a_' + k)}</b><small>${t('a_' + k + 'X')}</small></span><b class="lvl lvl-${lv === 2 ? 3 : lv}">${t('aStatus')[lv]}</b></li>`;
  }).join('')}</ul>`;
}

function renderCards(c) {
  // ---- 1. Rising temperatures ----
  setGroup('temp');
  setCard('temp', t('temp'), `<div class="split">${thermometer(c.T)}<div><div class="big" style="color:${tempColor(c.T)}">${c.T >= 0 ? '+' : ''}${fmt(c.T, 1)} °C</div><p>${t('tempSub')}</p></div></div>`);
  setCard('regional', t('regional'), `<p class="muted">${t('regionalSub')}</p>${regionalBars(c.T)}`);

  // ---- 2. Ice melting & sea level rise ----
  const slr = c.T < 0 ? c.seaLevelIceAge : c.seaLevel2100;
  setGroup('ice');
  const slrTxt = `${fmt(slr * 100)} cm`;
  setCard('sea', t('seaLevel'), `${coastScene(slr, false)}<div class="row"><span class="big">${slr < -0.5 ? '−' + fmt(-slr) + ' m' : '+' + slrTxt}</span><span>${slr < -0.5 ? t('seaSubIce') : t('seaSub2100')}</span></div>`);
  setCard('arctic', t('arctic'), `<div class="split">${arcticMap(c.arcticIce)}<div><div class="big">${fmt(c.arcticIce, 1)}</div><p>${t('arcticSub')}</p>${c.arcticIce < 1 ? `<p class="alert">${t('iceFree')}</p>` : ''}</div></div>`);
  setCard('iceSheets', t('iceSheets'), `<p class="muted">${t('iceSheetsSub')}</p>${tipList(c, ['greenland', 'wais', 'permafrost'])}`);

  // ---- 3. Extreme weather events ----
  setGroup('weather');
  setCard('heat', t('heat'), `<p>${t('heatSub')}</p>${decadeBoxes(c.heatX, 'hot')}<div class="row"><span class="big">${fmt(c.heatX, 1)}×</span><span>${t('timesIn10')}</span></div>`);
  setCard('drought', t('drought'), `<p>${t('droughtSub')}</p>${decadeBoxes(c.droughtX, 'dry')}<div class="row"><span class="big">${fmt(c.droughtX, 1)}×</span><span>${t('timesIn10')}</span></div>`);
  const fl = Math.min(4, Math.floor(c.fire * 5));
  setCard('fire', t('fire'), `<div class="gauge">${[0, 1, 2, 3, 4].map(i => `<span class="${i <= fl ? 'on' : ''}" style="--i:${i}"></span>`).join('')}</div><div class="big">${t('fireLevels')[fl]}</div>`);
  setCard('storms', t('g_storms'), `<div class="split"><span class="storm-ico">${TAG_ICONS.storm}</span><div><div class="row"><span class="big">+${fmt(c.stormShare)}%</span><span>${t('stormsSub')}</span></div><div class="row"><span class="big">+${fmt(c.stormRain)}%</span><span>${t('stormsRain')}</span></div></div></div>`);
  setCard('rain', t('rain'), `<p>${t('rainSub')}</p>${decadeBoxes(c.rainX, 'wet')}<div class="row"><span class="big">${fmt(c.rainX, 1)}×</span><span>${t('timesIn10')}</span></div>`);

  // ---- 4. Biodiversity loss ----
  setGroup('bio');
  setCard('coral', t('coral'), `${coralRow(c.coral)}<div class="row"><span class="big">${fmt(c.coral)}%</span><span>${t('coralSub')}</span></div>`);
  setCard('ocean', t('ocean'), `${phBar(c.pH)}<div class="row"><span class="big">pH ${fmt(c.pH, 2)}</span><span>${t('oceanSub')}</span></div><p class="muted">${fmt(Math.max(0, c.acidityUp))}% ${t('moreAcid')}</p>`);
  setCard('species', t('species'), `${speciesGrid(c.species)}<div class="row"><span class="big">${t('upTo')} ${fmt(c.species)}%</span></div><p class="muted">${t('speciesSub')}</p>`);
  setCard('animals', t('animals'), animalList(c));
  setCard('ecoTips', t('ecoTips'), `<p class="muted">${t('tippingSub')}</p>${tipList(c, ['reefs', 'amazon', 'boreal'])}`);
}

// ---------------- Chain & mood ----------------
// "What is happening?" — five live steps. Each shows a number and a level colour that follow the
// sliders; tapping a step flies the globe to where that consequence shows (tap again to go back).
const CHAIN = ['ghg', 'temp', 'ice', 'weather', 'bio'];
const CHAIN_VIEWS = {
  ghg:     { lat: 28, lon: 95, zoom: 1 },        // the whole planet, where most emissions are today
  temp:    { lat: 20, lon: 20, zoom: 1, heat: true },
  ice:     { lat: 72, lon: -42, zoom: 0.72 },    // Arctic sea ice, Greenland (and the Ice-Age ice sheets)
  weather: { lat: 16, lon: 128, zoom: 0.7 },     // typhoons in the Pacific, heat & fire in Asia
  bio:     { lat: -14, lon: 140, zoom: 0.7 },    // coral reefs, turtles, koalas
};
let activeStep = null, heatBefore = null;
const prevLevels = {};

function chainData(c) {
  const T = c.T, cold = T < -0.3;
  const sea = T < 0 ? c.seaLevelIceAge : c.seaLevel2100;
  const ghg = ghgNow();
  const seaTxt = sea < -0.5 ? `−${fmt(-sea)} m` : Math.abs(sea) < 2 ? `+${fmt(sea * 100)} cm` : `+${fmt(sea, 1)} m`;
  return {
    ghg: { val: `${fmt(ghg)} ppm`, sub: t('cv_ghg'), lvl: ghg < 320 ? 0 : ghg < 500 ? 1 : ghg < 700 ? 2 : 3 },
    temp: { val: `${T >= 0 ? '+' : '−'}${fmt(Math.abs(T), 1)} °C`, sub: t('cv_temp'), lvl: cold ? 'c' : T < 1.2 ? 0 : T < 1.5 ? 1 : T < 2.5 ? 2 : 3 },
    ice: { val: seaTxt, sub: cold ? t('cv_iceCold') : t('cv_ice'), lvl: cold ? 'c' : sea < 0.3 && c.arcticIce > 4.5 ? 0 : sea < 0.5 && c.arcticIce > 2 ? 1 : sea < 0.7 ? 2 : 3 },
    weather: { val: `${fmt(c.heatX, 1)}×`, sub: t('cv_weather').replace('{s}', fmt(c.stormShare)), lvl: c.heatX < 3 ? 0 : c.heatX < 4.5 ? 1 : c.heatX < 7 ? 2 : 3 },
    bio: { val: `${fmt(c.species)}%`, sub: t('cv_bio'), lvl: c.coral > 60 ? 0 : c.coral > 20 ? 1 : c.coral > 1 ? 2 : 3 },
  };
}

function buildChain() {
  const ol = document.getElementById('chain');
  ol.innerHTML = CHAIN.map(id => `<li><button type="button" class="cstep" data-step="${id}" aria-pressed="false">
      <span class="cs-icon">${id === 'ghg' ? ICONS.ghg : GROUP_ICONS[id]}</span>
      <span class="cs-title"></span>
      <b class="cs-val"></b>
      <span class="cs-sub"></span>
      <span class="cs-lvl"></span>
    </button></li>`).join('');
  ol.querySelectorAll('.cstep').forEach(b => b.addEventListener('click', () => tapStep(b.dataset.step)));
}

function clearStep() {
  if (activeStep === 'temp' && heatBefore !== null) { state.heatMap = heatBefore; heatBefore = null; syncToggles(); }
  activeStep = null;
}
function tapStep(id) {
  if (!globe) return;
  if (openHs) closeHotspot();
  closeTag(false);
  if (activeStep === 'temp' && heatBefore !== null) { state.heatMap = heatBefore; heatBefore = null; }
  if (activeStep === id) { // tap again: back to the whole Earth
    activeStep = null;
    globe.showView(18, 20, 1, true);
  } else {
    activeStep = id;
    const v = CHAIN_VIEWS[id];
    if (v.heat) { heatBefore = state.heatMap; state.heatMap = true; }
    globe.showView(v.lat, v.lon, v.zoom, false);
  }
  syncToggles();
  render();
  // bring the globe into view so the learner sees what changed
  const gw = document.querySelector('.globe-wrap').getBoundingClientRect();
  if (gw.top < -gw.height * 0.4 || gw.bottom > innerHeight + gw.height * 0.4) document.querySelector('.globe-wrap').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function renderChain(c) {
  const d = chainData(c), titles = t('chain');
  CHAIN.forEach((id, i) => {
    const b = document.querySelector(`.cstep[data-step="${id}"]`);
    const s = d[id];
    b.querySelector('.cs-title').textContent = titles[i];
    b.querySelector('.cs-val').textContent = s.val;
    b.querySelector('.cs-sub').textContent = s.sub;
    b.querySelector('.cs-lvl').textContent = s.lvl === 'c' ? t('lvlCold') : t('grpLevels')[s.lvl];
    b.className = `cstep lvl-bg-${s.lvl}` + (activeStep === id ? ' active' : '');
    b.setAttribute('aria-pressed', activeStep === id);
    b.title = activeStep === id ? t('cs_back') : t('cs_show');
    if (prevLevels[id] !== undefined && prevLevels[id] !== s.lvl) { // level changed: pulse
      b.classList.remove('pulse'); void b.offsetWidth; b.classList.add('pulse');
    }
    prevLevels[id] = s.lvl;
  });

  const T = c.T;
  const idx = T < 0.5 ? 0 : T < 1.2 ? 1 : T < 1.5 ? 2 : T < 2.0 ? 3 : T < 3.0 ? 4 : 5;
  document.getElementById('mood').textContent = T < -3 ? t('moodIceAge') : T < -0.3 ? t('moodCold') : t('mood')[idx];
  // note under the legend: the 2100 sea level is exaggerated on the globe; Ice-Age sea level is real
  const note = document.getElementById('seaNote');
  note.textContent = T < -0.3 ? t('seaNoteIce').replace('{m}', fmt(-c.seaLevelIceAge)) : t('seaNote');
  note.hidden = !note.textContent;
  const badge = document.getElementById('tempBadge');
  badge.textContent = `${T >= 0 ? '+' : ''}${fmt(T, 1)} °C`;
  badge.style.background = tempColor(T);
}

// ---------------- Show more / less ----------------
function syncMore() {
  const btn = document.getElementById('moreBtn'), cards = document.getElementById('cards');
  cards.hidden = !state.more;
  btn.setAttribute('aria-expanded', !!state.more);
  btn.querySelector('span').textContent = state.more ? t('showLess') : t('showMore');
}

// ---------------- i18n ----------------
function applyLang() {
  const html = document.documentElement;
  html.lang = state.lang; html.dir = state.lang === 'ar' ? 'rtl' : 'ltr';
  document.title = t('title');
  document.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
  document.getElementById('sciModel').innerHTML = t('sciModel').map(s => `<li>${s}</li>`).join('');
  document.getElementById('sciSources').innerHTML = SOURCES.map(s => `<li><a href="${s.url}" target="_blank" rel="noopener">${s.text}</a></li>`).join('');
}

// ---------------- Labels pinned on the globe ----------------
const TAG_ICONS = {
  ice: '<svg viewBox="0 0 24 24"><path d="M12 2v20M3.3 7l17.4 10M3.3 17 20.7 7M9 3.5l3 2 3-2M9 20.5l3-2 3 2" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/></svg>',
  reef: '<svg viewBox="0 0 24 24"><path d="M12 22v-8M12 14l-5-5V4M12 14l5-4V5M7 9 4 7M17 10l3-3M12 17l-4-2" stroke="currentColor" stroke-width="2.4" fill="none" stroke-linecap="round"/></svg>',
  forest: '<svg viewBox="0 0 24 24"><path d="M12 2 5 13h4l-5 6h16l-5-6h4z" fill="currentColor"/><rect x="11" y="19" width="2" height="4" fill="currentColor"/></svg>',
  mountain: '<svg viewBox="0 0 24 24"><path d="M2 20 9 7l4 6 2-3 7 10z" fill="currentColor"/><path d="m9 7-2 4 2-1 2 1z" fill="#fff"/></svg>',
  sun: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="5" fill="currentColor"/><path d="M12 1v3M12 20v3M1 12h3M20 12h3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  drop: '<svg viewBox="0 0 24 24"><path d="M3 20h18M6 16l2-3 2 2 3-5 2 3 3-2" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M5 20l3-3M11 20l3-3M17 20l2-2" stroke="currentColor" stroke-width="1.6"/></svg>',
  storm: '<svg viewBox="0 0 24 24"><path d="M12 9a3 3 0 1 1 0 6 3 3 0 0 1 0-6zM12 9c0-4 4-7 8-6-3 1-5 3-5 6M12 15c0 4-4 7-8 6 3-1 5-3 5-6" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/></svg>',
  ground: '<svg viewBox="0 0 24 24"><path d="M2 9h20M2 9l3 4 4-2 3 4 4-3 3 3 3-2" stroke="currentColor" stroke-width="2" fill="none" stroke-linejoin="round"/><path d="M7 4v3M12 3v4M17 4v3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  snow: '<svg viewBox="0 0 24 24"><path d="M12 2v20M4 7l16 10M4 17 20 7" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="12" r="2.5" fill="currentColor"/></svg>',
  wave: '<svg viewBox="0 0 24 24"><path d="M2 10c3 0 3-3 6-3s3 3 6 3 3-3 6-3M2 16c3 0 3-3 6-3s3 3 6 3 3-3 6-3" stroke="currentColor" stroke-width="2.2" fill="none" stroke-linecap="round"/></svg>',
};
const ANIMAL_ICONS = {
  polarBear: '<svg viewBox="0 0 24 24"><path d="M2 14.5c0-3 2.6-5 6-5h6.5c1.4 0 2.4-1.6 4.2-1.6 1.2 0 2.1.6 2.6 1.4.4.7.1 1.6-.6 1.9l-1.2.4c-.6.2-1 .7-1 1.3V19h-2v-3.2l-1-.6h-4.6V19h-2v-3.5H7.2V19h-2v-3.2c-1.9-.1-3.2-.6-3.2-1.3z" fill="currentColor"/></svg>',
  penguin: '<svg viewBox="0 0 24 24"><path d="M12 2c2 0 3.2 1.6 3.2 3.4 0 .7.4 1.1 1 1.6 1.8 1.6 2.6 4.4 2.3 7.8-.2 2.8-1.3 5.2-2.9 6.4l1.2.8H7.2l1.2-.8C6.8 20 5.7 17.6 5.5 14.8c-.3-3.4.5-6.2 2.3-7.8.6-.5 1-.9 1-1.6C8.8 3.6 10 2 12 2z" fill="currentColor"/><path d="M12 8.5c1.9 0 3 2.2 3 5.5s-1.3 5.5-3 5.5-3-2.2-3-5.5 1.1-5.5 3-5.5z" fill="#fff" opacity=".9"/><path d="M13.6 4.6l2.4.7-2.2.6z" fill="#f2a33a"/></svg>',
  turtle: '<svg viewBox="0 0 24 24"><ellipse cx="12" cy="13" rx="5.5" ry="6.5" fill="currentColor"/><ellipse cx="12" cy="4.6" rx="2" ry="2.4" fill="currentColor"/><path d="M7 9 2.5 7.5 4 11.5zM17 9l4.5-1.5-1.5 4zM7.5 17.5 4 20l3.8.4zM16.5 17.5 20 20l-3.8.4z" fill="currentColor"/><path d="M12 8.5v9M8 11h8M8.5 15h7" stroke="#fff" stroke-width="1" opacity=".6"/></svg>',
  tiger: '<svg viewBox="0 0 24 24"><path d="M4.5 3.5 8 6.5h8l3.5-3 1 7.5c0 5.2-3.9 9.5-8.5 9.5S3.5 16.2 3.5 11z" fill="currentColor"/><path d="M12 7v3M8 9l1.5 2M16 9l-1.5 2M5 13h3M16 13h3" stroke="#fff" stroke-width="1.3" stroke-linecap="round" opacity=".8"/><circle cx="9.3" cy="12.5" r="1.1" fill="#fff"/><circle cx="14.7" cy="12.5" r="1.1" fill="#fff"/></svg>',
  orangutan: '<svg viewBox="0 0 24 24"><path d="M12 3c3.2 0 5.4 2.3 5.4 5.2 2 1 3.1 3 3.1 5.3 0 4.1-3.8 7.5-8.5 7.5s-8.5-3.4-8.5-7.5c0-2.3 1.1-4.3 3.1-5.3C6.6 5.3 8.8 3 12 3z" fill="currentColor"/><ellipse cx="12" cy="14.5" rx="5" ry="4" fill="#fff" opacity=".35"/><circle cx="9.8" cy="10" r="1" fill="#fff"/><circle cx="14.2" cy="10" r="1" fill="#fff"/></svg>',
  koala: '<svg viewBox="0 0 24 24"><circle cx="5.5" cy="7.5" r="4" fill="currentColor"/><circle cx="18.5" cy="7.5" r="4" fill="currentColor"/><path d="M12 5c4 0 6.5 3 6.5 7.3S15.6 20 12 20s-6.5-3.4-6.5-7.7S8 5 12 5z" fill="currentColor"/><ellipse cx="12" cy="13.5" rx="1.8" ry="2.4" fill="#fff" opacity=".55"/><circle cx="9.3" cy="11" r=".9" fill="#fff"/><circle cx="14.7" cy="11" r=".9" fill="#fff"/></svg>',
};
const ANIMAL_PLACES = {
  polarBear: [73, -125], penguin: [-74, 165], turtle: [-23.4, 151.9], tiger: [21.8, 88.8], koala: [-29, 152],
};
let HOTSPOTS = [];

function tagHTML(icon, title, value, extra, level) {
  return `<span class="gi ${level != null ? 'lv' + level : ''}">${icon}</span><span class="gt"><b>${title}</b>${value ? `<small>${value}</small>` : ''}${extra ? `<em>${extra}</em>` : ''}</span>`;
}
function floodedArea(h, sea) {
  const i = Math.max(0, Math.min(h.area.length - 1, Math.floor(sea / h.areaStep)));
  return Math.max(0, h.area[i] - h.area[0]); // land flooded compared with today
}
const km2 = (v) => v >= 10000 ? `${Math.round(v / 1000).toLocaleString('en')}k` : Math.round(v).toLocaleString('en');

function renderGlobeTags(c) {
  if (!globe) return;
  const sea = c.seaLevel2100;
  const tp = (id) => c.tipping.find(x => x.id === id).level;
  const lvlName = (id) => t('tpLevels')[tp(id)];
  const lvlOf = (id) => Math.min(2, tp(id));
  const ice = c.arcticIce;
  const tags = [
    ['arctic', 82, -20, 'ice', t('arctic'), `${fmt(ice, 1)} ${t('mkm2')}${ice < 1 ? ' · ' + t('iceFree') : ''}`, t('g_arcticX'), ice < 1 ? 2 : ice < 4.5 ? 1 : 0],
    ['greenland', 73, -41, 'ice', t('g_greenland'), lvlName('greenland'), t('g_greenlandX'), lvlOf('greenland')],
    ['wais', -80, -110, 'ice', t('g_wais'), lvlName('wais'), t('g_waisX'), lvlOf('wais')],
    ['gbr', -15.5, 146, 'reef', t('g_gbr'), `${fmt(c.coral)}% ${t('g_survive')}`, t('g_gbrX'), c.coral > 60 ? 0 : c.coral > 10 ? 1 : 2],
    ['amazon', -4, -63, 'forest', t('g_amazon'), lvlName('amazon'), t('g_amazonX'), lvlOf('amazon')],
    ['med', 40, 17, 'drop', t('g_med'), `${t('drought')} ${fmt(c.droughtX, 1)}×`, t('g_medX'), c.droughtX < 1.8 ? 0 : c.droughtX < 3 ? 1 : 2],
    ['heat', 23, 77, 'sun', t('heat'), `${fmt(c.heatX, 1)}× ${t('g_moreOften')}`, t('g_heatX'), c.heatX < 3 ? 0 : c.heatX < 6 ? 1 : 2],
    ['permafrost', 67, 125, 'ground', t('g_permafrost'), lvlName('permafrost'), t('g_permafrostX'), lvlOf('permafrost')],
    ['storms', 24, 140, 'storm', t('g_storms'), `+${fmt(c.stormShare)}% ${t('g_strongest')}`, `${t('g_stormRain')} +${fmt(c.stormRain)}%`, c.stormShare < 5 ? 0 : c.stormShare < 15 ? 1 : 2],
  ];
  const pin = (id, lat, lon, iconSvg, title, value, extra, level, cls) => {
    const info = { id, lat, lon, title, value, extra };
    globe.setTag(id, { lat, lon, html: tagHTML(iconSvg, title, value, extra, level), cls: cls + (openTag === id ? ' open' : ''), onClick: () => focusTag(info) });
    if (openTag === id) fillTagPanel(info);
  };
  for (const [id, lat, lon, icon, title, value, extra, level] of tags) pin(id, lat, lon, TAG_ICONS[icon], title, value, extra, level, 'info');
  for (const [key, [lat, lon]] of Object.entries(ANIMAL_PLACES)) {
    const lv = c.animals[key];
    pin('a_' + key, lat, lon, ANIMAL_ICONS[key], t('a_' + key), t('aStatus')[lv], t('a_' + key + 'X'), lv, 'animal');
  }
  for (const h of HOTSPOTS) {
    const a = floodedArea(h, sea);
    globe.setTag('hs_' + h.id, {
      lat: h.lat, lon: h.lon, cls: 'gcoast',
      html: tagHTML(TAG_ICONS.wave, h[state.lang] || h.en, c.T < -0.3 ? t('g_lowSea') : a >= 1 ? `⁦${km2(a)} km²⁩ ${t('g_underSea')}` : t('g_zoom'), '', a > 3000 ? 2 : a > 300 ? 1 : 0),
      onClick: () => openHotspot(h),
    });
  }
  globe.setTagsVisible(state.labels && !globe.hotspot);
}

// ---------------- Label close-up ----------------
// Tapping any label flies the globe in to that place and shows what the label means in a panel.
let openTag = null;
function fillTagPanel(info) {
  document.getElementById('tagName').textContent = info.title;
  document.getElementById('tagVal').textContent = info.value || '';
  document.getElementById('tagX').textContent = info.extra || '';
}
function focusTag(info) {
  if (openHs) closeHotspot();
  clearStep();
  if (openTag === info.id) { closeTag(); return; }
  openTag = info.id;
  globe.showView(info.lat, info.lon, 0.5, false);
  fillTagPanel(info);
  document.getElementById('tagPanel').hidden = false;
  document.querySelector('.globe-wrap').classList.add('tag-mode');
  render();
}
function closeTag(goHome = true) {
  if (!openTag) return;
  openTag = null;
  document.getElementById('tagPanel').hidden = true;
  document.querySelector('.globe-wrap').classList.remove('tag-mode');
  if (goHome && globe) globe.showView(18, 20, 1, true);
  render();
}

// ---------------- Coastal close-up ----------------
let openHs = null;
let seaOverride = null; // "what if" sea level in the close-up (m)
const trySea = (v) => 20 * (v / 100) ** 2; // slider 0-100 -> 0-20 m, finer steps near 0
const tryPos = (m) => Math.sqrt(Math.min(20, m) / 20) * 100;
function openHotspot(h) {
  closeTag(false);
  clearStep();
  openHs = h;
  globe.openHotspot(h);
  document.getElementById('hsPanel').hidden = false;
  document.querySelector('.globe-wrap').classList.add('hs-mode');
  render();
}
function closeHotspot() {
  openHs = null;
  seaOverride = null; globe.seaOverride = null;
  globe.closeHotspot();
  document.getElementById('hsPanel').hidden = true;
  document.querySelector('.globe-wrap').classList.remove('hs-mode');
  render();
}
function renderHotspot(c) {
  if (!openHs) return;
  const model = c.seaLevel2100;
  const sea = seaOverride != null ? seaOverride : model;
  const a = floodedArea(openHs, sea);
  const seaTxt = sea < 2 ? `+${fmt(sea * 100)} cm` : `+${fmt(sea, 1)} m`;
  document.getElementById('hsName').textContent = openHs[state.lang] || openHs.en;
  const slider = document.getElementById('hsTry');
  if (document.activeElement !== slider) slider.value = tryPos(sea);
  document.getElementById('hsTryVal').textContent = seaTxt;
  document.getElementById('hsReset').hidden = seaOverride == null;
  document.getElementById('hsStats').innerHTML =
    `<span class="row"><span class="big">${seaTxt}</span><span>${seaOverride != null ? t('hsWhatIf') : t('seaSub2100')}</span></span>` +
    `<span class="row"><span class="big">${Math.round(a).toLocaleString('en')} km²</span><span>${t('hsLand')}</span></span>`;
}

// ---------------- Main render ----------------
let globe;
function render() {
  const c = computeClimate({ co2: co2Now(), methane: ch4Now() });
  renderSliders();
  renderCards(c);
  renderChain(c);
  if (globe) {
    globe.update(c, { far: false, season: 0, heatMap: state.heatMap });
    renderGlobeTags(c);
    renderHotspot(c);
  }
  document.getElementById('heatLegend').hidden = !state.heatMap;
  try { localStorage.setItem('earth-state-v2', JSON.stringify(state)); } catch { /* ignore */ }
}

function applyPreset(name) {
  const p = PRESETS[name];
  const from = { co2: co2Now(), methane: ch4Now(), clean: state.clean, transport: state.transport, livestock: state.livestock };
  const start = performance.now(), dur = 900;
  const step = (now) => {
    const f = Math.min(1, (now - start) / dur), e = f < 0.5 ? 2 * f * f : 1 - Math.pow(-2 * f + 2, 2) / 2;
    for (const k of ['clean', 'transport', 'livestock']) state[k] = from[k] + (p[k] - from[k]) * e;
    const co2 = from.co2 + (p.co2 - from.co2) * e, ch4 = from.methane + (p.methane - from.methane) * e;
    state.co2Base = co2 - co2FromEnergy(state.clean) - co2FromTransport(state.transport);
    state.ch4Base = ch4 - methaneFromLivestock(state.livestock);
    render();
    if (f < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function syncToggles() {
  document.getElementById('heatBtn').setAttribute('aria-pressed', state.heatMap);
  const lb = document.getElementById('labelsBtn');
  lb.setAttribute('aria-pressed', state.labels);
  document.getElementById('labelsTxt').textContent = state.labels ? t('hideLabels') : t('showLabels');
  document.getElementById('zoomIn').setAttribute('aria-label', t('zoomIn'));
  document.getElementById('zoomIn').title = t('zoomIn');
  document.getElementById('zoomOut').setAttribute('aria-label', t('zoomOut'));
  document.getElementById('zoomOut').title = t('zoomOut');
}

function init() {
  try {
    const saved = JSON.parse(localStorage.getItem('earth-state-v2') || 'null');
    if (saved && 'ch4Base' in saved) Object.assign(state, saved); // ignore saves from the old slider set
    delete state.far; delete state.season; // removed options
  } catch { /* ignore */ }

  const left = document.getElementById('leftSliders'), right = document.getElementById('rightSliders');
  for (const cfg of Object.values(SLIDERS)) (cfg.side === 'left' ? left : right).appendChild(buildSlider(cfg));
  buildCards();
  buildChain();
  applyLang();
  syncMore();

  document.getElementById('heatBtn').addEventListener('click', () => { state.heatMap = !state.heatMap; syncToggles(); render(); });
  document.getElementById('labelsBtn').addEventListener('click', () => { state.labels = !state.labels; syncToggles(); render(); });
  document.getElementById('zoomIn').addEventListener('click', () => globe && globe.zoomBy(0.75));
  document.getElementById('zoomOut').addEventListener('click', () => globe && globe.zoomBy(1 / 0.75));
  document.getElementById('hsBack').addEventListener('click', closeHotspot);
  document.getElementById('tagBack').addEventListener('click', () => closeTag());
  document.getElementById('moreBtn').addEventListener('click', () => {
    state.more = !state.more;
    syncMore();
    try { localStorage.setItem('earth-state-v2', JSON.stringify(state)); } catch { /* ignore */ }
    if (state.more) document.getElementById('cards').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  document.getElementById('hsTry').addEventListener('input', (e) => { seaOverride = Math.round(trySea(+e.target.value) * 100) / 100; globe.seaOverride = seaOverride; render(); });
  document.getElementById('hsReset').addEventListener('click', () => { seaOverride = null; globe.seaOverride = null; render(); });
  document.querySelectorAll('[data-preset]').forEach(b => b.addEventListener('click', () => applyPreset(b.dataset.preset)));
  document.getElementById('langBtn').addEventListener('click', () => {
    state.lang = state.lang === 'en' ? 'ar' : 'en';
    applyLang(); syncToggles(); syncMore(); render();
  });
  const dlg = document.getElementById('sciDialog');
  document.getElementById('sciBtn').addEventListener('click', () => dlg.showModal());
  syncToggles();

  try { globe = new Globe(document.getElementById('globe'), document.getElementById('tagLayer')); window.__globe = globe; }
  catch (e) { console.error(e); document.getElementById('globe').classList.add('no-webgl'); }
  fetch('./assets/data/hotspots.json').then(r => r.json()).then(h => { HOTSPOTS = h; render(); }).catch(() => {});
  render();
}
document.addEventListener('dragstart', (e) => e.preventDefault()); // no dragging images or text
init();
