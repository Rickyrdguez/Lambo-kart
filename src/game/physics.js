// Física arcade: aceleración, giro, derrapes por plátano y choques entre coches.
import { CAR_RADIUS } from '../config.js';
import { game } from './state.js';
import { owned } from './cars.js';

const ACCEL = 0.18, BRAKE = 0.3, FRICTION = 0.985, TURN = 0.055;
const OFFTRACK_SLOWDOWN = 0.45, BOOST = 1.6;

// inp = { up, down, turn }   dt = fotogramas transcurridos (1 = 60 fps)
export function physics(c, inp, dt) {
  if (c.spin > 0) spinOut(c, dt);
  else drive(c, inp, dt);
  c.x += Math.cos(c.angle) * c.speed * dt;
  c.y += Math.sin(c.angle) * c.speed * dt;
}

function drive(c, inp, dt) {
  let max = c.maxSpeed * (c.offTrack ? OFFTRACK_SLOWDOWN : 1);
  if (c.boost > 0) { c.boost -= dt; max *= BOOST; c.speed = max; }
  else if (inp.up && c.speed < max) c.speed = Math.min(max, c.speed + ACCEL * dt);
  else if (inp.down) c.speed -= BRAKE * dt;
  else c.speed *= Math.pow(FRICTION, dt);
  if (c.speed > max) c.speed -= (c.speed - max) * 0.08 * dt; // frena poco a poco al salirse
  if (c.speed < -3) c.speed = -3;
  // a poca velocidad se gira menos, y marcha atrás el giro se invierte
  const grip = Math.min(1, Math.abs(c.speed) / 4) * Math.sign(c.speed);
  c.angle += inp.turn * TURN * grip * dt;
}

// Trompo al pisar un plátano
function spinOut(c, dt) {
  c.spin -= dt;
  c.angle += 0.25 * dt;
  c.speed *= Math.pow(0.94, dt);
}

// Separa coches que se solapan. Cada ordenador solo empuja los coches que simula.
export function collideCars() {
  const cars = game.cars, minDist = CAR_RADIUS * 2;
  for (let i = 0; i < cars.length; i++) {
    for (let j = i + 1; j < cars.length; j++) {
      const a = cars[i], b = cars[j];
      const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
      if (d === 0 || d >= minDist) continue;
      const push = (minDist - d) / 2, nx = dx / d, ny = dy / d;
      if (owned(a)) { a.x -= nx * push; a.y -= ny * push; a.speed *= 0.97; }
      if (owned(b)) { b.x += nx * push; b.y += ny * push; b.speed *= 0.97; }
    }
  }
}
