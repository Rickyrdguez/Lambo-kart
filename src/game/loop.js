// Looping vertical (Parque de Atracciones).
//
// El juego es en 2D con alturas, así que el looping va "sobre raíles": al cruzar su entrada,
// el coche deja de conducir y recorre una circunferencia vertical (theta de 0 a 2π) a su
// velocidad. Como en los loopings de verdad, la salida queda desplazada a un lado para no
// chocar con la entrada: se entra por la mitad izquierda de la pista y se sale por la derecha.
// Antes y después hay muros que llevan a los coches a su mitad de la pista.
import { TRACK_WIDTH } from '../config.js';
import { track } from './track.js';

export const LOOP_SHIFT = 110;      // cuánto se desplaza el coche de lado entre entrada y salida
export const LOOP_LANE = 50;        // media anchura del carril del looping
const LOOP_MIN_SPEED = 10;          // si alguien llega lento, el looping le empuja hasta aquí
const LANE_MAX = -LOOP_LANE + 29;   // lado del coche más a la derecha al entrar (centro del coche)
const LANE_MIN = -LOOP_LANE - 40;
const OPEN = TRACK_WIDTH / 2 - 14;  // límite normal de la pista
const ENTRY_TAPER = [-300, -140];   // (distancia a lo largo) donde el muro de entrada se va cerrando
const EXIT_TAPER = [135, 260];      // y donde el de salida se va abriendo

const smooth = t => t * t * (3 - 2 * t);
const lerp = (a, b, t) => a + (b - a) * t;
const TAU = Math.PI * 2;

// Coordenadas de (x, y) respecto a la base del looping: along (hacia delante) y side (derecha)
function local(L, x, y) {
  const dx = x - L.x, dy = y - L.y, c = Math.cos(L.a), s = Math.sin(L.a);
  return { along: dx * c + dy * s, side: -dx * s + dy * c };
}

// Lateral del centro del carril en cada punto del looping (de la mitad izquierda a la derecha)
export const loopSide = (lin, theta) => lin + LOOP_SHIFT * smooth(Math.min(1, theta / TAU));

// Posición 3D en el looping: radio r (R = superficie por la que rueda el coche)
export function loopPoint(L, theta, side, r = L.R) {
  const along = r * Math.sin(theta), up = L.R - r * Math.cos(theta);
  const c = Math.cos(L.a), s = Math.sin(L.a);
  return { x: L.x + c * along - s * side, y: L.y + s * along + c * side, z: L.h + up };
}

function setPose(c, L) {
  const p = loopPoint(L, c.loop, loopSide(c.loopLane, c.loop));
  c.x = p.x; c.y = p.y; c.z = p.z;
  c.pitch = c.loop;          // el morro gira con el looping (boca abajo arriba del todo)
  c.angle = L.a;
}

// ¿Está entrando en el looping? Llamar después de mover el coche. Devuelve true si entra.
export function enterLoop(c) {
  const L = track.loop;
  if (!L || c.loop >= 0 || c.air > 0 || c.speed <= 0 || !nearLoop(c.seg, -8, 3)) return false;
  const { along, side } = local(L, c.x, c.y);
  if (along < 0 || along > 40 || side > 0) return false;
  c.loop = along / L.R;
  c.loopLane = Math.max(LANE_MIN, Math.min(LANE_MAX, side));
  c.slide = 0;
  setPose(c, L);
  return true;
}

// Recorre el looping; al terminar, sigue por la pista con la velocidad que llevaba
export function rideLoop(c, dt) {
  const L = track.loop;
  c.speed = Math.max(c.speed, LOOP_MIN_SPEED);
  if (c.boost > 0) c.boost -= dt;
  c.loop += c.speed * dt / L.R;
  if (c.loop < TAU) return setPose(c, L);
  const extra = (c.loop - TAU) * L.R; // lo que ha avanzado de más después de la salida
  c.loop = TAU;
  setPose(c, L);
  c.x += Math.cos(L.a) * extra;
  c.y += Math.sin(L.a) * extra;
  Object.assign(c, { loop: -1, z: L.h, ground: L.h, vz: 0, air: 0, pitch: 0, seg: L.seg });
}

// Igual que rideLoop pero para dibujar coches de otros jugadores (sin tocar su velocidad)
export function loopPose(c, theta, lane) {
  const L = track.loop;
  c.loop = Math.min(theta, TAU);
  c.loopLane = lane;
  setPose(c, L);
}

const nearLoop = (seg, k0, k1) => {
  const k = seg - track.loop.seg;
  const d = ((k + track.N / 2) % track.N + track.N) % track.N - track.N / 2;
  return d >= k0 && d <= k1;
};

// Límites laterales (centro del coche) antes y después del looping, o null si no hay muro.
// Sirve para empujar a los coches y para dibujar los muros.
export function loopLimits(along) {
  if (along >= ENTRY_TAPER[0] && along < 0) {
    const t = smooth(Math.min(1, (along - ENTRY_TAPER[0]) / (ENTRY_TAPER[1] - ENTRY_TAPER[0])));
    return { min: -OPEN, max: lerp(OPEN, LANE_MAX, t) };
  }
  if (along >= 0 && along <= EXIT_TAPER[1]) {
    const t = smooth(Math.max(0, (along - EXIT_TAPER[0]) / (EXIT_TAPER[1] - EXIT_TAPER[0])));
    return { min: lerp(-LANE_MAX, -OPEN, t), max: OPEN };
  }
  return null;
}

// Muros de entrada y salida: si el coche se pasa, vuelve a su mitad de la pista
export function keepInLoopLane(c) {
  const L = track.loop;
  if (!L || c.loop >= 0 || c.z > L.h + 30 || !nearLoop(c.seg, -20, 16)) return;
  const { along, side } = local(L, c.x, c.y), lim = loopLimits(along);
  if (!lim || (side >= lim.min && side <= lim.max)) return;
  const push = (side < lim.min ? lim.min : lim.max) - side;
  c.x += -Math.sin(L.a) * push;
  c.y += Math.cos(L.a) * push;
  c.speed *= 0.99;
}

// Carril que debe seguir la IA cerca del looping (o null para usar el suyo)
export function loopAiLane(seg) {
  if (!track.loop) return null;
  if (nearLoop(seg, -30, 0)) return -LOOP_LANE - 5;
  if (nearLoop(seg, 1, 10)) return LOOP_LANE + 5;
  return null;
}
