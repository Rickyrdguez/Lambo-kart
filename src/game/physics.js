// Física arcade: aceleración, giro, saltos en rampas, trompos por plátano, patinazos en el hielo
// y choques entre coches (con empujones y pérdida de control).
import { CAR_RADIUS } from '../config.js';
import { clamp } from '../core/math.js';
import { game } from './state.js';
import { groundAt, onWall } from './track.js';
import { owned } from './cars.js';

const ACCEL = 0.18, BRAKE = 0.3, FRICTION = 0.985, TURN = 0.055;
const OFFTRACK_SLOWDOWN = 0.45, BOOST = 1.6;
const GRAVITY = 0.12;        // unidades/fotograma² hacia abajo
const AIR_TURN = 0.3;        // en el aire se gira mucho menos
const LANDING_BOOST = 25;    // mini-turbo al aterrizar tras un buen salto
const MIN_JUMP_FOR_BOOST = 15;
export const SLIDE_TIME = 70; // fotogramas patinando sin control al pisar hielo
const RESTITUTION = 0.3;      // cuánto "rebotan" los choques (0 = se quedan pegados, 1 = rebote total)
const RAM_MASS = 2;          // quien embiste cuenta como el doble de pesado: sigue y el otro sale despedido
const KNOCK_FRICTION = 0.9;  // el empujón de un choque se frena así cada fotograma
const BUMP_MIN = 1.2;        // a partir de este golpe, el coche golpeado pierde el control un momento
const MAX_CLIMB = 3.5;       // velocidad vertical máxima al subir pegado al suelo
const LAUNCH = 1.5;          // si el suelo cae más deprisa que el coche en caída libre (más este margen), despega

// inp = { up, down, turn }   dt = fotogramas transcurridos (1 = 60 fps)
// Mueve el coche en el plano; la altura se ajusta después con updateHeight().
export function physics(c, inp, dt) {
  if (c.bump > 0) inp = bumped(c, inp, dt); // tras un golpe fuerte, casi sin control
  if (c.spin > 0) spinOut(c, dt);
  else if (c.slide > 0) slideOut(c, dt);
  else if (c.air > 0) c.angle += inp.turn * TURN * AIR_TURN * dt; // en el aire solo se gira un poco
  else drive(c, inp, dt);
  const heading = c.slide > 0 ? c.slideDir : c.angle; // patinando, sigue hacia donde iba
  c.x += (Math.cos(heading) * c.speed + c.kx) * dt;
  c.y += (Math.sin(heading) * c.speed + c.ky) * dt;
  const f = Math.pow(KNOCK_FRICTION, dt);       // el empujón lateral se va frenando
  c.kx *= f; c.ky *= f;
}

// Golpeado: el coche gira sobre sí mismo (cada vez menos) y el volante apenas responde
function bumped(c, inp, dt) {
  c.bump = Math.max(0, c.bump - dt);
  c.angle += c.yaw * dt;
  c.yaw *= Math.pow(0.93, dt);
  return { up: inp.up, down: inp.down, turn: inp.turn * 0.25 };
}

