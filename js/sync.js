/* GitHub sync: stores the app state as a JSON file in the repo (on a separate data branch)
 * through the GitHub contents API, using a fine-grained personal access token the user pastes in.
 * The browser's localStorage is then only a cache. */
(function (root) {
  'use strict';

  const clone = (o) => JSON.parse(JSON.stringify(o));
  const keys = (o) => Object.keys(o || {});

  /* ---------- merge two states (local + remote), per day / per setting, newest edit wins ---------- */
  // state.stamps holds "last edited" times: 'd:<date>' for each day, 'x:<theme>/<exercise>' for time edits.
  function mergeStates(l, r) {
    l = l || {}; r = r || {};
    const ls = l.stamps || {}, rs = r.stamps || {};
    const out = { weeks: Math.max(l.weeks | 0, r.weeks | 0), done: {}, custom: {}, details: {}, stamps: {} };

    function mergeKeyed(prefix, lMap, rMap, outMap) {
      const ids = new Set(keys(lMap).concat(keys(rMap)));
      [ls, rs].forEach((s) => keys(s).forEach((k) => { if (k.indexOf(prefix) === 0) ids.add(k.slice(prefix.length)); }));
      ids.forEach((id) => {
        const a = ls[prefix + id] || 0, b = rs[prefix + id] || 0;
        const lHas = lMap && Object.prototype.hasOwnProperty.call(lMap, id);
        const rHas = rMap && Object.prototype.hasOwnProperty.call(rMap, id);
        const useRemote = b > a || (b === a && !lHas && rHas);
        const has = useRemote ? rHas : lHas;
        if (has) outMap[id] = clone((useRemote ? rMap : lMap)[id]);
        if (Math.max(a, b)) out.stamps[prefix + id] = Math.max(a, b);
      });
    }
    mergeKeyed('d:', l.done, r.done, out.done);
    mergeKeyed('x:', l.details, r.details, out.details);

    // custom exercises: union by id; a removal ("until") on either side wins
    new Set(keys(l.custom).concat(keys(r.custom))).forEach((t) => {
      const map = new Map();
      ((l.custom && l.custom[t]) || []).concat((r.custom && r.custom[t]) || []).forEach((e) => {
        const prev = map.get(e.id);
        if (!prev) map.set(e.id, clone(e));
        else if (e.until && (!prev.until || e.until < prev.until)) prev.until = e.until;
      });
      out.custom[t] = Array.from(map.values()).sort((a, b) =>
        a.from < b.from ? -1 : a.from > b.from ? 1 : a.id < b.id ? -1 : 1);
    });
    return out;
  }

  /* ---------- base64 <-> UTF-8 ---------- */
  function b64enc(str) {
    const bytes = new TextEncoder().encode(str);
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  }
  function b64dec(b64) {
    const bin = atob(b64.replace(/\s/g, ''));
    return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
  }

  /* ---------- the sync engine ---------- */
  // opts: { cfg:{owner,repo,branch,path}, getState(), applyState(state), hasData(state), onStatus(status) }
  function create(opts) {
    const cfg = opts.cfg;
    const TOKEN_KEY = 'footballTracker.token', DIRTY_KEY = 'footballTracker.dirty';
    const store = {
      get: (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } },
      set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* ignore */ } },
      del: (k) => { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } }
    };
    let token = store.get(TOKEN_KEY) || '';
    let dirty = store.get(DIRTY_KEY) === '1';
    let changeCount = 0;
    let remoteSha = null;
    let timer = null;
    let chain = Promise.resolve();
    let lastSyncAt = 0;
    const setDirty = (v) => { dirty = v; if (v) store.set(DIRTY_KEY, '1'); else store.del(DIRTY_KEY); };
    const status = (kind, message) => opts.onStatus({ kind, message: message || '', time: new Date(), dirty });

    function httpError(res) {
      const e = new Error(
        res.status === 401 ? 'GitHub rejected the token (expired or wrong)' :
        res.status === 403 ? 'The token isn’t allowed to write to this repo (or rate limit hit)' :
        res.status === 404 ? 'Repo not found — check the token has access to ' + cfg.repo :
        'GitHub error ' + res.status + (res.data && res.data.message ? ': ' + res.data.message : ''));
      e.status = res.status;
      return e;
    }
    async function api(method, path, body) {
      const res = await fetch('https://api.github.com/repos/' + cfg.owner + '/' + cfg.repo + path, {
        method, cache: 'no-store',
        headers: Object.assign({
          Accept: 'application/vnd.github+json',
          Authorization: 'Bearer ' + token,
          'X-GitHub-Api-Version': '2022-11-28'
        }, body ? { 'Content-Type': 'application/json' } : {}),
        body: body ? JSON.stringify(body) : undefined
      });
      let data = null;
      try { data = await res.json(); } catch (e) { /* no body */ }
      return { status: res.status, ok: res.ok, data };
    }
    const filePath = () => '/contents/' + cfg.path.split('/').map(encodeURIComponent).join('/');

    async function pullRemote() {
      const r = await api('GET', filePath() + '?ref=' + encodeURIComponent(cfg.branch));
      if (r.status === 200 && r.data && r.data.content != null) {
        remoteSha = r.data.sha;
        return { exists: true, state: JSON.parse(b64dec(r.data.content)) };
      }
      if (r.status === 404) {
        // Either the file or the whole data branch is missing. A 404 for a repo the token can't see
        // also lands here, so check the repo itself before assuming "empty".
        const repo = await api('GET', '');
        if (!repo.ok) throw httpError(repo);
        remoteSha = null;
        return { exists: false };
      }
      throw httpError(r);
    }
    async function ensureBranch() {
      const ref = await api('GET', '/git/ref/heads/' + cfg.branch.split('/').map(encodeURIComponent).join('/'));
      if (ref.ok) return;
      if (ref.status !== 404) throw httpError(ref);
      const repo = await api('GET', '');
      if (!repo.ok) throw httpError(repo);
      const base = await api('GET', '/git/ref/heads/' + repo.data.default_branch.split('/').map(encodeURIComponent).join('/'));
      if (!base.ok) throw httpError(base);
      const made = await api('POST', '/git/refs', { ref: 'refs/heads/' + cfg.branch, sha: base.data.object.sha });
      if (!made.ok && made.status !== 422) throw httpError(made); // 422 = already exists (race)
    }

    async function doSync(force) {
      if (!token) { status('off'); return; }
      status('syncing');
      try {
        for (let attempt = 0; attempt < 3; attempt++) {
          const remote = await pullRemote();
          const local = opts.getState();
          const v = changeCount;
          let merged = local;
          if (!force && remote.exists) {
            merged = mergeStates(local, remote.state);
            opts.applyState(merged);
          }
          const needPush = force || dirty || (!remote.exists && opts.hasData(merged));
          if (!needPush) { lastSyncAt = Date.now(); status('ok'); return; }
          if (!remote.exists) await ensureBranch();
          const body = {
            message: 'Update progress',
            content: b64enc(JSON.stringify(Object.assign({ version: 1 }, clone(merged)), null, 2)),
            branch: cfg.branch
          };
          if (remoteSha) body.sha = remoteSha;
          const put = await api('PUT', filePath(), body);
          if (put.ok) {
            remoteSha = put.data.content.sha;
            if (changeCount === v) setDirty(false);
            lastSyncAt = Date.now();
            status('ok');
            if (changeCount !== v) schedule(500); // edited while saving
            return;
          }
          if (put.status === 409 || put.status === 422) continue; // someone else saved first: re-read, merge, retry
          throw httpError(put);
        }
        throw new Error('Could not save — GitHub kept reporting a conflict');
      } catch (err) {
        if (err instanceof TypeError) { status('offline'); return; } // network failure
        status('error', err.message);
        throw err;
      }
    }
    // serialise all network work
    const run = (force) => (chain = chain.then(() => doSync(force), () => doSync(force)));
    function schedule(ms) {
      clearTimeout(timer);
      if (token) timer = setTimeout(() => { run(false).catch(() => {}); }, ms);
    }

    // refresh when the page comes back into view / network returns
    const refresh = () => {
      if (token && Date.now() - lastSyncAt > 15000) run(false).catch(() => {});
    };
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') refresh(); });
      window.addEventListener('online', () => { if (token) run(false).catch(() => {}); });
    }

    return {
      connected: () => !!token,
      isDirty: () => dirty,
      init() { if (token) run(false).catch(() => {}); else status('off'); },
      changed() { changeCount++; setDirty(true); schedule(2000); },
      now() { clearTimeout(timer); return run(false); },
      force() { // overwrite the remote with the local state (reset / import)
        changeCount++; setDirty(true); clearTimeout(timer);
        return token ? run(true).catch(() => {}) : Promise.resolve();
      },
      async connect(t) {
        token = String(t || '').trim();
        if (!token) throw new Error('Paste your token first');
        store.set(TOKEN_KEY, token);
        try { await run(false); }
        catch (err) {
          if (err.status === 401 || err.status === 403 || err.status === 404) { token = ''; store.del(TOKEN_KEY); status('off'); }
          throw err;
        }
      },
      disconnect() { token = ''; store.del(TOKEN_KEY); clearTimeout(timer); status('off'); }
    };
  }

  const api = { mergeStates, create, b64enc, b64dec };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.Sync = api;
})(typeof window !== 'undefined' ? window : globalThis);
