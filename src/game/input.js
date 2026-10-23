// Teclado (los botones táctiles marcan estas mismas teclas) y control del volante del jugador.
import { clamp } from '../core/math.js';

export const keys = {};

const BLOCKED = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space']; // no mover la página
const STEER_IN = 0.08;   // cuánto gira el volante por fotograma al mantener la tecla (~0,2 s hasta el tope)
const STEER_OUT = 0.25;  // cuánto vuelve al centro por fotograma al soltar

// sensitivity: multiplica el giro del jugador (lo elige él en el menú; 1 = como la IA)
export const settings = { sensitivity: 0.85 };
let steer = 0;

// El volante no salta de golpe: un toque corto hace una corrección pequeña y
// mantener pulsado gira del todo
export function playerInput(dt = 1) {
  const target = (keys.ArrowRight || keys.KeyD ? 1 : 0) - (keys.ArrowLeft || keys.KeyA ? 1 : 0);
  // soltar o cambiar de lado: rápido; empezar a girar o seguir girando: progresivo
  const rate = target === 0 || steer * target < 0 ? STEER_OUT : STEER_IN;
  steer += clamp(target - steer, -rate * dt, rate * dt);
  return {
    up: keys.ArrowUp || keys.KeyW,
    down: keys.ArrowDown || keys.KeyS,
    turn: steer * settings.sensitivity
  };
}

// onPress recibe el código de cada tecla pulsada (para Escape, Enter, Espacio...)
export function bindKeyboard(onPress) {
  addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT') return; // escribiendo en el menú
    keys[e.code] = true;
    if (BLOCKED.includes(e.code)) e.preventDefault();
    onPress(e.code);
  });
  addEventListener('keyup', e => { keys[e.code] = false; });
}
