// Escenario en 3D: suelo o isla con mar, montañas o rascacielos, asfalto, bordillos, meta,
// muelle, puente, túnel, rampas, placas de turbo, atajos, arcos, looping, atracciones del parque,
// decorado y luces de noche.
// Los colores salen del tema del circuito (game/maps.js).
import { TRACK_WIDTH as W } from '../config.js';
import { UP, rgb, norm3 } from '../core/math.js';
import { modelMatrix } from '../core/mat4.js';
import { track, pointAt, waterRangeAt, inTunnel, inTrench, PARK_WIDTH } from '../game/track.js';
import { M, vtx, tri, quadN, normalOf, box, bothSides, sideZ, frustumY, appendTransformed } from './geometry.js';
import { LOOP_LANE, loopPoint, loopSide, loopLimits } from '../game/loop.js';

const theme = () => track.map.theme;
const UP4 = [UP, UP, UP, UP];
const SEA_LEVEL = -3;
const DECK = 8;        // grosor del tablero del puente
const TRENCH_WALL = W / 2 + 18;  // muros de la trinchera (distancia al centro de la pista)
const SIDEWALK = 160;            // aceras a nivel de calle junto a la trinchera
const TILE = 80;                 // baldosas del suelo cuando hay que hacerle un agujero
const elevated = i => track.points[i % track.N].h > 1;
export const ferrisHub = R => R + 30; // altura del eje de la noria

// Suelo, mar, montañas y pista (no proyectan sombra)
export function buildWorld() {
  const g = [];
  if (track.land) buildIsland(g); else buildGround(g);
  if (theme().skyline) buildSkyline(g); else buildMountains(g);
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
  buildBridge(g);
  if (track.tunnel) { buildTrench(g, track.tunnel); buildPark(g, track.tunnel); }
  if (track.loop) { buildLoop(g, track.loop); buildLoopWalls(g, track.loop); }
  if (track.coaster) buildCoaster(g, track.coaster);
  if (track.tent) buildTent(g, track.tent);
  if (track.ferris) buildFerrisBase(g, track.ferris);
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
  appendTransformed(g, local, modelMatrix(p.x, p.y, p.a, p.h));
}

// ================== Pista ==================
// Punto de la pista en 3D: segmento i (+ fracción f), desplazamiento lateral o,
// altura h sobre la calzada (que puede estar elevada, en el puente)
function T(i, f, o, h) {
  const a = pointAt(i, o), b = pointAt(i + 1, o);
  const road = track.points[i % track.N].h * (1 - f) + track.points[(i + 1) % track.N].h * f;
  return [a.x + (b.x - a.x) * f, h + road, a.y + (b.y - a.y) * f];
}

function trackStrip(g, i, f0, f1, o1, o2, h, color, mat) {
  const ps = [T(i, f0, o1, h), T(i, f0, o2, h), T(i, f1, o2, h), T(i, f1, o1, h)];
  quadN(g, ps, UP4, rgb(color), mat);
}

