// Escenario en 3D: suelo o isla con mar, montañas, asfalto, bordillos, meta, muelle, rampas,
// placas de turbo, atajos, arcos y decorado. Los colores salen del tema del circuito (game/maps.js).
import { TRACK_WIDTH as W } from '../config.js';
import { UP, rgb, norm3 } from '../core/math.js';
import { modelMatrix } from '../core/mat4.js';
import { track, pointAt, waterRangeAt } from '../game/track.js';
import { M, vtx, tri, quadN, normalOf, box, bothSides, sideZ, frustumY, appendTransformed } from './geometry.js';

const theme = () => track.map.theme;
const UP4 = [UP, UP, UP, UP];
const SEA_LEVEL = -3;

// Suelo, mar, montañas y pista (no proyectan sombra)
export function buildWorld() {
  const g = [];
  if (track.land) buildIsland(g); else buildGround(g);
  buildMountains(g);
  buildTrackMesh(g);
  track.pads.forEach(p => buildBoostPad(g, p));
  return g;
}

// Objetos con volumen (sí proyectan sombra)
export function buildProps() {
  const g = [];
  track.decor.forEach(d => DECOR[d.type](g, d));
  track.ramps.forEach(r => buildRamp(g, r));
  track.arches.forEach(a => buildArch(g, a));
  track.shortcuts.forEach(s => buildShortcut(g, s));
  track.water.filter(r => r.type === 'pier').forEach(r => buildPierPosts(g, r));
  return g;
}

