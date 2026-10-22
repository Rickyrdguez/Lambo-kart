// Estado compartido de la partida. Es un objeto para que todos los módulos vean los cambios.
//   state: 'menu' | 'countdown' | 'race'
export const game = {
  state: 'menu',
  countdown: 0,   // segundos de la cuenta atrás
  goTimer: 0,     // fotogramas que se muestra "¡YA!"
  cars: [],
  boxes: [],
  bananas: [],
  finishOrder: [] // coches en el orden en que han llegado a meta
};

export function setState(s) {
  if (s === 'race' && game.state !== 'race') game.goTimer = 50;
  game.state = s;
}
