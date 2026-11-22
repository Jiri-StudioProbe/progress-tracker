(function () {
  'use strict';

  const C = window.TRAINING_CONFIG;
  const KEY = 'footballTracker.v1';

  /* ---------------- dates (kept as local 'YYYY-MM-DD' strings) ---------------- */
  const pad = (n) => String(n).padStart(2, '0');
  const toStr = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const parse = (s) => { const p = s.split('-').map(Number); return new Date(p[0], p[1] - 1, p[2]); };
  const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return toStr(d); };
  const diffDays = (a, b) => Math.round((parse(b) - parse(a)) / 864e5);
  const today = () => toStr(new Date());
  const fmt = (s, opts) => parse(s).toLocaleDateString('en-GB', opts);
  const longDate = (s) => fmt(s, { weekday: 'long', day: 'numeric', month: 'long' });
  const shortDate = (s) => fmt(s, { day: 'numeric', month: 'short' });
  const esc = (t) => String(t == null ? '' : t).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* ---------------- state ---------------- */
  // state = { weeks, done: { date: { themeId: [exerciseId] } }, custom: { themeId: [{id,name,detail,from,until?}] } }
  function normalize(s) {
    s = s && typeof s === 'object' ? s : {};
    return {
      weeks: Number.isInteger(s.weeks) && s.weeks >= C.weeks && s.weeks <= 104 ? s.weeks : C.weeks,
      done: s.done && typeof s.done === 'object' && !Array.isArray(s.done) ? s.done : {},
      custom: s.custom && typeof s.custom === 'object' && !Array.isArray(s.custom) ? s.custom : {},
      details: s.details && typeof s.details === 'object' && !Array.isArray(s.details) ? s.details : {},
      // "last edited" times (ms) used to merge changes made on different devices: 'd:<date>' and 'x:<theme>/<exercise>'
      stamps: s.stamps && typeof s.stamps === 'object' && !Array.isArray(s.stamps) ? s.stamps : {}
    };
  }
  const touch = (key) => { state.stamps[key] = Date.now(); };
  let saveWarned = false;
  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) return normalize(JSON.parse(raw));
    } catch (e) { /* fall through to empty state */ }
    return normalize({});
  }
  // Saves to this browser (a cache) and, if GitHub sync is on, queues an upload.
  function save(fromSync) {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch (e) {
      if (!saveWarned) { saveWarned = true; toast('Could not save in this browser (private mode?).', true); }
    }
    if (!fromSync && sync) sync.changed();
  }
  let state = load();
  let sync = null;

  const START = C.startDate;
  const endDate = () => addDays(START, state.weeks * 7 - 1);
  const totalDays = () => state.weeks * 7;

  /* ---------------- plan logic ---------------- */
  // Exercises available to a theme on a given date (custom ones apply from the day they were added,
  // so adding/removing an exercise never rewrites the status of past days).
  function exercisesOn(theme, date) {
    const extra = (state.custom[theme.id] || []).filter((e) => e.from <= date && (!e.until || date < e.until));
    return theme.exercises.concat(extra);
  }
  // The time/detail shown against an exercise: the user's edit if there is one, else the default.
  const detailKey = (themeId, exId) => themeId + '/' + exId;
  function detailOf(themeId, ex) {
    const k = detailKey(themeId, ex.id);
    return Object.prototype.hasOwnProperty.call(state.details, k) ? String(state.details[k]) : (ex.detail || '');
  }
  function themeStatus(date, theme) {
    const avail = exercisesOn(theme, date);
    const ids = new Set(avail.map((e) => e.id));
    const ticked = ((state.done[date] || {})[theme.id] || []).filter((id) => ids.has(id));
    const need = Math.min(C.minPerTheme, avail.length);
    return { avail, ticked, done: ticked.length, need, complete: ticked.length >= need };
  }
  // Themes with a weeklyTarget are tracked every day but don't block a day from completing.
  const isDaily = (theme) => !theme.weeklyTarget;
  const dailyThemes = C.themes.filter(isDaily);
  const weeklyThemes = C.themes.filter((t) => !isDaily(t));
  function dayStatus(date) {
    const themes = C.themes.map((t) => themeStatus(date, t));
    const n = themes.filter((t, i) => isDaily(C.themes[i]) && t.complete).length;
    return {
      themes, themesDone: n, dailyCount: dailyThemes.length,
      complete: n === dailyThemes.length,
      everyTheme: themes.every((t) => t.complete)
    };
  }
  // How a weekly-target theme is doing in plan week `w` (0-based).
  function themeWeek(theme, w) {
    const t = today(), first = addDays(START, w * 7);
    let count = 0, left = 0;
    for (let d = 0; d < 7; d++) {
      const date = addDays(first, d);
      if (themeStatus(date, theme).complete) count++;
      else if (date >= t) left++; // today (if not done yet) and later days can still add to the count
    }
    const target = Math.min(theme.weeklyTarget, 7);
    return { count, target, left, met: count >= target, reachable: count + left >= target, over: addDays(first, 6) < t };
  }
  function lastElapsed() { // last plan day that has started, or null if the plan hasn't begun
    const t = today();
    if (t < START) return null;
    const e = endDate();
    return t > e ? e : t;
  }
  function streaks() {
    const last = lastElapsed();
    if (!last) return { current: 0, best: 0 };
    const n = diffDays(START, last) + 1;
    let best = 0, run = 0;
    for (let i = 0; i < n; i++) {
      if (dayStatus(addDays(START, i)).complete) { run++; best = Math.max(best, run); } else run = 0;
    }
    let cur = 0, i = n - 1;
    if (last === today() && !dayStatus(last).complete) i--; // today still in progress doesn't break the streak
    for (; i >= 0 && dayStatus(addDays(START, i)).complete; i--) cur++;
    return { current: cur, best };
  }

  /* ---------------- view state ---------------- */
  let view = 'today';
  let editing = null; // 'themeId/exId' while a time is being edited
  let selected = (function () {
    const t = today(), e = endDate();
    return t < START ? START : t > e ? e : t;
  })();

  /* ---------------- rendering ---------------- */
  function renderToday() {
    const date = selected, t = today();
    const idx = diffDays(START, date);
    const status = dayStatus(date);
    const future = date > t;
    let html = '';

    if (t < START) {
      const n = diffDays(t, START);
      html += '<div class="banner">Your plan starts ' + (n === 1 ? 'tomorrow' : 'in ' + n + ' days') +
        ' — ' + longDate(START) + '. Have a look around, ticking opens on the day.</div>';
    } else if (t > endDate()) {
      html += '<div class="banner">🎉 Plan finished! See how you did in Progress, or add another week in Settings.</div>';
    }

    html += '<div class="day-nav">' +
      '<button class="icon-btn" data-action="shift" data-n="-1" aria-label="Previous day"' + (idx <= 0 ? ' disabled' : '') + '>‹</button>' +
      '<div class="title"><strong>' + esc(longDate(date)) + '</strong><span>Day ' + (idx + 1) + ' of ' + totalDays() +
      ' · Week ' + (Math.floor(idx / 7) + 1) + '</span></div>' +
      '<button class="icon-btn" data-action="shift" data-n="1" aria-label="Next day"' + (date >= endDate() ? ' disabled' : '') + '>›</button>' +
      '</div>';

    if (date !== t && t >= START && t <= endDate()) {
      html += '<button class="btn go-today" data-action="today">Jump to today</button>';
    }

    html += '<div class="day-summary"><div style="flex:1"><div class="bar"><i style="width:' +
      (status.themesDone / status.dailyCount * 100) + '%"></i></div></div>' +
      '<span class="pill' + (status.complete ? ' done' : '') + '">' +
      (status.complete ? 'Day complete ✓' : status.themesDone + ' / ' + status.dailyCount + ' daily themes') + '</span></div>';
    if (weeklyThemes.length) {
      html += '<p class="note" style="margin-top:6px">' + weeklyThemes.map((x) => esc(x.name)).join(' and ') +
        ' count toward weekly targets, not the daily total.</p>';
    }

    if (future) html += '<div class="banner">🔒 This day hasn’t arrived yet, so ticking is locked.</div>';

    C.themes.forEach((theme, i) => {
      const ts = status.themes[i];
      const flexible = !isDaily(theme);
      let weekly = '';
      if (flexible) {
        const tw = themeWeek(theme, Math.floor(idx / 7));
        let msg;
        if (tw.met) msg = '✓ target met';
        else if (tw.over) msg = 'target missed this week';
        else if (!tw.reachable) msg = 'can’t reach it this week';
        else msg = tw.left + ' day' + (tw.left === 1 ? '' : 's') + ' left';
        weekly = '<p class="weekly' + (!tw.met && !tw.reachable ? ' warn' : '') + '">This week: <b>' + tw.count + ' / ' + tw.target +
          '</b> days · ' + msg + '</p>';
      }
      html += '<section class="card theme-card' + (ts.complete ? ' complete' : '') + (future ? ' locked' : '') +
        '" style="--c:' + theme.color + '">' +
        '<div class="theme-head"><span aria-hidden="true">' + theme.icon + '</span>' +
        '<h2 class="name">' + esc(theme.name) + '</h2>' + (flexible ? '<span class="tag">weekly</span>' : '') +
        '<span class="count">' + ts.done + '/' + ts.need + (ts.complete ? ' ✓' : '') + '</span></div>' +
        '<div class="bar"><i style="width:' + (ts.need ? Math.min(100, ts.done / ts.need * 100) : 100) + '%"></i></div>' +
        '<p class="need muted">' + (flexible ? 'Optional today — ' : '') + 'Do at least ' + ts.need + ' of ' + ts.avail.length + ' exercise' + (ts.avail.length === 1 ? '' : 's') +
        (flexible ? ' for today to count toward your weekly target' : '') +
        (ts.avail.length < C.minPerTheme ? ' (add more in Settings to reach ' + C.minPerTheme + ')' : '') + '</p>' + weekly +
        '<div class="ex-list">';
      ts.avail.forEach((ex) => {
        const on = ts.ticked.indexOf(ex.id) >= 0;
        const detail = detailOf(theme.id, ex);
        const ids = 'data-theme="' + esc(theme.id) + '" data-ex="' + esc(ex.id) + '"';
        html += '<div class="ex-wrap"><div class="ex-row">' +
          '<button class="ex" data-action="toggle" ' + ids + ' aria-pressed="' + on + '">' +
          '<span class="box" aria-hidden="true">✓</span><span class="label">' + esc(ex.name) + '</span></button>' +
          '<button class="time' + (detail ? '' : ' empty') + '" data-action="edit-time" ' + ids +
          ' aria-label="Edit time for ' + esc(ex.name) + '">' + (detail ? esc(detail) : '+ time') + '</button></div>';
        if (editing === detailKey(theme.id, ex.id)) {
          html += '<form class="time-form" ' + ids + '>' +
            '<input name="detail" value="' + esc(detail) + '" maxlength="20" placeholder="e.g. 10 min" ' +
            'aria-label="Time for ' + esc(ex.name) + '" autocomplete="off">' +
            '<button class="btn primary" type="submit">Save</button>' +
            '<button class="btn" type="button" data-action="cancel-time">Cancel</button></form>';
        }
        html += '</div>';
      });
      html += '</div></section>';
    });
    return html;
  }

  function renderPlan() {
    const t = today();
    let html = '<p class="muted" style="margin-top:6px">Tap a day to open it. A day is complete when ' +
      dailyThemes.map((x) => x.icon).join(' ') + ' are done. Dots show every theme (' + C.themes.map((x) => x.icon).join(' ') +
      ')' + (weeklyThemes.length ? '; ' + weeklyThemes.map((x) => x.icon).join(' ') + ' are weekly targets.' : '.') + '</p>';
    for (let w = 0; w < state.weeks; w++) {
      const first = addDays(START, w * 7);
      let completeDays = 0;
      let tiles = '';
      for (let d = 0; d < 7; d++) {
        const date = addDays(first, d);
        const s = dayStatus(date);
        if (s.complete) completeDays++;
        const cls = ['tile'];
        if (s.complete) cls.push('complete');
        else if (date < t) cls.push('missed');
        if (date > t) cls.push('future');
        if (date === t) cls.push('today');
        tiles += '<button class="' + cls.join(' ') + '" data-action="goto" data-date="' + date + '" aria-label="' +
          esc(longDate(date)) + ', ' + s.themesDone + ' of ' + s.dailyCount + ' daily themes done">' +
          '<span class="dnum">' + parse(date).getDate() + '</span>' +
          '<span class="dmon">' + fmt(date, { month: 'short' }) + '</span>' +
          '<span class="dots">' + C.themes.map((th, i) =>
            '<i class="' + (s.themes[i].complete ? 'on' : '') + '" style="--c:' + th.color + '"></i>').join('') + '</span>' +
          '</button>';
      }
      const dow = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((x) => '<div class="dow">' + x + '</div>').join('');
      html += '<div class="week-head" style="margin-top:18px"><h2>Week ' + (w + 1) + '</h2><span>' +
        shortDate(first) + ' – ' + shortDate(addDays(first, 6)) + ' · ' + completeDays + '/7 days</span></div>' +
        weekChips(w) +
        '<div class="week-grid">' + dow + tiles + '</div>';
    }
    html += '<div class="legend">' + C.themes.map((th) =>
      '<span style="--c:' + th.color + '"><b></b>' + esc(th.name) + '</span>').join('') + '</div>';
    return html;
  }

  // "🔥 2/3  🎯 3/3" chips for the weekly-target themes in plan week w
  function weekChips(w, withLabel) {
    if (!weeklyThemes.length) return '';
    return '<div class="wk-chips">' + weeklyThemes.map((th) => {
      const tw = themeWeek(th, w);
      const cls = tw.met ? 'met' : tw.over || !tw.reachable ? 'missed' : 'open';
      return '<span class="chip ' + cls + '" style="--c:' + th.color + '" title="' + esc(th.name) + ' weekly target">' +
        th.icon + ' ' + (withLabel ? esc(th.name) + ' ' : '') + tw.count + '/' + tw.target + (tw.met ? ' ✓' : '') + '</span>';
    }).join('') + '</div>';
  }

  function renderProgress() {
    const last = lastElapsed();
    const elapsed = last ? diffDays(START, last) + 1 : 0;
    const total = totalDays();
    let completeDays = 0, everyDays = 0;
    const themeDays = C.themes.map(() => 0);
    for (let i = 0; i < elapsed; i++) {
      const s = dayStatus(addDays(START, i));
      if (s.complete) completeDays++;
      if (s.everyTheme) everyDays++;
      s.themes.forEach((x, k) => { if (x.complete) themeDays[k]++; });
    }
    // weekly targets: only weeks that are over, or already hit, count toward the "x / y"
    const weeksStarted = last ? Math.floor(diffDays(START, last) / 7) + 1 : 0;
    let targetsHit = 0, targetsDecided = 0;
    for (let w = 0; w < weeksStarted; w++) {
      weeklyThemes.forEach((th) => {
        const tw = themeWeek(th, w);
        if (tw.met) { targetsHit++; targetsDecided++; } else if (tw.over) targetsDecided++;
      });
    }
    // exercise tick counts (over plan days)
    const counts = {};
    let ticks = 0;
    Object.keys(state.done).forEach((date) => {
      if (date < START || date > endDate()) return;
      const day = state.done[date];
      Object.keys(day).forEach((tid) => (day[tid] || []).forEach((id) => {
        counts[tid + '/' + id] = (counts[tid + '/' + id] || 0) + 1; ticks++;
      }));
    });
    const st = streaks();

    let html = '<div class="stats">' +
      stat(completeDays + ' / ' + total, 'days completed') +
      stat(st.current, 'day streak 🔥') +
      stat(st.best, 'best streak') +
      stat(ticks, 'exercises ticked') +
      (weeklyThemes.length ? stat(targetsHit + ' / ' + targetsDecided, 'weekly targets hit') : '') +
      (weeklyThemes.length ? stat(everyDays, 'days with every theme') : '') + '</div>';

    html += '<section class="card"><h2>Overall</h2>' +
      rowBar('Plan complete', completeDays + ' of ' + total + ' days', completeDays / total * 100, '') +
      rowBar('Time elapsed', elapsed + ' of ' + total + ' days', elapsed / total * 100, '#6b8a7a') + '</section>';

    html += '<section class="card"><h2>By theme</h2><p class="muted" style="font-size:.85rem">Days you reached the exercise minimum, so far' +
      (weeklyThemes.length ? ' (weekly themes aren’t required every day)' : '') + '</p>';
    C.themes.forEach((th, k) => {
      html += rowBar(th.icon + ' ' + th.name + (isDaily(th) ? '' : ' · weekly'), themeDays[k] + ' / ' + elapsed, elapsed ? themeDays[k] / elapsed * 100 : 0, th.color);
    });
    html += '</section>';

    if (weeklyThemes.length) {
      html += '<section class="card"><h2>Weekly targets</h2><p class="muted" style="font-size:.85rem">Days per week reaching the minimum, against each target</p>';
      weeklyThemes.forEach((th) => {
        html += '<div class="theme-title" style="color:' + th.color + '"><span aria-hidden="true">' + th.icon + '</span>' + esc(th.name) +
          ' · ' + Math.min(th.weeklyTarget, 7) + ' days a week</div><div class="wk-chips" style="margin-top:8px">';
        for (let w = 0; w < weeksStarted; w++) {
          const tw = themeWeek(th, w);
          const cls = tw.met ? 'met' : tw.over || !tw.reachable ? 'missed' : 'open';
          html += '<span class="chip ' + cls + '" style="--c:' + th.color + '">Wk ' + (w + 1) + ' · ' + tw.count + '/' + tw.target + (tw.met ? ' ✓' : '') + '</span>';
        }
        if (!weeksStarted) html += '<span class="muted" style="font-size:.85rem">Starts with the first week</span>';
        html += '</div>';
      });
      html += '</section>';
    }

    html += '<section class="card"><h2>Weekly consistency</h2><p class="muted" style="font-size:.85rem">Completed days per week</p><div class="weeks-chart">';
    for (let w = 0; w < state.weeks; w++) {
      let n = 0;
      for (let d = 0; d < 7; d++) if (dayStatus(addDays(START, w * 7 + d)).complete) n++;
      html += '<div class="col' + (n ? '' : ' empty') + '"><span class="v">' + n + '</span><div class="fill" style="height:' +
        (n / 7 * 80) + 'px"></div><small>Wk ' + (w + 1) + '</small></div>';
    }
    html += '</div></section>';

    html += '<section class="card"><h2>Exercise log</h2><p class="muted" style="font-size:.85rem">How many times you’ve done each one</p>';
    C.themes.forEach((th) => {
      const all = th.exercises.concat(state.custom[th.id] || []);
      html += '<div class="theme-title" style="color:' + th.color + '"><span aria-hidden="true">' + th.icon + '</span>' + esc(th.name) + '</div><div class="ex-counts">';
      all.forEach((ex) => {
        html += '<div><span>' + esc(ex.name) + '</span><span>' + (counts[th.id + '/' + ex.id] || 0) + '×</span></div>';
      });
      html += '</div>';
    });
    html += '</section>';
    return html;
  }
  const stat = (v, l) => '<div class="stat"><strong>' + v + '</strong><span>' + l + '</span></div>';
  const rowBar = (label, right, pct, color) =>
    '<div class="row-bar"' + (color ? ' style="--c:' + color + '"' : '') + '><div class="top"><span>' + esc(label) +
    '</span><span>' + esc(right) + '</span></div><div class="bar"><i style="width:' + Math.max(0, Math.min(100, pct)) + '%"></i></div></div>';

  function renderSync() {
    const g = C.sync;
    const where = g.owner + '/' + g.repo + ' → branch “' + g.branch + '” → ' + g.path;
    if (sync.connected()) {
      return '<section class="card"><h2>☁️ GitHub sync</h2>' +
        '<p id="sync-detail" class="note"></p>' +
        '<p class="note">Saving to ' + esc(where) + '. This device’s browser storage is only a cache.</p>' +
        '<div class="btn-row"><button class="btn primary" data-action="sync-now">Sync now</button>' +
        '<button class="btn" data-action="sync-disconnect">Disconnect this device</button></div></section>';
    }
    return '<section class="card"><h2>☁️ GitHub sync</h2>' +
      '<p class="note">Right now your progress lives only in this browser, which can be cleared. ' +
      'Connect GitHub to save it as <b>' + esc(g.path) + '</b> in your repo (on the <b>' + esc(g.branch) + '</b> branch) ' +
      'and share it between your devices.</p>' +
      '<form id="sync-form"><div class="field"><label for="sync-token">GitHub token</label>' +
      '<input id="sync-token" type="password" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="github_pat_…" required></div>' +
      '<div class="btn-row"><button class="btn primary" type="submit">Connect</button></div></form>' +
      '<details class="how"><summary>How do I get a token?</summary><ol>' +
      '<li>On GitHub go to <b>Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token</b>.</li>' +
      '<li>Name it e.g. “training tracker”, and pick an expiry (the longest you’re allowed).</li>' +
      '<li><b>Repository access</b> → <i>Only select repositories</i> → <b>' + esc(g.repo) + '</b>.</li>' +
      '<li><b>Permissions → Repository permissions → Contents → Read and write</b>. Nothing else is needed.</li>' +
      '<li>Generate, copy the token, paste it above. Do this once on each device.</li></ol>' +
      '<p class="note">The token only works for this one repo. It’s kept in this browser, so don’t use sync on a shared computer.</p></details></section>';
  }

  function renderSettings() {
    let html = renderSync() + '<section class="card"><h2>Add an exercise</h2>' +
      '<p class="note">Each theme needs ' + C.minPerTheme + ' exercises a day (or all of them if it has fewer). ' +
      'New exercises count from today onward — past days are never changed.</p>' +
      '<form id="add-ex"><div class="field"><label for="ex-theme">Theme</label><select id="ex-theme">' +
      C.themes.map((t) => '<option value="' + esc(t.id) + '">' + esc(t.icon + ' ' + t.name) + '</option>').join('') +
      '</select></div>' +
      '<div class="field"><label for="ex-name">Exercise name</label><input id="ex-name" required maxlength="60" autocomplete="off"></div>' +
      '<div class="field"><label for="ex-detail">Detail (optional, e.g. 5 min)</label><input id="ex-detail" maxlength="20" autocomplete="off"></div>' +
      '<div class="btn-row"><button class="btn primary" type="submit">Add exercise</button></div></form>';

    const t = today();
    const items = [];
    C.themes.forEach((th) => (state.custom[th.id] || []).forEach((e) => {
      if (!e.until || t < e.until) items.push({ th, e });
    }));
    if (items.length) {
      html += '<h2 style="margin-top:18px">Your added exercises</h2>';
      items.forEach((x) => {
        const dd = detailOf(x.th.id, x.e);
        html += '<div class="custom-item"><div class="grow">' + esc(x.e.name) + (dd ? ' · ' + esc(dd) : '') +
          '<small>' + esc(x.th.name) + '</small></div><button class="btn danger" data-action="remove-ex" data-theme="' +
          esc(x.th.id) + '" data-ex="' + esc(x.e.id) + '">Remove</button></div>';
      });
    }
    html += '</section>';

    html += '<section class="card"><h2>Plan length</h2><p class="muted">' + state.weeks + ' weeks · ' + longDate(START) + ' to ' + longDate(endDate()) + '</p>' +
      '<div class="btn-row"><button class="btn" data-action="add-week">+ Add another week</button></div></section>';

    html += '<section class="card"><h2>Backup</h2>' +
      '<p class="note">With GitHub sync on, your progress is already backed up. You can also download a copy as a file, ' +
      'or restore from one.</p>' +
      '<div class="btn-row"><button class="btn" data-action="export">Export backup</button>' +
      '<button class="btn" data-action="import">Import backup</button>' +
      '<button class="btn danger" data-action="reset">Reset all progress</button></div></section>';
    return html;
  }

  function render(focusSel) {
    const views = { today: renderToday, plan: renderPlan, progress: renderProgress, settings: renderSettings };
    document.getElementById('app-sub').textContent = state.weeks + '-week plan · ' + shortDate(START) + ' – ' + shortDate(endDate());
    document.getElementById('view').innerHTML = views[view]();
    document.querySelectorAll('.tab').forEach((b) => {
      const on = b.dataset.view === view;
      b.classList.toggle('active', on);
      if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    });
    if (lastSync) showSync(lastSync); // refill the status line inside freshly rendered markup
    if (focusSel) { const el = document.querySelector(focusSel); if (el) el.focus({ preventScroll: true }); }
  }

  /* ---------------- toast ---------------- */
  let toastTimer;
  function toast(msg, warn) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.classList.toggle('warn', !!warn);
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
  }

  /* ---------------- actions ---------------- */
  function toggle(themeId, exId) {
    if (selected > today()) { toast('That day hasn’t arrived yet.', true); return; }
    const was = dayStatus(selected).complete;
    const day = state.done[selected] || (state.done[selected] = {});
    const arr = day[themeId] || (day[themeId] = []);
    const i = arr.indexOf(exId);
    if (i >= 0) arr.splice(i, 1); else arr.push(exId);
    if (!arr.length) delete day[themeId];
    if (!Object.keys(day).length) delete state.done[selected];
    touch('d:' + selected);
    save();
    render('[data-theme="' + themeId + '"][data-ex="' + exId + '"]');
    if (!was && dayStatus(selected).complete) toast('Day complete! 💪 Great work.');
  }

  function download(name, text) {
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const d = el.dataset;
    if (d.action !== 'toggle' && d.action !== 'edit-time') editing = null;
    switch (d.action) {
      case 'edit-time': {
        const k = detailKey(d.theme, d.ex);
        editing = editing === k ? null : k;
        render(editing ? '.time-form input' : '[data-action="edit-time"][data-theme="' + d.theme + '"][data-ex="' + d.ex + '"]');
        const inp = document.querySelector('.time-form input');
        if (inp) { inp.select(); inp.scrollIntoView({ block: 'center' }); }
        break;
      }
      case 'cancel-time': render(); break;
      case 'view': view = d.view; window.scrollTo(0, 0); render(); break;
      case 'toggle': toggle(d.theme, d.ex); break;
      case 'goto': selected = d.date; view = 'today'; window.scrollTo(0, 0); render(); break;
      case 'shift': {
        const n = addDays(selected, Number(d.n));
        if (n >= START && n <= endDate()) { selected = n; render(); }
        break;
      }
      case 'today': selected = today(); render(); break;
      case 'add-week':
        if (state.weeks < 104) { state.weeks++; save(); render(); toast('Week ' + state.weeks + ' added.'); }
        break;
      case 'remove-ex': {
        const list = state.custom[d.theme] || [];
        const ex = list.find((x) => x.id === d.ex);
        if (ex && confirm('Remove “' + ex.name + '”? Past days are kept as they were.')) {
          ex.until = today(); // soft delete, so the removal syncs and past days stay as they were
          save(); render();
        }
        break;
      }
      case 'export':
        download('football-training-' + today() + '.json', JSON.stringify(state, null, 2));
        break;
      case 'import': document.getElementById('import-file').click(); break;
      case 'reset':
        if (confirm('Delete ALL progress and added exercises' + (sync && sync.connected() ? ' (also in GitHub)' : ' on this device') + '? This cannot be undone.')) {
          state = normalize({}); save(true); render(); toast('Progress reset.');
          if (sync) sync.force();
        }
        break;
      case 'sync-now':
        toast('Syncing…');
        sync.now().then(() => { toast('Synced with GitHub.'); }, (err) => toast(err.message, true));
        break;
      case 'sync-disconnect':
        if (confirm('Disconnect this device from GitHub? Your saved progress stays in GitHub; this device just stops syncing.')) {
          sync.disconnect(); render();
        }
        break;
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && editing) { editing = null; render(); }
  });

  document.addEventListener('submit', (e) => {
    if (e.target.classList.contains('time-form')) {
      e.preventDefault();
      const f = e.target;
      state.details[detailKey(f.dataset.theme, f.dataset.ex)] = f.elements.detail.value.trim();
      touch('x:' + detailKey(f.dataset.theme, f.dataset.ex));
      editing = null;
      save();
      render('[data-action="edit-time"][data-theme="' + f.dataset.theme + '"][data-ex="' + f.dataset.ex + '"]');
      return;
    }
    if (e.target.id === 'sync-form') {
      e.preventDefault();
      const input = document.getElementById('sync-token');
      const btn = e.target.querySelector('button[type=submit]');
      btn.disabled = true; btn.textContent = 'Connecting…';
      sync.connect(input.value).then(
        () => { toast('Connected — progress is saved to GitHub.'); render(); },
        (err) => { toast(err.message, true); btn.disabled = false; btn.textContent = 'Connect'; });
      return;
    }
    if (e.target.id !== 'add-ex') return;
    e.preventDefault();
    const themeId = document.getElementById('ex-theme').value;
    const name = document.getElementById('ex-name').value.trim();
    const detail = document.getElementById('ex-detail').value.trim();
    if (!name) return;
    const t = today();
    const from = t < START ? START : t;
    const list = state.custom[themeId] || (state.custom[themeId] = []);
    list.push({ id: 'c' + Date.now().toString(36) + list.length, name, detail, from });
    save(); render(); toast('Added “' + name + '”.');
  });

  document.getElementById('import-file').addEventListener('change', (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        if (!data || typeof data !== 'object' || typeof data.done !== 'object') throw new Error('bad file');
        if (!confirm('Replace the current progress' + (sync && sync.connected() ? ' (also in GitHub)' : '') + ' with the backup?')) return;
        state = normalize(data); save(true); render(); toast('Backup imported.');
        if (sync) sync.force();
      } catch (err) { toast('That file isn’t a valid backup.', true); }
    };
    reader.readAsText(file);
  });

  /* ---------------- sync status ---------------- */
  let lastSync = null;
  function showSync(s) {
    lastSync = s;
    const hhmm = s.time.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    const text = {
      off: '⚠ Not backed up — tap to set up GitHub sync',
      syncing: '☁️ Saving…',
      ok: '☁️ Saved to GitHub · ' + hhmm,
      offline: '☁️ Offline — will retry · changes kept on this device',
      error: '⚠ Sync problem — tap for details'
    }[s.kind];
    const btn = document.getElementById('sync-status');
    btn.textContent = text;
    btn.dataset.kind = s.kind;
    const det = document.getElementById('sync-detail');
    if (det) det.textContent = s.kind === 'error' ? 'Problem: ' + s.message : text.replace(/^[^\w]+/, '');
  }

  /* ---------------- boot ---------------- */
  document.getElementById('app-title').textContent = C.title;
  sync = window.Sync.create({
    cfg: C.sync,
    getState: () => state,
    hasData: (s) => Object.keys(s.done).length > 0 || Object.keys(s.custom).length > 0 || Object.keys(s.details).length > 0,
    applyState: (merged) => {
      state = normalize(merged);
      save(true);
      if (view !== 'settings' && !editing) render();
    },
    onStatus: showSync
  });
  render();
  sync.init();

  // Roll over to the new day if the page is left open overnight.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && view !== 'settings' && !editing) render();
  });
})();
