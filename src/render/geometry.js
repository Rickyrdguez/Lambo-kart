// Generación de geometría: cajas, cilindros, conos y "lofts" (secciones unidas).
// Cada vértice ocupa 12 números: posición(3) normal(3) color(3) uv(2) material(1).
import { rgb, norm3, sub3, dot3, cross3, avg3 } from '../core/math.js';
import { transformPoint } from '../core/mat4.js';

// Materiales: el shader cambia de aspecto según este número
export const M = { MATTE: 0, PAINT: 1, GLASS: 2, EMIT: 3, ASPHALT: 4, GRASS: 5, CHROME: 7, RAINBOW: 8, BLOB: 9, CHECKER: 10 };
export const FLOATS_PER_VERTEX = 12;

export function vtx(g, p, n, c, uv, mat) {
  g.push(p[0], p[1], p[2], n[0], n[1], n[2], c[0], c[1], c[2], uv[0], uv[1], mat);
}

export function tri(g, a, b, c, n, col, mat) {
  [a, b, c].forEach(p => vtx(g, p, n, col, [0, 0], mat));
}

// Cuadrilátero con normal por vértice y uv opcionales
export function quadN(g, ps, ns, col, mat, uvs = [[0, 0], [0, 0], [0, 0], [0, 0]]) {
  [0, 1, 2, 0, 2, 3].forEach(i => vtx(g, ps[i], ns[i], col, uvs[i], mat));
}

export function normalOf(pts) {
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

// Une secciones transversales (pts = [derecha, arriba]) colocadas a lo largo de x.
// styleOf(tramo, cara) devuelve [color, material]; para las tapas recibe 'rear' o 'front'.
export function loft(g, secs, styleOf) {
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
export function box(g, x0, x1, y0, y1, z0, z1, color, mat) {
  const r = [[z0, y0], [z1, y0], [z1, y1], [z0, y1]];
  loft(g, [{ x: x0, pts: r }, { x: x1, pts: r }], () => [color, mat]);
}

// Llama a fn para el lado derecho (s = 1) y el izquierdo (s = -1)
export function bothSides(fn) { fn(1); fn(-1); }
export const sideZ = (z0, z1, s) => s > 0 ? [z0, z1] : [-z1, -z0];

// Cilindro con el eje en z (ruedas)
export function cylinderZ(g, cx, cy, cz, r, w, color, mat, seg = 20) {
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
export function frustumY(g, cx, cz, y0, y1, r0, r1, color, mat, seg = 10) {
  const c = rgb(color), h = y1 - y0;
  const P = (a, y, r) => [cx + Math.cos(a) * r, y, cz + Math.sin(a) * r];
  const Nn = a => norm3([Math.cos(a) * h, r0 - r1, Math.sin(a) * h]);
  for (let i = 0; i < seg; i++) {
    const a0 = i / seg * Math.PI * 2, a1 = (i + 1) / seg * Math.PI * 2;
    quadN(g, [P(a0, y0, r0), P(a1, y0, r0), P(a1, y1, r1), P(a0, y1, r1)], [Nn(a0), Nn(a1), Nn(a1), Nn(a0)], c, mat);
  }
}

// Copia geometría aplicando una matriz
export function appendTransformed(dst, src, m) {
  for (let i = 0; i < src.length; i += FLOATS_PER_VERTEX) {
    const p = transformPoint(m, src.slice(i, i + 3)), n = transformPoint(m, src.slice(i + 3, i + 6), 0);
    dst.push(...p, ...n, ...src.slice(i + 6, i + FLOATS_PER_VERTEX));
  }
}