function center() {
  const b = track.bounds;
  return [(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2];
}

// Construye geometría en el sistema local de un punto de la pista (x delante, z a la derecha)
function atSeg(g, seg, build) {
  const p = track.points[seg % track.N], local = [];
  build(local);
  appendTransformed(g, local, modelMatrix(p.x, p.y, p.a));
}

// ================== Pista ==================
// Punto de la pista en 3D: segmento i (+ fracción f), desplazamiento lateral o, altura h
function T(i, f, o, h) {
  const a = pointAt(i, o), b = pointAt(i + 1, o);
  return [a.x + (b.x - a.x) * f, h, a.y + (b.y - a.y) * f];
}

function trackStrip(g, i, f0, f1, o1, o2, h, color, mat) {
  const ps = [T(i, f0, o1, h), T(i, f0, o2, h), T(i, f1, o2, h), T(i, f1, o1, h)];
  quadN(g, ps, UP4, rgb(color), mat);
}

function buildTrackMesh(g) {
  const { asphalt, curbs } = theme();
  for (let i = 0; i < track.N; i++) {
    const water = waterRangeAt(i);
    if (water && water.type === 'cove') continue;            // la cala no tiene suelo: hay que saltarla
    if (water && water.type === 'pier') { pierDeck(g, i); continue; }
    trackStrip(g, i, 0, 1, -W / 2 - 2, W / 2 + 2, 0.3, asphalt, M.ASPHALT);
    [0, 0.5].forEach((f, k) => {                              // bordillos de dos colores
      trackStrip(g, i, f, f + 0.5, W / 2, W / 2 + 16, 0.5, curbs[k], M.MATTE);
      trackStrip(g, i, f, f + 0.5, -W / 2 - 16, -W / 2, 0.5, curbs[k], M.MATTE);
    });
    trackStrip(g, i, 0, 1, W / 2 - 12, W / 2 - 7, 0.45, '#e6e6e6', M.MATTE);   // líneas laterales
    trackStrip(g, i, 0, 1, -W / 2 + 7, -W / 2 + 12, 0.45, '#e6e6e6', M.MATTE);
    if (i % 2 === 0) trackStrip(g, i, 0, 0.6, -2.5, 2.5, 0.45, '#e6e6e6', M.MATTE); // línea central
  }
  buildStartLine(g);
}

// Tablones de madera del muelle (sin bordillos: si te sales, al agua)
function pierDeck(g, i) {
  trackStrip(g, i, 0, 0.5, -W / 2, W / 2, 0.3, '#8a5a35', M.MATTE);
  trackStrip(g, i, 0.5, 1, -W / 2, W / 2, 0.3, '#76492b', M.MATTE);
  trackStrip(g, i, 0, 1, W / 2, W / 2 + 6, 0.6, '#4e3220', M.MATTE);
  trackStrip(g, i, 0, 1, -W / 2 - 6, -W / 2, 0.6, '#4e3220', M.MATTE);
}

// Postes que sujetan el muelle, hundidos en el agua
function buildPierPosts(g, range) {
  for (let i = range.from; i <= range.to; i += 3) {
    atSeg(g, i, l => bothSides(s => box(l, -3, 3, -30, 3, ...sideZ(W / 2 - 4, W / 2 + 4, s), '#3f2a1a', M.MATTE)));
  }
}

function buildStartLine(g) {
  atSeg(g, 0, l => {
    quadN(l, [[-18, 0.55, -W / 2], [-18, 0.55, W / 2], [0, 0.55, W / 2], [0, 0.55, -W / 2]],
          UP4, [1, 1, 1], M.CHECKER, [[0, 0], [14, 0], [14, 2], [0, 2]]);
    buildGantry(l);
  });
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

// ================== Elementos especiales ==================
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

// Placa de turbo: tres flechas brillantes pintadas en el asfalto
function buildBoostPad(g, p) {
  const local = [], hw = W / 2 - 14, col = rgb('#ff9a1a');
  [4, 19, 34].forEach(x => bothSides(s => {
    quadN(local, [[x, 0.6, -hw * s], [x + 8, 0.6, -hw * s], [x + 26, 0.6, 0], [x + 18, 0.6, 0]], UP4, col, M.EMIT);
  }));
  appendTransformed(g, local, modelMatrix(p.x, p.y, p.a));
}

// Atajo: camino de arena compactada con postes de madera a los lados
function buildShortcut(g, s) {
  const len = Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y), hw = s.width / 2, local = [];
  quadN(local, [[0, 0.15, -hw], [0, 0.15, hw], [len, 0.15, hw], [len, 0.15, -hw]], UP4, rgb('#a07b4f'), M.MATTE);
  for (let x = 120; x < len - 120; x += 60) {
    bothSides(sd => box(local, x - 2, x + 2, 0, 12, ...sideZ(hw + 2, hw + 6, sd), '#5d3d22', M.MATTE));
  }
  appendTransformed(g, local, modelMatrix(s.a.x, s.a.y, Math.atan2(s.b.y - s.a.y, s.b.x - s.a.x)));
}

// Arco de roca natural por encima de la pista
function buildArch(g, a) {
  const rock = ['#8c7a66', '#7a6a58', '#9c8a74'], z = W / 2 + 45;
  atSeg(g, a.seg, l => {
    bothSides(s => {
      box(l, -28, 28, 0, 70, ...sideZ(z - 22, z + 30, s), rock[0], M.MATTE);
      box(l, -22, 24, 70, 112, ...sideZ(z - 30, z + 18, s), rock[1], M.MATTE);
      box(l, -18, 20, 0, 40, ...sideZ(z + 25, z + 50, s), rock[2], M.MATTE);
    });
    box(l, -26, 26, 100, 128, -z - 20, z + 20, rock[2], M.MATTE);
    box(l, -18, 22, 124, 142, -z + 30, z - 40, rock[0], M.MATTE);
  });
}

// ================== Entorno ==================
function buildGround(g) {
  const [cx, cz] = center(), s = 16000;
  quadN(g, [[cx - s, 0, cz - s], [cx + s, 0, cz - s], [cx + s, 0, cz + s], [cx - s, 0, cz + s]],
        UP4, [1, 1, 1], M.GRASS);
}

// Isla: mar alrededor y una franja de arena a cada lado de la pista, con orilla en pendiente
function buildIsland(g) {
  const R = track.map.island.radius, [cx, cz] = center(), s = 16000;
  quadN(g, [[cx - s, SEA_LEVEL, cz - s], [cx + s, SEA_LEVEL, cz - s], [cx + s, SEA_LEVEL, cz + s], [cx - s, SEA_LEVEL, cz + s]],
        UP4, [1, 1, 1], M.WATER);
  for (let i = 0; i < track.N; i++) {
    if (waterRangeAt(i)) continue;
    trackStrip(g, i, 0, 1, -R, R, 0, '#ffffff', M.GRASS);
    shore(g, [T(i, 0, R, 0), T(i, 0, R + 60, -8), T(i, 1, R + 60, -8), T(i, 1, R, 0)]);
    shore(g, [T(i, 0, -R, 0), T(i, 0, -R - 60, -8), T(i, 1, -R - 60, -8), T(i, 1, -R, 0)]);
    if (waterRangeAt(i - 1)) shoreEnd(g, i, 0, -1); // la tierra acaba en el agua del muelle o la cala
    if (waterRangeAt(i + 1)) shoreEnd(g, i, 1, 1);
  }
}

function shore(g, pts) {
  let n = normalOf(pts);
  if (n[1] < 0) n = n.map(v => -v);
  quadN(g, pts, [n, n, n, n], rgb('#b39b6e'), M.MATTE);
}

// Orilla en el extremo de la franja de tierra, hacia delante (dir 1) o hacia atrás (dir -1)
function shoreEnd(g, i, f, dir) {
  const R = track.map.island.radius, p = track.points[(i + f) % track.N];
  const out = ([x, , z]) => [x + Math.cos(p.a) * 60 * dir, -8, z + Math.sin(p.a) * 60 * dir];
  const a = T(i, f, -R, 0), b = T(i, f, R, 0);
  shore(g, [a, b, out(b), out(a)]);
}

// Anillo de montañas (o islas) lejanas
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

// ================== Decorado ==================
const tint = (hex, k) => '#' + rgb(hex).map(v => Math.min(255, v * 255 * k | 0).toString(16).padStart(2, '0')).join('');

// Pino (conos apilados) o árbol redondo, con un tono de verde algo distinto cada uno
function buildTree(g, t) {
  const s = t.s, k = 0.85 + Math.random() * 0.3, snowy = theme().trees.snowy;
  frustumY(g, t.x, t.y, 0, 26 * s, 3.5 * s, 2.5 * s, '#5b3a24', M.MATTE, 7);
  if (t.pine) {
    [[16, 52, 26, '#244f22'], [36, 70, 20, '#2a5a26'], [54, 88, 13, '#30652b']].forEach(([y0, y1, r, col]) => {
      frustumY(g, t.x, t.y, y0 * s, y1 * s, r * s, 0, tint(snowy ? '#1f4026' : col, k), M.MATTE);
      if (snowy) frustumY(g, t.x, t.y, y1 * s - (y1 - y0) * s * 0.45, y1 * s + 0.5, r * s * 0.5, 0, '#eef3f8', M.MATTE);
    });
  } else {
    frustumY(g, t.x, t.y, 20 * s, 42 * s, 12 * s, 30 * s, tint('#3d6e2a', k), M.MATTE);
    frustumY(g, t.x, t.y, 42 * s, 70 * s, 30 * s, 0, tint('#467a30', k), M.MATTE);
  }
}

// Palmera: tronco inclinado por tramos y hojas largas que caen hacia abajo
function buildPalm(g, t) {
  const s = t.s, h = 80 * s, parts = 6, dx = Math.cos(t.dir), dz = Math.sin(t.dir);
  const off = k => t.lean * 28 * s * (k / parts) ** 2;
  for (let k = 0; k < parts; k++) {
    const r0 = (4.2 - k * 0.4) * s, r1 = (3.8 - k * 0.4) * s;
    frustumY(g, t.x + dx * off(k), t.y + dz * off(k), k * h / parts, (k + 1) * h / parts + 1, r0, r1, '#8b6b45', M.MATTE, 6);
  }
  const tx = t.x + dx * off(parts), tz = t.y + dz * off(parts), k = 0.85 + Math.random() * 0.3;
  for (let j = 0; j < 7; j++) {
    const leaf = [];
    box(leaf, 0, 38 * s, -0.8, 0.8, -5 * s, 5 * s, tint(j % 2 ? '#3d8a2f' : '#2f7426', k), M.MATTE);
    appendTransformed(g, leaf, modelMatrix(tx, tz, j / 7 * Math.PI * 2 + t.dir, h, -0.45));
  }
  box(g, tx - 3 * s, tx + 3 * s, h - 6 * s, h, tz - 3 * s, tz + 3 * s, '#5a3e22', M.MATTE); // cocos
}

function buildRock(g, t) {
  const s = t.s, col = tint('#7d7468', 0.85 + Math.random() * 0.3);
  frustumY(g, t.x, t.y, -2, 7 * s, 10 * s, 14 * s, col, M.MATTE, 7);
  frustumY(g, t.x, t.y, 7 * s, 15 * s, 14 * s, 4 * s, col, M.MATTE, 7);
}

const UMBRELLA_COLORS = ['#ff4d4d', '#ffd23f', '#3fa7ff', '#ff8ad8'];

function buildUmbrella(g, t) {
  frustumY(g, t.x, t.y, 0, 34, 1.2, 1.2, '#dddddd', M.MATTE, 5);
  frustumY(g, t.x, t.y, 28, 40, 26, 0, UMBRELLA_COLORS[t.color], M.MATTE, 8);
}

// Faro de franjas blancas y rojas con la luz encendida
function buildLighthouse(g, t) {
  frustumY(g, t.x, t.y, -4, 6, 30, 28, '#9a9a9a', M.MATTE, 12);
  for (let k = 0; k < 4; k++) {
    const y0 = 6 + k * 30, r0 = 18 - k * 1.5;
    frustumY(g, t.x, t.y, y0, y0 + 30, r0, r0 - 1.5, k % 2 ? '#c62828' : '#f5f5f5', M.MATTE, 12);
  }
  frustumY(g, t.x, t.y, 126, 140, 10, 10, '#ffe9a8', M.EMIT, 10);
  frustumY(g, t.x, t.y, 140, 156, 14, 0, '#c62828', M.MATTE, 10);
}

const DECOR = { tree: buildTree, palm: buildPalm, rock: buildRock, umbrella: buildUmbrella, lighthouse: buildLighthouse };
