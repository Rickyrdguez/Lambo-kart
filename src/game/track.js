// Trazado del circuito: una curva suave (Catmull-Rom) que pasa por los puntos de control del mapa.
// La pista se guarda como una lista de puntos; el "segmento" de un coche es el índice
// del punto más cercano y sirve para contar vueltas y posiciones.
// Aquí también están los elementos especiales: rampas, placas de turbo, atajos, arcos y,
// en los circuitos de isla, qué es tierra y qué es agua.
import { TRACK_WIDTH } from '../config.js';

const SCALE = 1.4;  // tamaño de los circuitos
const STEPS = 40;   // puntos por tramo entre puntos de control
const RAMP_LEN = 80, RAMP_HEIGHT = 16;
const PAD_LEN = 50;
const CELL = 25;    // tamaño de celda del mapa de tierra/agua

export const track = {
  map: null, points: [], N: 0, bounds: null, decor: [],
  ramps: [], pads: [], shortcuts: [], arches: [], water: [], land: null
};

function catmull(p0, p1, p2, p3, t) {
  const t2 = t * t, t3 = t2 * t;
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2
         + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}

// Puntos de la curva cerrada que pasa por los puntos de control. a = dirección en cada punto.
export function splinePoints(control) {
  const pts = control.map(p => [p[0] * SCALE, p[1] * SCALE]), n = pts.length, out = [];
  for (let i = 0; i < n; i++) {
    const a = pts[(i - 1 + n) % n], b = pts[i], c = pts[(i + 1) % n], d = pts[(i + 2) % n];
    for (let s = 0; s < STEPS; s++) {
      const t = s / STEPS;
      out.push({ x: catmull(a[0], b[0], c[0], d[0], t), y: catmull(a[1], b[1], c[1], d[1], t) });
    }
  }
  out.forEach((p, i) => { const q = out[(i + 1) % out.length]; p.a = Math.atan2(q.y - p.y, q.x - p.x); });
  return out;
}

export function computeBounds(pts) {
  const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
}

export function buildTrack(map) {
  const pts = splinePoints(map.points);
  Object.assign(track, { map, points: pts, N: pts.length, bounds: computeBounds(pts) });
  track.ramps = (map.ramps || []).map(seg => zone(seg, RAMP_LEN, { h: RAMP_HEIGHT }));
  track.pads = (map.boostPads || []).map(seg => zone(seg, PAD_LEN, {}));
  track.shortcuts = (map.shortcuts || []).map(s => ({ ...s, a: pointAt(s.from, 0), b: pointAt(s.to, 0) }));
  track.arches = (map.arches || []).map(seg => ({ ...pts[seg], seg }));
  track.water = map.island ? map.island.water : [];
  track.land = map.island ? buildLandMask(map.island.radius) : null;
  track.decor = placeDecor(map.theme);
}

// Punto de la pista desplazado lateralmente (lane > 0 = derecha)
export function pointAt(seg, lane) {
  const p = track.points[((seg % track.N) + track.N) % track.N];
  return { x: p.x - Math.sin(p.a) * lane, y: p.y + Math.cos(p.a) * lane };
}

// Busca el punto de la pista más cercano, empezando desde el último conocido
export function nearestSeg(x, y, from) {
  let best = from, bd = Infinity;
  for (let k = -10; k <= 30; k++) {
    const i = (from + k + track.N) % track.N, p = track.points[i];
    const d = (p.x - x) ** 2 + (p.y - y) ** 2;
    if (d < bd) { bd = d; best = i; }
  }
  return { i: best, d: Math.sqrt(bd) };
}

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

export const onBoostPad = (x, y) => track.pads.some(p => insideZone(p, x, y) >= 0);

// ================== Atajos ==================
// Distancia de (x, y) a la línea del atajo y posición a lo largo de él (0 = inicio, 1 = fin)
function shortcutPos(s, x, y) {
  const abx = s.b.x - s.a.x, aby = s.b.y - s.a.y;
  const t = Math.max(0, Math.min(1, ((x - s.a.x) * abx + (y - s.a.y) * aby) / (abx * abx + aby * aby)));
  return { t, d: Math.hypot(x - (s.a.x + abx * t), y - (s.a.y + aby * t)) };
}

// Si (x, y) va por un atajo, devuelve el segmento de la pista equivalente; si no, -1
export function shortcutAt(x, y) {
  for (const s of track.shortcuts) {
    const { t, d } = shortcutPos(s, x, y);
    if (d <= s.width / 2 && t > 0.03 && t < 0.97) return Math.round(s.from + t * (s.to - s.from));
  }
  return -1;
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
function distToTrack(x, y) {
  let best = Infinity;
  for (const p of track.points) best = Math.min(best, Math.hypot(p.x - x, p.y - y));
  return best;
}

// Reparte "count" objetos al azar en tierra, a más de "margin" del borde de la pista
function scatter(count, margin, add, extraCheck = () => true) {
  const b = track.bounds, R = track.map.island ? track.map.island.radius : 900;
  for (let placed = 0, tries = 0; placed < count && tries < count * 40; tries++) {
    const x = b.x0 - R + Math.random() * (b.x1 - b.x0 + 2 * R);
    const y = b.y0 - R + Math.random() * (b.y1 - b.y0 + 2 * R);
    if (!isLand(x, y) || nearShortcut(x, y, 40)) continue;
    const d = distToTrack(x, y);
    if (d < TRACK_WIDTH / 2 + margin || !extraCheck(d)) continue;
    add(x, y);
    placed++;
  }
}

function placeDecor(theme) {
  const out = [], trees = theme.trees, extra = theme.decor || {};
  scatter(trees.count, 80, (x, y) => out.push({
    type: trees.kind === 'palm' ? 'palm' : 'tree', x, y, s: 0.7 + Math.random() * 0.7,
    pine: Math.random() < (trees.pine ?? 1), dir: Math.random() * Math.PI * 2, lean: 0.4 + Math.random() * 0.8
  }));
  if (extra.rocks) scatter(extra.rocks, 60, (x, y) => out.push({ type: 'rock', x, y, s: 0.6 + Math.random() * 1.4 }));
  if (extra.umbrellas) {
    const shore = track.map.island.radius - 220; // sombrillas cerca del mar
    scatter(extra.umbrellas, 100, (x, y) => out.push({ type: 'umbrella', x, y, color: Math.random() * 4 | 0 }), d => d > shore);
  }
  if (extra.lighthouse) {
    const { seg, side } = extra.lighthouse, p = pointAt(seg, side * (track.map.island.radius - 90));
    out.push({ type: 'lighthouse', x: p.x, y: p.y });
  }
  return out;
}
