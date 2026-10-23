// Trazado del circuito: una curva suave (Catmull-Rom) que pasa por los puntos de control del mapa.
// La pista se guarda como una lista de puntos; el "segmento" de un coche es el índice
// del punto más cercano y sirve para contar vueltas y posiciones.
// Aquí también están los elementos especiales: altura de la pista (puentes), rampas, placas de
// turbo, atajos, arcos, túneles, el looping, el rasante, la pista en el cielo y, en los circuitos
// de isla, qué es tierra y qué es agua.
import { TRACK_WIDTH } from '../config.js';
import { angDiff } from '../core/math.js';

const SCALE = 1.4;  // tamaño de los circuitos
const STEPS = 40;   // puntos por tramo entre puntos de control
const RAMP_LEN = 80, RAMP_HEIGHT = 16;
const PAD_LEN = 50;
const CELL = 25;    // tamaño de celda del mapa de tierra/agua
const WALL = TRACK_WIDTH / 2 - 14; // en los tramos elevados, el coche no pasa de aquí

export const track = {
  map: null, points: [], N: 0, bounds: null, decor: [],
  ramps: [], pads: [], shortcuts: [], arches: [], water: [], land: null, tunnel: null,
  loop: null, sky: false, gaps: [], open: []
};

function catmull(p0, p1, p2, p3, t) {
  const t2 = t * t, t3 = t2 * t;
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2
         + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}

// Puntos de la curva cerrada que pasa por los puntos de control.
// a = dirección, len = distancia al siguiente punto.
export function splinePoints(control) {
  const pts = control.map(p => [p[0] * SCALE, p[1] * SCALE]), n = pts.length, out = [];
  for (let i = 0; i < n; i++) {
    const a = pts[(i - 1 + n) % n], b = pts[i], c = pts[(i + 1) % n], d = pts[(i + 2) % n];
    for (let s = 0; s < STEPS; s++) {
      const t = s / STEPS;
      out.push({ x: catmull(a[0], b[0], c[0], d[0], t), y: catmull(a[1], b[1], c[1], d[1], t) });
    }
  }
  out.forEach((p, i) => {
    const q = out[(i + 1) % out.length];
    p.a = Math.atan2(q.y - p.y, q.x - p.x);
    p.len = Math.hypot(q.x - p.x, q.y - p.y);
  });
  return out;
}

export function computeBounds(pts) {
  const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
}

export function buildTrack(map) {
  const pts = splinePoints(map.points);
  pts.forEach((p, i) => { p.h = bridgeHeight(map.bridge, i) - tunnelDepth(map.tunnel, i) + crestHeight(map.crest, i); });
  Object.assign(track, { map, points: pts, N: pts.length, bounds: computeBounds(pts), tunnel: map.tunnel || null });
  track.ramps = (map.ramps || []).map(seg => zone(seg, RAMP_LEN, { h: RAMP_HEIGHT }));
  track.pads = (map.boostPads || []).map(seg => zone(seg, PAD_LEN, { h: pts[seg].h }));
  track.shortcuts = (map.shortcuts || []).map(s => ({ ...s, a: pointAt(s.from, 0), b: pointAt(s.to, 0) }));
  track.arches = (map.arches || []).map(seg => ({ ...pts[seg], seg }));
  track.water = map.island ? map.island.water : [];
  track.loop = map.loop ? { ...pts[map.loop.seg], seg: map.loop.seg, R: map.loop.radius } : null;
  // pista en el cielo: huecos sin suelo y tramos sin barreras (si te sales, caes)
  track.sky = !!map.sky;
  track.gaps = map.sky ? map.sky.gaps || [] : [];
  track.open = map.sky ? map.sky.open || [] : [];
  track.land = map.island ? buildLandMask(map.island.radius) : null;
  track.decor = placeDecor(map.theme);
}

// Punto de la pista desplazado lateralmente (lane > 0 = derecha)
export function pointAt(seg, lane) {
  const p = track.points[((seg % track.N) + track.N) % track.N];
  return { x: p.x - Math.sin(p.a) * lane, y: p.y + Math.cos(p.a) * lane };
}

