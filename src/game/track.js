// Trazado del circuito: una curva suave (Catmull-Rom) que pasa por los puntos de control del mapa.
// La pista se guarda como una lista de puntos; el "segmento" de un coche es el índice
// del punto más cercano y sirve para contar vueltas y posiciones.
import { TRACK_WIDTH } from '../config.js';

const SCALE = 1.4;  // tamaño de los circuitos
const STEPS = 40;   // puntos por tramo entre puntos de control
const RAMP_LEN = 80, RAMP_HEIGHT = 16;

export const track = { map: null, points: [], N: 0, bounds: null, decor: [], ramps: [] };

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
  track.map = map;
  track.points = pts;
  track.N = pts.length;
  track.bounds = computeBounds(pts);
  track.ramps = map.ramps.map(seg => {
    const p = pts[seg];
    return { x: p.x, y: p.y, a: p.a, len: RAMP_LEN, h: RAMP_HEIGHT, width: TRACK_WIDTH + 8 };
  });
  track.decor = placeTrees(map.theme.trees);
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

// Si (x, y) está encima de una rampa, devuelve su altura en ese punto y su pendiente
export function rampUnder(x, y) {
  for (const r of track.ramps) {
    const dx = x - r.x, dy = y - r.y;
    const along = dx * Math.cos(r.a) + dy * Math.sin(r.a);
    const side = -dx * Math.sin(r.a) + dy * Math.cos(r.a);
    if (along >= 0 && along <= r.len && Math.abs(side) <= r.width / 2) {
      return { h: r.h * along / r.len, slope: r.h / r.len };
    }
  }
  return null;
}

function distToTrack(x, y) {
  let best = Infinity;
  for (const p of track.points) best = Math.min(best, Math.hypot(p.x - x, p.y - y));
  return best;
}

// Árboles repartidos al azar, sin pisar la pista
function placeTrees({ count, pine }) {
  const b = track.bounds, trees = [];
  while (trees.length < count) {
    const x = b.x0 - 900 + Math.random() * (b.x1 - b.x0 + 1800);
    const y = b.y0 - 900 + Math.random() * (b.y1 - b.y0 + 1800);
    if (distToTrack(x, y) > TRACK_WIDTH / 2 + 80) {
      trees.push({ x, y, s: 0.7 + Math.random() * 0.7, pine: Math.random() < pine });
    }
  }
  return trees;
}
