// Escenario en 3D: suelo, montañas, asfalto, bordillos, meta, rampas y árboles.
// Los colores salen del tema del circuito (game/maps.js).
import { TRACK_WIDTH as W } from '../config.js';
import { UP, rgb, norm3 } from '../core/math.js';
import { modelMatrix } from '../core/mat4.js';
import { track, pointAt } from '../game/track.js';
import { M, vtx, tri, quadN, normalOf, box, bothSides, sideZ, frustumY, appendTransformed } from './geometry.js';

const theme = () => track.map.theme;

// Suelo, montañas y pista (no proyectan sombra)
export function buildWorld() {
  const g = [];
  buildGround(g);
  buildMountains(g);
  buildTrackMesh(g);
  return g;
}

// Árboles y rampas (sí proyectan sombra)
export function buildProps() {
  const g = [];
  track.decor.forEach(t => buildTree(g, t));
  track.ramps.forEach(r => buildRamp(g, r));
  return g;
}

function center() {
  const b = track.bounds;
  return [(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2];
}

// ---- Pista ----
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
  const { asphalt, curbs } = theme();
  for (let i = 0; i < track.N; i++) {
    trackStrip(g, i, 0, 1, -W / 2 - 2, W / 2 + 2, 0.3, asphalt, M.ASPHALT);
    [0, 0.5].forEach((f, k) => {                     // bordillos de dos colores
      trackStrip(g, i, f, f + 0.5, W / 2, W / 2 + 16, 0.5, curbs[k], M.MATTE);
      trackStrip(g, i, f, f + 0.5, -W / 2 - 16, -W / 2, 0.5, curbs[k], M.MATTE);
    });
    trackStrip(g, i, 0, 1, W / 2 - 12, W / 2 - 7, 0.45, '#e6e6e6', M.MATTE);   // líneas laterales
    trackStrip(g, i, 0, 1, -W / 2 + 7, -W / 2 + 12, 0.45, '#e6e6e6', M.MATTE);
    if (i % 2 === 0) trackStrip(g, i, 0, 0.6, -2.5, 2.5, 0.45, '#e6e6e6', M.MATTE); // línea central
  }
  buildStartLine(g);
}

function buildStartLine(g) {
  const p = track.points[0], local = [];
  quadN(local, [[-18, 0.55, -W / 2], [-18, 0.55, W / 2], [0, 0.55, W / 2], [0, 0.55, -W / 2]],
        [UP, UP, UP, UP], [1, 1, 1], M.CHECKER, [[0, 0], [14, 0], [14, 2], [0, 2]]);
  buildGantry(local);
  appendTransformed(g, local, modelMatrix(p.x, p.y, p.a));
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

// Rampa en cuña con franjas amarillas y negras. Su altura coincide con rampUnder() de track.js.
function buildRamp(g, r) {
  const local = [], L = r.len, H = r.h, hw = r.width / 2, strips = 8;
  const n = norm3([-H, L, 0]), side = rgb('#8a8d93');
  for (let i = 0; i < strips; i++) {
    const x0 = L * i / strips, x1 = L * (i + 1) / strips, y0 = H * i / strips, y1 = H * (i + 1) / strips;
    quadN(local, [[x0, y0 + 0.4, -hw], [x0, y0 + 0.4, hw], [x1, y1 + 0.4, hw], [x1, y1 + 0.4, -hw]],
          [n, n, n, n], rgb(i % 2 ? '#1c1c1c' : '#ffc400'), M.PAINT);
  }
  quadN(local, [[L, 0, -hw], [L, 0, hw], [L, H + 0.4, hw], [L, H + 0.4, -hw]], Array(4).fill([1, 0, 0]), side, M.MATTE);
  tri(local, [0, 0, hw], [L, 0, hw], [L, H + 0.4, hw], [0, 0, 1], side, M.MATTE);
  tri(local, [0, 0, -hw], [L, H + 0.4, -hw], [L, 0, -hw], [0, 0, -1], side, M.MATTE);
  appendTransformed(g, local, modelMatrix(r.x, r.y, r.a));
}

// ---- Entorno ----
function buildGround(g) {
  const [cx, cz] = center(), s = 16000;
  quadN(g, [[cx - s, 0, cz - s], [cx + s, 0, cz - s], [cx + s, 0, cz + s], [cx - s, 0, cz + s]],
        [UP, UP, UP, UP], [1, 1, 1], M.GRASS);
}

// Anillo de montañas lejanas, con nieve en las cumbres
function buildMountains(g) {
  const [cx, cz] = center(), n = 160;
  const height = a => Math.max(150, 650 + 380 * Math.sin(3 * a + 1) + 220 * Math.sin(7 * a + 2) + 130 * Math.sin(19 * a));
  const P = (a, R, h) => [cx + Math.cos(a) * R, h, cz + Math.sin(a) * R];
  for (let i = 0; i < n; i++) {
    const a0 = i / n * Math.PI * 2, a1 = (i + 1) / n * Math.PI * 2, h0 = height(a0), h1 = height(a1);
    const rows = [
      [P(a0, 6000, -5), P(a1, 6000, -5)],
      [P(a0, 7800, h0), P(a1, 7800, h1)],
      [P(a0, 9800, h0 * 0.4), P(a1, 9800, h1 * 0.4)]
    ];
    for (let r = 0; r < 2; r++) mountainQuad(g, rows[r][0], rows[r][1], rows[r + 1][1], rows[r + 1][0]);
  }
}

function mountainColor(h) {
  const m = theme().mountains;
  return rgb(h > m.snowAt ? m.snow : h > m.midAt ? m.mid : m.low);
}

function mountainQuad(g, a, b, c, d) {
  [[a, b, c], [a, c, d]].forEach(t => {
    const n = normalOf(t);
    t.forEach(p => vtx(g, p, n, mountainColor(p[1]), [0, 0], M.MATTE));
  });
}

// ---- Árboles ----
// Pino (conos apilados) o árbol redondo, con un tono de verde algo distinto cada uno
function buildTree(g, t) {
  const s = t.s, k = 0.85 + Math.random() * 0.3, snowy = theme().trees.snowy;
  const green = hex => '#' + rgb(hex).map(v => Math.min(255, v * 255 * k | 0).toString(16).padStart(2, '0')).join('');
  frustumY(g, t.x, t.y, 0, 26 * s, 3.5 * s, 2.5 * s, '#5b3a24', M.MATTE, 7);
  if (t.pine) {
    [[16, 52, 26, '#244f22'], [36, 70, 20, '#2a5a26'], [54, 88, 13, '#30652b']].forEach(([y0, y1, r, col]) => {
      frustumY(g, t.x, t.y, y0 * s, y1 * s, r * s, 0, green(snowy ? '#1f4026' : col), M.MATTE);
      if (snowy) snowCap(g, t, y0 * s, y1 * s, r * s);
    });
  } else {
    frustumY(g, t.x, t.y, 20 * s, 42 * s, 12 * s, 30 * s, green('#3d6e2a'), M.MATTE);
    frustumY(g, t.x, t.y, 42 * s, 70 * s, 30 * s, 0, green('#467a30'), M.MATTE);
  }
}

// Capa de nieve sobre la parte de arriba de cada cono del pino
function snowCap(g, t, y0, y1, r) {
  const h = y1 - y0, start = y1 - h * 0.45;
  frustumY(g, t.x, t.y, start, y1 + 0.5, r * 0.45 * 1.12, 0, '#eef3f8', M.MATTE);
}