// Busca el punto de la pista más cercano, empezando desde el último conocido.
// Si el coche se ha alejado mucho, busca más lejos; si aun así no lo encuentra, en toda la
// pista (lost = true: en ese caso no se cuentan vueltas con ese salto).
// Como solo se busca cerca del último segmento, en un cruce de la pista (puente) cada coche
// sigue en el tramo por el que iba.
export function nearestSeg(x, y, from) {
  let r = searchSegs(x, y, from, -10, 30);
  if (r.d > TRACK_WIDTH) r = searchSegs(x, y, from, -60, 150);
  if (r.d > TRACK_WIDTH * 3) return { ...searchSegs(x, y, 0, 0, track.N - 1), lost: true };
  return r;
}

function searchSegs(x, y, from, k0, k1) {
  let best = from, bd = Infinity;
  for (let k = k0; k <= k1; k++) {
    const i = (from + k + track.N) % track.N, p = track.points[i];
    const d = (p.x - x) ** 2 + (p.y - y) ** 2;
    if (d < bd) { bd = d; best = i; }
  }
  return { i: best, d: Math.sqrt(bd) };
}

// ================== Altura de la pista (puentes y túneles) ==================
const smooth = t => t * t * (3 - 2 * t);

// El puente sube suavemente, sigue recto arriba y vuelve a bajar
function bridgeHeight(b, i) {
  if (!b || i < b.from || i > b.to) return 0;
  if (i < b.up) return b.height * smooth((i - b.from) / (b.up - b.from));
  if (i > b.down) return b.height * smooth((b.to - i) / (b.to - b.down));
  return b.height;
}

// El túnel es lo contrario: la pista baja por una trinchera, va bajo tierra y vuelve a subir
function tunnelDepth(t, i) {
  if (!t || i < t.from || i > t.to) return 0;
  if (i < t.down) return t.depth * smooth((i - t.from) / (t.down - t.from));
  if (i > t.up) return t.depth * smooth((t.to - i) / (t.to - t.up));
  return t.depth;
}

// Rasante: la pista sube en línea recta hasta un pico afilado y baja algo más suave.
// Como el pico es afilado, a buena velocidad el coche sale volando (physics.updateHeight).
function crestHeight(k, i) {
  if (!k || i < k.from || i > k.to) return 0;
  return i <= k.peak ? k.height * (i - k.from) / (k.peak - k.from) : k.height * (k.to - i) / (k.to - k.peak);
}

// Altura de la calzada en (x, y) para un coche en el segmento seg (interpola entre puntos)
function roadHeight(seg, x, y) {
  const P = track.points, N = track.N;
  const a = P[seg], b = P[(seg + 1) % N], prev = P[(seg - 1 + N) % N];
  if (!a.h && !b.h && !prev.h) return 0;
  const t = ((x - a.x) * (b.x - a.x) + (y - a.y) * (b.y - a.y)) / (a.len * a.len);
  return t >= 0 ? a.h + (b.h - a.h) * Math.min(1, t) : a.h + (prev.h - a.h) * Math.min(1, -t);
}

// Altura del suelo bajo un coche: la calzada (si va por ella) más una rampa si la pisa
export function groundAt(c) {
  if (track.sky) return skyGround(c);
  const road = c.trackDist <= TRACK_WIDTH / 2 + 30 ? roadHeight(c.seg, c.x, c.y) : 0;
  const ramp = rampUnder(c.x, c.y);
  return road + (ramp ? ramp.h : 0);
}

// ================== Pista en el cielo ==================
export const VOID = -5000;      // "suelo" cuando no hay pista debajo: se cae
export const FALL_LIMIT = -320; // por debajo de esto, el coche reaparece en la pista
const SKY_EDGE = TRACK_WIDTH / 2 + 16;
const inRanges = (list, i) => list.some(r => i >= r.from && i <= r.to);
export const inGap = i => inRanges(track.gaps, ((i % track.N) + track.N) % track.N);
export const gapAt = i => track.gaps.find(r => i >= r.from && i <= r.to);
export const walled = i => track.sky && !inGap(i) && !inRanges(track.open, i);

// Solo hay suelo encima de la losa: fuera de ella, en un hueco o por debajo de ella, se cae
function skyGround(c) {
  if (c.trackDist > SKY_EDGE || inGap(c.seg)) return VOID;
  const road = roadHeight(c.seg, c.x, c.y);
  if (c.z < road - 15) return VOID;
  const ramp = rampUnder(c.x, c.y);
  return road + (ramp ? ramp.h : 0);
}

