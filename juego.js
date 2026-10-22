// Lambo Kart - codigo JavaScript del juego (copia para leer).
// El juego se abre con index.html, que ya lleva este mismo codigo dentro.
// ================== CONFIGURACIÓN ==================
const LAPS = 3;          // vueltas
const W = 230;           // ancho de pista
const CAR_R = 20;        // radio de colisión de los coches
const LAMBO_COLOR = '#ffb400'; // amarillo Giallo

// Multijugador: hasta 4 coches. Cada jugador lleva un Lamborghini; los huecos son karts con IA
const PLAYER_COLORS = ['#ffb400', '#5ed12a', '#ff6a00', '#8e44ff'];
const KARTS = [['Rojo', '#d32f2f'], ['Azul', '#1e6fd9'], ['Verde', '#2e9e44'], ['Rosa', '#e91e8c']];
const GRID = [[4, -55], [4, 55], [10, -55], [10, 55]]; // [segmento, carril] de salida

// Cámara trasera (estilo GTA)
const FOV_DEG = 72;      // campo de visión horizontal (se abre un poco con la velocidad)
const CAM_DIST = 170;    // distancia detrás del coche
const CAM_H = 70;        // altura de la cámara

// Luz
const SUN = norm3([-0.55, 0.6, -0.58]);   // dirección hacia el sol
const SUN_COL = [2.6, 2.4, 2.1];          // color/intensidad del sol
const SHADOW_SIZE = 2048, SHADOW_RANGE = 900;

const glc = document.getElementById('gl');
const gl = glc.getContext('webgl2', { antialias: true });
const cv = document.getElementById('hud');
const ctx = cv.getContext('2d');
const keys = {};

let track = [], N = 0, bounds = null;
let cars = [], boxes = [], bananas = [], decor = [];
let state = 'menu', countdown = 0, goTimer = 0, finishOrder = [];

// ================== UTILIDADES ==================
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const avg3 = pts => [0, 1, 2].map(k => pts.reduce((s, p) => s + p[k], 0) / pts.length);
function norm3(v) { const l = Math.hypot(...v) || 1; return v.map(x => x / l); }

function angDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

function hexToRgb(hex) {
  let h = hex.slice(1);
  if (h.length === 3) h = h.split('').map(c => c + c).join(''); // '#abc' -> 'aabbcc'
  const n = parseInt(h, 16);
  return [n >> 16, (n >> 8) & 255, n & 255];
}
const rgb = hex => hexToRgb(hex).map(v => v / 255);

// Polígono 2D (para el HUD)
function poly(points, color) {
  ctx.beginPath();
  points.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

// Punto de la pista desplazado lateralmente (lane > 0 = derecha)
function pointAt(seg, lane) {
  const p = track[(seg + N) % N];
  return { x: p.x - Math.sin(p.a) * lane, y: p.y + Math.cos(p.a) * lane };
}

// ================== MATRICES (column-major, como WebGL) ==================
function mat4Mul(a, b) {
  const o = new Float32Array(16);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
    let s = 0;
    for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
    o[c * 4 + r] = s;
  }
  return o;
}

function perspective(fovy, aspect, n, f) {
  const t = 1 / Math.tan(fovy / 2), nf = 1 / (n - f);
  return new Float32Array([t / aspect, 0, 0, 0, 0, t, 0, 0, 0, 0, (f + n) * nf, -1, 0, 0, 2 * f * n * nf, 0]);
}

function ortho(s, n, f) {
  return new Float32Array([1 / s, 0, 0, 0, 0, 1 / s, 0, 0, 0, 0, -2 / (f - n), 0, 0, 0, -(f + n) / (f - n), 1]);
}

function lookAt(eye, target, up) {
  const z = norm3(sub3(eye, target)), x = norm3(cross3(up, z)), y = cross3(z, x);
  return new Float32Array([x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0,
    -dot3(x, eye), -dot3(y, eye), -dot3(z, eye), 1]);
}

// Coloca un modelo (x delante, y arriba, z derecha) en el mapa 2D del juego
function carMatrix(x, y, angle, h = 0) {
  const c = Math.cos(angle), s = Math.sin(angle);
  return new Float32Array([c, 0, s, 0, 0, 1, 0, 0, -s, 0, c, 0, x, h, y, 1]);
}

function transformPoint(m, p, w = 1) {
  return [0, 1, 2].map(r => m[r] * p[0] + m[4 + r] * p[1] + m[8 + r] * p[2] + m[12 + r] * w);
}

const IDENTITY = carMatrix(0, 0, 0);

// ================== PISTA ==================
const CTRL = [[0,0],[1200,0],[1800,300],[1900,900],[1500,1300],[1000,1100],
              [600,1400],[0,1500],[-500,1100],[-400,500],[-700,200]];

function catmull(p0, p1, p2, p3, t) {
  const t2 = t * t, t3 = t2 * t;
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2
         + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}

function buildTrack() {
  const pts = CTRL.map(p => [p[0] * 1.4, p[1] * 1.4]), n = pts.length;
  track = [];
  for (let i = 0; i < n; i++) {
    const a = pts[(i - 1 + n) % n], b = pts[i], c = pts[(i + 1) % n], d = pts[(i + 2) % n];
    for (let s = 0; s < 40; s++) {
      const t = s / 40;
      track.push({ x: catmull(a[0], b[0], c[0], d[0], t), y: catmull(a[1], b[1], c[1], d[1], t) });
    }
  }
  N = track.length;
  track.forEach((p, i) => { const q = track[(i + 1) % N]; p.a = Math.atan2(q.y - p.y, q.x - p.x); });
  computeBounds();
}

