// Reglas de la carrera: actualización de cada fotograma, vueltas, posiciones y llegada.
import { LAPS, TRACK_WIDTH } from '../config.js';
import { track, nearestSeg } from './track.js';
import { game, setState } from './state.js';
import { owned } from './cars.js';
import { physics, collideCars } from './physics.js';
import { aiInput, rubberBand } from './ai.js';
import { playerInput } from './input.js';
import { updateBoxes, updateBananas, useItem } from './items.js';
import { net, isHost, followNet } from '../net/network.js';

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
  const mine = c.id === net.myId && c.human;
  const inp = mine && !c.done ? playerInput() : aiInput(c); // al terminar, piloto automático
  physics(c, inp, dt);
  updateProgress(c);
  if (!c.human && c.item && Math.random() < 0.006 * dt) useItem(c);
}

// Cuenta una vuelta cuando el segmento salta del final al principio de la pista
function updateProgress(c) {
  const { i, d } = nearestSeg(c.x, c.y, c.seg);
  if (i < c.seg - track.N / 2) c.lap++;
  else if (i > c.seg + track.N / 2) c.lap--;
  c.seg = i;
  c.offTrack = d > TRACK_WIDTH / 2;
  if (c.lap >= LAPS && !c.done) {
    c.done = true;
    c.lane = 0;
    c.look = 12;
  }
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
