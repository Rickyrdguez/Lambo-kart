// Inteligencia artificial de los rivales.
import { angDiff, clamp } from '../core/math.js';
import { pointAt } from './track.js';
import { game } from './state.js';
import { progress } from './race.js';

// Apunta a un punto de la pista unos segmentos por delante y frena en las curvas cerradas
export function aiInput(c) {
  const t = pointAt(c.seg + c.look, c.lane);
  const diff = angDiff(Math.atan2(t.y - c.y, t.x - c.x), c.angle);
  const brake = Math.abs(diff) > 1.3 && c.speed > 4;
  return { up: !brake, down: brake, turn: clamp(diff * 2.5, -1, 1) };
}

// "Goma elástica": la IA acelera si va detrás del jugador que va primero y frena un poco
// si va delante, para que la carrera esté igualada.
export function rubberBand() {
  const lead = Math.max(...game.cars.filter(c => c.human).map(progress));
  game.cars.forEach(c => {
    if (!c.human) c.maxSpeed = c.base + (progress(c) < lead ? 0.4 : -0.4);
  });
}