function computeBounds() {
  const xs = track.map(p => p.x), ys = track.map(p => p.y);
  bounds = { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
}

function distToTrack(x, y) {
  let best = Infinity;
  for (const p of track) best = Math.min(best, Math.hypot(p.x - x, p.y - y));
  return best;
}

function buildDecor() {
  decor = [];
  while (decor.length < 260) {
    const x = bounds.x0 - 900 + Math.random() * (bounds.x1 - bounds.x0 + 1800);
    const y = bounds.y0 - 900 + Math.random() * (bounds.y1 - bounds.y0 + 1800);
    if (distToTrack(x, y) > W / 2 + 80) decor.push({ x, y, s: 0.7 + Math.random() * 0.7, pine: Math.random() < 0.7 });
  }
}

// ================== GEOMETRÍA ==================
// Cada vértice: posición(3) normal(3) color(3) uv(2) material(1)
const M = { MATTE: 0, PAINT: 1, GLASS: 2, EMIT: 3, ASPHALT: 4, GRASS: 5, CHROME: 7, RAINBOW: 8, BLOB: 9, CHECKER: 10 };
const UP = [0, 1, 0];

function vtx(g, p, n, c, uv, mat) {
  g.push(p[0], p[1], p[2], n[0], n[1], n[2], c[0], c[1], c[2], uv[0], uv[1], mat);
}

function tri(g, a, b, c, n, col, mat) {
  [a, b, c].forEach(p => vtx(g, p, n, col, [0, 0], mat));
}

// Cuadrilátero con normal por vértice y uv opcionales
function quadN(g, ps, ns, col, mat, uvs = [[0, 0], [0, 0], [0, 0], [0, 0]]) {
  [0, 1, 2, 0, 2, 3].forEach(i => vtx(g, ps[i], ns[i], col, uvs[i], mat));
}

function normalOf(pts) {
  let n = cross3(sub3(pts[1], pts[0]), sub3(pts[2], pts[0]));
  if (Math.hypot(...n) < 1e-6) n = cross3(sub3(pts[2], pts[0]), sub3(pts[3], pts[0]));
  return norm3(n);
}

// Polígono convexo plano con la normal apuntando hacia fuera de "center"
function facePoly(g, pts, color, mat, center) {
  let n = normalOf(pts);
  if (dot3(n, sub3(avg3(pts), center)) < 0) n = n.map(v => -v);
  const c = rgb(color);
  for (let i = 1; i < pts.length - 1; i++) tri(g, pts[0], pts[i], pts[i + 1], n, c, mat);
}

// Une secciones transversales (pts = [derecha, arriba]) colocadas a lo largo de x
function loft(g, secs, styleOf) {
  const P = (s, p) => [s.x, p[1], p[0]];
  const center = avg3(secs.flatMap(s => s.pts.map(p => P(s, p))));
  for (let k = 0; k < secs.length - 1; k++) {
    const A = secs[k], B = secs[k + 1], m = A.pts.length;
    for (let j = 0; j < m; j++) {
      const j2 = (j + 1) % m;
      facePoly(g, [P(A, A.pts[j]), P(A, A.pts[j2]), P(B, B.pts[j2]), P(B, B.pts[j])], ...styleOf(k, j), center);
    }
  }
  const first = secs[0], last = secs[secs.length - 1];
  facePoly(g, first.pts.map(p => P(first, p)), ...styleOf('rear'), center);
  facePoly(g, last.pts.map(p => P(last, p)), ...styleOf('front'), center);
}

// Caja: x (delante), y (arriba), z (derecha)
function box(g, x0, x1, y0, y1, z0, z1, color, mat) {
  const r = [[z0, y0], [z1, y0], [z1, y1], [z0, y1]];
  loft(g, [{ x: x0, pts: r }, { x: x1, pts: r }], () => [color, mat]);
}

// Llama a fn para el lado derecho (s=1) y el izquierdo (s=-1)
function bothSides(fn) { fn(1); fn(-1); }
const sideZ = (z0, z1, s) => s > 0 ? [z0, z1] : [-z1, -z0];

// Cilindro con el eje en z (ruedas)
function cylinderZ(g, cx, cy, cz, r, w, color, mat, seg = 20) {
  const c = rgb(color), z0 = cz - w / 2, z1 = cz + w / 2;
  const P = (a, z) => [cx + Math.cos(a) * r, cy + Math.sin(a) * r, z];
  const Nr = a => [Math.cos(a), Math.sin(a), 0];
  for (let i = 0; i < seg; i++) {
    const a0 = i / seg * Math.PI * 2, a1 = (i + 1) / seg * Math.PI * 2;
    quadN(g, [P(a0, z0), P(a1, z0), P(a1, z1), P(a0, z1)], [Nr(a0), Nr(a1), Nr(a1), Nr(a0)], c, mat);
    tri(g, [cx, cy, z0], P(a0, z0), P(a1, z0), [0, 0, -1], c, mat);
    tri(g, [cx, cy, z1], P(a1, z1), P(a0, z1), [0, 0, 1], c, mat);
  }
}

// Tronco de cono vertical (árboles)
function frustumY(g, cx, cz, y0, y1, r0, r1, color, mat, seg = 10) {
  const c = rgb(color), h = y1 - y0;
  const P = (a, y, r) => [cx + Math.cos(a) * r, y, cz + Math.sin(a) * r];
  const Nn = a => norm3([Math.cos(a) * h, r0 - r1, Math.sin(a) * h]);
  for (let i = 0; i < seg; i++) {
    const a0 = i / seg * Math.PI * 2, a1 = (i + 1) / seg * Math.PI * 2;
    quadN(g, [P(a0, y0, r0), P(a1, y0, r0), P(a1, y1, r1), P(a0, y1, r1)], [Nn(a0), Nn(a1), Nn(a1), Nn(a0)], c, mat);
  }
}

// Copia geometría aplicando una matriz
function appendTransformed(dst, src, m) {
  for (let i = 0; i < src.length; i += 12) {
    const p = transformPoint(m, src.slice(i, i + 3)), n = transformPoint(m, src.slice(i + 3, i + 6), 0);
    dst.push(...p, ...n, ...src.slice(i + 6, i + 12));
  }
}

// ================== MUNDO 3D ==================
// Punto de la pista en 3D: segmento i (+ fracción f), desplazamiento lateral o, altura h
function T(i, f, o, h) {
  const a = pointAt(i, o), b = pointAt(i + 1, o);
  return [a.x + (b.x - a.x) * f, h, a.y + (b.y - a.y) * f];
}

function trackStrip(g, i, f0, f1, o1, o2, h, color, mat) {
  const ps = [T(i, f0, o1, h), T(i, f0, o2, h), T(i, f1, o2, h), T(i, f1, o1, h)];
  quadN(g, ps, [UP, UP, UP, UP], rgb(color), mat);
}

function buildTrackMesh(g) {
  for (let i = 0; i < N; i++) {
    trackStrip(g, i, 0, 1, -W / 2 - 2, W / 2 + 2, 0.3, '#3d3d40', M.ASPHALT);
    [0, 0.5].forEach((f, k) => {
      const col = k ? '#c81e1e' : '#f2f2f2';
      trackStrip(g, i, f, f + 0.5, W / 2, W / 2 + 16, 0.5, col, M.MATTE);
      trackStrip(g, i, f, f + 0.5, -W / 2 - 16, -W / 2, 0.5, col, M.MATTE);
    });
    trackStrip(g, i, 0, 1, W / 2 - 12, W / 2 - 7, 0.45, '#e6e6e6', M.MATTE);
    trackStrip(g, i, 0, 1, -W / 2 + 7, -W / 2 + 12, 0.45, '#e6e6e6', M.MATTE);
    if (i % 2 === 0) trackStrip(g, i, 0, 0.6, -2.5, 2.5, 0.45, '#e6e6e6', M.MATTE);
  }
  buildStartLine(g);
}

function buildStartLine(g) {
  const p = track[0], local = [];
  quadN(local, [[-18, 0.55, -W / 2], [-18, 0.55, W / 2], [0, 0.55, W / 2], [0, 0.55, -W / 2]],
        [UP, UP, UP, UP], [1, 1, 1], M.CHECKER, [[0, 0], [14, 0], [14, 2], [0, 2]]);
  buildGantry(local);
  appendTransformed(g, local, carMatrix(p.x, p.y, p.a));
}

// Arco de meta con pancarta a cuadros
function buildGantry(g) {
  const z = W / 2 + 32;
  bothSides(s => box(g, -4, 4, 0, 92, ...sideZ(W / 2 + 22, z, s), '#b0b0b0', M.MATTE));
  box(g, -5, 5, 74, 92, -z, z, '#202020', M.MATTE);
  [-5.4, 5.4].forEach(x => {
    const n = [Math.sign(x), 0, 0];
    quadN(g, [[x, 76, -W / 2], [x, 76, W / 2], [x, 90, W / 2], [x, 90, -W / 2]],
          [n, n, n, n], [1, 1, 1], M.CHECKER, [[0, 0], [24, 0], [24, 2], [0, 2]]);
  });
}

function buildGrass(g) {
  const cx = (bounds.x0 + bounds.x1) / 2, cz = (bounds.y0 + bounds.y1) / 2, s = 16000;
  quadN(g, [[cx - s, 0, cz - s], [cx + s, 0, cz - s], [cx + s, 0, cz + s], [cx - s, 0, cz + s]],
        [UP, UP, UP, UP], [1, 1, 1], M.GRASS);
}

// Anillo de montañas lejanas con nieve en las cumbres
function buildMountains(g) {
  const cx = (bounds.x0 + bounds.x1) / 2, cz = (bounds.y0 + bounds.y1) / 2, n = 160;
  const height = a => Math.max(150, 650 + 380 * Math.sin(3 * a + 1) + 220 * Math.sin(7 * a + 2) + 130 * Math.sin(19 * a));
  const P = (a, R, h) => [cx + Math.cos(a) * R, h, cz + Math.sin(a) * R];
  const colorAt = h => h > 900 ? rgb('#e9eef2') : h > 500 ? rgb('#6f746b') : rgb('#3f5a34');
  for (let i = 0; i < n; i++) {
    const a0 = i / n * Math.PI * 2, a1 = (i + 1) / n * Math.PI * 2, h0 = height(a0), h1 = height(a1);
    const rows = [[P(a0, 6000, -5), P(a1, 6000, -5)], [P(a0, 7800, h0), P(a1, 7800, h1)], [P(a0, 9800, h0 * 0.4), P(a1, 9800, h1 * 0.4)]];
    for (let r = 0; r < 2; r++) mountainQuad(g, rows[r][0], rows[r][1], rows[r + 1][1], rows[r + 1][0], colorAt);
  }
}

function mountainQuad(g, a, b, c, d, colorAt) {
  [[a, b, c], [a, c, d]].forEach(t => {
    const n = normalOf(t);
    t.forEach(p => vtx(g, p, n, colorAt(p[1]), [0, 0], M.MATTE));
  });
}

function buildTrees(g) {
  decor.forEach(t => {
    const s = t.s, k = 0.85 + Math.random() * 0.3, green = c => '#' + rgb(c).map(v => Math.min(255, v * 255 * k | 0).toString(16).padStart(2, '0')).join('');
    frustumY(g, t.x, t.y, 0, 26 * s, 3.5 * s, 2.5 * s, '#5b3a24', M.MATTE, 7);
    if (t.pine) {
      frustumY(g, t.x, t.y, 16 * s, 52 * s, 26 * s, 0, green('#244f22'), M.MATTE);
      frustumY(g, t.x, t.y, 36 * s, 70 * s, 20 * s, 0, green('#2a5a26'), M.MATTE);
      frustumY(g, t.x, t.y, 54 * s, 88 * s, 13 * s, 0, green('#30652b'), M.MATTE);
    } else {
      frustumY(g, t.x, t.y, 20 * s, 42 * s, 12 * s, 30 * s, green('#3d6e2a'), M.MATTE);
      frustumY(g, t.x, t.y, 42 * s, 70 * s, 30 * s, 0, green('#467a30'), M.MATTE);
    }
  });
}

// ================== MODELOS DE COCHES ==================
const GLASS = '#0e1319';

function lamboSection(x, hw, hs, ht, top) {
  return { x, pts: [[-hw, 3], [hw, 3], [hw, hs], [ht, top], [-ht, top], [-hw, hs]] };
}

// k = tramo (0 trasera ... 6 morro), j = cara de la sección (0 abajo, 2/4 laterales altos, 3 arriba)
function lamboStyle(k, j, paint) {
  if (k === 'rear') return [paint, M.PAINT];
  if (k === 'front') return [paint, M.PAINT];
  if (j === 0) return ['#0b0b0b', M.MATTE];
  if (j === 3 && (k === 1 || k === 4)) return [GLASS, M.GLASS];     // tapa motor y parabrisas
  if ((j === 2 || j === 4) && k >= 2 && k <= 4) return [GLASS, M.GLASS]; // ventanillas
  return [paint, M.PAINT];
}

function buildLambo(paint) {
  const g = [];
  loft(g, [
    lamboSection(-31, 13.5, 10, 11.5, 13), lamboSection(-24, 14.5, 11, 11.5, 14.5),
    lamboSection(-14, 15, 11.5, 10, 17), lamboSection(-2, 15, 11.5, 9, 18),
    lamboSection(6, 15, 11, 9.5, 17), lamboSection(18, 15, 9.5, 12, 10.5),
    lamboSection(27, 14.5, 7, 12, 7.5), lamboSection(34, 12, 4, 10, 5.5)
  ], (k, j) => lamboStyle(k, j, paint));
  lamboWheels(g);
  lamboAero(g, paint);
  lamboLights(g);
  return g;
}

function wheel(g, x, z, r, w) {
  cylinderZ(g, x, r, z, r, w, '#151515', M.MATTE);
  cylinderZ(g, x, r, z, r * 0.62, w + 0.6, '#c9c9c9', M.CHROME, 14);
  cylinderZ(g, x, r, z, r * 0.2, w + 1, '#222222', M.CHROME, 8);
}

function lamboWheels(g) {
  bothSides(s => { wheel(g, -19, 14.8 * s, 7.4, 7); wheel(g, 20, 14.8 * s, 6.8, 6); });
}

function lamboAero(g, paint) {
  box(g, 27, 35, 1.2, 3, -12.5, 12.5, '#0b0b0b', M.MATTE);           // splitter
  box(g, -33, -29, 1.5, 6, -12, 12, '#0b0b0b', M.MATTE);             // difusor
  box(g, -31.5, -30.6, 6, 11.5, -9, 9, '#0b0b0b', M.MATTE);          // rejilla trasera
  box(g, -35, -27.5, 18.5, 20, -15.5, 15.5, '#101010', M.PAINT);     // alerón
  bothSides(s => {
    box(g, -31, -29, 12.5, 18.5, ...sideZ(6, 8, s), '#101010', M.MATTE);
    box(g, -13, -3, 5, 10, ...sideZ(14.9, 15.5, s), '#080808', M.MATTE); // tomas de aire
    box(g, 8, 12, 12.5, 14.5, ...sideZ(15, 18.5, s), paint, M.PAINT);     // retrovisores
  });
}

function lamboLights(g) {
  bothSides(s => {
    box(g, -31.7, -30.8, 9, 10.5, ...sideZ(6, 13.5, s), '#ff1424', M.EMIT);   // pilotos en Y
    box(g, -31.7, -30.8, 6.5, 10.5, ...sideZ(12, 13.5, s), '#ff1424', M.EMIT);
    box(g, 30, 33.6, 5, 6.3, ...sideZ(5, 10.5, s), '#eaf4ff', M.EMIT);         // faros
  });
  box(g, -32.4, -30.8, 4, 7, -3.5, 3.5, '#bdbdbd', M.CHROME);   // escape
  box(g, -32.6, -32.3, 4.8, 6.2, -2.6, 2.6, '#050505', M.MATTE);
}

function buildKart(color) {
  const g = [];
  box(g, -22, 22, 2.5, 4, -11, 11, '#2a2a2a', M.MATTE);          // chasis
  box(g, 12, 26, 3, 9, -9, 9, color, M.PAINT);                   // morro
  box(g, 24, 28, 2, 6, -12, 12, '#1a1a1a', M.MATTE);             // parachoques
  box(g, -30, -27, 3, 6, -13, 13, '#1a1a1a', M.MATTE);
  box(g, -27, -20, 4, 12, -6, 6, '#8a8a8a', M.CHROME);           // motor
  box(g, -14, -4, 4, 14, -6, 6, '#222222', M.MATTE);             // asiento
  box(g, -10, 0, 8, 20, -6, 6, color, M.MATTE);                  // piloto
  box(g, 7, 9, 12, 18, -4, 4, '#111111', M.MATTE);               // volante
  box(g, -9, 1, 20, 30, -5.5, 5.5, '#f5f5f5', M.PAINT);          // casco
  box(g, 1, 1.7, 23, 27, -4.5, 4.5, GLASS, M.GLASS);             // visera
  bothSides(s => {
    box(g, -10, 10, 3, 8, ...sideZ(9, 14, s), color, M.PAINT);   // pontones
    box(g, 0, 8, 14, 17, ...sideZ(5, 8, s), color, M.MATTE);     // brazos
    wheel(g, -17, 14 * s, 6.5, 7);
    wheel(g, 16, 13 * s, 5.5, 5);
  });
  return g;
}

function buildItemBox() {
  const g = [];
  box(g, -13, 13, -13, 13, -13, 13, '#ffffff', M.RAINBOW);
  return g;
}

function buildBanana() {
  const g = [];
  for (let i = 0; i < 6; i++) {
    const a = -0.9 + i * 0.36, x = Math.sin(a) * 10, z = Math.cos(a) * 10 - 10;
    const tip = i === 0 || i === 5;
    box(g, x - 2.2, x + 2.2, 0.5, tip ? 3 : 4.5, z - 2.2, z + 2.2, tip ? '#5d4037' : '#ffd21f', M.PAINT);
  }
  return g;
}

function buildFlame(len) {
  const g = [], sq = r => [[-r, 5.5 - r], [r, 5.5 - r], [r, 5.5 + r], [-r, 5.5 + r]];
  loft(g, [{ x: -32.5, pts: sq(3) }, { x: -40, pts: sq(2.6) }, { x: -32.5 - len, pts: sq(0.3) }], () => ['#ff6a00', M.EMIT]);
  loft(g, [{ x: -32.6, pts: sq(1.6) }, { x: -32.6 - len * 0.6, pts: sq(0.2) }], () => ['#ffe066', M.EMIT]);
  return g;
}

// Sombra suave de contacto bajo cada coche
function buildBlob() {
  const g = [];
  quadN(g, [[-38, 0.9, -21], [38, 0.9, -21], [38, 0.9, 21], [-38, 0.9, 21]], [UP, UP, UP, UP],
        [0, 0, 0], M.BLOB, [[0, 0], [1, 0], [1, 1], [0, 1]]);
  return g;
}

// ================== SHADERS ==================
const HEAD = '#version 300 es\nprecision highp float;\n';

const GLSL_COMMON = `
uniform vec3 uSun; uniform vec3 uSunCol; uniform float uTime;
float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}
float fbm(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { s += a * noise(p); p = p * 2.03 + 17.1; a *= 0.5; }
  return s;
}
vec3 skyCol(vec3 d) {
  float y = max(d.y, 0.0);
  vec3 c = mix(vec3(0.62, 0.74, 0.9), vec3(0.14, 0.32, 0.75), pow(y, 0.5));
  float s = max(dot(d, uSun), 0.0);
  return c + uSunCol * (pow(s, 1500.0) * 30.0 + pow(s, 10.0) * 0.05);
}
vec3 tonemap(vec3 x) {
  x = clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
  return pow(x, vec3(1.0 / 2.2));
}
`;

const MAIN_VS = HEAD + `
layout(location=0) in vec3 aPos; layout(location=1) in vec3 aNor; layout(location=2) in vec3 aCol;
layout(location=3) in vec2 aUv; layout(location=4) in float aMat;
uniform mat4 uVP, uModel, uLightVP;
out vec3 vPos; out vec3 vNor; out vec3 vCol; out vec2 vUv; out float vMat; out vec4 vLight;
void main() {
  vec4 w = uModel * vec4(aPos, 1.0);
  vPos = w.xyz; vNor = mat3(uModel) * aNor; vCol = aCol; vUv = aUv; vMat = aMat;
  vLight = uLightVP * w;
  gl_Position = uVP * w;
}`;

const MAIN_FS = HEAD + 'precision highp sampler2DShadow;\n' + GLSL_COMMON + `
in vec3 vPos; in vec3 vNor; in vec3 vCol; in vec2 vUv; in float vMat; in vec4 vLight;
uniform sampler2DShadow uShadow; uniform vec3 uCam;
out vec4 outColor;

float shadowAt() {
  vec3 p = vLight.xyz / vLight.w * 0.5 + 0.5;
  if (p.x < 0.0 || p.x > 1.0 || p.y < 0.0 || p.y > 1.0 || p.z > 1.0) return 1.0;
  vec2 t = 1.5 / vec2(textureSize(uShadow, 0));
  float s = 0.0;
  for (int x = -1; x <= 1; x++) for (int y = -1; y <= 1; y++)
    s += texture(uShadow, vec3(p.xy + vec2(x, y) * t, p.z - 0.0004));
  return s / 9.0;
}

vec3 albedo(int m, float dist) {
  vec3 b = pow(vCol, vec3(2.2));
  float near = clamp(1.0 - dist / 700.0, 0.0, 1.0);
  if (m == 4) {
    float grain = noise(vPos.xz * 0.7) * 0.5 + noise(vPos.xz * 0.17) * 0.5;
    b *= mix(1.0, 0.75 + 0.5 * grain, near) * (0.8 + 0.4 * fbm(vPos.xz * 0.006));
  }
  if (m == 5) {
    b = mix(vec3(0.04, 0.11, 0.015), vec3(0.13, 0.24, 0.04), fbm(vPos.xz * 0.0025));
    b = mix(b, vec3(0.16, 0.14, 0.06), smoothstep(0.6, 0.8, fbm(vPos.xz * 0.0013 + 3.0)) * 0.6);
    b *= mix(1.0, 0.7 + 0.6 * noise(vPos.xz * 0.45), near);
  }
  if (m == 8) b = pow(0.5 + 0.5 * cos(6.2832 * (uTime * 0.4 + vPos.y * 0.04 + vec3(0.0, 0.33, 0.67))), vec3(2.2));
  if (m == 10) b = vec3(mod(floor(vUv.x) + floor(vUv.y), 2.0) * 0.75 + 0.01);
  return b;
}

vec3 shade(int m, vec3 base, vec3 N, vec3 V) {
  float sh = shadowAt(), ndl = max(dot(N, uSun), 0.0);
  vec3 amb = mix(vec3(0.12, 0.11, 0.09), vec3(0.42, 0.5, 0.68), N.y * 0.5 + 0.5) * 0.75;
  vec3 col = base * (amb + uSunCol * ndl * sh);
  float spec = 0.04, gloss = 16.0, refl = 0.0;
  if (m == 1) { spec = 1.2; gloss = 250.0; refl = 0.05; }
  if (m == 2) { spec = 2.0; gloss = 400.0; refl = 0.12; }
  if (m == 7) { spec = 1.5; gloss = 60.0; refl = 1.0; }
  if (m == 8) { spec = 1.0; gloss = 80.0; refl = 0.2; }
  if (m == 4) { spec = 0.1; gloss = 20.0; }
  vec3 H = normalize(uSun + V);
  col += uSunCol * spec * pow(max(dot(N, H), 0.0), gloss) * ndl * sh;
  if (refl > 0.0) {
    vec3 R = reflect(-V, N);
    vec3 env = skyCol(R);
    if (R.y < 0.0) env = mix(env, vec3(0.05, 0.07, 0.04), clamp(-R.y * 5.0, 0.0, 1.0));
    float fr = refl + (1.0 - refl) * pow(1.0 - max(dot(N, V), 0.0), 5.0);
    col = m == 7 ? mix(col, env * base * 1.5, 0.6) : mix(col, env * (0.5 + 0.5 * sh), fr * 0.6);
  }
  return col;
}

void main() {
  int m = int(vMat + 0.5);
  if (m == 9) {
    float a = 1.0 - smoothstep(0.2, 1.0, length(vUv * 2.0 - 1.0));
    outColor = vec4(0.0, 0.0, 0.0, a * 0.45);
    return;
  }
  vec3 V = uCam - vPos; float dist = length(V); V /= dist;
  vec3 N = normalize(vNor);
  if (dot(N, V) < 0.0) N = -N;
  vec3 base = albedo(m, dist);
  vec3 col = m == 3 ? base * 4.0 : shade(m, base, N, V);
  vec3 D = -V;
  float fog = 1.0 - exp(-dist * 0.00011);
  col = mix(col, skyCol(normalize(vec3(D.x, max(D.y, 0.0) * 0.3 + 0.01, D.z))), fog);
  outColor = vec4(tonemap(col), 1.0);
}`;

const SHADOW_VS = HEAD + `
layout(location=0) in vec3 aPos;
uniform mat4 uLightVP, uModel;
void main() { gl_Position = uLightVP * uModel * vec4(aPos, 1.0); }`;

const SHADOW_FS = HEAD + 'void main() {}';

const SKY_VS = HEAD + `
out vec2 vNdc;
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2)) * 2.0 - 1.0;
  vNdc = p;
  gl_Position = vec4(p, 0.999, 1.0);
}`;

const SKY_FS = HEAD + GLSL_COMMON + `
in vec2 vNdc;
uniform vec3 uFwd, uRight, uUp; uniform vec2 uTan;
out vec4 outColor;
void main() {
  vec3 d = normalize(uFwd + vNdc.x * uTan.x * uRight + vNdc.y * uTan.y * uUp);
  vec3 col = skyCol(d);
  if (d.y > 0.0) {
    vec2 uv = d.xz / (d.y + 0.08) * 1.2 + vec2(uTime * 0.006, uTime * 0.002);
    float c = smoothstep(0.5, 0.8, fbm(uv * 1.6));
    float lit = 0.8 + 0.3 * max(dot(d, uSun), 0.0);
    col = mix(col, vec3(1.05, 1.0, 0.97) * 1.3 * lit, c * smoothstep(0.0, 0.25, d.y) * 0.9);
  }
  outColor = vec4(tonemap(col), 1.0);
}`;

// ================== WEBGL: PREPARACIÓN ==================
let progMain, progShadow, progSky, shadowMap, emptyVao, meshes = {};
const meshCache = {};

function compile(type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
  return s;
}

function program(vs, fs) {
  const p = gl.createProgram();
  gl.attachShader(p, compile(gl.VERTEX_SHADER, vs));
  gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  p.locs = {};
  return p;
}

function loc(p, name) {
  if (!(name in p.locs)) p.locs[name] = gl.getUniformLocation(p, name);
  return p.locs[name];
}

function upload(data) {
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW);
  let off = 0;
  [3, 3, 3, 2, 1].forEach((size, i) => {
    gl.enableVertexAttribArray(i);
    gl.vertexAttribPointer(i, size, gl.FLOAT, false, 48, off);
    off += size * 4;
  });
  gl.bindVertexArray(null);
  return { vao, count: data.length / 12 };
}

