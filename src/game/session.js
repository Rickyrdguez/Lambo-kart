// Empezar, repetir y volver al menú (solo u online), y qué circuito se juega.
import { game, setState } from './state.js';
import { resetRace } from './cars.js';
import { getMap, resolveMap, RANDOM_MAP } from './maps.js';
import { track, buildTrack } from './track.js';
import { snapCamera } from '../render/camera.js';
import { loadWorld } from '../render/renderer.js';
import { net, send } from '../net/network.js';
import { hideUI, playerName } from '../ui/menu.js';

// mapChoice: id de un circuito o 'random'. En multijugador lo elige el anfitrión.
export const session = { mapChoice: RANDOM_MAP };

// Construye la pista y el escenario si el circuito es distinto del actual
export function loadMap(id) {
  if (track.map && track.map.id === id) return;
  buildTrack(getMap(id));
  loadWorld();
}

export function startRace(humans, mapId) {
  loadMap(mapId);
  resetRace(humans);
  snapCamera();
  net.inRace = true;
  setState('countdown');
  game.countdown = 3;
  hideUI();
}

// Solo lo llama el anfitrión (o quien juega solo): elige el circuito y empieza para todos.
// Con "Aleatorio" se sortea un circuito nuevo en cada carrera.
export function hostStart() {
  const humans = net.online ? net.lobby.map(p => ({ id: p.id, name: p.name })) : [{ id: 0, name: playerName() }];
  const map = resolveMap(session.mapChoice);
  send({ t: 'start', humans, map });
  startRace(humans, map);
}

// Escena de fondo del menú (en el último circuito cargado)
export function showMenuScene() {
  game.state = 'menu';
  resetRace([{ id: 0, name: playerName() }]);
  snapCamera();
}
