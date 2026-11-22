/* Page background: a collage of football-legend tiles (stylised silhouettes + name + shirt number,
 * drawn here as SVG) and a choice of colour palettes. Loaded in <head> so the saved colours apply
 * before the first paint. Preferences are per device (localStorage). */
(function (root) {
  'use strict';

  /* ---------- palettes ---------- */
  // The page background is dark; the "boxes" (cards, rows, tiles, buttons) are white, or black on Graphite.
  const BOXES = {
    white: { surface: '#ffffff', surface2: '#f1f3f5', line: '#c5cbd3', edge: '#6b7683', text: '#14181c', muted: '#55606b', warn: '#b42318', mix: '45%' },
    black: { surface: '#000000', surface2: '#161616', line: '#3d3d3d', edge: '#7c7c7c', text: '#f2f2f2', muted: '#a9a9a9', warn: '#ff8a8a', mix: '0%' }
  };
  const PALETTES = [
    { id: 'pitch',    name: 'Pitch',    bg: '#0b1410', muted: '#94ab9f', accent: '#3ddc84', boxes: 'white' },
    { id: 'midnight', name: 'Midnight', bg: '#0a1220', muted: '#93a5c4', accent: '#4da3ff', boxes: 'white' },
    { id: 'crimson',  name: 'Crimson',  bg: '#1a0b0e', muted: '#c4a0a6', accent: '#ff6b81', boxes: 'white' },
    { id: 'purple',   name: 'Purple',   bg: '#130d20', muted: '#aa9fc9', accent: '#b794ff', boxes: 'white' },
    { id: 'sunset',   name: 'Sunset',   bg: '#1c1008', muted: '#c9ab8f', accent: '#ffa94d', boxes: 'white' },
    { id: 'teal',     name: 'Teal',     bg: '#071a1a', muted: '#8fbdb9', accent: '#2dd4bf', boxes: 'white' },
    // lighter page grey so the black boxes stand out from it
    { id: 'graphite', name: 'Graphite', bg: '#565b61', muted: '#dcdfe2', accent: '#e5e5e5', boxes: 'black' }
  ];
  PALETTES.forEach((p) => { p.box = BOXES[p.boxes].surface; });

  const KEY = 'footballTracker.bg';
  const DEFAULTS = { palette: 'pitch', collage: true };

  function load() {
    try {
      const p = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (p && typeof p === 'object') {
        return {
          palette: PALETTES.some((x) => x.id === p.palette) ? p.palette : DEFAULTS.palette,
          collage: p.collage !== false
        };
      }
    } catch (e) { /* use defaults */ }
    return Object.assign({}, DEFAULTS);
  }
  let prefs = load();
  const paletteOf = (id) => PALETTES.find((p) => p.id === id) || PALETTES[0];

  function applyPalette() {
    const p = paletteOf(prefs.palette), b = BOXES[p.boxes], st = root.document.documentElement.style;
    const set = (k, v) => st.setProperty(k, v);
    set('--bg', p.bg); set('--muted', p.muted); set('--accent', p.accent); set('--accent-ink', '#0a0d0c');
    set('--surface', b.surface); set('--surface-2', b.surface2); set('--line', b.line); set('--box-edge', b.edge);
    set('--box-text', b.text); set('--box-muted', b.muted); set('--box-warn', b.warn); set('--box-mix', b.mix);
    const meta = root.document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', p.bg);
  }

  /* ---------- the collage ---------- */
  // Stylised figures drawn from joints in a 100x100 box: [head x,y], torso [from,to], limbs as polylines, ball.
  const POSES = [
    { name: 'strike', head: [48, 12], torso: [[48, 21], [50, 52]], ball: [92, 56],
      limbs: [[[50, 52], [48, 73], [46, 96]], [[50, 52], [64, 66], [84, 60]], [[48, 27], [32, 36], [22, 30]], [[48, 27], [62, 34], [70, 44]]] },
    { name: 'dribble', head: [58, 13], torso: [[55, 22], [47, 50]], ball: [84, 94],
      limbs: [[[47, 50], [36, 68], [22, 80]], [[47, 50], [60, 66], [64, 92]], [[53, 28], [40, 35], [33, 47]], [[53, 28], [66, 37], [77, 32]]] },
    { name: 'celebrate', head: [50, 14], torso: [[50, 23], [50, 54]],
      limbs: [[[50, 54], [42, 75], [38, 96]], [[50, 54], [58, 75], [62, 96]], [[50, 28], [34, 18], [27, 4]], [[50, 28], [66, 18], [73, 4]]] },
    { name: 'header', head: [56, 14], torso: [[52, 23], [46, 52]], ball: [76, 5],
      limbs: [[[46, 52], [38, 68], [46, 86]], [[46, 52], [56, 70], [62, 84]], [[50, 29], [34, 31], [24, 23]], [[50, 29], [66, 27], [77, 19]]] },
    { name: 'bicycle', head: [27, 72], torso: [[36, 67], [58, 45]], ball: [92, 8],
      limbs: [[[58, 45], [72, 28], [86, 14]], [[58, 45], [76, 52], [92, 58]], [[38, 66], [28, 52], [18, 42]], [[38, 66], [46, 82], [58, 90]]] },
    { name: 'pose', head: [50, 14], torso: [[50, 23], [50, 54]],
      limbs: [[[50, 54], [40, 75], [32, 96]], [[50, 54], [60, 75], [68, 96]], [[50, 28], [36, 42], [25, 58]], [[50, 28], [64, 42], [75, 58]]] }
  ];

  const pts = (a) => a.map((p) => p[0] + ',' + p[1]).join(' ');
  function figure(p) {
    let s = '<circle cx="' + p.head[0] + '" cy="' + p.head[1] + '" r="8.5"/>' +
      '<polyline points="' + pts(p.torso) + '" stroke-width="12"/>';
    p.limbs.forEach((l) => { s += '<polyline points="' + pts(l) + '" stroke-width="7.5"/>'; });
    if (p.ball) s += '<circle cx="' + p.ball[0] + '" cy="' + p.ball[1] + '" r="6" fill="none" stroke-width="3"/>';
    return '<g fill="currentColor" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">' + figureFix(s) + '</g>';
  }
  // polylines must not be filled (they would be closed into blobs)
  const figureFix = (s) => s.replace(/<polyline /g, '<polyline fill="none" ');
  const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function tile(i, x, y, w, h, rot, player, pose) {
    const s = (h - 38) / 100;
    return '<g transform="translate(' + x.toFixed(1) + ' ' + y.toFixed(1) + ') rotate(' + rot + ' ' + w / 2 + ' ' + h / 2 + ')">' +
      '<clipPath id="ct' + i + '"><rect width="' + w + '" height="' + h + '" rx="14"/></clipPath>' +
      '<rect width="' + w + '" height="' + h + '" rx="14" fill="currentColor" fill-opacity=".08" stroke="currentColor" stroke-opacity=".2" stroke-width="2"/>' +
      '<g clip-path="url(#ct' + i + ')">' +
      '<text x="' + (w - 8) + '" y="' + (h - 8) + '" text-anchor="end" font-size="' + Math.round(h * 0.82) +
      '" font-weight="900" font-family="Arial Black, Impact, system-ui, sans-serif" fill="currentColor" fill-opacity=".11">' + esc(player.number) + '</text>' +
      '<g transform="translate(10 8) scale(' + s.toFixed(3) + ')" opacity=".3">' + figure(pose) + '</g>' +
      '<text x="12" y="' + (h - 11) + '" font-size="15" font-weight="800" letter-spacing="1.6" font-family="system-ui, Arial, sans-serif" fill="currentColor" fill-opacity=".55">' +
      esc(String(player.name).toUpperCase()) + '</text></g></g>';
  }

  function renderCollage() {
    const el = root.document.getElementById('bg');
    if (!el) return;
    const players = (root.TRAINING_CONFIG && root.TRAINING_CONFIG.collage) || [];
    if (!prefs.collage || !players.length) { el.innerHTML = ''; return; }
    const W = root.innerWidth, H = root.innerHeight;
    const w = W < 600 ? 172 : 230, h = Math.round(w * 0.78);
    const sx = w * 0.84, sy = h * 0.8;
    const cols = Math.ceil(W / sx) + 2, rows = Math.ceil(H / sy) + 2;
    let out = '<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '" aria-hidden="true" focusable="false">';
    let i = 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++, i++) {
        const x = c * sx - (r % 2 ? sx / 2 : 0) - 30, y = r * sy - 30;
        const rot = ((i * 53) % 13) - 6;
        out += tile(i, x, y, w, h, rot, players[(i * 3 + r) % players.length], POSES[(i * 5 + c) % POSES.length]);
      }
    }
    el.innerHTML = out + '</svg>';
  }

  /* ---------- public api ---------- */
  function set(patch) {
    prefs = Object.assign({}, prefs, patch);
    try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch (e) { /* not saved, still applied */ }
    applyPalette();
    renderCollage();
  }
  const api = { palettes: PALETTES, boxes: BOXES, poses: POSES, get: () => Object.assign({}, prefs), set, renderCollage };

  if (typeof module !== 'undefined' && module.exports) { module.exports = api; return; }
  root.Background = api;
  applyPalette();
  let timer;
  root.document.addEventListener('DOMContentLoaded', renderCollage);
  root.addEventListener('resize', () => { clearTimeout(timer); timer = setTimeout(renderCollage, 150); });
})(typeof window !== 'undefined' ? window : globalThis);