function cachedMesh(key, build) {
  if (!meshCache[key]) meshCache[key] = upload(build());
  return meshCache[key];
}

function makeShadowMap() {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texStorage2D(gl.TEXTURE_2D, 1, gl.DEPTH_COMPONENT24, SHADOW_SIZE, SHADOW_SIZE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL);
  const fbo = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, tex, 0);
  gl.drawBuffers([gl.NONE]);
  gl.readBuffer(gl.NONE);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return { tex, fbo };
}

function initGL() {
  progMain = program(MAIN_VS, MAIN_FS);
  progShadow = program(SHADOW_VS, SHADOW_FS);
  progSky = program(SKY_VS, SKY_FS);
  shadowMap = makeShadowMap();
  emptyVao = gl.createVertexArray();
  const world = [], props = [];
  buildGrass(world);
  buildMountains(world);
  buildTrackMesh(world);
  buildTrees(props);
  meshes.world = upload(world);
  meshes.props = upload(props);
  meshes.box = upload(buildItemBox());
  meshes.banana = upload(buildBanana());
  meshes.flames = [upload(buildFlame(18)), upload(buildFlame(24))];
  meshes.blob = upload(buildBlob());
}

// ================== COCHES ==================
function makeCar(id, name, color, human) {
  const [seg, lane] = GRID[id], p = pointAt(seg, lane);
  const base = human ? 9 : 8.2 + Math.random() * 0.6;
  return {
    id, name, color, human, x: p.x, y: p.y, angle: track[seg].a, speed: 0,
    seg, lap: 0, item: null, boost: 0, spin: 0, offTrack: false, done: false, net: null,
    base, maxSpeed: base, lane: human ? 0 : (Math.random() * 80 - 40),
    look: 10 + Math.floor(Math.random() * 4),
    mesh: human ? cachedMesh('lambo' + color, () => buildLambo(color)) : cachedMesh(color, () => buildKart(color))
  };
}

