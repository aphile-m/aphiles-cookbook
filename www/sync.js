/* sync.js — Cookbook Sync Module (Trainer App SPEC §5.5). Self-contained, dormant
   until signed in. Shares the Supabase project with the Trainer App:
     OUT: pantry, recipes, cooked events (finishCooking is wrapped, not modified)
     IN:  this week's agreed meal plan + Trainer-generated shopping items
   Kitchen data (pantry/shopping) stays cookbook-owned; plans stay Trainer-owned. */
(function () {
  'use strict';

  var SB_URL = 'https://uaqvqvrflzxulixdrmna.supabase.co';
  var SB_KEY = 'sb_publishable_o1xfAQwaiVwuPkZOWgZfFw_2AsUlCOz';
  var CFG_KEY = 'cookbook_sync_v1';

  function cfg() { try { return JSON.parse(localStorage.getItem(CFG_KEY)) || {}; } catch (e) { return {}; } }
  function saveCfg(patch) {
    var next = Object.assign(cfg(), patch);
    localStorage.setItem(CFG_KEY, JSON.stringify(next));
    return next;
  }
  function signedIn() { return !!cfg().session; }

  /* ---------- auth ---------- */
  async function authFetch(path, body) {
    var res = await fetch(SB_URL + '/auth/v1/' + path, {
      method: 'POST',
      headers: { 'content-type': 'application/json', apikey: SB_KEY },
      body: JSON.stringify(body),
    });
    var data = await res.json().catch(function () { return {}; });
    if (!res.ok) throw new Error(data.msg || data.error_description || 'Sign-in failed (' + res.status + ')');
    return data;
  }
  function saveSession(d) {
    saveCfg({ session: {
      access_token: d.access_token, refresh_token: d.refresh_token,
      expires_at: Math.floor(Date.now() / 1000) + (d.expires_in || 3600),
    } });
  }
  async function token() {
    var s = cfg().session;
    if (!s) throw new Error('Not signed in.');
    if (s.expires_at - 60 < Date.now() / 1000) {
      saveSession(await authFetch('token?grant_type=refresh_token', { refresh_token: s.refresh_token }));
      s = cfg().session;
    }
    return s.access_token;
  }

  /* ---------- REST ---------- */
  async function sbFetch(method, pathAndQuery, body) {
    var res = await fetch(SB_URL + '/rest/v1/' + pathAndQuery, {
      method: method,
      headers: {
        'content-type': 'application/json',
        apikey: SB_KEY,
        authorization: 'Bearer ' + (await token()),
        prefer: method === 'POST' ? 'resolution=merge-duplicates,return=minimal' : 'return=minimal',
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) throw new Error('Sync failed (' + res.status + ') ' + (await res.text()).slice(0, 100));
    return res.status === 204 ? null : res.json();
  }
  async function sbGet(pathAndQuery) {
    var res = await fetch(SB_URL + '/rest/v1/' + pathAndQuery, {
      headers: { apikey: SB_KEY, authorization: 'Bearer ' + (await token()) },
    });
    if (!res.ok) throw new Error('Fetch failed (' + res.status + ')');
    return res.json();
  }

  /* ---------- OUT: pantry, recipes ---------- */
  async function pushAll() {
    // pantry: manual items + everything currently marked "have" across recipes
    var have = (typeof buildHaveItems === 'function') ? buildHaveItems() : [];
    var pantryRows = have.map(function (p) {
      return { name: p.name, category: p.cat || null, updated_at: new Date().toISOString() };
    });
    if (pantryRows.length) await sbFetch('POST', 'shared_pantry_items?on_conflict=user_id,name', pantryRows);

    // recipes: full library keyed by cookbook id
    var recipeRows = state.recipes.map(function (r) {
      return {
        source_id: 'cookbook-' + r.id, title: r.name, source_app: 'cookbook',
        recipe: r, updated_at: new Date().toISOString(),
      };
    });
    if (recipeRows.length) await sbFetch('POST', 'shared_recipes?on_conflict=user_id,source_id', recipeRows);
    saveCfg({ lastSync: new Date().toISOString() });
    return { pantry: pantryRows.length, recipes: recipeRows.length };
  }

  /* cooked events: wrap finishCooking without touching core code */
  var origFinish = null;
  function armCookedEvents() {
    if (origFinish || typeof window.finishCooking !== 'function') return;
    origFinish = window.finishCooking;
    window.finishCooking = function () {
      try {
        if (signedIn()) {
          var r = (typeof cur === 'function') ? cur() : null;
          var p = r && state.progress[r.id];
          sbFetch('POST', 'shared_cooked_events', [{
            recipe_id: null, servings: (p && p.servings) || (r && r.base) || 1, consumed: true,
          }]).catch(function () {});
        }
      } catch (e) { /* never break cooking over sync */ }
      return origFinish.apply(this, arguments);
    };
  }

  /* ---------- IN: this week's plan + trainer shopping items ---------- */
  function mondayOf() {
    var d = new Date();
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return d.toISOString().slice(0, 10);
  }
  async function fetchPlan() {
    var plans = await sbGet('shared_meal_plans?select=week_start,plan&week_start=eq.' + mondayOf());
    var extras = await sbGet('shared_shopping_items?select=id,name,quantity,checked&source_app=eq.trainer&checked=eq.false&order=name');
    return { plan: plans[0] || null, extras: extras };
  }

  /* ---------- UI (injected into the settings sheet + pantry screen) ---------- */
  function h(html) { var d = document.createElement('div'); d.innerHTML = html; return d.firstElementChild; }

  function injectSettings() {
    var sheet = document.querySelector('#set-overlay .sheet') || document.getElementById('set-overlay');
    if (!sheet || document.getElementById('tsync-card')) return;
    var card = h(
      '<div id="tsync-card" style="margin-top:14px;padding:14px;border:1px solid rgba(0,0,0,.1);border-radius:12px">' +
      '<div class="set-label">Trainer App sync</div>' +
      '<div id="tsync-body"></div></div>');
    sheet.appendChild(card);
    renderSyncBody();
  }

  function renderSyncBody() {
    var body = document.getElementById('tsync-body');
    if (!body) return;
    if (!signedIn()) {
      body.innerHTML =
        '<p style="font-size:13px;opacity:.75;margin:6px 0">Connects this cookbook to Trainer App — pantry & recipes go up, Vic’s agreed meal plan comes back.</p>' +
        '<input id="tsync-email" class="add-input" type="email" placeholder="email" value="' + (cfg().email || 'aphilem@gmail.com') + '" style="margin-bottom:8px">' +
        '<input id="tsync-pass" class="add-input" type="password" placeholder="password">' +
        '<button class="btn-primary" style="margin-top:10px;padding:12px" id="tsync-signin">Sign in & sync</button>' +
        '<div id="tsync-status" style="font-size:13px;margin-top:8px;opacity:.75"></div>';
      document.getElementById('tsync-signin').onclick = async function () {
        var st = document.getElementById('tsync-status');
        try {
          var email = document.getElementById('tsync-email').value.trim();
          saveCfg({ email: email });
          saveSession(await authFetch('token?grant_type=password', {
            email: email, password: document.getElementById('tsync-pass').value,
          }));
          st.textContent = 'Signed in — syncing…';
          var c = await pushAll();
          st.textContent = 'Synced: ' + c.recipes + ' recipes, ' + c.pantry + ' pantry items ✓';
          renderSyncBody();
        } catch (e) { st.textContent = '⚠️ ' + e.message; }
      };
    } else {
      body.innerHTML =
        '<p style="font-size:13px;opacity:.75;margin:6px 0">Connected ✓ Last sync: ' + (cfg().lastSync ? cfg().lastSync.slice(0, 16).replace('T', ' ') : 'never') + '</p>' +
        '<button class="btn-primary" style="padding:12px" id="tsync-now">Sync now</button> ' +
        '<button class="btn-primary" style="padding:12px;opacity:.8" id="tsync-plan">This week’s plan</button>' +
        '<div id="tsync-status" style="font-size:13px;margin-top:8px;opacity:.75"></div>';
      document.getElementById('tsync-now').onclick = async function () {
        var st = document.getElementById('tsync-status');
        st.textContent = 'Syncing…';
        try {
          var c = await pushAll();
          st.textContent = 'Synced: ' + c.recipes + ' recipes, ' + c.pantry + ' pantry items ✓';
        } catch (e) { st.textContent = '⚠️ ' + e.message; }
      };
      document.getElementById('tsync-plan').onclick = showPlanOverlay;
    }
  }

  async function showPlanOverlay() {
    var old = document.getElementById('tsync-plan-ov');
    if (old) old.remove();
    var ov = h('<div id="tsync-plan-ov" style="position:fixed;inset:0;background:rgba(0,0,0,.75);z-index:99;display:flex;align-items:center;justify-content:center;padding:20px">' +
      '<div style="background:#fff;color:#222;border-radius:16px;padding:20px;max-width:420px;width:100%;max-height:80vh;overflow-y:auto">' +
      '<h3 style="margin:0 0 10px">This week’s plan</h3><div id="tsync-plan-body">Loading…</div>' +
      '<button class="btn-primary" style="margin-top:12px;padding:12px" onclick="document.getElementById(\'tsync-plan-ov\').remove()">Close</button></div></div>');
    document.body.appendChild(ov);
    var bodyEl = document.getElementById('tsync-plan-body');
    try {
      var data = await fetchPlan();
      var html = '';
      if (data.plan) {
        html += (data.plan.plan || []).map(function (d) {
          return '<p style="margin:4px 0"><b>' + d.day + ':</b> ' + d.meal + (d.kcal ? ' · ~' + d.kcal + ' kcal' : '') + '</p>';
        }).join('');
      } else {
        html += '<p style="opacity:.7">No agreed plan for this week yet — ask Vic in Trainer App.</p>';
      }
      if (data.extras.length) {
        html += '<h4 style="margin:12px 0 6px">Extra shopping (from Vic’s plan)</h4>' +
          data.extras.map(function (i) {
            return '<label style="display:block;margin:3px 0"><input type="checkbox" data-tsid="' + i.id + '"> ' +
              i.name + (i.quantity ? ' · ' + i.quantity : '') + '</label>';
          }).join('') +
          '<p style="font-size:12px;opacity:.6">Tick when bought — it syncs back.</p>';
      }
      bodyEl.innerHTML = html || '<p style="opacity:.7">Nothing here yet.</p>';
      bodyEl.querySelectorAll('input[data-tsid]').forEach(function (cb) {
        cb.addEventListener('change', function () {
          sbFetch('PATCH', 'shared_shopping_items?id=eq.' + cb.getAttribute('data-tsid'), { checked: cb.checked })
            .catch(function () {});
        });
      });
    } catch (e) {
      bodyEl.innerHTML = '<p>⚠️ ' + e.message + '</p>';
    }
  }

  /* ---------- boot: dormant unless the app is present ---------- */
  function boot() {
    if (typeof state === 'undefined') return; // not the cookbook page — do nothing
    armCookedEvents();
    var origOpen = window.openSettings;
    if (typeof origOpen === 'function' && !origOpen._tsync) {
      window.openSettings = function () { origOpen.apply(this, arguments); injectSettings(); };
      window.openSettings._tsync = true;
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