// En los tramos elevados (puente) o hundidos (trinchera y túnel) hay muros: si el coche llega
// al borde, se le devuelve a la calzada y se le endereza un poco, como si rozara el muro.
export function keepOnRoad(c) {
  const p = track.points[c.seg];
  if (track.sky ? !walled(c.seg) : Math.abs(p.h) < 1) return; // en el cielo hay barreras casi en toda la pista
  if (c.z < p.h - 20) return;
  const nx = -Math.sin(p.a), ny = Math.cos(p.a), side = (c.x - p.x) * nx + (c.y - p.y) * ny;
  if (Math.abs(side) <= WALL) return;
  const push = Math.sign(side) * WALL - side;
  c.x += nx * push;
  c.y += ny * push;
  const along = Math.abs(angDiff(p.a, c.angle)) < Math.PI / 2 ? p.a : p.a + Math.PI;
  c.angle += angDiff(along, c.angle) * 0.25;
  c.speed *= 0.98;
}

// Trinchera completa (de donde empieza a bajar a donde termina de subir) y parte cubierta
export const inTrench = seg => !!track.tunnel && seg >= track.tunnel.from && seg <= track.tunnel.to;
export const inTunnel = seg => !!track.tunnel && seg >= track.tunnel.down && seg <= track.tunnel.up;

// Parque encima del túnel: segmentos cubiertos y hasta esta distancia del centro de la pista
export const PARK_WIDTH = TRACK_WIDTH / 2 + 230;

// ================== Rampas y placas de turbo ==================
// Zona rectangular sobre la pista que empieza en el segmento seg y mide len de largo
function zone(seg, len, extra) {
  const p = track.points[seg];
  return { x: p.x, y: p.y, a: p.a, len, width: TRACK_WIDTH + 8, ...extra };
}

// Distancia recorrida dentro de la zona, o -1 si (x, y) está fuera
function insideZone(z, x, y) {
  const dx = x - z.x, dy = y - z.y;
  const along = dx * Math.cos(z.a) + dy * Math.sin(z.a);
  const side = -dx * Math.sin(z.a) + dy * Math.cos(z.a);
  return along >= 0 && along <= z.len && Math.abs(side) <= z.width / 2 ? along : -1;
}

// Si (x, y) está encima de una rampa, devuelve su altura en ese punto y su pendiente
export function rampUnder(x, y) {
  for (const r of track.ramps) {
    const along = insideZone(r, x, y);
    if (along >= 0) return { h: r.h * along / r.len, slope: r.h / r.len };
  }
  return null;
}

// La placa tiene que estar a la altura del coche (no vale pasar por debajo de un puente)
export const onBoostPad = c => track.pads.some(p => Math.abs(c.z - p.h) < 10 && insideZone(p, c.x, c.y) >= 0);

// ================== Atajos ==================
// Distancia de (x, y) a la línea del atajo y posición a lo largo de él (0 = inicio, 1 = fin)
function shortcutPos(s, x, y) {
  const abx = s.b.x - s.a.x, aby = s.b.y - s.a.y;
  const t = Math.max(0, Math.min(1, ((x - s.a.x) * abx + (y - s.a.y) * aby) / (abx * abx + aby * aby)));
  return { t, d: Math.hypot(x - (s.a.x + abx * t), y - (s.a.y + aby * t)) };
}

// Si (x, y) va por un atajo, devuelve el segmento de la pista equivalente y lo que frena; si no, null
export function shortcutAt(x, y) {
  for (const s of track.shortcuts) {
    const { t, d } = shortcutPos(s, x, y);
    if (d <= s.width / 2 && t > 0.03 && t < 0.97) return { seg: Math.round(s.from + t * (s.to - s.from)), speed: s.speed ?? 0.85 };
  }
  return null;
}

const nearShortcut = (x, y, margin) => track.shortcuts.some(s => shortcutPos(s, x, y).d < s.width / 2 + margin);

// ================== Tierra y agua (circuitos de isla) ==================
export const waterRangeAt = seg => track.water.find(r => seg >= r.from && seg <= r.to);