// humans = [{ id, name }] jugadores conectados; el resto de huecos son karts con IA
function resetRace(humans) {
  cars = [0, 1, 2, 3].map(i => {
    const h = humans.find(p => p.id === i);
    return h ? makeCar(i, h.name, PLAYER_COLORS[i], true) : makeCar(i, KARTS[i][0], KARTS[i][1], false);
  });
  bananas = []; finishOrder = [];
  makeBoxes();
  cam.a = me().angle;
}

const me = () => cars[net.myId] || cars[0];

// Coches que simula este ordenador: el mío y, si soy el anfitrión, los de la IA
function owned(c) {
  return (c.id === net.myId && c.human) || (isHost() && !c.human);
}

function playerInput() {
  const k = keys;
  return {
    up: k.ArrowUp || k.KeyW,
    down: k.ArrowDown || k.KeyS,
    turn: (k.ArrowRight || k.KeyD ? 1 : 0) - (k.ArrowLeft || k.KeyA ? 1 : 0)
  };
}

function aiInput(c) {
  const t = pointAt(c.seg + c.look, c.lane);
  const diff = angDiff(Math.atan2(t.y - c.y, t.x - c.x), c.angle);
  const brake = Math.abs(diff) > 1.3 && c.speed > 4;
  return { up: !brake, down: brake, turn: clamp(diff * 2.5, -1, 1) };
}

