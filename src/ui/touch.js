// Controles táctiles para móvil y tablet. En el ordenador no aparecen.
//   abajo a la izquierda: girar    abajo a la derecha: acelerar / frenar
//   a media altura a la izquierda: usar objeto
import { IS_TOUCH } from '../config.js';
import { keys } from '../game/input.js';
import { game } from '../game/state.js';
import { me } from '../game/cars.js';
import { isHost } from '../net/network.js';

const $ = id => document.getElementById(id);
const ITEM_ICONS = { banana: '🍌', turbo: '⚡' };

// Mientras se mantiene pulsado el botón, la tecla cuenta como pulsada (admite varios dedos a la vez)
function hold(btn, code) {
  const release = () => { keys[code] = false; btn.classList.remove('on'); };
  btn.addEventListener('pointerdown', e => {
    e.preventDefault();
    keys[code] = true;
    btn.classList.add('on');
    try { btn.setPointerCapture(e.pointerId); } catch {} // así se suelta aunque el dedo salga del botón
  });
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(ev => btn.addEventListener(ev, release));
}

function tap(btn, action) {
  btn.addEventListener('pointerdown', e => { e.preventDefault(); action(); });
}

// onPress recibe los mismos códigos que el teclado ('Space', 'Enter', 'Escape')
export function initTouch(onPress) {
  if (!IS_TOUCH) return;
  document.body.classList.add('touch');
  hold($('t-left'), 'ArrowLeft');
  hold($('t-right'), 'ArrowRight');
  hold($('t-up'), 'ArrowUp');
  hold($('t-down'), 'ArrowDown');
  tap($('t-item'), () => onPress('Space'));
  tap($('t-exit'), () => onPress('Escape'));
  tap($('t-menu'), () => onPress('Escape'));
  tap($('t-again'), () => onPress('Enter'));
  addEventListener('contextmenu', e => e.preventDefault()); // sin menú al mantener pulsado
}

// Cada fotograma: qué botones se ven y qué objeto lleva el jugador
export function updateTouch() {
  if (!IS_TOUCH) return;
  const racing = game.state !== 'menu', done = racing && me().done, item = me().item;
  $('touch').classList.toggle('hidden', !racing);
  $('t-pad').classList.toggle('hidden', done);
  $('t-end').classList.toggle('hidden', !done);
  $('t-again').classList.toggle('hidden', !isHost());
  const icon = ITEM_ICONS[item] || '';
  if ($('t-item').textContent !== icon) $('t-item').textContent = icon;
  $('t-item').classList.toggle('ready', !!item);
}

// Pantalla completa y en horizontal (solo se puede pedir tras tocar un botón)
export function goFullscreen() {
  if (!IS_TOUCH || document.fullscreenElement || !document.documentElement.requestFullscreen) return;
  document.documentElement.requestFullscreen()
    .then(() => screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape'))
    .catch(() => {});
}
