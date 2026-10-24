// Matrices 4x4 en formato column-major, como las espera WebGL.
import { norm3, sub3, cross3, dot3 } from './math.js';

export function mat4Mul(a, b) {
  const o = new Float32Array(16);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
    let s = 0;
    for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
    o[c * 4 + r] = s;
  }
  return o;
}

export function perspective(fovy, aspect, n, f) {
  const t = 1 / Math.tan(fovy / 2), nf = 1 / (n - f);
  return new Float32Array([t / aspect, 0, 0, 0, 0, t, 0, 0, 0, 0, (f + n) * nf, -1, 0, 0, 2 * f * n * nf, 0]);
}

// Proyección ortográfica cuadrada de lado 2*s (para el mapa de sombras)
export function ortho(s, n, f) {
  return new Float32Array([1 / s, 0, 0, 0, 0, 1 / s, 0, 0, 0, 0, -2 / (f - n), 0, 0, 0, -(f + n) / (f - n), 1]);
}

export function lookAt(eye, target, up) {
  const z = norm3(sub3(eye, target)), x = norm3(cross3(up, z)), y = cross3(z, x);
  return new Float32Array([x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0,
    -dot3(x, eye), -dot3(y, eye), -dot3(z, eye), 1]);
}

// Coloca un modelo (x delante, y arriba, z derecha) en el mapa 2D del juego:
// (x, y) del mapa pasan a ser (X, Z) en 3D, "angle" gira alrededor del eje vertical
// "pitch" levanta o baja el morro (rampas y saltos) y "roll" inclina hacia un lado (peraltes).
export function modelMatrix(x, y, angle, height = 0, pitch = 0, roll = 0) {
  const c = Math.cos(angle), s = Math.sin(angle), cp = Math.cos(pitch), sp = Math.sin(pitch);
  const X = [c * cp, sp, s * cp], Y = [-c * sp, cp, -s * sp], Z = [-s, 0, c];
  const cr = Math.cos(roll), sr = Math.sin(roll);
  const Y2 = Y.map((v, i) => v * cr + Z[i] * sr), Z2 = Z.map((v, i) => -Y[i] * sr + v * cr);
  return new Float32Array([...X, 0, ...Y2, 0, ...Z2, 0, x, height, y, 1]);
}

// w = 1 para puntos, w = 0 para direcciones (normales)
export function transformPoint(m, p, w = 1) {
  return [0, 1, 2].map(r => m[r] * p[0] + m[4 + r] * p[1] + m[8 + r] * p[2] + m[12 + r] * w);
}

export const IDENTITY = modelMatrix(0, 0, 0);