// La IA acelera si va detrás del jugador que va primero y frena un poco si va delante
function rubberBand() {
  const lead = Math.max(...cars.filter(c => c.human).map(progress));
  cars.forEach(c => {
    if (!c.human) c.maxSpeed = c.base + (progress(c) < lead ? 0.4 : -0.4);
  });
}

function drive(c, inp, dt) {
  let max = c.maxSpeed * (c.offTrack ? 0.45 : 1);
  if (c.boost > 0) { c.boost -= dt; max *= 1.6; c.speed = max; }
  else if (inp.up && c.speed < max) c.speed = Math.min(max, c.speed + 0.18 * dt);
  else if (inp.down) c.speed -= 0.3 * dt;
  else c.speed *= Math.pow(0.985, dt);
  if (c.speed > max) c.speed -= (c.speed - max) * 0.08 * dt;
  if (c.speed < -3) c.speed = -3;
  const grip = Math.min(1, Math.abs(c.speed) / 4) * Math.sign(c.speed);
  c.angle += inp.turn * 0.055 * grip * dt;
}

function physics(c, inp, dt) {
  if (c.spin > 0) {
    c.spin -= dt;
    c.angle += 0.25 * dt;
    c.speed *= Math.pow(0.94, dt);
  } else {
    drive(c, inp, dt);
  }
  c.x += Math.cos(c.angle) * c.speed * dt;
  c.y += Math.sin(c.angle) * c.speed * dt;
}

function nearestSeg(c) {
  let best = c.seg, bd = Infinity;
  for (let k = -10; k <= 30; k++) {
    const i = (c.seg + k + N) % N, p = track[i];
    const d = (p.x - c.x) ** 2 + (p.y - c.y) ** 2;
    if (d < bd) { bd = d; best = i; }
  }
  return { i: best, d: Math.sqrt(bd) };
}

function updateProgress(c) {
  const { i, d } = nearestSeg(c);
  if (i < c.seg - N / 2) c.lap++;
  else if (i > c.seg + N / 2) c.lap--;
  c.seg = i;
  c.offTrack = d > W / 2;
  if (c.lap >= LAPS && !c.done) finishCar(c);
}

// Al terminar, el coche sigue solo con el piloto automático
function finishCar(c) {
  c.done = true;
  c.lane = 0; c.look = 12;
}

// El anfitrión apunta el orden de llegada
function updateFinish() {
  cars.forEach(c => { if (c.done && !finishOrder.includes(c)) finishOrder.push(c); });
}

function progress(c) {
  const i = finishOrder.indexOf(c);
  if (i >= 0) return 1e6 - i;
  return (c.done ? 5e5 : 0) + c.lap * N + c.seg;
}

function ranking() {
  return [...cars].sort((a, b) => progress(b) - progress(a));
}

function collideCars() {
  for (let i = 0; i < cars.length; i++) {
    for (let j = i + 1; j < cars.length; j++) {
      const a = cars[i], b = cars[j];
      const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
      if (d === 0 || d >= CAR_R * 2) continue;
      const push = (CAR_R * 2 - d) / 2, nx = dx / d, ny = dy / d;
      // cada ordenador solo empuja los coches que simula
      if (owned(a)) { a.x -= nx * push; a.y -= ny * push; a.speed *= 0.97; }
      if (owned(b)) { b.x += nx * push; b.y += ny * push; b.speed *= 0.97; }
    }
  }
}

// ================== OBJETOS ==================
function makeBoxes() {
  boxes = [];
  [0.18, 0.45, 0.72].forEach(f => {
    const s = Math.floor(N * f);
    [-70, 0, 70].forEach(l => { const p = pointAt(s, l); boxes.push({ x: p.x, y: p.y, t: 0 }); });
  });
}

function updateBoxes(dt) {
  boxes.forEach(b => {
    if (b.t > 0) { b.t -= dt; return; }
    const c = cars.find(c => dist(b, c) < 32);
    if (!c) return;
    b.t = 180;
    if (c.item) return;
    c.item = Math.random() < 0.5 ? 'turbo' : 'banana';
    if (!owned(c)) send({ t: 'item', id: c.id, item: c.item });
  });
}

function useItem(c) {
  if (c.item === 'turbo') c.boost = 80;
  if (c.item === 'banana') {
    const b = { x: c.x - Math.cos(c.angle) * 45, y: c.y - Math.sin(c.angle) * 45 };
    if (isHost()) bananas.push(b); else send({ t: 'banana', x: b.x, y: b.y });
  }
  c.item = null;
}

function hitBanana(c) { c.spin = 50; c.boost = 0; }

function updateBananas() {
  for (let i = bananas.length - 1; i >= 0; i--) {
    const hit = cars.find(c => dist(bananas[i], c) < 26);
    if (!hit) continue;
    if (owned(hit)) hitBanana(hit); else send({ t: 'spin', id: hit.id });
    bananas.splice(i, 1);
  }
}

// ================== BUCLE ==================
function setState(s) {
  if (s === 'race' && state !== 'race') goTimer = 50;
  state = s;
}

function update(dt) {
  if (goTimer > 0) goTimer -= dt;
  if (isHost() && state === 'countdown') {
    countdown -= dt / 60;
    if (countdown <= 0) setState('race');
  }
  if (state !== 'race') return;
  if (isHost()) rubberBand();
  cars.forEach(c => owned(c) ? updateCar(c, dt) : followNet(c, dt));
  collideCars();
  if (!isHost()) return;
  updateBoxes(dt);
  updateBananas();
  updateFinish();
}

