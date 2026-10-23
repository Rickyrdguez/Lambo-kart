// Creación de coches y quién controla cada uno.
import { GRID, PLAYER_COLORS, KARTS, MAX_PLAYERS, MIN_CARS } from '../config.js';
import { track, pointAt } from './track.js';
import { game } from './state.js';
import { makeBoxes } from './items.js';
import { net, isHost } from '../net/network.js';

// id = hueco del jugador en la sala (0 = anfitrión); spot = posición en la parrilla de salida
export function makeCar(id, spot, name, color, human) {
  const [seg, lane] = GRID[spot], p = pointAt(seg, lane);
  const base = human ? 9 : 8.2 + Math.random() * 0.6; // velocidad máxima
  return {
    id, name, color, human,
    model: human ? 'lambo' : 'kart',
    x: p.x, y: p.y, angle: track.points[seg].a, speed: 0,
    z: 0, vz: 0, air: 0, pitch: 0,              // altura, velocidad vertical, tiempo en el aire, inclinación
    ground: 0, trackDist: 0,                    // altura del suelo bajo el coche, distancia al centro de la pista
    sink: 0, onShortcut: false, shortcutSpeed: 1, // hundiéndose en el agua, yendo por un atajo
    seg, lap: 0, done: false, offTrack: false,
    item: null, boost: 0, spin: 0,
    slide: 0, slideDir: 0,                      // patinando por el hielo y hacia dónde iba
    base, maxSpeed: base,
    lane: human ? 0 : Math.random() * 80 - 40,  // carril que sigue la IA
    look: 10 + Math.floor(Math.random() * 4),   // cuántos segmentos mira por delante la IA
    net: null                                   // última posición recibida por red
  };
}

// humans = [{ id, name }] jugadores conectados. Si son menos de MIN_CARS, karts con IA ocupan
// los huecos libres más bajos hasta llegar a MIN_CARS (con 5 o más jugadores no hay IA).
export function resetRace(humans) {
  const ids = humans.map(h => h.id);
  for (let i = 0; i < MAX_PLAYERS && ids.length < MIN_CARS; i++) if (!ids.includes(i)) ids.push(i);
  ids.sort((a, b) => a - b);
  game.cars = ids.map((id, spot) => {
    const h = humans.find(p => p.id === id);
    return h ? makeCar(id, spot, h.name, PLAYER_COLORS[id], true) : makeCar(id, spot, KARTS[id][0], KARTS[id][1], false);
  });
  game.bananas = [];
  game.coconuts = [];
  game.ices = [];
  game.finishOrder = [];
  makeBoxes();
}

// Coche de un jugador por su hueco en la sala
export const carById = id => game.cars.find(c => c.id === id);

// Mi coche
export const me = () => carById(net.myId) || game.cars[0];

// Coches que simula este ordenador: el mío y, si soy el anfitrión, los de la IA
export function owned(c) {
  return (c.id === net.myId && c.human) || (isHost() && !c.human);
}
