// The right-hand panel: one panel with two views. Thread is Sol's conversation for the level you are on;
// Info is the body you picked. On a desktop a divider resizes it; at 1060px and narrower it is a bottom sheet
// with three heights (peek, half, full), the way a maps app does it.
import { $ } from './util.js';

const RW0 = 380, RWK = 'sol.panelWidth', SNAPS = ['peek', 'half', 'full'];
const sheetQuery = matchMedia('(max-width:1060px)');
let mode = 'thread', rwPref = 0;
const THR = new Map();
let cur = 'all';

export const isSheet = () => sheetQuery.matches;
export const getMode = () => mode;

export function setMode(m) {
  mode = m;
  $('#panel').dataset.pm = m;
  for (const k of ['thread', 'info']) { const b = $('#pm-' + k); b.setAttribute('aria-selected', String(k === m)); b.tabIndex = k === m ? 0 : -1; $('#p-' + k).hidden = k !== m; }
}

export function showPanel(on) {
  $('#panel').hidden = !on; $('#hdiv').hidden = !on;
  document.body.classList.toggle('panel-open', on);
}

export function setTitle(text, scope) { $('#rp-ttl').textContent = text; $('#thr-scope').textContent = scope ? ` · ${scope}` : ' · whole company'; }

// One thread per level: the galaxy has Sol's, each star has its own.
export function swapThread(key, greet) {
  const log = $('#log');
  key = key || 'all';
  if (key !== cur) {
    const fr = document.createDocumentFragment();
    while (log.firstChild) fr.appendChild(log.firstChild);
    THR.set(cur, fr); cur = key;
    if (THR.has(key)) { log.append(THR.get(key)); THR.delete(key); }
  }
  if (!log.firstChild) greet(log);
  toBottom();
}
export function toBottom() { const rb = $('#rp-body'); rb.scrollTop = rb.scrollHeight; }
export function scrollTo(node) { const rb = $('#rp-body'); rb.scrollTop = Math.max(0, node.offsetTop - 6); }

// ---- desktop: the divider ----
function bounds() { const w = $('.main').clientWidth; return w > 0 ? [300, Math.max(300, Math.min(720, w - 14 - 420))] : [300, 720]; }
function applyWidth(px) {
  const [a, b] = bounds(); px = Math.round(Math.max(a, Math.min(b, px)));
  $('.main').style.setProperty('--rw', px + 'px');
  const d = $('#hdiv'); d.setAttribute('aria-valuenow', px); d.setAttribute('aria-valuemin', a); d.setAttribute('aria-valuemax', b);
  window.dispatchEvent(new Event('sol-panel-resize'));
  return px;
}
const saveWidth = () => { try { localStorage.setItem(RWK, String(rwPref)); } catch (e) {} };

// ---- phones and tablets: the sheet ----
export function sheetTo(s) { if (!isSheet()) return; const p = $('#panel'); p.dataset.snap = s; $('#grab').setAttribute('aria-expanded', String(s !== 'peek')); }
const snapPx = s => s === 'peek' ? 92 : s === 'half' ? Math.round(innerHeight * 0.52) : Math.round(innerHeight * 0.88);

export function initPanel() {
  try { const v = +localStorage.getItem(RWK); if (v) rwPref = v; } catch (e) {}
  applyWidth(rwPref || RW0);
  setMode('thread');

  const hd = $('#hdiv');
  hd.addEventListener('pointerdown', e => { if (e.pointerType === 'mouse' && e.button !== 0) return; e.preventDefault(); try { hd.setPointerCapture(e.pointerId); } catch (_) {} hd.classList.add('drag'); document.body.classList.add('dragging'); });
  hd.addEventListener('pointermove', e => { if (hd.classList.contains('drag')) rwPref = applyWidth($('.main').getBoundingClientRect().right - e.clientX - 7); });
  const end = () => { if (!hd.classList.contains('drag')) return; hd.classList.remove('drag'); document.body.classList.remove('dragging'); saveWidth(); };
  hd.addEventListener('pointerup', end); hd.addEventListener('pointercancel', end); hd.addEventListener('lostpointercapture', end);
  hd.addEventListener('dblclick', () => { rwPref = applyWidth(RW0); saveWidth(); });
  hd.addEventListener('keydown', e => {
    const step = e.shiftKey ? 72 : 24, now = +hd.getAttribute('aria-valuenow') || RW0, [a, b] = bounds();
    let n = null;
    if (e.key === 'ArrowLeft') n = now + step; else if (e.key === 'ArrowRight') n = now - step;
    else if (e.key === 'Home') n = b; else if (e.key === 'End') n = a; else if (e.key === 'Enter' || e.key === 'Escape') n = RW0;
    if (n == null) return; e.preventDefault(); rwPref = applyWidth(n); saveWidth();
  });
  addEventListener('resize', () => { if (rwPref) applyWidth(rwPref); });

  const sh = $('#panel'); let d = null;
  sh.addEventListener('pointerdown', e => {
    if (!isSheet()) return;
    if (e.target.closest('button') && !e.target.closest('#grab')) return;
    if (e.target.closest('.rp-body')) return;
    d = { y: e.clientY, h: sh.getBoundingClientRect().height, moved: false, onGrab: !!e.target.closest('#grab') };
    try { sh.setPointerCapture(e.pointerId); } catch (_) {}
    sh.classList.add('drag');
  });
  sh.addEventListener('pointermove', e => {
    if (!d) return;
    const dy = d.y - e.clientY; if (Math.abs(dy) > 4) d.moved = true;
    sh.style.height = Math.max(92, Math.min(innerHeight * 0.92, d.h + dy)) + 'px';
  });
  const finish = () => {
    if (!d) return;
    const h = sh.getBoundingClientRect().height, now = sh.dataset.snap;
    sh.classList.remove('drag'); sh.style.height = '';
    const next = !d.moved ? (d.onGrab ? SNAPS[(SNAPS.indexOf(now) + 1) % 3] : now) : SNAPS.reduce((a, b) => Math.abs(snapPx(b) - h) < Math.abs(snapPx(a) - h) ? b : a);
    d = null; sheetTo(next);
  };
  sh.addEventListener('pointerup', finish); sh.addEventListener('pointercancel', finish);
  $('#grab').addEventListener('click', e => { if (e.detail === 0) sheetTo(SNAPS[(SNAPS.indexOf(sh.dataset.snap) + 1) % 3]); });
  $('#grab').addEventListener('keydown', e => {
    const i = SNAPS.indexOf(sh.dataset.snap);
    if (e.key === 'ArrowUp') { e.preventDefault(); sheetTo(SNAPS[Math.min(2, i + 1)]); }
    if (e.key === 'ArrowDown') { e.preventDefault(); sheetTo(SNAPS[Math.max(0, i - 1)]); }
  });

  for (const k of ['thread', 'info']) {
    const b = $('#pm-' + k);
    b.addEventListener('click', () => { setMode(k); if (isSheet() && sh.dataset.snap === 'peek') sheetTo('half'); });
    b.addEventListener('keydown', e => { if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); const o = k === 'thread' ? 'info' : 'thread'; setMode(o); $('#pm-' + o).focus(); } });
  }
}
