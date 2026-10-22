// Controles táctiles para móvil y tablet. En el ordenador no aparecen.
//   abajo a la izquierda: ◀ ▶ girar      abajo a la derecha: ▼ frenar  ▲ acelerar (como pedales)
//   encima de ◀ ▶: usar objeto           arriba, junto al objeto: ✕ salir
//
// En vez de fiarse de los eventos de cada botón (iOS a veces cancela un dedo cuando hay dos en
// pantalla), en cada movimiento se mira dónde está CADA dedo y qué botón tiene debajo. Así se
// pueden pulsar varios a la vez y deslizar el pulgar de un botón a otro sin levantarlo.
import { IS_TOUCH } from '../config.js';
import { keys } from '../game/input.js';
import { game } from '../game/state.js';
import { me } from '../game/cars.js';
import { isHost } from '../net/network.js';

const $ = id => document.getElementById(id);
const DRIVE = [['t-left', 'ArrowLeft'], ['t-right', 'ArrowRight'], ['t-up', 'ArrowUp'], ['t-down', 'ArrowDown']];
const ITEM_ICONS = { banana: '🍌', turbo: '⚡' };
const REACH = 0.8; // un dedo cuenta si está a menos de 0,8 veces el ancho del botón de su centro

// Botón de conducción más cercano a un dedo (con un margen generoso alrededor)
function buttonAt(x, y) {
  let best = null, bestDist = Infinity;
  for (const [id, code] of DRIVE) {
    const r = $(id).getBoundingClientRect();
    const d = Math.hypot(x - (r.left + r.width / 2), y - (r.top + r.height / 2));
    if (d < r.width * REACH && d < bestDist) { bestDist = d; best = code; }
  }
  return best;
}

function syncFingers(e) {
  e.preventDefault();
  const pressed = new Set();
  for (const t of e.touches) {
    const code = buttonAt(t.clientX, t.clientY);
    if (code) pressed.add(code);
  }
  DRIVE.forEach(([id, code]) => {
    keys[code] = pressed.has(code);
    $(id).classList.toggle('on', keys[code]);
  });
}

function tap(btn, action) {
  btn.addEventListener('touchstart', e => { e.preventDefault(); action(); }, { passive: false });
  btn.addEventListener('click', action); // por si se usa con ratón
}

// onPress recibe los mismos códigos que el teclado ('Space', 'Enter', 'Escape')
export function initTouch(onPress) {
  if (!IS_TOUCH) return;
  document.body.classList.add('touch');
  const pad = $('t-drive');
  ['touchstart', 'touchmove', 'touchend', 'touchcancel'].forEach(ev => pad.addEventListener(ev, syncFingers, { passive: false }));
  tap($('t-item'), () => onPress('Space'));
  tap($('t-exit'), () => onPress('Escape'));
  tap($('t-menu'), () => onPress('Escape'));
  tap($('t-again'), () => onPress('Enter'));
  // sin zoom con dos dedos ni menú al mantener pulsado (iOS)
  ['gesturestart', 'gesturechange'].forEach(ev => document.addEventListener(ev, e => e.preventDefault()));
  addEventListener('contextmenu', e => e.preventDefault());
}

// Cada fotograma: qué botones se ven y qué objeto lleva el jugador
export function updateTouch() {
  if (!IS_TOUCH) return;
  const racing = game.state !== 'menu', done = racing && me().done, item = me().item;
  $('touch').classList.toggle('hidden', !racing);
  $('t-pad').classList.toggle('hidden', done);
  $('t-end').classList.toggle('hidden', !done);
  $('t-again').classList.toggle('hidden', !isHost());
  if (done || !racing) DRIVE.forEach(([, code]) => { keys[code] = false; });
  const icon = ITEM_ICONS[item] || '';
  if ($('t-item').textContent !== icon) $('t-item').textContent = icon;
  $('t-item').classList.toggle('ready', !!item);
}

// Pantalla completa y en horizontal (solo se puede pedir tras tocar un botón; en iPhone no existe)
export function goFullscreen() {
  if (!IS_TOUCH || document.fullscreenElement || !document.documentElement.requestFullscreen) return;
  document.documentElement.requestFullscreen()
    .then(() => screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape'))
    .catch(() => {});
}