function updateCar(c, dt) {
  const mine = c.id === net.myId && c.human;
  const inp = (mine && !c.done) ? playerInput() : aiInput(c);
  physics(c, inp, dt);
  updateProgress(c);
  if (!c.human && c.item && Math.random() < 0.006 * dt) useItem(c);
}

let last = 0;
function loop(t) {
  const dt = Math.min(3, (t - last) / 16.67 || 1);
  last = t;
  update(dt);
  netTick(t);
  updateCamera(dt);
  renderGL(t / 1000);
  renderHUD();
  requestAnimationFrame(loop);
}

// ================== CÁMARA ==================
const cam = { a: 0, VP: IDENTITY };

// La cámara sigue al coche con un poco de retraso al girar
function updateCamera(dt) {
  cam.a += angDiff(me().angle, cam.a) * Math.min(1, 0.08 * dt);
}

function cameraView() {
  const p = me(), fx = Math.cos(cam.a), fz = Math.sin(cam.a);
  const eye = [p.x - fx * CAM_DIST, CAM_H, p.y - fz * CAM_DIST];
  const target = [p.x + fx * 90, 12, p.y + fz * 90];
  const aspect = glc.width / glc.height;
  const fovH = (FOV_DEG + Math.min(9, Math.abs(p.speed) * 0.6)) * Math.PI / 180;
  const tanY = Math.min(Math.tan(fovH / 2) / aspect, Math.tan(0.6));
  const VP = mat4Mul(perspective(2 * Math.atan(tanY), aspect, 4, 16000), lookAt(eye, target, UP));
  const fwd = norm3(sub3(target, eye)), right = norm3(cross3(fwd, UP)), up = cross3(right, fwd);
  return { VP, eye, fwd, right, up, tan: [tanY * aspect, tanY] };
}

// La zona de sombras sigue al jugador (un poco por delante)
function lightMatrix() {
  const p = me(), step = 16;
  const cx = Math.round((p.x + Math.cos(cam.a) * 400) / step) * step;
  const cz = Math.round((p.y + Math.sin(cam.a) * 400) / step) * step;
  const eye = [cx + SUN[0] * 3000, SUN[1] * 3000, cz + SUN[2] * 3000];
  return mat4Mul(ortho(SHADOW_RANGE, 1000, 5000), lookAt(eye, [cx, 0, cz], UP));
}

// ================== RENDER 3D ==================
function drawMesh(prog, mesh, model) {
  gl.uniformMatrix4fv(loc(prog, 'uModel'), false, model);
  gl.bindVertexArray(mesh.vao);
  gl.drawArrays(gl.TRIANGLES, 0, mesh.count);
}

function carModel(c) { return carMatrix(c.x, c.y, c.angle); }

// Todo lo que proyecta sombra
function drawCasters(prog, t) {
  drawMesh(prog, meshes.props, IDENTITY);
  cars.forEach(c => drawMesh(prog, c.mesh, carModel(c)));
  boxes.forEach(b => { if (b.t <= 0) drawMesh(prog, meshes.box, carMatrix(b.x, b.y, t * 1.5, 20 + Math.sin(t * 3) * 3)); });
  bananas.forEach(b => drawMesh(prog, meshes.banana, carMatrix(b.x, b.y, 0)));
}

function setLight(prog, t) {
  gl.uniform3fv(loc(prog, 'uSun'), SUN);
  gl.uniform3fv(loc(prog, 'uSunCol'), SUN_COL);
  gl.uniform1f(loc(prog, 'uTime'), t);
}

function shadowPass(lightVP, t) {
  gl.bindFramebuffer(gl.FRAMEBUFFER, shadowMap.fbo);
  gl.viewport(0, 0, SHADOW_SIZE, SHADOW_SIZE);
  gl.clear(gl.DEPTH_BUFFER_BIT);
  gl.enable(gl.DEPTH_TEST);
  gl.enable(gl.POLYGON_OFFSET_FILL);
  gl.polygonOffset(2, 4);
  gl.useProgram(progShadow);
  gl.uniformMatrix4fv(loc(progShadow, 'uLightVP'), false, lightVP);
  drawCasters(progShadow, t);
  gl.disable(gl.POLYGON_OFFSET_FILL);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
}

function skyPass(v, t) {
  gl.disable(gl.DEPTH_TEST);
  gl.useProgram(progSky);
  setLight(progSky, t);
  gl.uniform3fv(loc(progSky, 'uFwd'), v.fwd);
  gl.uniform3fv(loc(progSky, 'uRight'), v.right);
  gl.uniform3fv(loc(progSky, 'uUp'), v.up);
  gl.uniform2fv(loc(progSky, 'uTan'), v.tan);
  gl.bindVertexArray(emptyVao);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
}

function mainPass(v, lightVP, t) {
  gl.enable(gl.DEPTH_TEST);
  gl.useProgram(progMain);
  setLight(progMain, t);
  gl.uniformMatrix4fv(loc(progMain, 'uVP'), false, v.VP);
  gl.uniformMatrix4fv(loc(progMain, 'uLightVP'), false, lightVP);
  gl.uniform3fv(loc(progMain, 'uCam'), v.eye);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, shadowMap.tex);
  gl.uniform1i(loc(progMain, 'uShadow'), 0);
  drawMesh(progMain, meshes.world, IDENTITY);
  drawCasters(progMain, t);
  cars.forEach(c => { if (c.boost > 0) drawMesh(progMain, meshes.flames[Math.random() < 0.5 ? 0 : 1], carModel(c)); });
  drawBlobs();
}

function drawBlobs() {
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  gl.depthMask(false);
  cars.forEach(c => drawMesh(progMain, meshes.blob, carModel(c)));
  gl.depthMask(true);
  gl.disable(gl.BLEND);
}

function renderGL(t) {
  const v = cameraView(), lightVP = lightMatrix();
  shadowPass(lightVP, t);
  gl.viewport(0, 0, glc.width, glc.height);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  skyPass(v, t);
  mainPass(v, lightVP, t);
  cam.VP = v.VP;
}

// Punto 3D -> píxel del HUD
function projectHUD(x, h, y) {
  const m = cam.VP, p = [x, h, y];
  const cl = [0, 1, 3].map(r => m[r] * p[0] + m[4 + r] * p[1] + m[8 + r] * p[2] + m[12 + r]);
  if (cl[2] <= 1) return null;
  return { x: (cl[0] / cl[2] * 0.5 + 0.5) * cv.width, y: (0.5 - cl[1] / cl[2] * 0.5) * cv.height, s: 300 / cl[2] };
}

// ================== HUD ==================
function ordinal(n) { return n + 'º'; }

function panel(x, y, w, h) {
  ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(x, y, w, h);
}

