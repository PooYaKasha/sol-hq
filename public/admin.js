// Sol HQ data file page: shows what is loaded and replaces it.
(function () {
  'use strict';
  var st = document.getElementById('status'), msg = document.getElementById('msg');
  function show(s) {
    if (!s.loaded) { st.innerHTML = '<p class="bad"><b>No data file loaded.</b> Sol HQ shows empty money, deals and tracker panels until one is.</p>'; return; }
    var m = s.meta || {};
    st.innerHTML = '<p class="ok"><b>Data file loaded.</b></p><p>Built ' + esc(m.built ? new Date(m.built).toLocaleString() : 'unknown') + ' from ' + esc(m.source || 'unknown') + ' · ' + esc(String(m.constants || '?')) + ' data sets · loaded here ' + esc(new Date(s.at).toLocaleString()) + ' · ' + Math.round(s.bytes / 1024) + ' KB</p>';
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function refresh() { fetch('/api/ui-data', { credentials: 'same-origin' }).then(function (r) { return r.json(); }).then(show).catch(function () { st.innerHTML = '<p class="bad">Could not reach the server.</p>'; }); }
  document.getElementById('up').addEventListener('submit', function (e) {
    e.preventDefault();
    var f = document.getElementById('file').files[0]; if (!f) return;
    msg.textContent = 'Loading…'; msg.className = '';
    f.text().then(function (text) {
      return fetch('/api/ui-data', { method: 'PUT', headers: { 'Content-Type': 'text/javascript', 'X-Sol': '1' }, body: text, credentials: 'same-origin' });
    }).then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || 'Upload failed'); return j; }); })
      .then(function (s) { show(s); return applySeed(); })
      .then(function (n) { msg.textContent = 'Loaded.' + (n ? ' ' + n + ' saved answer' + (n === 1 ? '' : 's') + ' added to Sol HQ.' : '') + ' Open Sol HQ to see the numbers.'; msg.className = 'ok'; })
      .catch(function (err) { msg.textContent = err.message; msg.className = 'bad'; });
  });
  // Saved answers that ride in the data file (seed): written once, only where Sol HQ has no answer of its own yet.
  function applySeed() {
    return new Promise(function (resolve) {
      var sc = document.createElement('script'); sc.src = '/ui-data.js?t=' + Date.now();
      sc.onload = function () { resolve((window.SOL_DATA && window.SOL_DATA.seed) || {}); }; sc.onerror = function () { resolve({}); };
      document.head.appendChild(sc);
    }).then(function (seed) {
      var H = { 'Content-Type': 'application/json', 'X-Sol': '1' }, added = 0;
      return Object.keys(seed).reduce(function (p, c) {
        return p.then(function () { return fetch('/api/store/' + encodeURIComponent(c), { credentials: 'same-origin' }).then(function (r) { return r.json(); }); })
          .then(function (j) {
            var have = {}; (j.docs || []).forEach(function (d) { have[d.id] = 1; });
            return Object.keys(seed[c]).filter(function (id) { return !have[id]; }).reduce(function (q, id) {
              return q.then(function () { return fetch('/api/store/' + encodeURIComponent(c) + '/' + encodeURIComponent(id), { method: 'PUT', headers: H, body: JSON.stringify(seed[c][id]), credentials: 'same-origin' }).then(function (r) { if (r.ok) added++; }); });
            }, Promise.resolve());
          });
      }, Promise.resolve()).then(function () { return added; });
    });
  }
  refresh();
})();
