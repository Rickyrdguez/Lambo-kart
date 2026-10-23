// Modelos 3D construidos por código: Lamborghini, kart, caja de objeto, plátano, coco y efectos.
// Coordenadas locales: x hacia delante, y hacia arriba, z hacia la derecha.
import { UP } from '../core/math.js';
import { M, loft, box, bothSides, sideZ, cylinderZ, quadN } from './geometry.js';

const GLASS = '#0e1319';

// ---- Lamborghini ----
// Sección transversal: hw/hs = media anchura y altura del lateral; ht/top = del techo
function lamboSection(x, hw, hs, ht, top) {
  return { x, pts: [[-hw, 3], [hw, 3], [hw, hs], [ht, top], [-ht, top], [-hw, hs]] };
}

// k = tramo (0 trasera ... 6 morro), j = cara de la sección (0 abajo, 2/4 laterales altos, 3 arriba)
function lamboStyle(k, j, paint) {
  if (k === 'rear' || k === 'front') return [paint, M.PAINT];
  if (j === 0) return ['#0b0b0b', M.MATTE];
  if (j === 3 && (k === 1 || k === 4)) return [GLASS, M.GLASS];          // tapa del motor y parabrisas
  if ((j === 2 || j === 4) && k >= 2 && k <= 4) return [GLASS, M.GLASS]; // ventanillas
  return [paint, M.PAINT];
}

export function buildLambo(paint) {
  const g = [];
  loft(g, [
    lamboSection(-31, 13.5, 10, 11.5, 13), lamboSection(-24, 14.5, 11, 11.5, 14.5),
    lamboSection(-14, 15, 11.5, 10, 17), lamboSection(-2, 15, 11.5, 9, 18),
    lamboSection(6, 15, 11, 9.5, 17), lamboSection(18, 15, 9.5, 12, 10.5),
    lamboSection(27, 14.5, 7, 12, 7.5), lamboSection(34, 12, 4, 10, 5.5)
  ], (k, j) => lamboStyle(k, j, paint));
  bothSides(s => { wheel(g, -19, 14.8 * s, 7.4, 7); wheel(g, 20, 14.8 * s, 6.8, 6); });
  lamboAero(g, paint);
  lamboLights(g);
  return g;
}

function wheel(g, x, z, r, w) {
  cylinderZ(g, x, r, z, r, w, '#151515', M.MATTE);              // neumático
  cylinderZ(g, x, r, z, r * 0.62, w + 0.6, '#c9c9c9', M.CHROME, 14); // llanta
  cylinderZ(g, x, r, z, r * 0.2, w + 1, '#222222', M.CHROME, 8);     // buje
}

function lamboAero(g, paint) {
  box(g, 27, 35, 1.2, 3, -12.5, 12.5, '#0b0b0b', M.MATTE);           // splitter
  box(g, -33, -29, 1.5, 6, -12, 12, '#0b0b0b', M.MATTE);             // difusor
  box(g, -31.5, -30.6, 6, 11.5, -9, 9, '#0b0b0b', M.MATTE);          // rejilla trasera
  box(g, -35, -27.5, 18.5, 20, -15.5, 15.5, '#101010', M.PAINT);     // alerón
  bothSides(s => {
    box(g, -31, -29, 12.5, 18.5, ...sideZ(6, 8, s), '#101010', M.MATTE); // soportes del alerón
    box(g, -13, -3, 5, 10, ...sideZ(14.9, 15.5, s), '#080808', M.MATTE); // tomas de aire
    box(g, 8, 12, 12.5, 14.5, ...sideZ(15, 18.5, s), paint, M.PAINT);     // retrovisores
  });
}

function lamboLights(g) {
  bothSides(s => {
    box(g, -31.7, -30.8, 9, 10.5, ...sideZ(6, 13.5, s), '#ff1424', M.EMIT);  // pilotos en Y
    box(g, -31.7, -30.8, 6.5, 10.5, ...sideZ(12, 13.5, s), '#ff1424', M.EMIT);
    box(g, 30, 33.6, 5, 6.3, ...sideZ(5, 10.5, s), '#eaf4ff', M.EMIT);        // faros
  });
  box(g, -32.4, -30.8, 4, 7, -3.5, 3.5, '#bdbdbd', M.CHROME);   // escape
  box(g, -32.6, -32.3, 4.8, 6.2, -2.6, 2.6, '#050505', M.MATTE);
}