function drawLabels() {
  cars.forEach(c => {
    if (c === me()) return;
    const p = projectHUD(c.x, 40, c.y);
    if (!p) return;
    ctx.font = `bold ${clamp(14 * p.s, 9, 18) | 0}px sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.6)'; ctx.strokeText(c.name, p.x, p.y);
    ctx.fillStyle = '#fff'; ctx.fillText(c.name, p.x, p.y);
  });
}

function drawHUD() {
  const p = me(), pos = ranking().indexOf(p) + 1;
  panel(10, 10, 200, 92);
  ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  ctx.font = 'bold 22px sans-serif';
  ctx.fillText(`Vuelta ${clamp(p.lap + 1, 1, LAPS)}/${LAPS}`, 20, 18);
  ctx.fillText(`Posición ${ordinal(pos)}/${cars.length}`, 20, 46);
  ctx.font = '16px sans-serif';
  ctx.fillText(`${Math.round(Math.abs(p.speed) * 30)} km/h`, 20, 76);
  drawItemSlot(p);
}

function drawFlame() {
  const f = 14 + Math.random() * 12;
  poly([[-28, -7], [-28 - f, 0], [-28, 7]], '#ff9800');
  poly([[-28, -4], [-28 - f * 0.6, 0], [-28, 4]], '#ffeb3b');
}

function drawBanana(x, y, s) {
  ctx.save();
  ctx.translate(x, y); ctx.scale(s, s);
  ctx.strokeStyle = '#ffe135'; ctx.lineWidth = 7; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.arc(0, -6, 12, 0.3, Math.PI - 0.3); ctx.stroke();
  ctx.strokeStyle = '#5d4037'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(11, -1); ctx.lineTo(14, -4); ctx.stroke();
  ctx.restore();
}

function drawItemSlot(p) {
  const x = cv.width / 2 - 35, y = 10;
  panel(x, y, 70, 70);
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.strokeRect(x, y, 70, 70);
  if (p.item === 'banana') drawBanana(x + 35, y + 38, 1.6);
  if (p.item === 'turbo') {
    ctx.save(); ctx.translate(x + 50, y + 35); drawFlame(); ctx.restore();
    ctx.fillStyle = '#ff5722'; ctx.font = 'bold 14px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('TURBO', x + 35, y + 52);
  }
  ctx.fillStyle = '#eee'; ctx.font = '12px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  ctx.fillText('ESPACIO', x + 35, y + 74);
}

function drawMinimap() {
  const size = 180, pad = 10;
  const s = size / Math.max(bounds.x1 - bounds.x0, bounds.y1 - bounds.y0);
  const ox = cv.width - size - pad * 2, oy = cv.height - (bounds.y1 - bounds.y0) * s - pad * 3;
  const mx = x => ox + pad + (x - bounds.x0) * s, my = y => oy + pad + (y - bounds.y0) * s;
  panel(ox, oy, size + pad * 2, (bounds.y1 - bounds.y0) * s + pad * 2);
  ctx.beginPath();
  track.forEach((p, i) => i ? ctx.lineTo(mx(p.x), my(p.y)) : ctx.moveTo(mx(p.x), my(p.y)));
  ctx.closePath(); ctx.strokeStyle = '#aaa'; ctx.lineWidth = 5; ctx.stroke();
  cars.forEach(c => {
    ctx.fillStyle = c.color;
    ctx.beginPath(); ctx.arc(mx(c.x), my(c.y), c === me() ? 6 : 4, 0, Math.PI * 2); ctx.fill();
  });
}

function bigText(text, y, size, color) {
  ctx.font = `bold ${size}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.lineWidth = 6; ctx.strokeStyle = '#000'; ctx.strokeText(text, cv.width / 2, y);
  ctx.fillStyle = color; ctx.fillText(text, cv.width / 2, y);
}

function drawOverlay() {
  const cy = cv.height / 2;
  if (state === 'countdown') bigText(String(Math.ceil(countdown)), cy * 0.6, 120, '#fff');
  if (state === 'race' && goTimer > 0) bigText('¡YA!', cy * 0.6, 120, '#4caf50');
  if (state === 'race' && me().done) drawResults(cy);
}

function drawResults(cy) {
  ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(0, 0, cv.width, cv.height);
  const pos = ranking().indexOf(me()) + 1;
  bigText(pos === 1 ? '¡HAS GANADO!' : `Has quedado ${ordinal(pos)}`, cy - 120, 64, me().color);
  ranking().forEach((c, i) => bigText(`${ordinal(i + 1)}  ${c.name}`, cy - 40 + i * 36, 26, c.color));
  const hint = isHost() ? 'ENTER: otra carrera  ·  ESC: salir al menú' : 'Esperando al anfitrión...  ·  ESC: salir';
  bigText(hint, cy + 130, 26, '#4caf50');
}

function renderHUD() {
  ctx.clearRect(0, 0, cv.width, cv.height);
  if (state === 'menu') return;
  drawLabels();
  drawHUD();
  drawMinimap();
  drawOverlay();
}

// ================== RED (multijugador online con PeerJS) ==================
// Cada partida tiene un código. El anfitrión hace de "servidor": los amigos se conectan
// directamente a su navegador (WebRTC) y él reenvía los mensajes a los demás.
// El servidor gratuito de PeerJS solo sirve para que los navegadores se encuentren.
const PEER_PREFIX = 'lambokart-v1-';
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sin letras que se confunden (O/0, I/1)
const net = {
  peer: null, conns: [], hostConn: null, online: false,
  myId: 0, hostId: 0, code: '', lobby: [], inRace: false, lastCar: 0, lastWorld: 0
};
const isHost = () => net.myId === net.hostId;

function randomCode() {
  return Array.from({ length: 5 }, () => CODE_CHARS[Math.random() * CODE_CHARS.length | 0]).join('');
}

// El anfitrión lo manda a todos; un invitado se lo manda al anfitrión (que lo reenvía)
function send(msg) {
  if (!net.online) return;
  if (isHost()) relay(msg, null);
  else if (net.hostConn && net.hostConn.open) net.hostConn.send(msg);
}

function relay(msg, except) {
  net.conns.forEach(c => { if (c !== except && c.open) c.send(msg); });
}

// ---- Anfitrión ----
function createGame() {
  setStatus('Creando partida...');
  net.code = randomCode();
  const peer = new Peer(PEER_PREFIX + net.code);
  net.peer = peer;
  peer.on('open', () => {
    Object.assign(net, { online: true, myId: 0, hostId: 0, lobby: [{ id: 0, name: playerName() }] });
    setStatus('');
    showLobby();
  });
  peer.on('connection', hostAccept);
  peer.on('disconnected', () => { if (!peer.destroyed) peer.reconnect(); });
  peer.on('error', e => {
    if (e.type === 'unavailable-id') { peer.destroy(); createGame(); } // código ya usado: otro
    else netError(e);
  });
}

function freeSlot() {
  for (let i = 1; i < 4; i++) if (!net.conns.some(c => c.slot === i)) return i;
  return -1;
}

function hostAccept(conn) {
  conn.on('open', () => {
    const id = freeSlot();
    if (id < 0) { conn.send({ t: 'full' }); setTimeout(() => conn.close(), 500); return; }
    conn.slot = id;
    net.conns.push(conn);
    conn.send({ t: 'welcome', id });
  });
  conn.on('data', m => hostReceive(conn, m));
  conn.on('close', () => hostDrop(conn));
}

function hostReceive(conn, m) {
  if (m.t === 'hello') {
    net.lobby = net.lobby.filter(p => p.id !== conn.slot).concat({ id: conn.slot, name: cleanName(m.name) || 'Jugador' });
    sendLobby();
    return;
  }
  relay(m, conn);
  if (handlers[m.t]) handlers[m.t](m);
}

function hostDrop(conn) {
  if (!net.conns.includes(conn)) return;
  net.conns = net.conns.filter(c => c !== conn);
  net.lobby = net.lobby.filter(p => p.id !== conn.slot);
  sendLobby();
}

function sendLobby() {
  const msg = { t: 'lobby', players: net.lobby };
  relay(msg, null);
  handlers.lobby(msg);
}

// ---- Invitado ----
function joinGame(rawCode) {
  const code = rawCode.trim().toUpperCase();
  if (code.length < 5) return setStatus('Escribe el código de 5 letras', true);
  setStatus('Conectando...');
  const peer = new Peer();
  Object.assign(net, { peer, myId: -1, hostId: 0, code });
  peer.on('open', () => {
    const conn = peer.connect(PEER_PREFIX + code, { reliable: true });
    net.hostConn = conn;
    const timer = setTimeout(() => { if (!conn.open) netError({ type: 'timeout' }); }, 15000);
    conn.on('open', () => {
      clearTimeout(timer);
      net.online = true;
      conn.send({ t: 'hello', name: playerName() });
      setStatus('');
      showLobby();
    });
    conn.on('data', m => { if (handlers[m.t]) handlers[m.t](m); });
    conn.on('close', () => { if (net.peer === peer) leaveGame('El anfitrión ha cerrado la partida'); });
  });
  peer.on('error', netError);
}

function netError(e) {
  const msgs = {
    'peer-unavailable': 'No existe ninguna partida con ese código',
    'network': 'No hay conexión con el servidor de PeerJS. ¿Tienes internet?',
    'server-error': 'El servidor de PeerJS no responde. Prueba en un rato.',
    'socket-error': 'No hay conexión con el servidor de PeerJS. ¿Tienes internet?',
    'browser-incompatible': 'Tu navegador no permite jugar online. Usa Chrome, Edge o Firefox.',
    'timeout': 'No se pudo conectar con el anfitrión. Si estáis en la red del instituto, probad con el hotspot del móvil.'
  };
  leaveGame(msgs[e.type] || 'Error de conexión: ' + e.type);
}

function leaveGame(msg = '') {
  const peer = net.peer;
  Object.assign(net, { peer: null, conns: [], hostConn: null, online: false, myId: 0, hostId: 0, code: '', lobby: [], inRace: false });
  if (peer) peer.destroy();
  state = 'menu';
  resetRace([{ id: 0, name: playerName() }]);
  showScreen('scr-main');
  setStatus(msg, !!msg);
}

const handlers = {
  welcome: m => { net.myId = m.id; renderLobby(); },
  full: () => leaveGame('La partida está llena (máximo 4 jugadores)'),
  lobby: m => { net.lobby = m.players; dropMissingPlayers(); renderLobby(); },
  start: m => startRace(m.humans),
  car: m => { if (net.inRace) applyRemote(cars[m.id], m.s); },
  world: m => { if (net.inRace && !isHost()) applyWorld(m); },
  item: m => { if (m.id === net.myId) me().item = m.item; },
  spin: m => { if (m.id === net.myId) hitBanana(me()); },
  banana: m => { if (isHost()) bananas.push({ x: m.x, y: m.y }); }
};

// Si alguien se va en mitad de la carrera, su coche pasa a llevarlo la IA
function dropMissingPlayers() {
  cars.forEach(c => {
    if (c.human && net.inRace && !net.lobby.some(p => p.id === c.id)) { c.human = false; c.net = null; }
  });
}

function carState(c) {
  return {
    id: c.id, x: +c.x.toFixed(1), y: +c.y.toFixed(1), angle: +c.angle.toFixed(3), speed: +c.speed.toFixed(2),
    lap: c.lap, seg: c.seg, boost: Math.max(0, Math.round(c.boost)), spin: Math.max(0, Math.round(c.spin)),
    done: c.done, item: c.item
  };
}

function applyRemote(c, s) {
  if (!c || owned(c)) return;
  c.net = s;
  ['lap', 'seg', 'boost', 'spin', 'done', 'item'].forEach(k => { c[k] = s[k]; });
}

function applyWorld(m) {
  if (m.state !== state) setState(m.state);
  countdown = m.countdown;
  m.ai.forEach(s => applyRemote(cars[s.id], s));
  boxes.forEach((b, i) => { b.t = m.boxes[i]; });
  bananas = m.bananas.map(([x, y]) => ({ x, y }));
  finishOrder = m.finish.map(id => cars[id]);
}

function worldMsg() {
  return {
    t: 'world', state, countdown,
    ai: cars.filter(c => !c.human).map(carState),
    boxes: boxes.map(b => Math.max(0, Math.round(b.t))),
    bananas: bananas.map(b => [Math.round(b.x), Math.round(b.y)]),
    finish: finishOrder.map(c => c.id)
  };
}

// Mueve un coche remoto hacia su última posición conocida (suavizado)
function followNet(c, dt) {
  const n = c.net;
  if (!n) return;
  n.x += Math.cos(n.angle) * n.speed * dt;
  n.y += Math.sin(n.angle) * n.speed * dt;
  c.x += (n.x - c.x) * 0.3;
  c.y += (n.y - c.y) * 0.3;
  c.angle += angDiff(n.angle, c.angle) * 0.3;
  c.speed = n.speed;
}

// Envía mi coche ~30 veces por segundo y, si soy el anfitrión, el mundo ~20 veces
function netTick(t) {
  if (!net.online || !net.inRace) return;
  if (t - net.lastCar > 33 && me().human) { net.lastCar = t; send({ t: 'car', id: net.myId, s: carState(me()) }); }
  if (isHost() && t - net.lastWorld > 50) { net.lastWorld = t; send(worldMsg()); }
}

// ================== MENÚ ==================
const $ = id => document.getElementById(id);

function showScreen(id) {
  $('ui').classList.remove('hidden');
  ['scr-main', 'scr-join', 'scr-lobby'].forEach(s => $(s).classList.toggle('hidden', s !== id));
  $('name-row').classList.toggle('hidden', id === 'scr-lobby');
}

function hideUI() {
  $('ui').classList.add('hidden');
  document.activeElement.blur();
}

function setStatus(text, error = false) {
  $('status').textContent = text;
  $('status').classList.toggle('error', error);
}

function cleanName(n) { return String(n || '').trim().slice(0, 14); }
function playerName() { return cleanName($('name').value) || 'Jugador'; }
function shareLink() { return location.href.split('#')[0] + '#' + net.code; }

function showLobby() {
  showScreen('scr-lobby');
  const host = isHost();
  $('share').classList.toggle('hidden', !host);
  $('btn-start').classList.toggle('hidden', !host);
  $('lobby-wait').classList.toggle('hidden', host);
  $('code-big').textContent = net.code;
  $('link').value = shareLink();
  $('file-warning').classList.toggle('hidden', location.protocol.startsWith('http'));
  renderLobby();
}

function renderLobby() {
  const list = $('players');
  list.innerHTML = '';
  net.lobby.forEach(p => {
    const li = document.createElement('li'), dot = document.createElement('span');
    dot.className = 'dot';
    dot.style.background = PLAYER_COLORS[p.id];
    li.append(dot, p.name + (p.id === net.hostId ? ' (anfitrión)' : '') + (p.id === net.myId ? ' — tú' : ''));
    list.append(li);
  });
  $('player-count').textContent = `(${net.lobby.length}/4)`;
}

async function copyText(text, btn) {
  try { await navigator.clipboard.writeText(text); }
  catch { $('link').select(); document.execCommand('copy'); }
  const old = btn.textContent;
  btn.textContent = '¡Copiado!';
  setTimeout(() => { btn.textContent = old; }, 1500);
}

function needPeer() {
  if (window.Peer) return true;
  setStatus('Para jugar online hace falta internet (no se pudo cargar PeerJS).', true);
  return false;
}

function saveName() {
  try { localStorage.setItem('lamboName', playerName()); } catch {}
}

function initUI() {
  try { $('name').value = localStorage.getItem('lamboName') || ''; } catch {}
  $('name').addEventListener('change', saveName);
  $('btn-solo').onclick = () => { saveName(); hostStart(); };
  $('btn-create').onclick = () => { saveName(); if (needPeer()) createGame(); };
  $('btn-join').onclick = () => { setStatus(''); showScreen('scr-join'); $('code').focus(); };
  $('btn-join-go').onclick = () => { saveName(); if (needPeer()) joinGame($('code').value); };
  $('code').addEventListener('keydown', e => { if (e.key === 'Enter') $('btn-join-go').click(); });
  $('btn-start').onclick = () => hostStart();
  $('btn-copy-link').onclick = e => copyText(shareLink(), e.target);
  $('btn-copy-code').onclick = e => copyText(net.code, e.target);
  document.querySelectorAll('[data-back]').forEach(b => { b.onclick = () => leaveGame(); });
  // Si se entra con un enlace de invitación (…#ABCDE), va directo a "Unirse"
  const code = location.hash.slice(1).toUpperCase();
  if (code) { $('code').value = code; showScreen('scr-join'); setStatus('Te han invitado. Escribe tu nombre y pulsa Unirse.'); }
  else showScreen('scr-main');
}

// ================== ENTRADA ==================
function startRace(humans) {
  resetRace(humans);
  net.inRace = true;
  setState('countdown');
  countdown = 3;
  hideUI();
}

function hostStart() {
  const humans = net.online ? net.lobby.map(p => ({ id: p.id, name: p.name })) : [{ id: 0, name: playerName() }];
  send({ t: 'start', humans });
  startRace(humans);
}

addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT') return; // escribiendo en el menú
  keys[e.code] = true;
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
  if (state === 'menu') return;
  if (e.code === 'Escape') leaveGame();
  if (e.code === 'Enter' && isHost() && me().done) hostStart();
  if (e.code === 'Space' && state === 'race' && me().item && !me().done) useItem(me());
});
addEventListener('keyup', e => { keys[e.code] = false; });

function resize() {
  const dpr = Math.min(devicePixelRatio || 1, 1.5);
  glc.width = innerWidth * dpr | 0; glc.height = innerHeight * dpr | 0;
  cv.width = innerWidth; cv.height = innerHeight;
}
addEventListener('resize', resize);

// ================== INICIO ==================
resize();
if (!gl) {
  document.getElementById('ui').classList.add('hidden');
  ctx.fillStyle = '#fff'; ctx.font = '20px sans-serif';
  ctx.fillText('Tu navegador no soporta WebGL2. Prueba con Chrome, Edge o Firefox actualizados.', 20, 40);
} else {
  buildTrack();
  buildDecor();
  initGL();
  resetRace([{ id: 0, name: 'Tú' }]);
  initUI();
  requestAnimationFrame(loop);
}
