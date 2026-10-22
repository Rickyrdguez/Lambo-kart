// Punto de entrada: prepara todo y arranca el bucle del juego.
import { game } from './game/state.js';
import { buildTrack } from './game/track.js';
import { MAPS } from './game/maps.js';
import { me } from './game/cars.js';
import { updateRace } from './game/race.js';
import { useItem } from './game/items.js';
import { bindKeyboard } from './game/input.js';
import { hostStart, showMenuScene } from './game/session.js';
import { canvas, gl, initRenderer, render } from './render/renderer.js';
import { updateCamera } from './render/camera.js';
import { hudCanvas, renderHUD, showMessage } from './ui/hud.js';
import { initMenu } from './ui/menu.js';
import { isHost, leaveGame, netTick } from './net/network.js';

function resize() {
  const dpr = Math.min(devicePixelRatio || 1, 1.5); // limitado para no castigar la GPU
  canvas.width = innerWidth * dpr | 0;
  canvas.height = innerHeight * dpr | 0;
  hudCanvas.width = innerWidth;
  hudCanvas.height = innerHeight;
}

// Teclas de acción (la conducción se lee en cada fotograma desde input.js)
function onPress(code) {
  if (game.state === 'menu') return;
  if (code === 'Escape') leaveGame();
  if (code === 'Enter' && isHost() && me().done) hostStart();
  if (code === 'Space' && game.state === 'race' && me().item && !me().done) useItem(me());
}

let last = 0;
function loop(t) {
  const dt = Math.min(3, (t - last) / 16.67 || 1); // 1 = un fotograma a 60 fps
  last = t;
  updateRace(dt);
  netTick(t);
  updateCamera(dt);
  render(t / 1000);
  renderHUD();
  requestAnimationFrame(loop);
}

function boot() {
  resize();
  addEventListener('resize', resize);
  if (!gl) {
    document.getElementById('ui').classList.add('hidden');
    showMessage('Tu navegador no soporta WebGL2. Prueba con Chrome, Edge o Firefox actualizados.');
    return;
  }
  buildTrack(MAPS[0]);
  initRenderer();
  showMenuScene();
  initMenu();
  bindKeyboard(onPress);
  requestAnimationFrame(loop);
}

boot();