// ---- Kart de los rivales ----
export function buildKart(color) {
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

// ---- Objetos y efectos ----
export function buildItemBox() {
  const g = [];
  box(g, -13, 13, -13, 13, -13, 13, '#ffffff', M.RAINBOW);
  return g;
}

export function buildBanana() {
  const g = [];
  for (let i = 0; i < 6; i++) {
    const a = -0.9 + i * 0.36, x = Math.sin(a) * 10, z = Math.cos(a) * 10 - 10;
    const tip = i === 0 || i === 5;
    box(g, x - 2.2, x + 2.2, 0.5, tip ? 3 : 4.5, z - 2.2, z + 2.2, tip ? '#5d4037' : '#ffd21f', M.PAINT);
  }
  return g;
}

// Coco: una bola marrón de pocas caras (centrada en el origen para que pueda rodar)
export const COCO_R = 9;
export function buildCoco() {
  const g = [], rings = 7, sides = 9;
  const secs = [];
  for (let i = 0; i <= rings; i++) {
    const a = Math.PI * i / rings, r = Math.max(0.01, Math.sin(a) * COCO_R);
    secs.push({ x: -Math.cos(a) * COCO_R, pts: Array.from({ length: sides }, (_, j) => {
      const b = Math.PI * 2 * j / sides;
      return [Math.cos(b) * r, Math.sin(b) * r];
    }) });
  }
  loft(g, secs, (k, j) => [(k + j) % 3 ? '#6b4423' : '#4a2c14', M.MATTE]);
  box(g, COCO_R - 1.5, COCO_R + 0.5, -1.2, 1.2, -1.2, 1.2, '#2a170a', M.MATTE); // "ojos" del coco
  return g;
}

// Placa de hielo sobre la pista, de seg a seg + segs, de borde a borde (coordenadas del mundo)
export function buildIce(points, seg, segs, halfWidth) {
  const g = [], N = points.length;
  // f: 0..segs a lo largo, s: -1..1 de lado a lado
  const at = (f, s, y) => {
    const i = Math.min(Math.floor(f), segs - 1), t = f - i;
    const p = points[(seg + i) % N], q = points[(seg + i + 1) % N];
    const x = p.x + (q.x - p.x) * t, z = p.y + (q.y - p.y) * t, a = p.a + Math.atan2(Math.sin(q.a - p.a), Math.cos(q.a - p.a)) * t;
    return [x - Math.sin(a) * halfWidth * s, (p.h || 0) + (q.h - p.h || 0) * t + y, z + Math.cos(a) * halfWidth * s];
  };
  const quad = (f0, f1, s0, s1, y, col) =>
    quadN(g, [at(f0, s0, y), at(f0, s1, y), at(f1, s1, y), at(f1, s0, y)], [UP, UP, UP, UP], col, M.GLASS);
  for (let i = 0; i < segs; i++) quad(i, i + 1, -1, 1, 1.2, [0.42, 0.72, 0.95]); // capa azul
  // trozos más claros repartidos encima, como placas de hielo agrietado
  let r = seg * 9301 + 49297;
  const rnd = () => (r = (r * 9301 + 49297) % 233280) / 233280;
  for (let k = 0; k < 14; k++) {
    const f = rnd() * (segs - 0.6), s = rnd() * 1.7 - 0.95, w = 0.15 + rnd() * 0.2;
    quad(f, f + 0.3 + rnd() * 0.4, s, s + w, 1.6, rnd() < 0.5 ? [0.85, 0.95, 1] : [0.66, 0.86, 1]);
  }
  return g;
}

// Llama del turbo detrás del coche
export function buildFlame(len) {
  const g = [], sq = r => [[-r, 5.5 - r], [r, 5.5 - r], [r, 5.5 + r], [-r, 5.5 + r]];
  loft(g, [{ x: -32.5, pts: sq(3) }, { x: -40, pts: sq(2.6) }, { x: -32.5 - len, pts: sq(0.3) }], () => ['#ff6a00', M.EMIT]);
  loft(g, [{ x: -32.6, pts: sq(1.6) }, { x: -32.6 - len * 0.6, pts: sq(0.2) }], () => ['#ffe066', M.EMIT]);
  return g;
}

// Cono de luz de los faros sobre el suelo (uv.x = distancia al coche, uv.y = de lado a lado)
export function buildHeadlights() {
  const g = [], y = 0.8;
  quadN(g, [[34, y, -14], [34, y, 14], [230, y, 80], [230, y, -80]], [UP, UP, UP, UP],
        [1, 0.93, 0.75], M.HEADLIGHT, [[0, 0], [0, 1], [1, 1], [1, 0]]);
  return g;
}

// Sombra suave de contacto bajo cada coche
export function buildBlob() {
  const g = [];
  quadN(g, [[-38, 0.9, -21], [38, 0.9, -21], [38, 0.9, 21], [-38, 0.9, 21]], [UP, UP, UP, UP],
        [0, 0, 0], M.BLOB, [[0, 0], [1, 0], [1, 1], [0, 1]]);
  return g;
}
