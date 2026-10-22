// Marcador sobre el juego (canvas 2D): vuelta, posición, objeto, minimapa, cuenta atrás y resultados.
import { LAPS, IS_TOUCH } from '../config.js';
import { clamp } from '../core/math.js';
import { game } from '../game/state.js';
import { me } from '../game/cars.js';
import { ranking } from '../game/race.js';
import { track } from '../game/track.js';
import { isHost } from '../net/network.js';
import { projectToScreen } from '../render/camera.js';

export const hudCanvas = document.getElementById('hud');
const ctx = hudCanvas.getContext('2d');

const ordinal = n => n + 'º';

export function renderHUD() {
  ctx.clearRect(0, 0, hudCanvas.width, hudCanvas.height);
  if (game.state === 'menu') return;
  drawLabels();
  drawStats();
  drawItemSlot(me());
  drawMinimap();
  drawOverlay();
}

export function showMessage(text) {
  ctx.fillStyle = '#fff';
  ctx.font = '20px sans-serif';
  ctx.fillText(text, 20, 40);
}

// ---- Piezas del marcador ----
function panel(x, y, w, h) {
  ctx.fillStyle = 'rgba(0,0,0,.55)';
  ctx.fillRect(x, y, w, h);
}

function poly(points, color) {
  ctx.beginPath();
  points.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

// Nombre encima de cada rival
function drawLabels() {
  game.cars.forEach(c => {
    if (c === me()) return;
    const p = projectToScreen(c.x, 40 + c.z, c.y, hudCanvas.width, hudCanvas.height);
    if (!p) return;
    ctx.font = `bold ${clamp(14 * p.s, 9, 18) | 0}px sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.6)'; ctx.strokeText(c.name, p.x, p.y);
    ctx.fillStyle = '#fff'; ctx.fillText(c.name, p.x, p.y);
  });
}

function drawStats() {
  const p = me(), pos = ranking().indexOf(p) + 1;
  panel(10, 10, 200, 92);
  ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  ctx.font = 'bold 22px sans-serif';
  ctx.fillText(`Vuelta ${clamp(p.lap + 1, 1, LAPS)}/${LAPS}`, 20, 18);
  ctx.fillText(`Posición ${ordinal(pos)}/${game.cars.length}`, 20, 46);
  ctx.font = '16px sans-serif';
  ctx.fillText(`${Math.round(Math.abs(p.speed) * 30)} km/h`, 20, 76);
}

function drawFlame() {
  const f = 14 + Math.random() * 12;
  poly([[-28, -7], [-28 - f, 0], [-28, 7]], '#ff9800');
  poly([[-28, -4], [-28 - f * 0.6, 0], [-28, 4]], '#ffeb3b');
}

function drawBanana(x, y, s) {
  ctx.save();
  ctx.translate(x, y); ctx.scale(s, s);
  ctx.strokeStyle = '#ffe135'; ctx.lineWidth = 7; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.arc(0, -6, 12, 0.3, Math.PI - 0.3); ctx.stroke();
  ctx.strokeStyle = '#5d4037'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(11, -1); ctx.lineTo(14, -4); ctx.stroke();
  ctx.restore();
}

function drawItemSlot(p) {
  const x = hudCanvas.width / 2 - 35, y = 10;
  panel(x, y, 70, 70);
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.strokeRect(x, y, 70, 70);
  if (p.item === 'banana') drawBanana(x + 35, y + 38, 1.6);
  if (p.item === 'turbo') {
    ctx.save(); ctx.translate(x + 50, y + 35); drawFlame(); ctx.restore();
    ctx.fillStyle = '#ff5722'; ctx.font = 'bold 14px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('TURBO', x + 35, y + 52);
  }
  if (IS_TOUCH) return; // en móvil el objeto se usa con su botón
  ctx.fillStyle = '#eee'; ctx.font = '12px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  ctx.fillText('ESPACIO', x + 35, y + 74);
}

function drawMinimap() {
  const b = track.bounds, size = IS_TOUCH ? 110 : 180, pad = IS_TOUCH ? 6 : 10;
  const s = size / Math.max(b.x1 - b.x0, b.y1 - b.y0), h = (b.y1 - b.y0) * s;
  // en móvil, arriba a la derecha (abajo están los botones)
  const ox = hudCanvas.width - size - pad * 2, oy = IS_TOUCH ? pad : hudCanvas.height - h - pad * 3;
  const mx = x => ox + pad + (x - b.x0) * s, my = y => oy + pad + (y - b.y0) * s;
  panel(ox, oy, size + pad * 2, h + pad * 2);
  ctx.beginPath();
  track.points.forEach((p, i) => i ? ctx.lineTo(mx(p.x), my(p.y)) : ctx.moveTo(mx(p.x), my(p.y)));
  ctx.closePath(); ctx.strokeStyle = '#aaa'; ctx.lineWidth = 5; ctx.stroke();
  ctx.fillStyle = '#ffc400'; // rampas
  track.ramps.forEach(r => ctx.fillRect(mx(r.x) - 3, my(r.y) - 3, 6, 6));
  game.cars.forEach(c => {
    ctx.fillStyle = c.color;
    ctx.beginPath(); ctx.arc(mx(c.x), my(c.y), c === me() ? 6 : 4, 0, Math.PI * 2); ctx.fill();
  });
}

// ---- Textos grandes ----
// Los textos grandes se encogen en pantallas bajas (móvil en horizontal)
const textScale = () => Math.min(1, hudCanvas.height / 560);

function bigText(text, y, size, color) {
  const k = textScale(), cy = hudCanvas.height / 2;
  y = cy + (y - cy) * k;
  size *= k;
  ctx.font = `bold ${size}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.lineWidth = 6 * k; ctx.strokeStyle = '#000'; ctx.strokeText(text, hudCanvas.width / 2, y);
  ctx.fillStyle = color; ctx.fillText(text, hudCanvas.width / 2, y);
}

function drawOverlay() {
  const cy = hudCanvas.height / 2;
  if (game.state === 'countdown') bigText(String(Math.ceil(game.countdown)), cy * 0.6, 120, '#fff');
  if (game.state === 'race' && game.goTimer > 0) bigText('¡YA!', cy * 0.6, 120, '#4caf50');
  if (me().sink > 0) bigText('¡Al agua!', cy * 0.6, 72, '#4fc3f7');
  if (game.state === 'race' && me().done) drawResults(cy);
}

function drawResults(cy) {
  ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(0, 0, hudCanvas.width, hudCanvas.height);
  const order = ranking(), pos = order.indexOf(me()) + 1;
  const gap = order.length > 4 ? 27 : 36, size = order.length > 4 ? 22 : 26; // con 7 coches, filas más juntas
  const top = cy - 50, bottom = top + order.length * gap + 14;
  bigText(pos === 1 ? '¡HAS GANADO!' : `Has quedado ${ordinal(pos)}`, top - 70, 64, me().color);
  order.forEach((c, i) => bigText(`${ordinal(i + 1)}  ${c.name}`, top + i * gap, size, c.color));
  if (IS_TOUCH) { if (!isHost()) bigText('Esperando al anfitrión...', bottom, 22, '#4caf50'); return; } // hay botones
  const hint = isHost() ? 'ENTER: otra carrera  ·  ESC: salir al menú' : 'Esperando al anfitrión...  ·  ESC: salir';
  bigText(hint, bottom, 26, '#4caf50');
}
