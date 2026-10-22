// Física arcade: aceleración, giro, saltos en rampas, trompos por plátano y choques entre coches.
import { CAR_RADIUS } from '../config.js';
import { clamp } from '../core/math.js';
import { game } from './state.js';
import { rampUnder } from './track.js';
import { owned } from './cars.js';

const ACCEL = 0.18, BRAKE = 0.3, FRICTION = 0.985, TURN = 0.055;
const OFFTRACK_SLOWDOWN = 0.45, SHORTCUT_SLOWDOWN = 0.85, BOOST = 1.6;
const GRAVITY = 0.12;        // unidades/fotograma² hacia abajo
const AIR_TURN = 0.3;        // en el aire se gira mucho menos
const LANDING_BOOST = 25;    // mini-turbo al aterrizar tras un buen salto
const MIN_JUMP_FOR_BOOST = 15;

// inp = { up, down, turn }   dt = fotogramas transcurridos (1 = 60 fps)
export function physics(c, inp, dt) {
  if (c.spin > 0) spinOut(c, dt);
  else if (c.air > 0) c.angle += inp.turn * TURN * AIR_TURN * dt; // en el aire solo se gira un poco
  else drive(c, inp, dt);
  c.x += Math.cos(c.angle) * c.speed * dt;
  c.y += Math.sin(c.angle) * c.speed * dt;
  updateHeight(c, dt);
}

function drive(c, inp, dt) {
  const terrain = c.onShortcut ? SHORTCUT_SLOWDOWN : c.offTrack ? OFFTRACK_SLOWDOWN : 1;
  let max = c.maxSpeed * terrain;
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

// Sobre una rampa el coche sube pegado a ella; al acabarse la rampa sigue subiendo con la
// velocidad vertical que llevaba y la gravedad lo hace caer.
function updateHeight(c, dt) {
  const ramp = rampUnder(c.x, c.y), ground = ramp ? ramp.h : 0;
  if (c.z > ground + 0.5) {
    c.air += dt;
    c.vz -= GRAVITY * dt;
    c.z += c.vz * dt;
    if (c.z <= ground) land(c, ground);
  } else {
    c.z = ground;
    c.vz = ramp ? c.speed * ramp.slope : 0;
    c.air = 0;
  }
  const target = c.air > 0 ? clamp(Math.atan2(c.vz, Math.max(1, Math.abs(c.speed))), -0.5, 0.5)
    : ramp ? Math.atan(ramp.slope) : 0;
  c.pitch += (target - c.pitch) * Math.min(1, 0.3 * dt);
}

function land(c, ground) {
  if (c.air > MIN_JUMP_FOR_BOOST) c.boost = Math.max(c.boost, LANDING_BOOST);
  c.z = ground;
  c.vz = 0;
  c.air = 0;
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
      if (Math.abs(a.z - b.z) > 15) continue; // uno pasa volando por encima del otro
      const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
      if (d === 0 || d >= minDist) continue;
      const push = (minDist - d) / 2, nx = dx / d, ny = dy / d;
      const friction = a.air > 0 || b.air > 0 ? 1 : 0.97; // rozarse en el aire no frena (si no, no se llega al otro lado)
      if (owned(a)) { a.x -= nx * push; a.y -= ny * push; a.speed *= friction; }
      if (owned(b)) { b.x += nx * push; b.y += ny * push; b.speed *= friction; }
    }
  }
}
