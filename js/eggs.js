/* Surprises ("easter eggs"). Fired when the trainee completes a day:
 *   plan day 2, 4, 5 and 7 each have their own scripted surprise; after day 7 a random one appears on
 *   roughly half of the completed days. A missed scripted surprise catches up on the next completed day.
 * Which surprise was shown on which date is kept in the app state (state.eggs) so it syncs between devices.
 * Preview any surprise with  ?egg=<id>  (see README). */
(function (root) {
  'use strict';

  const SCRIPT = [[2, 'var'], [4, 'keepy'], [5, 'crash'], [7, 'ceremony']];
  const RANDOM = ['redcard', 'invader', 'flip', 'gaffer', 'banana', 'fortune'];
  const CHANCE = 50; // % of completed days after day 7 that get a random surprise
  const PREF_KEY = 'footballTracker.eggs';

  /* ---------- choosing ---------- */
  const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
  // info: { today:'YYYY-MM-DD', dayNum:number (plan day of today), shown:{ 'YYYY-MM-DD': eggId } }
  function pick(info) {
    const shown = info.shown || {};
    if (shown[info.today]) return null; // one a day
    const seen = new Set(Object.keys(shown).map((d) => shown[d]));
    for (let i = 0; i < SCRIPT.length; i++) if (SCRIPT[i][0] <= info.dayNum && !seen.has(SCRIPT[i][1])) return SCRIPT[i][1]; // incl. catch-up
    if (info.dayNum <= 7) return null;
    const h = hash(info.today);
    if (h % 100 >= CHANCE) return null;
    const fresh = RANDOM.filter((id) => !seen.has(id));
    const pool = fresh.length ? fresh : RANDOM;
    return pool[Math.floor(h / 100) % pool.length];
  }

  /* ---------- preference (per device) ---------- */
  function enabled() { try { return localStorage.getItem(PREF_KEY) !== 'off'; } catch (e) { return true; } }
  function setEnabled(v) { try { localStorage.setItem(PREF_KEY, v ? 'on' : 'off'); } catch (e) { /* ignore */ } }

  if (typeof module !== 'undefined' && module.exports) { module.exports = { pick, SCRIPT, RANDOM, hash }; return; }

  const doc = root.document;
  let cfg = { stats: null };
  let current = null;
  const reducedMotion = () => !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const rnd = (a) => a[Math.floor(Math.random() * a.length)];
  function h(tag, cls, html) { const e = doc.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function btn(label, cls, fn) { const b = h('button', 'egg-btn' + (cls ? ' ' + cls : ''), label); b.type = 'button'; b.addEventListener('click', fn); return b; }

  /* ---------- confetti ---------- */
  function confetti(api, o) {
    o = o || {};
    if (api.reduced) return;
    const cv = h('canvas', 'egg-confetti');
    const W = root.innerWidth, H = root.innerHeight, dpr = Math.min(2, root.devicePixelRatio || 1);
    cv.width = W * dpr; cv.height = H * dpr; cv.style.width = W + 'px'; cv.style.height = H + 'px';
    api.root.appendChild(cv);
    const c = cv.getContext('2d'); c.scale(dpr, dpr);
    const colors = ['#ffd23f', '#ff5d73', '#3ddc84', '#4da3ff', '#b794ff', '#ffffff', '#ff9f43'];
    const parts = [], n = o.count || 120;
    for (let i = 0; i < n; i++) {
      const left = i % 2 === 0;
      // "sides": two cannons in the bottom corners aimed at the middle; otherwise one burst from the centre
      const a = o.sides ? (left ? -Math.PI / 2 + 0.5 : -Math.PI / 2 - 0.5) + (Math.random() - .5) * .5
                        : -Math.PI / 2 + (Math.random() - .5) * 1.6;
      const sp = (o.sides ? 950 : 450) + Math.random() * 500;
      parts.push({
        x: o.sides ? (left ? 0 : W) : W / 2, y: o.sides ? H : H * .45,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        r: Math.random() * 6, vr: (Math.random() - .5) * 14, w: 6 + Math.random() * 7, h: 4 + Math.random() * 6,
        c: colors[(Math.random() * colors.length) | 0]
      });
    }
    api.loop((dt) => {
      const s = dt / 1000;
      c.clearRect(0, 0, W, H);
      let alive = 0;
      parts.forEach((p) => {
        p.vy += 1100 * s; p.vx *= 0.992; p.x += p.vx * s; p.y += p.vy * s; p.r += p.vr * s;
        if (p.y < H + 30) { alive++; c.save(); c.translate(p.x, p.y); c.rotate(p.r); c.fillStyle = p.c; c.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); c.restore(); }
      });
      if (!alive) { cv.remove(); return false; }
    });
  }

  /* ---------- the overlay shell ---------- */
  function open(id, extra) {
    const egg = EGGS[id];
    if (!egg) return false;
    if (current) current.close();
    const light = !!egg.light;
    const el = h('div', 'egg egg-' + id + (light ? ' egg-light' : ''));
    el.setAttribute('role', light ? 'status' : 'dialog');
    if (!light) el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-label', egg.label);
    const stage = h('div', 'egg-stage');
    const x = h('button', 'egg-close', '✕'); x.type = 'button'; x.setAttribute('aria-label', light ? 'Skip' : 'Close surprise');
    el.append(stage, x);

    const prev = doc.activeElement;
    const inertEls = light ? [] : Array.prototype.slice.call(doc.querySelectorAll('.app-header, #view, .tabs'));
    inertEls.forEach((n) => { n.inert = true; });
    if (!light) doc.body.classList.add('egg-open');

    const timers = new Set(), rafs = new Set(), cleanups = [];
    let closed = false;
    const api = {
      el: stage, root: el, light, reduced: reducedMotion(), cfg, extra: extra || {},
      after(fn, ms) { const t = root.setTimeout(() => { timers.delete(t); if (!closed) fn(); }, ms); timers.add(t); return t; },
      seq(steps) { let t = 0; steps.forEach((s) => { t += s[0]; api.after(s[1], t); }); return t; },
      loop(fn) {
        let last = null, rid;
        const step = (ts) => {
          rafs.delete(rid);
          if (closed) return;
          const dt = last == null ? 16 : Math.min(50, ts - last); last = ts;
          if (fn(dt) === false) return;
          rid = root.requestAnimationFrame(step); rafs.add(rid);
        };
        rid = root.requestAnimationFrame(step); rafs.add(rid);
      },
      onClose(fn) { cleanups.push(fn); },
      confetti(o) { confetti(api, o); },
      close() {
        if (closed) return;
        closed = true;
        timers.forEach((t) => root.clearTimeout(t)); rafs.forEach((r) => root.cancelAnimationFrame(r));
        cleanups.forEach((f) => { try { f(); } catch (e) { /* ignore */ } });
        doc.removeEventListener('keydown', onKey, true);
        el.remove();
        inertEls.forEach((n) => { n.inert = false; });
        doc.body.classList.remove('egg-open');
        if (current === api) current = null;
        if (prev && prev.focus && doc.contains(prev)) prev.focus({ preventScroll: true });
      }
    };
    function onKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); api.close(); return; }
      if (e.key === 'Tab' && !light) { // keep keyboard focus inside the surprise
        const f = Array.prototype.filter.call(el.querySelectorAll('button:not([disabled]):not([hidden])'), (b) => b.offsetParent !== null);
        if (!f.length) return;
        const first = f[0], last = f[f.length - 1];
        if (e.shiftKey && doc.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && doc.activeElement === last) { e.preventDefault(); first.focus(); }
        else if (!el.contains(doc.activeElement)) { e.preventDefault(); first.focus(); }
      }
    }
    x.addEventListener('click', () => api.close());
    doc.addEventListener('keydown', onKey, true);
    doc.body.appendChild(el);
    current = api;
    try { egg.run(api); } catch (err) { if (root.console) root.console.error('surprise failed', err); api.close(); return false; }
    if (!light) x.focus({ preventScroll: true });
    return true;
  }

  const ending = (api, label) => { const row = h('div', 'egg-actions'); row.appendChild(btn(label, '', () => api.close())); return row; };
  // used by the motion-heavy surprises when the device asks for reduced motion
  function staticCard(api, emoji, title, text) {
    api.el.innerHTML = '<div class="egg-card"><div class="egg-big" aria-hidden="true">' + emoji + '</div><h2>' + title + '</h2><p>' + text + '</p></div>';
    api.el.firstChild.appendChild(ending(api, 'Ha, nice 👍'));
  }

  /* ---------- the surprises ---------- */
  const EGGS = {
    /* Day 2 — a painfully serious video review of your tick */
    var: { label: 'Video review', run(api) {
      api.el.innerHTML =
        '<div class="var"><div class="var-top"><span class="var-badge">VAR</span><span class="var-rec"><i></i> REVIEW</span></div>' +
        '<div class="var-screen"><svg viewBox="0 0 300 180" class="var-pitch" aria-hidden="true">' +
        '<rect width="300" height="180" fill="#1b7a3d"/><g stroke="#fff" stroke-opacity=".5" fill="none" stroke-width="2"><rect x="8" y="8" width="284" height="164"/>' +
        '<line x1="150" y1="8" x2="150" y2="172"/><circle cx="150" cy="90" r="28"/></g>' +
        '<line class="vl vl-a" x1="206" y1="8" x2="206" y2="172"/><line class="vl vl-b" x1="22" y1="158" x2="282" y2="26"/>' +
        '<circle cx="206" cy="92" r="9" fill="#e5484d"/><circle cx="224" cy="118" r="9" fill="#3b82f6"/>' +
        '<g class="var-label"><line x1="224" y1="127" x2="250" y2="154" stroke="#ffd23f" stroke-width="2"/><text x="226" y="170" fill="#ffd23f" font-size="11" font-weight="700">YOUR SOCK</text></g>' +
        '<circle cx="150" cy="132" r="6" fill="#fff"/></svg></div>' +
        '<p class="var-line" aria-live="polite">⏸ Play is stopped.</p><p class="var-sub"></p><div class="var-actions"></div></div>';
      const screen = api.el.querySelector('.var-screen'), line = api.el.querySelector('.var-line'), sub = api.el.querySelector('.var-sub');
      const say = (t, cls) => () => { line.textContent = t; if (cls) screen.classList.add(cls); };
      api.seq([
        [1800, say('VAR is checking your exercises…')],
        [2200, say('Drawing very serious lines 📏', 'lines')],
        [2600, say('Zooming in 4000%… it is just a blurry sock.', 'zoom')],
        [2800, () => { screen.classList.remove('zoom'); say('Consulting 14 camera angles and one dog 🐕', 'label')(); }],
        [2800, say('Decision incoming… 🥁')],
        [2400, () => {
          screen.classList.remove('zoom');
          line.innerHTML = '✅ <strong>TICK STANDS.</strong><br>Today is officially <strong>AWESOME</strong>.';
          sub.textContent = '(Your left sock was slightly offside. We let it slide.)';
          line.classList.add('verdict');
          api.confetti({ count: 70 });
          api.el.querySelector('.var-actions').appendChild(ending(api, 'Fair enough 😌').firstChild);
        }]
      ]);
    } },

    /* Day 4 — keepy-uppy mini-game */
    keepy: { label: 'Keepy-uppy challenge', run(api) {
      const S = 116;
      api.el.classList.add('kp');
      api.el.innerHTML = '<div class="kp-score" aria-live="polite">0</div><div class="kp-msg">Keep it up! Tap the ball 👆</div>' +
        '<button class="kp-ball" type="button" aria-label="Football. Tap to keep it in the air.">⚽</button><div class="kp-ground"></div>' +
        '<div class="kp-over" hidden><div class="egg-card"><div class="egg-big kp-emoji" aria-hidden="true"></div><h2 class="kp-title"></h2><p class="kp-text"></p><p class="kp-best"></p><div class="egg-actions"></div></div></div>';
      const ball = api.el.querySelector('.kp-ball'), scoreEl = api.el.querySelector('.kp-score'), msg = api.el.querySelector('.kp-msg');
      const over = api.el.querySelector('.kp-over');
      let best = 0; try { best = +localStorage.getItem('footballTracker.keepyBest') || 0; } catch (e) { /* ignore */ }
      let x, y, vx, vy, rot, score, gravity, alive;
      const verdicts = [
        [0, '🤔', 'Zero.', 'The ball is confused. So are we.'],
        [1, '😬', 'Hmm.', 'Messi just laughed. Politely.'],
        [5, '🙂', 'Not bad!', 'A toddler could do… well, about that.'],
        [10, '😎', 'Now THAT is skill!', 'Ronaldinho nods approvingly.'],
        [20, '🤩', 'LEGEND.', 'Haaland is scared. Call the Golden Ball people.']
      ];
      function start() {
        const W = api.el.clientWidth;
        x = W / 2 - S / 2; y = -S; vx = (Math.random() - .5) * 120; vy = 0; rot = 0; score = 0; gravity = 1700; alive = true;
        scoreEl.textContent = '0'; msg.hidden = false; over.hidden = true; ball.disabled = false;
        api.loop(tick);
      }
      function tick(dt) {
        if (!alive) return false;
        const s = dt / 1000, W = api.el.clientWidth, H = api.el.clientHeight, ground = H - 78;
        vy += gravity * s; x += vx * s; y += vy * s; rot += vx * s * 0.6;
        if (x < 0) { x = 0; vx = Math.abs(vx) * .8; } else if (x > W - S) { x = W - S; vx = -Math.abs(vx) * .8; }
        if (y + S >= ground && vy > 0) { y = ground - S; finish(); }
        ball.style.transform = 'translate(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px) rotate(' + rot.toFixed(1) + 'deg)';
        return alive;
      }
      function finish() {
        alive = false; ball.disabled = true;
        const v = verdicts.filter((r) => score >= r[0]).pop();
        if (score > best) { best = score; try { localStorage.setItem('footballTracker.keepyBest', String(best)); } catch (e) { /* ignore */ } }
        over.querySelector('.kp-emoji').textContent = v[1];
        over.querySelector('.kp-title').textContent = score + (score === 1 ? ' keepy-uppy. ' : ' keepy-uppies. ') + v[2];
        over.querySelector('.kp-text').textContent = v[3];
        over.querySelector('.kp-best').textContent = 'Best on this device: ' + best;
        const row = over.querySelector('.egg-actions'); row.innerHTML = '';
        row.append(btn('Again! 🔁', '', start), btn('Done', 'ghost', () => api.close()));
        over.hidden = false;
        if (score >= 10) api.confetti({ count: 90 });
      }
      ball.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        if (!alive) return;
        const r = ball.getBoundingClientRect();
        const off = Math.max(-1, Math.min(1, (r.left + r.width / 2 - e.clientX) / (r.width / 2)));
        vy = -880; vx = off * 300 + (Math.random() - .5) * 120; gravity = Math.min(2400, gravity + 28);
        score++; scoreEl.textContent = String(score); msg.hidden = true;
        scoreEl.classList.remove('bump'); void scoreEl.offsetWidth; scoreEl.classList.add('bump');
      });
      start();
    } },

    /* Day 5 — a fake "fatal error" (it is a prank; progress is safe) */
    crash: { label: 'Fatal error (just a prank)', run(api) {
      api.el.classList.add('cr');
      api.el.innerHTML = '<div class="cr-term"><pre class="cr-log" aria-live="polite"></pre><div class="cr-bar" hidden><i></i></div>' +
        '<p class="cr-note" hidden>😄 Relax, it is a prank. Nothing is broken and your progress is safe.</p><div class="egg-actions"></div></div>';
      const log = api.el.querySelector('.cr-log'), bar = api.el.querySelector('.cr-bar'), fill = bar.firstChild;
      const note = api.el.querySelector('.cr-note'), actions = api.el.querySelector('.egg-actions');
      const add = (t) => () => { log.textContent += t + '\n'; };
      if (!api.reduced) { api.root.classList.add('glitch'); api.after(() => api.root.classList.remove('glitch'), 900); }
      api.seq([
        [200, add('> SYSTEM HALTED')],
        [900, add('> ERROR 404: LEGS NOT FOUND')],
        [1200, add('> Searching for legs........ nope.')],
        [1300, () => { note.hidden = false; }],
        [700, add('> Last seen: halfway through a squat.')],
        [1300, add('> Fix: perform 10 imaginary squats.')],
        [1400, () => { log.textContent += '> Rebooting legs...\n'; bar.hidden = false; fill.style.transition = api.reduced ? 'none' : 'width 4s linear'; fill.style.width = '99%'; }],
        [4300, add('> Stuck at 99%. (It always does that.)')],
        [1300, add('> Have you tried turning your legs off and on again?')],
        [700, () => actions.appendChild(btn('Turn legs off and on again 🦵', '', () => {
          actions.innerHTML = '';
          fill.style.transition = 'none'; fill.style.width = '0';
          api.seq([
            [300, add('> Legs off…')],
            [700, add('> Legs on…')],
            [700, () => { fill.style.transition = api.reduced ? 'none' : 'width .6s ease-out'; fill.style.width = '100%'; }],
            [800, add('> Counting legs… 1… 2… ✔ all present!')],
            [1000, add('> JOKE DETECTED 🤡')],
            [700, () => { api.confetti({ count: 60 }); actions.appendChild(btn('Phew 😅', '', () => api.close())); }]
          ]);
        }))]
      ]);
    } },

    /* Day 7 — a full awards ceremony, with your real numbers */
    ceremony: { label: 'Awards ceremony', run(api) {
      api.el.classList.add('cer');
      const st = (api.cfg.stats && api.cfg.stats()) || null;
      api.el.innerHTML = '<div class="cer-lights" aria-hidden="true"><i></i><i></i></div><div class="cer-body"><p class="cer-line" aria-live="polite"></p>' +
        '<div class="cer-trophy" aria-hidden="true">🏆</div><div class="cer-stats" hidden></div><p class="cer-speech" aria-live="polite" hidden></p><div class="egg-actions"></div></div>';
      const line = api.el.querySelector('.cer-line'), trophy = api.el.querySelector('.cer-trophy'), stats = api.el.querySelector('.cer-stats');
      const speech = api.el.querySelector('.cer-speech'), actions = api.el.querySelector('.egg-actions');
      const lines = [
        'I would like to thank my left foot… and my right foot. You were both there for me.',
        'I would like to thank the cone. It never moved. Total respect.',
        'To the orange slices at half-time: you are the real MVPs.',
        'This is for everyone who said I could not do three lunges. Well… I did five.',
        'I want to thank my knees for not making any noise. Yet.'
      ];
      let n = 0;
      const say = (t, cls) => () => { line.className = 'cer-line' + (cls ? ' ' + cls : ''); line.textContent = t; };
      api.seq([
        [300, say('🎙️ Ladies and gentlemen…')],
        [2300, say('The award for MOST DEDICATED PLAYER OF THE WEEK…')],
        [3200, say('…goes to… 🥁', 'drum')],
        [2800, say('…', 'drum')],
        [1400, () => {
          line.className = 'cer-line big'; line.textContent = 'YOU!!!';
          trophy.classList.add('rise'); api.root.classList.add('flash'); api.confetti({ count: 150, sides: true });
        }],
        [1300, () => { api.confetti({ count: 90, sides: true }); }],
        [900, () => {
          if (st) { stats.hidden = false; stats.innerHTML = '<b>Week 1</b> in numbers:<br><b>' + st.days + '</b> days completed · <b>' + st.ticks + '</b> exercises ticked · <b>' + st.best + '</b>-day best streak'; }
        }],
        [900, () => {
          actions.append(
            btn('Give acceptance speech 🎤', '', function () {
              speech.hidden = false; speech.textContent = '“' + lines[n++] + '”';
              api.confetti({ count: 30 });
              if (n >= lines.length) { this.remove(); api.after(() => { speech.textContent = '“…and thank you to the music. I’m being played off. BYE!”'; }, 3600); }
            }),
            btn('Take a bow 🙇', 'ghost', () => api.close()));
        }]
      ]);
    } },

    /* Random — the referee loses it */
    redcard: { label: 'Referee decision', run(api) {
      const offence = rnd(['Looking suspiciously fit', 'Unlicensed sprinting', 'Dribbling past a pigeon', 'Making the cones feel inadequate', 'Illegal levels of effort', 'Celebrating before scoring', 'Overly enthusiastic lunging']);
      api.el.innerHTML = '<div class="rc"><p class="rc-top">The referee has seen <em>something</em>…</p>' +
        '<button class="rc-card" type="button" aria-label="Referee\'s card. Tap to see the decision."><span class="rc-inner">' +
        '<span class="rc-face rc-front"><b>YELLOW CARD</b><small>for: ' + offence + '</small></span>' +
        '<span class="rc-face rc-back"><b>RED CARD</b><small>for: ' + offence + '<br>(and for arguing)</small></span></span></button>' +
        '<p class="rc-hint">👆 Tap the card</p><p class="rc-out" aria-live="polite"></p><div class="egg-actions"></div></div>';
      const card = api.el.querySelector('.rc-card'), out = api.el.querySelector('.rc-out'), actions = api.el.querySelector('.egg-actions');
      card.addEventListener('click', () => {
        card.classList.add('flipped'); card.disabled = true; api.el.querySelector('.rc-hint').style.visibility = 'hidden';
        out.textContent = 'Two cards in one go?! Not even in the rules. Please leave the pitch via the snack table 🍌.';
        actions.append(
          btn('Appeal ✋', '', function () { out.textContent = 'Appeal DENIED. The referee is my mum.'; this.remove(); }),
          btn('Accept my fate 🚶', 'ghost', () => api.close()));
      });
    } },

    /* Random — a dog runs onto the pitch; tackle it if you can */
    invader: { label: 'Pitch invader', light: true, run(api) {
      if (api.reduced) { staticCard(api, '🐕', 'PITCH INVADER!', 'A dog ran on, scored, and left. The crowd loved it.'); return; }
      api.el.innerHTML = '<div class="pi-banner">🚨 PITCH INVADER! Tap the dog! 🚨</div><button class="pi-dog" type="button" aria-label="The dog. Tap to tackle it.">🐕</button><p class="pi-out" aria-live="polite"></p><div class="egg-actions pi-actions" hidden></div>';
      const dog = api.el.querySelector('.pi-dog'), out = api.el.querySelector('.pi-out'), act = api.el.querySelector('.pi-actions');
      const W = api.el.clientWidth, H = api.el.clientHeight, size = 88;
      let x = -size, dir = 1, speed = 260, laps = 0, t = 0, base = H * 0.45, done = false;
      const end = (caught) => {
        done = true; dog.disabled = true;
        out.textContent = caught ? 'SLIDING TACKLE! 🎯 The dog is safe, cuddled, and has been given a biscuit 🦴' : 'He got away! Rumour is Real Madrid are already calling. 🐕💨';
        act.hidden = false; act.append(btn('Ha! 👍', '', () => api.close()));
        if (caught) { dog.classList.add('caught'); api.confetti({ count: 60 }); }
      };
      dog.addEventListener('pointerdown', (e) => { e.preventDefault(); if (!done) end(true); });
      api.after(() => api.loop((dt) => {
        if (done) return false;
        const s = dt / 1000; t += s; x += dir * speed * s;
        if (dir > 0 && x > W) { if (++laps >= 3) { end(false); return false; } dir = -1; speed *= 1.3; base = H * (0.25 + Math.random() * 0.45); }
        else if (dir < 0 && x < -size) { dir = 1; speed *= 1.2; base = H * (0.25 + Math.random() * 0.45); }
        const y = base + Math.sin(t * 7) * 48;
        dog.style.transform = 'translate(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px) scaleX(' + (dir > 0 ? -1 : 1) + ')';
      }), 900);
    } },

    /* Random — the whole screen flips upside down */
    flip: { label: 'Gravity malfunction', light: true, run(api) {
      api.el.innerHTML = '<div class="fl-banner" aria-live="polite"></div>';
      const banner = api.el.firstChild, say = (t) => () => { banner.textContent = t; };
      if (api.reduced) { say('🙃 Training in Australia today! (Your screen is fine.)')(); api.after(() => api.close(), 6000); return; }
      const targets = Array.prototype.slice.call(doc.querySelectorAll('.app-header, #view, .tabs, .bg'));
      doc.body.classList.add('egg-lock');
      const pivot = () => targets.forEach((t) => { t.style.transformOrigin = '50% ' + (root.innerHeight / 2 - t.getBoundingClientRect().top) + 'px'; });
      api.onClose(() => { doc.body.classList.remove('egg-lock'); targets.forEach((t) => { t.classList.remove('egg-flipper', 'egg-upside'); t.style.transformOrigin = ''; }); });
      pivot(); targets.forEach((t) => t.classList.add('egg-flipper'));
      api.seq([
        [100, say('😮 Wait… something feels off…')],
        [1500, () => { pivot(); targets.forEach((t) => t.classList.add('egg-upside')); banner.textContent = '🙃 Gravity has left the building!'; }],
        [2300, say('🦘 Training in Australia today!')],
        [2600, say('😅 Okay, okay… turning you back around.')],
        [900, () => targets.forEach((t) => t.classList.remove('egg-upside'))],
        [1500, say('✅ Gravity restored. Probably.')],
        [1800, () => api.close()]
      ]);
    } },

    /* Random — the manager's famous team talk */
    gaffer: { label: 'Message from the gaffer', run(api) {
      api.el.classList.add('gf');
      api.el.innerHTML = '<div class="gf-face" aria-hidden="true">😤</div><p class="gf-line" aria-live="polite"></p><div class="egg-actions"></div>';
      const face = api.el.querySelector('.gf-face'), line = api.el.querySelector('.gf-line');
      const shout = (t, f) => () => { line.textContent = t; if (f) face.textContent = f; if (!api.reduced) { api.el.classList.remove('shaking'); void api.el.offsetWidth; api.el.classList.add('shaking'); } };
      api.seq([
        [200, shout('RIGHT. EVERYBODY STOP.')],
        [1900, shout('I’VE BEEN IN FOOTBALL FORTY YEARS…', '😠')],
        [2600, shout('…AND I HAVE NEVER, EVER SEEN…', '😡')],
        [2400, shout('…SUCH A MAGNIFICENT SET OF LUNGES!!!', '🤩')],
        [2800, () => { line.textContent = '(sorry. I’ve gone a bit emotional.)'; face.textContent = '🥹'; api.el.classList.remove('shaking'); }],
        [2400, () => { line.textContent = 'Take it easy tomorrow. Eat an orange. That is an order.'; face.textContent = '🍊'; }],
        [700, () => api.el.querySelector('.egg-actions').appendChild(btn('Yes, boss! 🫡', '', () => api.close()))]
      ]);
    } },

    /* Random — slapstick */
    banana: { label: 'Banana incident', light: true, run(api) {
      if (api.reduced) { staticCard(api, '🍌', 'Banana incident', 'Someone left a banana on the pitch. Let this be a lesson to us all.'); return; }
      api.el.innerHTML = '<div class="bn-banana" aria-hidden="true">🍌</div><div class="bn-runner" aria-hidden="true">🏃</div><div class="bn-bubble" hidden>AAAAAAAH!</div><p class="bn-out" aria-live="polite"></p>';
      const W = api.el.clientWidth, H = api.el.clientHeight, ban = api.el.querySelector('.bn-banana'), run = api.el.querySelector('.bn-runner');
      const bubble = api.el.querySelector('.bn-bubble'), out = api.el.querySelector('.bn-out');
      const bx = W * 0.55, gy = H - 150;
      ban.style.transform = 'translate(' + bx + 'px,' + (gy + 18) + 'px)'; run.style.transform = 'translate(-90px,' + gy + 'px)';
      api.after(() => run.animate([{ transform: 'translate(-90px,' + gy + 'px)' }, { transform: 'translate(' + (bx - 20) + 'px,' + gy + 'px)' }], { duration: 2200, easing: 'linear', fill: 'forwards' }), 400);
      api.after(() => {
        bubble.hidden = false; bubble.style.transform = 'translate(' + (bx - 10) + 'px,' + (gy - 70) + 'px)';
        ban.style.opacity = '0.35';
        run.animate([
          { transform: 'translate(' + (bx - 20) + 'px,' + gy + 'px) rotate(0)' },
          { transform: 'translate(' + (bx + W * 0.1) + 'px,' + (gy - H * 0.55) + 'px) rotate(360deg)', offset: .55 },
          { transform: 'translate(' + (W + 120) + 'px,' + (gy - H * 0.2) + 'px) rotate(900deg)' }
        ], { duration: 1700, easing: 'ease-in', fill: 'forwards' });
      }, 2700);
      api.after(() => { bubble.hidden = true; out.textContent = '💥 *distant thud*'; }, 4500);
      api.after(() => { out.textContent = 'He’ll be fine. Never leave a banana on the training pitch.'; }, 5700);
      api.after(() => api.close(), 9000);
    } },

    /* Random — a magic football that gives terrible advice */
    fortune: { label: 'Magic football', run(api) {
      const fortunes = [
        'You will score a goal today… in your dreams. Pretty good dreams, though.',
        'A great save is coming. Probably of the last slice of pizza.',
        'Someone will pass you the ball. Be ready. They won’t.',
        'Your next sprint will be 4% faster. Source: trust me.',
        'You will win a 50/50 race… against a sleepy pigeon.',
        'Beware of cones. They are plotting something.',
        'The football gods have spoken: drink some water.',
        'You will be famous. In this app. For about 4 seconds.'
      ];
      api.el.innerHTML = '<div class="fo"><p class="fo-top">Tap the Magic Football 🔮</p><button class="fo-ball" type="button" aria-label="Magic football. Tap to shake it.">⚽</button>' +
        '<p class="fo-text" aria-live="polite"></p><div class="egg-actions"></div></div>';
      const ball = api.el.querySelector('.fo-ball'), text = api.el.querySelector('.fo-text'), top = api.el.querySelector('.fo-top'), actions = api.el.querySelector('.egg-actions');
      const order = fortunes.slice().sort(() => Math.random() - .5);
      let n = 0, busy = false;
      ball.addEventListener('click', () => {
        if (busy) return; busy = true; text.textContent = ''; top.hidden = true;
        ball.classList.remove('shake'); void ball.offsetWidth; ball.classList.add('shake');
        api.after(() => {
          busy = false; ball.classList.remove('shake');
          if (n < 3) { text.textContent = '“' + order[n++] + '”'; text.classList.remove('pop'); void text.offsetWidth; text.classList.add('pop'); }
          if (n >= 3) { ball.disabled = true; api.after(() => { text.textContent = 'The ball is dizzy now. Please leave it alone. 😵‍💫'; }, 3800); }
        }, api.reduced ? 50 : 800);
      });
      actions.appendChild(btn('Thanks, ball 🙏', 'ghost', () => api.close()));
    } }
  };

  /* ---------- public api ---------- */
  function onDayComplete(info) {
    if (!enabled() || info.date !== info.today) return false;
    const id = pick({ today: info.today, dayNum: info.dayNum, shown: info.shown });
    if (!id) return false;
    info.mark(info.date, id);
    root.setTimeout(() => open(id), 700);
    return true;
  }
  function previewFromUrl() {
    let id = null;
    try { id = new URLSearchParams(root.location.search).get('egg'); } catch (e) { return; }
    if (!id) return;
    if (id === 'random') id = rnd(RANDOM);
    if (!EGGS[id]) { if (root.console) root.console.warn('Unknown surprise "' + id + '". Try: ' + Object.keys(EGGS).join(', ')); return; }
    root.setTimeout(() => open(id), 500);
  }

  root.Eggs = {
    ids: Object.keys(EGGS), SCRIPT, RANDOM, pick,
    enabled, setEnabled, onDayComplete, previewFromUrl,
    play: open,
    configure(c) { cfg = Object.assign(cfg, c); }
  };
})(typeof window !== 'undefined' ? window : globalThis);
