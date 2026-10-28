// Stands in for the Claude page runtime, so the prototype runs unchanged in the app.
// window.claude.use('db' | 'assets' | 'downloads') returns the same shapes the prototype uses there:
//   db:        collection(c).onSnapshot(cb, err) · collection(c).doc(id).set(obj) / .delete() · doc('c/id').set / .delete
//   assets:    upload(blob) -> {id, url, sizeBytes, contentType} · delete(id) · list()
//   downloads: save({filename, data})
// Everything is stored by this server (data/state, never in git). Other people's changes arrive by polling every few seconds.
// __D(name, empty) hands the page its company data from /ui-data.js, or the empty shape when the data file is not loaded.
(function () {
  'use strict';
  window.__D = function (name, fallback) { var d = window.SOL_DATA; return d && d.v && Object.prototype.hasOwnProperty.call(d.v, name) ? d.v[name] : fallback; };

  var H = { 'Content-Type': 'application/json', 'X-Sol': '1' };
  function call(method, url, body) {
    return fetch(url, { method: method, headers: H, body: body === undefined ? undefined : JSON.stringify(body), credentials: 'same-origin' })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok) { var e = new Error(j.error || r.statusText); e.code = j.code || 'http_' + r.status; throw e; } return j; }); });
  }

  // one cache per collection: id -> data, plus the listeners and the server's revision
  var cols = {}, revs = {};
  function col(name) { return cols[name] || (cols[name] = { docs: {}, subs: [], loaded: false }); }
  function snap(c) { var ids = Object.keys(c.docs); return { size: ids.length, empty: !ids.length, docs: ids.map(function (id) { var v = c.docs[id]; return { id: id, exists: true, data: function () { return JSON.parse(JSON.stringify(v)); } }; }) }; }
  function emit(name) { var c = col(name), s = snap(c); c.subs.slice().forEach(function (f) { try { f[0](s); } catch (e) { console.error(e); } }); }
  function load(name) {
    return call('GET', '/api/store/' + encodeURIComponent(name)).then(function (j) {
      var c = col(name); c.docs = {}; (j.docs || []).forEach(function (d) { c.docs[d.id] = d.data; }); c.loaded = true; revs[name] = j.rev; emit(name);
    });
  }
  var polling = false;
  function poll() {
    var names = Object.keys(cols).filter(function (n) { return cols[n].subs.length; });
    if (!names.length || document.hidden) return;
    call('GET', '/api/store?rev=1').then(function (j) {
      names.forEach(function (n) { if ((j.revs || {})[n] !== revs[n]) load(n).catch(function () {}); });
    }).catch(function () {});
  }
  function startPoll() { if (polling) return; polling = true; setInterval(poll, 4000); document.addEventListener('visibilitychange', poll); }

  function docRef(name, id) {
    return {
      id: id,
      set: function (obj) {
        var c = col(name), data = JSON.parse(JSON.stringify(obj || {}));
        return call('PUT', '/api/store/' + encodeURIComponent(name) + '/' + encodeURIComponent(id), data).then(function (j) { c.docs[id] = data; revs[name] = j.rev; emit(name); });
      },
      delete: function () {
        var c = col(name);
        return call('DELETE', '/api/store/' + encodeURIComponent(name) + '/' + encodeURIComponent(id)).then(function (j) { delete c.docs[id]; revs[name] = j.rev; emit(name); });
      },
      get: function () { return call('GET', '/api/store/' + encodeURIComponent(name)).then(function (j) { var d = (j.docs || []).find(function (x) { return x.id === id; }); return { id: id, exists: !!d, data: function () { return d ? d.data : undefined; } }; }); }
    };
  }
  var db = {
    collection: function (name) {
      return {
        doc: function (id) { return docRef(name, String(id)); },
        onSnapshot: function (cb, err) {
          var c = col(name), sub = [cb, err]; c.subs.push(sub);
          if (c.loaded) setTimeout(function () { cb(snap(c)); }, 0); else load(name).catch(function (e) { if (err) err(e); });
          startPoll();
          return function () { c.subs = c.subs.filter(function (s) { return s !== sub; }); };
        }
      };
    },
    doc: function (pathStr) { var p = String(pathStr).split('/'); return docRef(p[0], p.slice(1).join('/')); }
  };

  var assets = {
    upload: function (blob) {
      // browsers often give CSV, Markdown and text files an empty or spreadsheet type; name the type from the extension instead
      var ext = String(blob.name || '').toLowerCase().split('.').pop(), byExt = { csv: 'text/csv', md: 'text/markdown', txt: 'text/plain', json: 'application/json' };
      var type = byExt[ext] && !/^(image\/|application\/pdf)/.test(blob.type) ? byExt[ext] : blob.type || 'application/octet-stream';
      return fetch('/api/assets', { method: 'POST', headers: { 'Content-Type': type, 'X-Sol': '1', 'X-Name': encodeURIComponent(blob.name || '') }, body: blob, credentials: 'same-origin' })
        .then(function (r) { return r.json().then(function (j) { if (!r.ok) { var e = new Error(j.error || 'upload failed'); e.code = j.code || 'http_' + r.status; throw e; } return j; }); });
    },
    delete: function (id) { return call('DELETE', '/api/assets/' + encodeURIComponent(id)); },
    list: function () { return call('GET', '/api/assets'); }
  };

  var downloads = {
    save: function (o) {
      var blob = o.data instanceof Blob ? o.data : new Blob([o.data], { type: o.type || 'text/plain' });
      var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = o.filename || 'download';
      document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
      return Promise.resolve({ saved: true });
    }
  };

  // App only: a small notice when the company data file has not been loaded on this server yet.
  document.addEventListener('DOMContentLoaded', function () {
    if (window.SOL_DATA) return;
    var n = document.createElement('div'); n.setAttribute('role', 'status');
    n.style.cssText = 'position:fixed;right:max(16px,env(safe-area-inset-right,0px));bottom:max(16px,env(safe-area-inset-bottom,0px));z-index:200;max-width:min(360px,calc(100vw - 32px));background:#2a2412;border:1px solid #F2B655;color:#E8EEF2;border-radius:12px;padding:10px 12px;font:13px/1.4 Inter,system-ui,sans-serif;display:flex;gap:10px;align-items:flex-start';
    n.innerHTML = '<span><b>Company data is not loaded yet.</b> Money, deals and the tracker show empty until a founder <a href="/admin" style="color:#8CC4FF">loads the data file</a>.</span><button type="button" aria-label="Dismiss" style="background:none;border:0;color:inherit;font-size:16px;cursor:pointer">×</button>';
    n.querySelector('button').onclick = function () { n.remove(); };
    document.body.appendChild(n);
  });

  // App only: MVP mode (SOL_MVP=1) hides the customer journey, which Pooya parked on the Oct 28 keep-or-cut list.
  // Nothing is removed from the page; unset SOL_MVP to bring it back.
  if (window.SOL_CONFIG && window.SOL_CONFIG.mvp) {
    var hide = document.createElement('style');
    hide.textContent = '#t-jour{display:none!important}';
    document.head.appendChild(hide);
    document.addEventListener('DOMContentLoaded', function () {
      if (location.hash === '#journey') { var g = document.getElementById('t-hq'); if (g) g.click(); }
    });
  }

  // App only: the Playbook links to Soph's SOP library, the one copy of the SOPs (Pooya + Dickson, Oct 28: "Link from Playbook").
  var SOP_URL = 'https://claude.ai/artifact/1zNwKNRKZK7nfVQVobk9T3';
  document.addEventListener('DOMContentLoaded', function () {
    var hero = document.querySelector('#tab-pb .inv-hero');
    if (!hero || document.getElementById('sop-link')) return;
    var c = document.createElement('div'); c.className = 'card'; c.id = 'sop-link';
    c.innerHTML = '<div class="eyebrow">How we work · SOP library</div><p style="margin:4px 0 8px">SOP-01 to SOP-10: search them, read one page per SOP, see what happens when, and suggest an edit. Soph keeps them; this is a link, not a copy.</p><a class="btn" target="_blank" rel="noopener" href="' + SOP_URL + '">Open the SOP library ↗</a>';
    hero.insertAdjacentElement('afterend', c);
  });

  var caps = { db: db, assets: assets, downloads: downloads };
  window.claude = { use: function (name) { return Promise.resolve(caps[name] || null); } };
})();
