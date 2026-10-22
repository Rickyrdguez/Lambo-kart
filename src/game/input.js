// Teclado.
export const keys = {};

const BLOCKED = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space']; // no mover la página

export function playerInput() {
  return {
    up: keys.ArrowUp || keys.KeyW,
    down: keys.ArrowDown || keys.KeyS,
    turn: (keys.ArrowRight || keys.KeyD ? 1 : 0) - (keys.ArrowLeft || keys.KeyA ? 1 : 0)
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
