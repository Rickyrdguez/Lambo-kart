// Creación de coches y quién controla cada uno.
import { GRID, PLAYER_COLORS, KARTS, MAX_PLAYERS } from '../config.js';
import { track, pointAt } from './track.js';
import { game } from './state.js';
import { makeBoxes } from './items.js';
import { net, isHost } from '../net/network.js';

export function makeCar(id, name, color, human) {
  const [seg, lane] = GRID[id], p = pointAt(seg, lane);
  const base = human ? 9 : 8.2 + Math.random() * 0.6; // velocidad máxima
  return {
    id, name, color, human,
    model: human ? 'lambo' : 'kart',
    x: p.x, y: p.y, angle: track.points[seg].a, speed: 0,
    z: 0, vz: 0, air: 0, pitch: 0,              // altura, velocidad vertical, tiempo en el aire, inclinación
    sink: 0, onShortcut: false,                 // hundiéndose en el agua, yendo por un atajo
    seg, lap: 0, done: false, offTrack: false,
    item: null, boost: 0, spin: 0,
    base, maxSpeed: base,
    lane: human ? 0 : Math.random() * 80 - 40,  // carril que sigue la IA
    look: 10 + Math.floor(Math.random() * 4),   // cuántos segmentos mira por delante la IA
    net: null                                   // última posición recibida por red
  };
}

// humans = [{ id, name }] jugadores conectados; el resto de huecos son karts con IA
export function resetRace(humans) {
  game.cars = Array.from({ length: MAX_PLAYERS }, (_, i) => {
    const h = humans.find(p => p.id === i);
    return h ? makeCar(i, h.name, PLAYER_COLORS[i], true) : makeCar(i, KARTS[i][0], KARTS[i][1], false);
  });
  game.bananas = [];
  game.finishOrder = [];
  makeBoxes();
}

// Mi coche
export const me = () => game.cars[net.myId] || game.cars[0];

// Coches que simula este ordenador: el mío y, si soy el anfitrión, los de la IA
export function owned(c) {
  return (c.id === net.myId && c.human) || (isHost() && !c.human);
}
