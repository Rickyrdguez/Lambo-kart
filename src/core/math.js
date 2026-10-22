// Utilidades matemáticas: vectores 3D como arrays [x, y, z], ángulos y colores.

export const UP = [0, 1, 0];

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

export const sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const avg3 = pts => [0, 1, 2].map(k => pts.reduce((s, p) => s + p[k], 0) / pts.length);

export function norm3(v) {
  const l = Math.hypot(...v) || 1;
  return v.map(x => x / l);
}

// Diferencia entre dos ángulos, siempre entre -PI y PI
export function angDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export function hexToRgb(hex) {
  let h = hex.slice(1);
  if (h.length === 3) h = h.split('').map(c => c + c).join(''); // '#abc' -> 'aabbcc'
  const n = parseInt(h, 16);
  return [n >> 16, (n >> 8) & 255, n & 255];
}

// Color hexadecimal -> [r, g, b] entre 0 y 1
export const rgb = hex => hexToRgb(hex).map(v => v / 255);
