// Empezar, repetir y volver al menú (solo u online).
import { game, setState } from './state.js';
import { resetRace } from './cars.js';
import { snapCamera } from '../render/camera.js';
import { net, send } from '../net/network.js';
import { hideUI, playerName } from '../ui/menu.js';

export function startRace(humans) {
  resetRace(humans);
  snapCamera();
  net.inRace = true;
  setState('countdown');
  game.countdown = 3;
  hideUI();
}

// Solo lo llama el anfitrión (o quien juega solo): empieza la carrera para todos
export function hostStart() {
  const humans = net.online ? net.lobby.map(p => ({ id: p.id, name: p.name })) : [{ id: 0, name: playerName() }];
  send({ t: 'start', humans });
  startRace(humans);
}

// Escena de fondo del menú
export function showMenuScene() {
  game.state = 'menu';
  resetRace([{ id: 0, name: playerName() }]);
  snapCamera();
}
