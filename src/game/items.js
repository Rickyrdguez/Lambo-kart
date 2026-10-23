// Cajas de objetos: turbo, plátano, coco y hielo.
import { TRACK_WIDTH } from '../config.js';
import { dist, angDiff } from '../core/math.js';
import { track, pointAt, nearestSeg } from './track.js';
import { game } from './state.js';
import { owned, carById } from './cars.js';
import { ranking } from './race.js';
import { SLIDE_TIME } from './physics.js';
import { send, isHost } from '../net/network.js';

const BOX_SPOTS = [0.18, 0.45, 0.72]; // en qué parte de la vuelta hay cajas
const BOX_LANES = [-70, 0, 70];
const BOX_RESPAWN = 180;              // fotogramas hasta que reaparece una caja
const TURBO_TIME = 80, SPIN_TIME = 50;
export const ITEMS = ['turbo', 'banana', 'coco', 'hielo'];

const COCO_SPEED = 17;   // algo más rápido que un coche con turbo
const COCO_LIFE = 300;   // fotogramas antes de desaparecer si no da a nadie
const COCO_TURN = 0.18;  // cuánto corrige el rumbo hacia su objetivo por fotograma
const ICE_TIME = 180;    // el hielo dura 3 segundos en la pista
const ICE_LEN = 60;      // largo de la placa de hielo (de ancho ocupa toda la carretera)
const ICE_GAP = 60;      // separación entre la parte de atrás del coche y el hielo

export function makeBoxes() {
  game.boxes = [];
  (track.map.boxes || BOX_SPOTS).forEach(f => {
    const seg = Math.floor(track.N * f);
    BOX_LANES.forEach(lane => {
      const p = pointAt(seg, lane);
      game.boxes.push({ x: p.x, y: p.y, h: track.points[seg].h, t: 0 }); // h: altura de la pista (puentes)
    });
  });
}

export function updateBoxes(dt) {
  game.boxes.forEach(b => {
    if (b.t > 0) { b.t -= dt; return; }
    const c = game.cars.find(c => dist(b, c) < 32 && Math.abs(c.z - b.h) < 35); // flotan a media altura
    if (!c) return;
    b.t = BOX_RESPAWN;
    if (c.item) return;
    c.item = ITEMS[Math.random() * ITEMS.length | 0];
    if (!owned(c)) send({ t: 'item', id: c.id, item: c.item });
  });
}

// Los objetos que se quedan en la pista los lleva el anfitrión: los invitados le avisan
export function useItem(c) {
  if (c.item === 'turbo') c.boost = TURBO_TIME;
  if (c.item === 'banana') {
    const b = { x: c.x - Math.cos(c.angle) * 45, y: c.y - Math.sin(c.angle) * 45, h: c.ground };
    if (isHost()) game.bananas.push(b);
    else send({ t: 'banana', x: b.x, y: b.y, h: b.h });
  }
  if (c.item === 'coco') isHost() ? throwCoco(c) : send({ t: 'coco', id: c.id });
  if (c.item === 'hielo') {
    const seg = segBehind(c.seg, ICE_GAP + ICE_LEN); // queda detrás del coche, sin tocarlo
    isHost() ? dropIce(seg) : send({ t: 'hielo', seg });
  }
  c.item = null;
}

export function hitBanana(c) {
  c.spin = SPIN_TIME;
  c.boost = 0;
}

// Trompo para el coche que lo simula: si es de otro jugador, se le avisa
function hit(c) {
  if (owned(c)) hitBanana(c);
  else send({ t: 'spin', id: c.id });
}

export function updateBananas() {
  for (let i = game.bananas.length - 1; i >= 0; i--) {
    const b = game.bananas[i];
    const car = game.cars.find(c => dist(b, c) < 26 && Math.abs(c.z - b.h) < 6); // en el aire no se pisan
    if (!car) continue;
    hit(car);
    game.bananas.splice(i, 1);
  }
}

// ================== Coco ==================
// Sale hacia delante y persigue al coche que va justo delante en la clasificación,
// siguiendo la pista. Si el que lo lanza va primero, sigue recto por la pista.
export function throwCoco(c) {
  const order = ranking(), ahead = order[order.indexOf(c) - 1];
  game.coconuts.push({
    x: c.x + Math.cos(c.angle) * 40, y: c.y + Math.sin(c.angle) * 40, h: c.ground,
    angle: c.angle, seg: c.seg, owner: c.id, target: ahead ? ahead.id : -1, life: COCO_LIFE, roll: 0
  });
}

export function updateCoconuts(dt) {
  for (let i = game.coconuts.length - 1; i >= 0; i--) {
    const k = game.coconuts[i];
    const target = carById(k.target);
    // si el objetivo está cerca va directo a por él; si no, sigue la pista
    const near = target && !target.done && dist(k, target) < 260;
    const aim = near ? target : pointAt(k.seg + 6, 0);
    const want = Math.atan2(aim.y - k.y, aim.x - k.x);
    k.angle += angDiff(want, k.angle) * Math.min(1, COCO_TURN * dt);
    k.x += Math.cos(k.angle) * COCO_SPEED * dt;
    k.y += Math.sin(k.angle) * COCO_SPEED * dt;
    k.seg = nearestSeg(k.x, k.y, k.seg).i;
    k.h = track.points[k.seg].h;
    k.roll += 0.35 * dt;
    k.life -= dt;
    // le da al primero que se cruce (menos a quien lo ha lanzado); a los que van en el aire, no
    const car = game.cars.find(c => c.id !== k.owner && dist(k, c) < 30 && Math.abs(c.z - k.h) < 12);
    if (car) hit(car);
    if (car || k.life <= 0) game.coconuts.splice(i, 1);
  }
}

// En los invitados: entre mensaje y mensaje del anfitrión, el coco sigue rodando hacia donde iba
export function rollCoconuts(dt) {
  game.coconuts.forEach(k => {
    k.x += Math.cos(k.angle) * COCO_SPEED * dt;
    k.y += Math.sin(k.angle) * COCO_SPEED * dt;
    k.roll += 0.35 * dt;
  });
}

// ================== Hielo ==================
// Una franja corta que ocupa todo el ancho de la carretera. Va de seg hacia delante.
export function dropIce(seg) {
  game.ices.push({ seg, segs: segsFor(seg, ICE_LEN), t: ICE_TIME });
}

export function updateIces(dt) {
  game.ices.forEach(ice => { ice.t -= dt; });
  game.ices = game.ices.filter(ice => ice.t > 0);
}

// Cuántos segmentos hacen falta desde seg para cubrir una distancia
export function segsFor(seg, len) {
  let n = 0;
  for (let d = 0; d < len; n++) d += track.points[(seg + n) % track.N].len;
  return n;
}

function segBehind(seg, len) {
  let d = 0;
  while (d < len) { seg = (seg - 1 + track.N) % track.N; d += track.points[seg].len; }
  return seg;
}

// Cada ordenador comprueba los coches que simula (como las placas de turbo)
export function checkIce(c) {
  if (c.air > 0 || c.slide > 0 || c.trackDist > TRACK_WIDTH / 2) return;
  const on = game.ices.some(ice => {
    const k = (c.seg - ice.seg + track.N) % track.N;
    return k < ice.segs && Math.abs(c.z - track.points[c.seg].h) < 10;
  });
  if (!on) return;
  c.slide = SLIDE_TIME;
  c.slideDir = c.angle;
  c.boost = 0;
}