function buildTrackMesh(g) {
  const { asphalt, curbs, lines } = theme();
  // de noche las líneas brillan para que se vea bien por dónde va la pista
  const line = lines ? [lines, M.EMIT] : ['#e6e6e6', M.MATTE], center = lines ? ['#3c3c3c', M.EMIT] : line;
  for (let i = 0; i < track.N; i++) {
    const water = waterRangeAt(i);
    if (water && water.type === 'cove') continue;            // la cala no tiene suelo: hay que saltarla
    if (water && water.type === 'pier') { pierDeck(g, i); continue; }
    trackStrip(g, i, 0, 1, -W / 2 - 2, W / 2 + 2, 0.3, asphalt, M.ASPHALT);
    if (!elevated(i)) {                                       // en el puente hay muros en vez de bordillos
      [0, 0.5].forEach((f, k) => {
        trackStrip(g, i, f, f + 0.5, W / 2, W / 2 + 16, 0.5, curbs[k], M.MATTE);
        trackStrip(g, i, f, f + 0.5, -W / 2 - 16, -W / 2, 0.5, curbs[k], M.MATTE);
      });
    }
    trackStrip(g, i, 0, 1, W / 2 - 12, W / 2 - 7, 0.45, ...line);   // líneas laterales
    trackStrip(g, i, 0, 1, -W / 2 + 7, -W / 2 + 12, 0.45, ...line);
    if (i % 2 === 0) trackStrip(g, i, 0, 0.6, -2.5, 2.5, 0.45, ...center); // línea central
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
  appendTransformed(g, local, modelMatrix(p.x, p.y, p.a, p.h || 0));
}

// Atajo: camino de arena con postes de madera, o callejón de asfalto con conos y vallas
function buildShortcut(g, s) {
  const len = Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y), hw = s.width / 2, local = [], alley = s.style === 'alley';
  quadN(local, [[0, 0.15, -hw], [0, 0.15, hw], [len, 0.15, hw], [len, 0.15, -hw]], UP4,
        rgb(alley ? '#26272c' : '#a07b4f'), alley ? M.ASPHALT : M.MATTE);
  for (let x = 120; x < len - 120; x += 60) {
    bothSides(sd => {
      const [z0, z1] = sideZ(hw + 2, hw + 6, sd);
      if (!alley) return box(local, x - 2, x + 2, 0, 12, z0, z1, '#5d3d22', M.MATTE);
      cone(local, x, (z0 + z1) / 2);
      box(local, x + 10, x + 50, 6, 9, z0, z1, '#d9d9d9', M.MATTE); // valla
    });
  }
  appendTransformed(g, local, modelMatrix(s.a.x, s.a.y, Math.atan2(s.b.y - s.a.y, s.b.x - s.a.x)));
}

// Cono de tráfico naranja con banda blanca
function cone(g, x, z) {
  frustumY(g, x, z, 0, 8, 5, 3, '#ff6a00', M.MATTE, 8);
  frustumY(g, x, z, 8, 11, 3, 2.2, '#f2f2f2', M.MATTE, 8);
  frustumY(g, x, z, 11, 16, 2.2, 0.4, '#ff6a00', M.MATTE, 8);
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
  if (track.tunnel) return buildGroundWithHole(g);
  const [cx, cz] = center(), s = 16000;
  groundQuad(g, cx - s, cx + s, cz - s, cz + s);
}

function groundQuad(g, x0, x1, z0, z1) {
  quadN(g, [[x0, 0, z0], [x1, 0, z0], [x1, 0, z1], [x0, 0, z1]], UP4, [1, 1, 1], M.GRASS);
}