// La tierra es una franja a cada lado de la pista, salvo en los tramos de agua (muelle y cala).
// Se guarda como una rejilla para poder preguntar rápido si un punto es tierra.
function buildLandMask(R) {
  const b = track.bounds, x0 = b.x0 - R - CELL * 2, y0 = b.y0 - R - CELL * 2;
  const cols = Math.ceil((b.x1 - b.x0 + 2 * R) / CELL) + 4, rows = Math.ceil((b.y1 - b.y0 + 2 * R) / CELL) + 4;
  const mask = { x0, y0, cols, rows, data: new Uint8Array(cols * rows) };
  for (let i = 0; i < track.N; i++) {
    if (waterRangeAt(i)) continue;
    const a = pointAt(i, -R), b2 = pointAt(i, R), c = pointAt(i + 1, R), d = pointAt(i + 1, -R);
    fillTriangle(mask, a, b2, c);
    fillTriangle(mask, a, c, d);
  }
  return mask;
}

function fillTriangle(m, p, q, r) {
  const cx0 = Math.max(0, Math.floor((Math.min(p.x, q.x, r.x) - m.x0) / CELL));
  const cx1 = Math.min(m.cols - 1, Math.floor((Math.max(p.x, q.x, r.x) - m.x0) / CELL));
  const cy0 = Math.max(0, Math.floor((Math.min(p.y, q.y, r.y) - m.y0) / CELL));
  const cy1 = Math.min(m.rows - 1, Math.floor((Math.max(p.y, q.y, r.y) - m.y0) / CELL));
  for (let cy = cy0; cy <= cy1; cy++) {
    for (let cx = cx0; cx <= cx1; cx++) {
      if (inTriangle(m.x0 + (cx + 0.5) * CELL, m.y0 + (cy + 0.5) * CELL, p, q, r)) m.data[cy * m.cols + cx] = 1;
    }
  }
}

function inTriangle(x, y, p, q, r) {
  const s1 = (x - q.x) * (p.y - q.y) - (p.x - q.x) * (y - q.y);
  const s2 = (x - r.x) * (q.y - r.y) - (q.x - r.x) * (y - r.y);
  const s3 = (x - p.x) * (r.y - p.y) - (r.x - p.x) * (y - p.y);
  return !((s1 < 0 || s2 < 0 || s3 < 0) && (s1 > 0 || s2 > 0 || s3 > 0));
}

export function isLand(x, y) {
  const m = track.land;
  if (!m) return true;
  const cx = Math.floor((x - m.x0) / CELL), cy = Math.floor((y - m.y0) / CELL);
  return cx >= 0 && cy >= 0 && cx < m.cols && cy < m.rows && m.data[cy * m.cols + cx] === 1;
}

// ¿Un coche en el suelo en (x, y), cerca del segmento seg y a distancia d del centro, está en el agua?
export function isWater(x, y, seg, d) {
  if (!track.land) return false;
  const range = waterRangeAt(seg);
  // Sobre la pista (asfalto con bordillos o tablones del muelle) solo se cae en la cala
  const surface = range && range.type === 'pier' ? TRACK_WIDTH / 2 + 6 : TRACK_WIDTH / 2 + 16;
  if (d <= surface) return !!(range && range.type === 'cove');
  return !isLand(x, y); // fuera de la pista: según el mapa de tierra
}

// ================== Decorado ==================
// Punto de la pista más cercano a (x, y) y su distancia
function nearestPoint(x, y) {
  let best = null, bd = Infinity;
  for (const p of track.points) { const d = Math.hypot(p.x - x, p.y - y); if (d < bd) { bd = d; best = p; } }
  return { p: best, d: bd };
}

const distToTrack = (x, y) => nearestPoint(x, y).d;

// Reparte "count" objetos al azar en tierra, a más de "margin" del borde de la pista
function scatter(count, margin, add, extraCheck = () => true) {
  const b = track.bounds, R = track.map.island ? track.map.island.radius : 900;
  for (let placed = 0, tries = 0; placed < count && tries < count * 40; tries++) {
    const x = b.x0 - R + Math.random() * (b.x1 - b.x0 + 2 * R);
    const y = b.y0 - R + Math.random() * (b.y1 - b.y0 + 2 * R);
    if (!isLand(x, y)) continue;
    const d = distToTrack(x, y);
    if (d < TRACK_WIDTH / 2 + margin || !extraCheck(d, x, y)) continue;
    if (add(x, y, d) !== false) placed++;
  }
}

