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
      .then(function (s) { show(s); msg.textContent = 'Loaded. Open Sol HQ to see the numbers.'; msg.className = 'ok'; })
      .catch(function (err) { msg.textContent = err.message; msg.className = 'bad'; });
  });
  refresh();
})();
