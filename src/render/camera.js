// Cámara trasera estilo GTA y matriz de la luz para las sombras.
import { FOV_DEG, CAM_DIST, CAM_H, SHADOW_RANGE } from '../config.js';
import { UP, angDiff, norm3, sub3, cross3 } from '../core/math.js';
import { mat4Mul, perspective, ortho, lookAt, IDENTITY } from '../core/mat4.js';
import { me } from '../game/cars.js';
import { lookingBack } from '../game/input.js';
import { track, VOID } from '../game/track.js';

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
  // la cámara sube con la carretera (puentes) y, al saltar, algo menos que el coche para que se note
  // sin pista debajo (pista en el cielo), la referencia es la altura de la pista o el propio coche si cae
  const ground = p.ground > VOID ? p.ground || 0 : Math.min(track.points[p.seg].h, p.z), jump = p.z - ground;
  let eye = [p.x - fx * CAM_DIST, CAM_H + ground + jump * 0.6, p.y - fz * CAM_DIST];
  let target = [p.x + fx * 90, 12 + ground + jump * 0.8, p.y + fz * 90];
  let up3 = UP;
  if (p.loop >= 0) [eye, target, up3] = loopShot(p);
  else if (lookingBack()) { // delante del coche, mirando a los que vienen detrás
    eye = [p.x + fx * CAM_DIST * 0.8, CAM_H * 0.8 + ground + jump * 0.6, p.y + fz * CAM_DIST * 0.8];
    target = [p.x - fx * 90, 12 + ground + jump * 0.8, p.y - fz * 90];
  }
  const fovH = (FOV_DEG + Math.min(9, Math.abs(p.speed) * 0.6)) * Math.PI / 180; // más velocidad, más campo
  const tanY = Math.min(Math.tan(fovH / 2) / aspect, Math.tan(0.6));
  const VP = mat4Mul(perspective(2 * Math.atan(tanY), aspect, 4, 16000), lookAt(eye, target, up3));
  const fwd = norm3(sub3(target, eye)), right = norm3(cross3(fwd, up3)), up = cross3(right, fwd);
  cam.VP = VP;
  return { VP, eye, fwd, right, up, tan: [tanY * aspect, tanY] };
}

// En el looping la cámara sigue en tercera persona: la misma posición que la normal (detrás y
// encima del coche) pero girando con él, así que arriba se ve el mundo del revés. El carril del
// looping solo se dibuja por dentro, así que no tapa al coche.
function loopShot(p) {
  const th = p.loop, c = Math.cos(track.loop.a), s = Math.sin(track.loop.a);
  const fwd = [c * Math.cos(th), Math.sin(th), s * Math.cos(th)];   // hacia donde va el coche
  const up = [-c * Math.sin(th), Math.cos(th), -s * Math.sin(th)];  // hacia el centro del looping
  const car = [p.x, p.z, p.y], at = (f, u) => car.map((v, i) => v + fwd[i] * f + up[i] * u);
  const eye = at(-CAM_DIST, CAM_H);
  eye[1] = Math.max(eye[1], track.loop.h + 30); // sin meterse por debajo de la pista al subir
  return [eye, at(90, 12), up];
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
