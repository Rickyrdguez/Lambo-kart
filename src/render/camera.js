// Cámara trasera estilo GTA y matriz de la luz para las sombras.
import { FOV_DEG, CAM_DIST, CAM_H, SHADOW_RANGE } from '../config.js';
import { UP, angDiff, norm3, sub3, cross3 } from '../core/math.js';
import { mat4Mul, perspective, ortho, lookAt, IDENTITY } from '../core/mat4.js';
import { me } from '../game/cars.js';
import { track } from '../game/track.js';

// a = ángulo de la cámara (sigue al coche con retraso). VP = última matriz usada
export const cam = { a: 0, VP: IDENTITY };

export function snapCamera() {
  cam.a = me().angle;
}

export function updateCamera(dt) {
  cam.a += angDiff(me().angle, cam.a) * Math.min(1, 0.08 * dt);
}

export function cameraView(aspect) {
  const p = me(), fx = Math.cos(cam.a), fz = Math.sin(cam.a);
  // al saltar, la cámara sube con el coche (algo menos, para que se note el salto)
  const eye = [p.x - fx * CAM_DIST, CAM_H + p.z * 0.6, p.y - fz * CAM_DIST];
  const target = [p.x + fx * 90, 12 + p.z * 0.8, p.y + fz * 90];
  const fovH = (FOV_DEG + Math.min(9, Math.abs(p.speed) * 0.6)) * Math.PI / 180; // más velocidad, más campo
  const tanY = Math.min(Math.tan(fovH / 2) / aspect, Math.tan(0.6));
  const VP = mat4Mul(perspective(2 * Math.atan(tanY), aspect, 4, 16000), lookAt(eye, target, UP));
  const fwd = norm3(sub3(target, eye)), right = norm3(cross3(fwd, UP)), up = cross3(right, fwd);
  cam.VP = VP;
  return { VP, eye, fwd, right, up, tan: [tanY * aspect, tanY] };
}

// La zona con sombras sigue al jugador, un poco por delante. Se ajusta a una rejilla
// para que las sombras no "tiemblen" al moverse.
export function lightMatrix() {
  const p = me(), step = 16;
  const cx = Math.round((p.x + Math.cos(cam.a) * 400) / step) * step;
  const cz = Math.round((p.y + Math.sin(cam.a) * 400) / step) * step;
  const sun = track.map.theme.sun;
  const eye = [cx + sun[0] * 3000, sun[1] * 3000, cz + sun[2] * 3000];
  return mat4Mul(ortho(SHADOW_RANGE, 1000, 5000), lookAt(eye, [cx, 0, cz], UP));
}

// Punto 3D (x, altura, y del mapa) -> píxel de pantalla, o null si queda detrás
export function projectToScreen(x, h, y, width, height) {
  const m = cam.VP, p = [x, h, y];
  const cl = [0, 1, 3].map(r => m[r] * p[0] + m[4 + r] * p[1] + m[8 + r] * p[2] + m[12 + r]);
  if (cl[2] <= 1) return null;
  return { x: (cl[0] / cl[2] * 0.5 + 0.5) * width, y: (0.5 - cl[1] / cl[2] * 0.5) * height, s: 300 / cl[2] };
}
