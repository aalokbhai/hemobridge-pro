/* HemoBridge – shared helpers for the admin and hospital pages */
(function () {
  var HB = window.HB = {};
  HB.$ = function (s, r) { return (r || document).querySelector(s); };
  HB.$$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  HB.esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  HB.when = function (t) { return t ? new Date(t).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '-'; };
  HB.day = function (t) { return t ? new Date(t).toLocaleDateString('en-IN', { dateStyle: 'medium' }) : '-'; };
  HB.inr = function (n) { return '₹' + Number(n || 0).toLocaleString('en-IN'); };
  HB.badge = function (text, kind) { return '<span class="badge ' + (kind || '') + '">' + HB.esc(text) + '</span>'; };

  var timer;
  HB.toast = function (msg, bad) {
    var old = HB.$('.toast'); if (old) old.remove();
    var el = document.createElement('div'); el.className = 'toast' + (bad ? ' bad' : ''); el.setAttribute('role', 'status'); el.textContent = msg;
    document.body.appendChild(el); clearTimeout(timer); timer = setTimeout(function () { el.remove(); }, 4200);
  };

  // key = sessionStorage key, onExpire = session khatam hone par kya karna hai
  HB.client = function (key, onExpire) {
    var c = {
      token: function () { return sessionStorage.getItem(key); },
      set: function (t) { sessionStorage.setItem(key, t); },
      clear: function () { sessionStorage.removeItem(key); },
      call: function (path, o) {
        o = o || {};
        var h = { 'Content-Type': 'application/json' }, t = c.token();
        if (t) h.Authorization = 'Bearer ' + t;
        return fetch(path, { method: o.method || 'GET', headers: h, body: o.body ? JSON.stringify(o.body) : undefined })
          .catch(function () { throw new Error('Cannot reach the server. Check your connection and try again.'); })
          .then(function (r) {
            if (o.raw && r.ok) return r;
            return r.json().catch(function () { return {}; }).then(function (j) {
              if (r.status === 401 && t && path.indexOf('/login') < 0) { c.clear(); if (onExpire) onExpire(); throw new Error('Session expired. Please log in again.'); }
              if (!r.ok) { var e = new Error(j.error || 'Server error (' + r.status + ')'); e.status = r.status; e.code = j.code; throw e; }
              return j;
            });
          });
      }
    };
    return c;
  };
})();