function drive(c, inp, dt) {
  const terrain = c.onShortcut ? c.shortcutSpeed : c.offTrack ? OFFTRACK_SLOWDOWN : 1;
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

// El coche va pegado al suelo mientras este sube o baja poco a poco (rampas, puentes).
// Si el suelo cae más deprisa de lo que caería el coche volando (final de una rampa, la cima
// de un rasante, el borde de la pista en el cielo), sigue con la velocidad vertical que llevaba
// y la gravedad lo hace caer. Por la pared peraltada, en cambio, siempre va pegado. Llamar después de saber en qué segmento está.
export function updateHeight(c, dt) {
  const ground = groundAt(c);
  c.ground = ground;
  const fly = c.z + c.vz * dt - GRAVITY * dt * dt; // dónde estaría si fuera volando
  if (c.air === 0 && (ground >= fly - LAUNCH || onWall(c))) { // por la pared peraltada va pegado
    // subir o bajar con la carretera (sin pasarse: subirse de golpe a una rampa de lado no lanza al cielo)
    c.vz = Math.min(MAX_CLIMB, (ground - c.z) / Math.max(dt, 0.01));
    c.z = ground;
  } else {
    if (c.air === 0) c.takeoff = c.seg; // de dónde despegó (para reaparecer ahí si se cae)
    c.air += dt;
    c.vz -= GRAVITY * dt;
    c.z += c.vz * dt;
    if (c.z <= ground) land(c, ground);
  }
  const target = clamp(Math.atan2(c.vz, Math.max(1, Math.abs(c.speed))), -0.5, 0.5);
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

// Patinazo en el hielo: no se puede girar ni acelerar; el coche colea de un lado a otro
// cada vez menos y sigue en la dirección que llevaba
function slideOut(c, dt) {
  c.slide = Math.max(0, c.slide - dt);
  const left = c.slide / SLIDE_TIME;
  c.angle = c.slideDir + Math.sin((1 - left) * Math.PI * 5) * 0.7 * left;
  c.speed *= Math.pow(0.992, dt);
}

// Choques entre coches: se separan y se pasan el empuje como dos bolas de billar. Quien embiste
// cuenta como más pesado: pierde algo de velocidad y el golpeado sale empujado en la dirección
// del golpe; si el golpe es fuerte, además gira y pierde el control un momento.
// Cada ordenador solo cambia los coches que simula; como todos hacen la misma cuenta con las
// mismas velocidades, en red no hace falta enviar nada más.
export function collideCars() {
  const cars = game.cars, minDist = CAR_RADIUS * 2;
  for (let i = 0; i < cars.length; i++) {
    for (let j = i + 1; j < cars.length; j++) {
      const a = cars[i], b = cars[j];
      if (Math.abs(a.z - b.z) > 15 || a.loop >= 0 || b.loop >= 0) continue; // uno pasa por encima del otro
      const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
      if (d === 0 || d >= minDist) continue;
      const push = (minDist - d) / 2, n = [dx / d, dy / d];
      if (owned(a)) { a.x -= n[0] * push; a.y -= n[1] * push; }
      if (owned(b)) { b.x += n[0] * push; b.y += n[1] * push; }
      if (a.air > 0 || b.air > 0) continue;         // rozarse en el aire no frena (si no, no se llega al otro lado)
      const va = velocity(a), vb = velocity(b);
      const closing = (va[0] - vb[0]) * n[0] + (va[1] - vb[1]) * n[1]; // > 0: se están acercando
      if (closing <= 0) continue;
      // embiste el que más iba hacia el otro; el otro es el golpeado y pierde el control
      const aHits = va[0] * n[0] + va[1] * n[1] > -(vb[0] * n[0] + vb[1] * n[1]);
      const ma = aHits ? RAM_MASS : 1, mb = aHits ? 1 : RAM_MASS;
      const J = (1 + RESTITUTION) * closing / (1 / ma + 1 / mb); // impulso del choque
      if (owned(a)) hit(a, va, -J / ma, n, !aHits);
      if (owned(b)) hit(b, vb, J / mb, n, aHits);
    }
  }
}

// Velocidad real del coche: hacia donde mira más el empujón que lleve
function velocity(c) {
  const h = c.slide > 0 ? c.slideDir : c.angle;
  return [Math.cos(h) * c.speed + (c.kx || 0), Math.sin(h) * c.speed + (c.ky || 0)];
}

// Aplica el impulso J (en la dirección n) a un coche: lo que va hacia delante cambia su
// velocidad y lo que va de lado se convierte en empujón. Si es el golpeado y el golpe es fuerte,
// pierde el control y gira (más cuanto más de lado le den).
function hit(c, v, J, n, victim) {
  const h = c.slide > 0 ? c.slideDir : c.angle, fx = Math.cos(h), fy = Math.sin(h);
  const nv = [v[0] + n[0] * J, v[1] + n[1] * J];
  c.speed = nv[0] * fx + nv[1] * fy;
  c.kx = nv[0] - c.speed * fx;
  c.ky = nv[1] - c.speed * fy;
  const force = Math.abs(J), side = fx * n[1] - fy * n[0]; // side: cuánto le da de lado (y por qué lado)
  if (!victim || force < BUMP_MIN) return;
  c.bump = Math.min(70, 15 + force * 10);
  c.yaw = Math.max(-0.2, Math.min(0.2, (c.yaw || 0) + Math.sign(J) * (side || 0.3) * force * 0.03));
  c.boost = 0;
}
