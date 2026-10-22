// Cajas de objetos, turbo y plátanos.
import { dist } from '../core/math.js';
import { track, pointAt } from './track.js';
import { game } from './state.js';
import { owned } from './cars.js';
import { send, isHost } from '../net/network.js';

const BOX_SPOTS = [0.18, 0.45, 0.72]; // en qué parte de la vuelta hay cajas
const BOX_LANES = [-70, 0, 70];
const BOX_RESPAWN = 180;              // fotogramas hasta que reaparece una caja
const TURBO_TIME = 80, SPIN_TIME = 50;

export function makeBoxes() {
  game.boxes = [];
  (track.map.boxes || BOX_SPOTS).forEach(f => {
    const seg = Math.floor(track.N * f);
    BOX_LANES.forEach(lane => {
      const p = pointAt(seg, lane);
      game.boxes.push({ x: p.x, y: p.y, t: 0 });
    });
  });
}

export function updateBoxes(dt) {
  game.boxes.forEach(b => {
    if (b.t > 0) { b.t -= dt; return; }
    const c = game.cars.find(c => dist(b, c) < 32 && c.z < 35); // las cajas flotan a media altura
    if (!c) return;
    b.t = BOX_RESPAWN;
    if (c.item) return;
    c.item = Math.random() < 0.5 ? 'turbo' : 'banana';
    if (!owned(c)) send({ t: 'item', id: c.id, item: c.item });
  });
}

export function useItem(c) {
  if (c.item === 'turbo') c.boost = TURBO_TIME;
  if (c.item === 'banana') {
    const b = { x: c.x - Math.cos(c.angle) * 45, y: c.y - Math.sin(c.angle) * 45 };
    if (isHost()) game.bananas.push(b);
    else send({ t: 'banana', x: b.x, y: b.y });
  }
  c.item = null;
}

export function hitBanana(c) {
  c.spin = SPIN_TIME;
  c.boost = 0;
}

export function updateBananas() {
  for (let i = game.bananas.length - 1; i >= 0; i--) {
    const hit = game.cars.find(c => dist(game.bananas[i], c) < 26 && c.z < 6); // en el aire no se pisan
    if (!hit) continue;
    if (owned(hit)) hitBanana(hit);
    else send({ t: 'spin', id: hit.id });
    game.bananas.splice(i, 1);
  }
}