// Suelo en baldosas con un agujero donde la pista baja a la trinchera. Los bordes dentados
// del agujero quedan tapados por las aceras (buildTrench).
function buildGroundWithHole(g) {
  const b = track.bounds, m = 1400, s = 16000, [cx, cz] = center();
  const x0 = b.x0 - m, x1 = b.x1 + m, z0 = b.y0 - m, z1 = b.y1 + m;
  [[cx - s, x0, cz - s, cz + s], [x1, cx + s, cz - s, cz + s], [x0, x1, cz - s, z0], [x0, x1, z1, cz + s]]
    .forEach(([a, b2, c, d]) => groundQuad(g, a, b2, c, d)); // marco exterior
  const trench = track.points.filter((p, i) => inTrench(i)), reach = TRENCH_WALL + TILE * 0.72;
  for (let x = x0; x < x1; x += TILE) {
    for (let z = z0; z < z1; z += TILE) {
      const mx = x + TILE / 2, mz = z + TILE / 2;
      if (!trench.some(p => Math.hypot(p.x - mx, p.y - mz) < reach)) groundQuad(g, x, x + TILE, z, z + TILE);
    }
  }
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

// ================== Ciudad ==================
const FACADES = ['#2a2f3a', '#323848', '#24282f', '#3a3346'];
const NEONS = ['#ff2bd6', '#2be8ff', '#a64bff', '#3dff8a'];

// Caja de edificio con ventanas: en cada cara, uv cuenta ventanas (12 de ancho x 14 de alto)
function buildingBox(g, hw, hd, h, color) {
  const c = rgb(color), side = (pts, n, w) => quadN(g, pts, [n, n, n, n], c, M.WINDOWS,
    [[0, 0], [w / 12, 0], [w / 12, h / 14], [0, h / 14]]);
  side([[hw, 0, -hd], [hw, 0, hd], [hw, h, hd], [hw, h, -hd]], [1, 0, 0], hd * 2);
  side([[-hw, 0, hd], [-hw, 0, -hd], [-hw, h, -hd], [-hw, h, hd]], [-1, 0, 0], hd * 2);
  side([[hw, 0, hd], [-hw, 0, hd], [-hw, h, hd], [hw, h, hd]], [0, 0, 1], hw * 2);
  side([[-hw, 0, -hd], [hw, 0, -hd], [hw, h, -hd], [-hw, h, -hd]], [0, 0, -1], hw * 2);
  quadN(g, [[-hw, h, -hd], [hw, h, -hd], [hw, h, hd], [-hw, h, hd]], UP4, c, M.MATTE); // azotea
}

// Edificio girado hacia la pista; algunos con un cartel de neón en la fachada que la mira
function buildBuilding(g, b) {
  const local = [], k = 0.9 + Math.random() * 0.2; // color algo distinto en cada uno (cambia sus ventanas)
  buildingBox(local, b.hw, b.hd, b.h, tint(FACADES[b.color], k));
  if (b.neon) {
    const w = Math.min(b.hd * 0.8, 45), y = b.neon.h;
    box(local, b.hw + 0.5, b.hw + 3, y, y + 16, -w, w, NEONS[b.neon.color], M.EMIT);
  }
  appendTransformed(g, local, modelMatrix(b.x, b.y, b.angle));
}

// Farola: poste, brazo hacia la carretera y lámpara encendida
function buildLamp(g, l) {
  const o = l.side * (elevated(l.seg) ? W / 2 + 6 : W / 2 + 24); // en el puente, sobre el muro
  atSeg(g, l.seg, loc => {
    frustumY(loc, 0, o, 0, 72, 2.4, 1.8, '#3a3d45', M.MATTE, 6);
    box(loc, -2, 2, 68, 72, ...(l.side > 0 ? [o - 34, o] : [o, o + 34]), '#3a3d45', M.MATTE);
    box(loc, -5, 5, 64, 68, ...(l.side > 0 ? [o - 36, o - 22] : [o + 22, o + 36]), '#ffe2a8', M.EMIT);
  });
}

// Rascacielos lejanos alrededor de la ciudad (en vez de montañas)
function buildSkyline(g) {
  const [cx, cz] = center();
  for (let i = 0; i < 140; i++) {
    const a = i / 140 * Math.PI * 2 + Math.random() * 0.02, R = 4200 + Math.random() * 2200, local = [];
    const hw = 80 + Math.random() * 120, h = 200 + Math.random() * 500; // sin tapar la luna
    buildingBox(local, hw, hw, h, tint(FACADES[i % 4], 0.8 + Math.random() * 0.3));
    appendTransformed(g, local, modelMatrix(cx + Math.cos(a) * R, cz + Math.sin(a) * R, a));
  }
}

// Puente: tablero con muros a los lados (tiras de neón encima) y pilares que no tocan la pista de abajo
function buildBridge(g) {
  for (let i = 0; i < track.N; i++) {
    if (!elevated(i) && !elevated(i + 1)) continue;
    const under = (o) => [T(i, 0, o, -DECK), T(i, 1, o, -DECK)];
    const [a0, a1] = under(-W / 2 - 10), [b0, b1] = under(W / 2 + 10);
    quadN(g, [a0, b0, b1, a1], Array(4).fill([0, -1, 0]), rgb('#2c2e35'), M.MATTE);   // parte de abajo
    bothSides(s => {
      const o0 = s * (W / 2 + 2), o1 = s * (W / 2 + 10);
      wallQuad(g, i, o1, -DECK, 14, '#3b3e48');                                          // cara exterior
      wallQuad(g, i, o0, 0, 14, '#4a4e5a');                                              // cara interior
      trackStrip(g, i, 0, 1, Math.min(o0, o1), Math.max(o0, o1), 14, '#ff2bd6', M.EMIT); // neón encima
    });
    if (i % 6 === 0 && track.points[i].h > 30) bridgePillars(g, i);
  }
}

// Pared vertical a lo largo del segmento i, a distancia lateral o, de h0 a h1 sobre la calzada
function wallQuad(g, i, o, h0, h1, color) {
  const pts = [T(i, 0, o, h0), T(i, 1, o, h0), T(i, 1, o, h1), T(i, 0, o, h1)];
  let n = normalOf(pts);
  if (Math.sign(n[0] * -Math.sin(track.points[i].a) + n[2] * Math.cos(track.points[i].a)) !== Math.sign(o)) n = n.map(v => -v);
  quadN(g, pts, [n, n, n, n], rgb(color), M.MATTE);
}

function bridgePillars(g, i) {
  const p = track.points[i];
  bothSides(s => {
    const q = pointAt(i, s * (W / 2 - 30));
    if (nearOtherRoad(q.x, q.y, i)) return; // no poner pilares encima de la pista de abajo
    box(g, q.x - 8, q.x + 8, 0, p.h - DECK, q.y - 8, q.y + 8, '#3b3e48', M.MATTE);
  });
}

// ¿(x, y) está sobre otro tramo de la pista (no el del propio puente)?
function nearOtherRoad(x, y, seg) {
  return track.points.some((p, j) => Math.abs(j - seg) > 60 && !elevated(j) && Math.hypot(p.x - x, p.y - y) < W / 2 + 40);
}

// ================== Túnel bajo tierra ==================
// Punto a una altura FIJA del mundo (no relativa a la calzada): segmento i + fracción f, lateral o
function P3(i, f, o, y) {
  const a = pointAt(i, o), b = pointAt(i + 1, o);
  return [a.x + (b.x - a.x) * f, y, a.y + (b.y - a.y) * f];
}

function flatStrip(g, i, o1, o2, y, color, mat, ny = 1) {
  const n = [0, ny, 0];
  quadN(g, [P3(i, 0, o1, y), P3(i, 0, o2, y), P3(i, 1, o2, y), P3(i, 1, o1, y)], [n, n, n, n], rgb(color), mat);
}

// Muro de la trinchera: desde la calzada (hundida) hasta el nivel de la calle, mirando a la pista
function trenchWall(g, i, o) {
  const P = track.points, a = P[i], b = P[(i + 1) % track.N];
  if (a.h > -0.5 && b.h > -0.5) return;
  const s = -Math.sign(o), n = [-Math.sin(a.a) * s, 0, Math.cos(a.a) * s];
  quadN(g, [P3(i, 0, o, a.h), P3(i, 1, o, b.h), P3(i, 1, o, 0.12), P3(i, 0, o, 0.12)], [n, n, n, n], rgb('#4a4c55'), M.MATTE);
}

// Trinchera con muros, aceras y neón; la parte central va cubierta (techo con luces)
function buildTrench(g, t) {
  for (let i = t.from; i < t.to; i++) {
    bothSides(s => {
      trenchWall(g, i, s * TRENCH_WALL);
      const [a, b] = sideZ(TRENCH_WALL, TRENCH_WALL + SIDEWALK, s);
      flatStrip(g, i, a, b, 0.12, '#55565c', M.MATTE);                                           // acera
      if (!inTunnel(i)) flatStrip(g, i, ...sideZ(TRENCH_WALL - 2, TRENCH_WALL + 2, s), 0.3, '#2be8ff', M.EMIT); // borde con neón
    });
  }
  for (let i = t.down; i < t.up; i++) {
    flatStrip(g, i, -TRENCH_WALL, TRENCH_WALL, -12, '#2a2c33', M.MATTE, -1);                     // techo del túnel
    if (i % 3 === 0) flatStrip(g, i, -8, 8, -12.5, '#ffe7b0', M.EMIT, -1);                       // tiras de luz
  }
  [t.down, t.up].forEach(i => {                                                                    // bocas del túnel
    const p = track.points[i], local = [];
    box(local, -4, 4, -16, 2, -TRENCH_WALL - 6, TRENCH_WALL + 6, '#5b5d66', M.MATTE);
    box(local, -4.6, 4.6, -15, -13, -TRENCH_WALL + 4, TRENCH_WALL - 4, '#2be8ff', M.EMIT);
    appendTransformed(g, local, modelMatrix(p.x, p.y, p.a));
  });
}

// Parque encima del túnel: césped, camino, árboles, bancos, farolitas y una fuente
function buildPark(g, t) {
  for (let i = t.down; i < t.up; i++) {
    flatStrip(g, i, -PARK_WIDTH, PARK_WIDTH, 0.16, i % 4 < 2 ? '#2f5a2a' : '#2b5527', M.MATTE);  // césped
    flatStrip(g, i, -14, 14, 0.2, '#7d7262', M.MATTE);                                            // camino
  }
  const mid = (t.down + t.up) >> 1, f = pointAt(mid, 0);
  fountain(g, f.x, f.y);
  for (let k = 0; k < 18; k++) {                                                                  // árboles
    const seg = t.down + 3 + Math.floor(Math.random() * (t.up - t.down - 6));
    const side = Math.random() < 0.5 ? -1 : 1, lane = side * (40 + Math.random() * (PARK_WIDTH - 80));
    if (Math.abs(seg - mid) < 5 && Math.abs(lane) < 90) continue; // la fuente
    const p = pointAt(seg, lane);
    buildTree(g, { x: p.x, y: p.y, s: 0.7 + Math.random() * 0.4, pine: false });
  }
  for (let i = t.down + 4; i < t.up - 3; i += 7) {                                              // bancos y farolitas
    bothSides(s => {
      const p = track.points[i], local = [];
      box(local, -10, 10, 0, 5, ...sideZ(20, 26, s), '#6b4a2e', M.MATTE);
      box(local, -10, 10, 5, 12, ...sideZ(25, 27, s), '#6b4a2e', M.MATTE);
      frustumY(local, 14, s * 22, 0, 30, 1.4, 1.1, '#3a3d45', M.MATTE, 6);
      box(local, 11, 17, 30, 34, s * 22 - 3, s * 22 + 3, '#ffe2a8', M.EMIT);
      appendTransformed(g, local, modelMatrix(p.x, p.y, p.a));
    });
  }
}

function fountain(g, x, z) {
  frustumY(g, x, z, 0, 9, 48, 46, '#8d8f96', M.MATTE, 16);                     // borde
  disc(g, x, z, 7, 46, '#ffffff', M.WATER);                                    // agua (la del mar, animada)
  frustumY(g, x, z, 0, 28, 6, 4, '#8d8f96', M.MATTE, 8);                       // columna
  frustumY(g, x, z, 28, 32, 4, 15, '#8d8f96', M.MATTE, 10);                    // taza
  disc(g, x, z, 31, 14, '#ffffff', M.WATER);
}

function disc(g, x, z, y, r, color, mat, seg = 16) {
  const c = rgb(color);
  for (let k = 0; k < seg; k++) {
    const a0 = k / seg * Math.PI * 2, a1 = (k + 1) / seg * Math.PI * 2;
    tri(g, [x, y, z], [x + Math.cos(a1) * r, y, z + Math.sin(a1) * r], [x + Math.cos(a0) * r, y, z + Math.sin(a0) * r], UP, c, mat);
  }
}

// Charcos de luz (de noche): bajo cada farola, bajo las luces del túnel y en el callejón
export function buildLights() {
  const g = [];
  const pool = (x, y, h, r, color) => quadN(g, [[x - r, h, y - r], [x + r, h, y - r], [x + r, h, y + r], [x - r, h, y + r]],
    UP4, rgb(color), M.LIGHT, [[0, 0], [1, 0], [1, 1], [0, 1]]);
  track.decor.filter(d => d.type === 'lamp').forEach(l => {
    const p = pointAt(l.seg, l.side * (W / 2 - 20));
    pool(p.x, p.y, track.points[l.seg].h + 0.7, 95, '#ffb35a');
  });
  if (track.tunnel) {
    const t = track.tunnel;
    for (let i = t.from; i < t.to; i += 3) { const p = pointAt(i, 0); pool(p.x, p.y, track.points[i].h + 0.7, 80, '#ffd9a0'); }
    for (let i = t.down + 4; i < t.up - 3; i += 7) {                    // farolitas del parque
      [-1, 1].forEach(s => { const p = pointAt(i, s * 22); pool(p.x, p.y, 0.25, 45, '#ffcf8a'); });
    }
  }
  track.shortcuts.filter(s => s.style === 'alley').forEach(s => {
    pool((s.a.x + s.b.x) / 2, (s.a.y + s.b.y) / 2, 0.7, 70, '#7fd0ff');
  });
  return g;
}

// ================== Parque de atracciones ==================
const p3 = p => [p.x, p.z, p.y]; // del juego (x, y, altura) a 3D (x, altura, z)

// Looping: carril naranja por dentro, estructura oscura por fuera, bordes de colores y dos torres
// con un travesaño por encima. Usa las mismas cuentas que el coche (game/loop.js).
function buildLoop(g, L) {
  const steps = 72, t0 = 0.12, t1 = Math.PI * 2 - 0.12, lin = -LOOP_LANE - 5, w = LOOP_LANE;
  const at = (th, s, r) => p3(loopPoint(L, th, loopSide(lin, th) + s, r));
  const c = Math.cos(L.a), sn = Math.sin(L.a), side = [-sn, 0, c];
  for (let k = 0; k < steps; k++) {
    const a = t0 + (t1 - t0) * k / steps, b = t0 + (t1 - t0) * (k + 1) / steps, m = (a + b) / 2;
    const inN = [-Math.sin(m) * c, Math.cos(m), -Math.sin(m) * sn], outN = inN.map(v => -v);
    quadN(g, [at(a, -w, L.R + 1), at(a, w, L.R + 1), at(b, w, L.R + 1), at(b, -w, L.R + 1)], [inN, inN, inN, inN],
          rgb(k % 2 ? '#ff7a00' : '#ff8f1f'), M.PAINT);                                            // carril
    quadN(g, [at(a, -w - 4, L.R + 7), at(b, -w - 4, L.R + 7), at(b, w + 4, L.R + 7), at(a, w + 4, L.R + 7)], [outN, outN, outN, outN],
          rgb('#30343e'), M.MATTE);                                                                // por fuera
    bothSides(s => {
      const n = side.map(v => v * s), o = s * (w + 4);
      quadN(g, [at(a, o, L.R + 7), at(b, o, L.R + 7), at(b, o, L.R - 8), at(a, o, L.R - 8)], [n, n, n, n],
            rgb(k % 4 < 2 ? '#ffffff' : '#e6007e'), M.PAINT);                                      // bordes
    });
  }
  const local = [], top = L.R * 2 + 14, z = LOOP_LANE * 2 + 34;                                     // torres y travesaño
  bothSides(s => box(local, -7, 7, 0, top + 10, ...sideZ(z - 7, z + 7, s), '#c9ced6', M.CHROME));
  box(local, -8, 8, top, top + 12, -z - 8, z + 8, '#e6007e', M.PAINT);
  appendTransformed(g, local, modelMatrix(L.x, L.y, L.a, L.h));
}

// Muros de bloques rojos y blancos que llevan a cada coche a su mitad de la pista
function buildLoopWalls(g, L) {
  const local = [];
  for (let along = -300, k = 0; along < 260; along += 14, k++) {
    const lim = loopLimits(along + 7);
    if (!lim) continue;
    const z = along < 0 ? lim.max + 18 : lim.min - 18;
    if (Math.abs(z) > W / 2 - 4) continue;
    box(local, along, along + 13, 0, 12, z - 3, z + 3, k % 2 ? '#ffffff' : '#e53935', M.PAINT);
  }
  appendTransformed(g, local, modelMatrix(L.x, L.y, L.a, L.h));
}

// ¿Este punto (3D) cae encima de alguna parte de la pista?
const overRoad = q => track.points.some(p => Math.hypot(p.x - q[0], p.y - q[2]) < W / 2 + 30);

// Montaña rusa decorativa: dos raíles con traviesas que suben y bajan, sobre columnas.
// Por encima de la pista va alta para que los coches pasen por debajo.
function buildCoaster(g, k) {
  const step = 24, n = Math.ceil(k.len / step), hAt = u => 175 + 70 * Math.cos(u / 160) - 40 * Math.cos(u / 55);
  const c = Math.cos(k.a), s = Math.sin(k.a), P = (u, o, y) => [k.x + c * u - s * o, y, k.y + s * u + c * o];
  const DOWN = [0, -1, 0];
  for (let i = 0; i < n; i++) {
    const u0 = -k.len / 2 + i * step, u1 = u0 + step, h0 = hAt(u0), h1 = hAt(u1);
    [-9, 9].forEach(o => {                                                                       // raíles
      quadN(g, [P(u0, o - 2, h0 + 3), P(u0, o + 2, h0 + 3), P(u1, o + 2, h1 + 3), P(u1, o - 2, h1 + 3)], UP4, rgb('#e53935'), M.PAINT);
      quadN(g, [P(u0, o - 2, h0), P(u1, o - 2, h1), P(u1, o + 2, h1), P(u0, o + 2, h0)], [DOWN, DOWN, DOWN, DOWN], rgb('#9b1c1c'), M.PAINT);
    });
    quadN(g, [P(u0, -12, h0), P(u0, 12, h0), P(u0 + 5, 12, h0), P(u0 + 5, -12, h0)], UP4, rgb('#5b5f69'), M.MATTE); // traviesa
    const q = P(u0, 0, 0);
    if (i % 3 === 0 && !overRoad(q)) box(g, q[0] - 3, q[0] + 3, 0, h0, q[2] - 3, q[2] + 3, '#f2f2f2', M.PAINT); // columnas
  }
}

// Carpa de circo de rayas rojas y blancas por encima de la pista, abierta por los extremos
function buildTent(g, t) {
  const slices = 12, R = W / 2 + 40, H = 125;
  const ring = (i, k) => { const f = Math.PI * k / slices; return T(i, 0, -Math.cos(f) * R, Math.sin(f) * H); };
  for (let i = t.from; i < t.to; i++) {
    for (let k = 0; k < slices; k++) {
      const pts = [ring(i, k), ring(i + 1, k), ring(i + 1, k + 1), ring(i, k + 1)], col = rgb(k % 2 ? '#f5f5f5' : '#d81b2c');
      let n = normalOf(pts);
      if (n[1] < 0) n = n.map(v => -v);
      const m = n.map(v => -v);
      quadN(g, pts, [n, n, n, n], col, M.MATTE);                                                     // por fuera
      quadN(g, [pts[0], pts[3], pts[2], pts[1]], [m, m, m, m], col.map(v => v * 0.8), M.MATTE);      // por dentro
    }
  }
  [t.from, t.to].forEach(i => {                                                                     // mástiles con banderín
    const top = T(i, 0, 0, H);
    box(g, top[0] - 2, top[0] + 2, top[1] - 4, top[1] + 40, top[2] - 2, top[2] + 2, '#7a5a3a', M.MATTE);
    box(g, top[0] + 2, top[0] + 22, top[1] + 26, top[1] + 38, top[2] - 1, top[2] + 1, '#ffd21f', M.PAINT);
  });
}

// Patas en A de la noria (la rueda gira: la dibuja el renderer con models.buildFerrisWheel)
function buildFerrisBase(g, f) {
  const local = [], hub = ferrisHub(f.R), spread = 0.42, len = hub * Math.hypot(1, spread), tilt = Math.atan(spread);
  bothSides(s => [-1, 1].forEach(d => {
    const leg = [];
    box(leg, -4, 4, 0, len + 6, -4, 4, '#f2f2f2', M.PAINT);
    appendTransformed(local, leg, modelMatrix(d * hub * spread, s * 26, 0, 0, d * tilt));
  }));
  box(local, -6, 6, hub - 6, hub + 6, -30, 30, '#c9ced6', M.CHROME);                              // eje
  frustumY(local, 0, 0, 0, 5, 70, 70, '#8d8f96', M.MATTE, 14);                                      // base
  appendTransformed(g, local, modelMatrix(f.x, f.y, f.a));
}

const STALL_COLORS = ['#e53935', '#1e88e5', '#43a047', '#8e24aa'];

// Caseta de feria con toldo de rayas, mirando a la pista
function buildStall(g, t) {
  const local = [], col = STALL_COLORS[t.color];
  box(local, -14, 14, 0, 26, -22, 22, '#f3e3c3', M.MATTE);                                          // caseta
  box(local, 14, 15, 10, 22, -16, 16, '#3b2a1a', M.MATTE);                                          // ventanilla
  for (let k = 0; k < 6; k++) box(local, -16, 24, 26, 30, -24 + k * 8, -16 + k * 8, k % 2 ? '#ffffff' : col, M.PAINT); // toldo
  box(local, -4, 4, 30, 42, -10, 10, col, M.PAINT);                                                 // cartel
  appendTransformed(g, local, modelMatrix(t.x, t.y, t.angle));
}

const BALLOON_COLORS = ['#ff3b3b', '#ffd21f', '#3fa7ff', '#ff6ad5', '#3ddc84', '#ff8a1f'];

// Ramo de globos atados a un poste
function buildBalloons(g, t) {
  frustumY(g, t.x, t.y, 0, 30, 1.2, 1, '#9a9a9a', M.MATTE, 5);
  for (let k = 0; k < t.n; k++) {
    const a = k / t.n * Math.PI * 2, x = t.x + Math.cos(a) * 9, z = t.y + Math.sin(a) * 9, y = 52 + (k % 3) * 9;
    const col = BALLOON_COLORS[(k + t.n) % BALLOON_COLORS.length];
    frustumY(g, (t.x + x) / 2, (t.y + z) / 2, 30, y - 8, 0.4, 0.4, '#dddddd', M.MATTE, 4);          // cuerda
    frustumY(g, x, z, y - 9, y, 2, 8, col, M.PAINT, 8);                                             // globo
    frustumY(g, x, z, y, y + 9, 8, 3, col, M.PAINT, 8);
  }
}

const DECOR = {
  tree: buildTree, palm: buildPalm, rock: buildRock, umbrella: buildUmbrella, lighthouse: buildLighthouse,
  building: buildBuilding, lamp: buildLamp, stall: buildStall, balloons: buildBalloons
};
