// Small DOM and formatting helpers shared by every view.
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Build an element: h('div.card', {onclick}, children...)
export function h(tag, attrs, ...kids) {
  const [name, ...classes] = tag.split('.');
  const e = document.createElement(name || 'div');
  if (classes.length) e.className = classes.join(' ');
  if (attrs && typeof attrs === 'object' && !(attrs instanceof Node)) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
      else if (k === 'html') e.innerHTML = v;
      else if (k === 'dataset') Object.assign(e.dataset, v);
      else e.setAttribute(k, v === true ? '' : v);
    }
  } else if (attrs != null) kids.unshift(attrs);
  for (const k of kids.flat(Infinity)) if (k != null && k !== false) e.append(k instanceof Node ? k : document.createTextNode(String(k)));
  return e;
}

export const usd = v => typeof v === 'number' ? '$' + v.toLocaleString('en-US') : (v || '');
export const fmtDate = iso => { if (!iso) return ''; const d = new Date(iso.length === 10 ? iso + 'T12:00:00' : iso); return isNaN(d) ? iso : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); };
export const daysSince = (iso, now = new Date()) => iso ? Math.round((now - new Date(iso.length === 10 ? iso + 'T12:00:00' : iso)) / 864e5) : null;
export const plural = (n, one, many = one + 's') => `${n} ${n === 1 ? one : many}`;
export const trunc = (t, n) => (t = String(t ?? '')).length > n ? t.slice(0, n - 1) + '…' : t;
export const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
