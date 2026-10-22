// Reglas de la carrera: actualización de cada fotograma, vueltas, posiciones, llegada,
// placas de turbo, atajos y caídas al agua.
import { LAPS, TRACK_WIDTH } from '../config.js';
import { track, nearestSeg, pointAt, shortcutAt, onBoostPad, isWater, waterRangeAt } from './track.js';
import { game, setState } from './state.js';
import { owned } from './cars.js';
import { physics, collideCars } from './physics.js';
import { aiInput, rubberBand } from './ai.js';
import { playerInput } from './input.js';
import { updateBoxes, updateBananas, useItem } from './items.js';
import { net, isHost, followNet } from '../net/network.js';

const PAD_BOOST = 45;  // fotogramas de turbo al pisar una placa
const SINK_TIME = 70;  // fotogramas hundiéndose antes de reaparecer

export function updateRace(dt) {
  if (game.goTimer > 0) game.goTimer -= dt;
  if (isHost() && game.state === 'countdown') {
    game.countdown -= dt / 60;
    if (game.countdown <= 0) setState('race');
  }
  if (game.state !== 'race') return;
  if (isHost()) rubberBand();
  game.cars.forEach(c => owned(c) ? updateCar(c, dt) : followNet(c, dt));
  collideCars();
  if (!isHost()) return; // objetos y llegada los decide el anfitrión
  updateBoxes(dt);
  updateBananas();
  updateFinish();
}

function updateCar(c, dt) {
  if (c.sink > 0) return updateSink(c, dt);
  const mine = c.id === net.myId && c.human;
  const inp = mine && !c.done ? playerInput() : aiInput(c); // al terminar, piloto automático
  physics(c, inp, dt);
  updateProgress(c);
  if (!c.human && c.item && Math.random() < 0.006 * dt) useItem(c);
}

// Cuenta una vuelta cuando el segmento salta del final al principio de la pista
function updateProgress(c) {
  let { i, d } = nearestSeg(c.x, c.y, c.seg);
  const shortcut = shortcutAt(c.x, c.y);
  c.onShortcut = shortcut >= 0;
  if (c.onShortcut) { i = shortcut; d = 0; } // en el atajo se avanza como si fuera por la pista
  if (i < c.seg - track.N / 2) c.lap++;
  else if (i > c.seg + track.N / 2) c.lap--;
  c.seg = i;
  c.offTrack = d > TRACK_WIDTH / 2;
  if (c.air === 0) {
    if (onBoostPad(c.x, c.y)) c.boost = Math.max(c.boost, PAD_BOOST);
    if (isWater(c.x, c.y, i, d)) { c.sink = SINK_TIME; c.boost = 0; }
  }
  if (c.lap >= LAPS && !c.done) {
    c.done = true;
    c.lane = 0;
    c.look = 12;
  }
}

// Al caer al agua el coche se hunde poco a poco y luego reaparece en la pista
function updateSink(c, dt) {
  c.sink -= dt;
  c.z -= 0.35 * dt;
  c.speed *= Math.pow(0.9, dt);
  c.x += Math.cos(c.angle) * c.speed * dt;
  c.y += Math.sin(c.angle) * c.speed * dt;
  if (c.sink <= 0) respawn(c);
}

// Si cayó en la cala reaparece al otro lado; si no, en el centro de la pista donde cayó
function respawn(c) {
  const range = waterRangeAt(c.seg);
  const seg = (range && range.type === 'cove' ? range.to + 3 : c.seg) % track.N;
  const p = pointAt(seg, 0);
  Object.assign(c, { x: p.x, y: p.y, angle: track.points[seg].a, seg, speed: 0, z: 0, vz: 0, air: 0, pitch: 0, sink: 0 });
}

function updateFinish() {
  game.cars.forEach(c => { if (c.done && !game.finishOrder.includes(c)) game.finishOrder.push(c); });
}

// Número que crece cuanto más ha avanzado un coche (sirve para ordenar posiciones)
export function progress(c) {
  const i = game.finishOrder.indexOf(c);
  if (i >= 0) return 1e6 - i;
  return (c.done ? 5e5 : 0) + c.lap * track.N + c.seg;
}

export function ranking() {
  return [...game.cars].sort((a, b) => progress(b) - progress(a));
}