function placeDecor(theme) {
  const out = [], trees = theme.trees, extra = theme.decor || {};
  const free = (x, y, m) => !nearShortcut(x, y, m) && !nearAttraction(x, y, m);
  scatter(trees.count, 80, (x, y) => out.push({
    type: trees.kind === 'palm' ? 'palm' : 'tree', x, y, s: 0.7 + Math.random() * 0.7,
    pine: Math.random() < (trees.pine ?? 1), dir: Math.random() * Math.PI * 2, lean: 0.4 + Math.random() * 0.8
  }), (d, x, y) => free(x, y, 40));
  if (extra.rocks) scatter(extra.rocks, 60, (x, y) => out.push({ type: 'rock', x, y, s: 0.6 + Math.random() * 1.4 }), (d, x, y) => free(x, y, 40));
  if (extra.umbrellas) {
    const shore = track.map.island.radius - 220; // sombrillas cerca del mar
    scatter(extra.umbrellas, 100, (x, y) => out.push({ type: 'umbrella', x, y, color: Math.random() * 4 | 0 }), (d, x, y) => d > shore && free(x, y, 40));
  }
  if (extra.lighthouse) {
    const { seg, side } = extra.lighthouse, p = pointAt(seg, side * (track.map.island.radius - 90));
    out.push({ type: 'lighthouse', x: p.x, y: p.y });
  }
  if (extra.buildings) placeBuildings(out, extra.buildings);
  // nubes: casi todas por debajo de la pista; alguna alta y lejos
  if (extra.clouds) scatter(extra.clouds, 150, (x, y, d) => out.push({
    type: 'cloud', x, y, n: 4 + Math.random() * 4 | 0, s: 0.8 + Math.random() * 1.6,
    h: d > 700 && Math.random() < 0.3 ? 250 + Math.random() * 300 : -120 - Math.random() * 380
  }), (d, x, y) => free(x, y, 120));
  if (extra.airBalloons) scatter(extra.airBalloons, 300, (x, y) => out.push({
    type: 'airballoon', x, y, s: 0.9 + Math.random() * 0.6, h: 60 + Math.random() * 320, color: Math.random() * 4 | 0
  }), (d, x, y) => free(x, y, 120));
  if (extra.lamps) placeLamps(out, extra.lamps);
  return out;
}

// ¿(x, y) está cerca del looping?
function nearAttraction(x, y, m) {
  const L = track.loop;
  return !!L && Math.hypot(x - L.x, y - L.y) < L.R + 220 + m;
}

// Edificios girados hacia la pista, sin pisarla ni pisarse entre ellos. Los cercanos llevan neón.
function placeBuildings(out, count) {
  const placed = [];
  scatter(count, 60, (x, y) => {
    const hw = 50 + Math.random() * 60, hd = 50 + Math.random() * 60, r = Math.max(hw, hd) * 1.25;
    const { p, d } = nearestPoint(x, y), seg = track.points.indexOf(p);
    if (d < TRACK_WIDTH / 2 + 40 + r || nearShortcut(x, y, r + 15)) return false;
    if (inTunnel(seg) && d < PARK_WIDTH + r) return false; // ni en el parque
    if (inTrench(seg) && d < TRACK_WIDTH / 2 + 130 + r) return false; // ni en las aceras de la trinchera
    if (placed.some(o => Math.hypot(o.x - x, o.y - y) < o.r + r + 15)) return false;
    const b = {
      type: 'building', x, y, r, hw, hd, h: 120 + Math.random() * 360,
      angle: Math.atan2(p.y - y, p.x - x), color: Math.random() * 4 | 0,
      neon: d < 520 && Math.random() < 0.6 ? { color: Math.random() * 4 | 0, h: 30 + Math.random() * 70 } : null
    };
    placed.push(b);
    out.push(b);
  });
}

// Farolas a lo largo de la pista, alternando lados (en la trinchera y el túnel hay otras luces)
function placeLamps(out, every) {
  for (let i = 0, k = 0; i < track.N; i += every, k++) {
    if (!inTrench(i)) out.push({ type: 'lamp', seg: i, side: k % 2 ? 1 : -1 });
  }
}
