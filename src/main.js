// Punto de entrada: prepara todo y arranca el bucle del juego.
import { IS_TOUCH } from './config.js';
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
import { quality, detectSoftware, adaptQuality } from './render/quality.js';
import { hudCanvas, renderHUD, showMessage } from './ui/hud.js';
import { initMenu, setStatus } from './ui/menu.js';
import { initTouch, updateTouch } from './ui/touch.js';
import { isHost, leaveGame, netTick } from './net/network.js';

function resize() {
  const dpr = Math.min(devicePixelRatio || 1, IS_TOUCH ? 1 : 1.5) * quality.scale; // limitado para no castigar la GPU
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
  const frameMs = t - last;
  const dt = Math.min(3, frameMs / 16.67 || 1); // 1 = un fotograma a 60 fps
  last = t;
  if (adaptQuality(frameMs)) resize();
  updateRace(dt);
  netTick(t);
  updateCamera(dt);
  render(t / 1000);
  renderHUD();
  updateTouch();
  requestAnimationFrame(loop);
}

function boot() {
  if (!gl) {
    resize();
    document.getElementById('ui').classList.add('hidden');
    showMessage('Tu navegador no soporta WebGL2. Prueba con Chrome, Edge o Firefox actualizados.');
    return;
  }
  detectSoftware();
  resize();
  addEventListener('resize', resize);
  buildTrack(MAPS[0]);
  initRenderer();
  showMenuScene();
  initMenu();
  bindKeyboard(onPress);
  initTouch(onPress);
  if (quality.software && !location.hash) {
    setStatus('Tu navegador está dibujando sin la tarjeta gráfica y el juego irá lento. ' +
              'Activa la "aceleración por hardware" en sus ajustes y reinícialo.', true);
  }
  requestAnimationFrame(loop);
}

boot();
