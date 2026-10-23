// Menú HTML: jugar solo (eligiendo circuito), iniciar partida, unirse y sala de espera.
import { PLAYER_COLORS } from '../config.js';
import { MAPS, RANDOM_MAP } from '../game/maps.js';
import { splinePoints, computeBounds } from '../game/track.js';
import { hostStart, session } from '../game/session.js';
import { net, isHost, createGame, joinGame, leaveGame, shareMapChoice, setRoomSize } from '../net/network.js';
import { goFullscreen } from './touch.js';

const $ = id => document.getElementById(id);
const SCREENS = ['scr-main', 'scr-maps', 'scr-join', 'scr-lobby'];

export function showScreen(id) {
  $('ui').classList.remove('hidden');
  SCREENS.forEach(s => $(s).classList.toggle('hidden', s !== id));
  $('name-row').classList.toggle('hidden', id !== 'scr-main' && id !== 'scr-join');
}

export function hideUI() {
  $('ui').classList.add('hidden');
  document.activeElement.blur();
}

export function setStatus(text, error = false) {
  $('status').textContent = text;
  $('status').classList.toggle('error', error);
}

export const cleanName = n => String(n || '').trim().slice(0, 14);
export const playerName = () => cleanName($('name').value) || 'Jugador';
const shareLink = () => location.origin + location.pathname + '#' + net.code;
const mapName = id => id === RANDOM_MAP ? 'Aleatorio' : MAPS.find(m => m.id === id).name;

// ================== Elegir circuito ==================
// Tarjetas con el dibujo de cada circuito, más una de "Aleatorio"
function renderMapCards(container, selected, onPick, compact = false) {
  container.innerHTML = '';
  [...MAPS.map(m => m.id), RANDOM_MAP].forEach(id => {
    const card = document.createElement('button'), title = document.createElement('strong');
    card.className = 'map-card' + (id === selected ? ' selected' : '');
    title.textContent = mapName(id);
    card.append(mapPreview(id), title);
    if (!compact) {
      const sub = document.createElement('small');
      sub.textContent = id === RANDOM_MAP ? 'Un circuito al azar en cada carrera' : MAPS.find(m => m.id === id).subtitle;
      card.append(sub);
    }
    card.onclick = () => onPick(id);
    container.append(card);
  });
}

// Miniatura del trazado (con las rampas en amarillo y el looping en naranja)
function mapPreview(id) {
  const cv = document.createElement('canvas'), ctx = cv.getContext('2d'), w = 160, h = 100;
  cv.width = w; cv.height = h;
  if (id === RANDOM_MAP) {
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, MAPS[0].theme.preview); g.addColorStop(1, MAPS[MAPS.length - 1].theme.preview);
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    ctx.font = '44px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('🎲', w / 2, h / 2 + 2);
    return cv;
  }
  const map = MAPS.find(m => m.id === id), pts = splinePoints(map.points), b = computeBounds(pts);
  const s = Math.min((w - 24) / (b.x1 - b.x0), (h - 20) / (b.y1 - b.y0));
  const px = x => (w - (b.x1 - b.x0) * s) / 2 + (x - b.x0) * s, py = y => (h - (b.y1 - b.y0) * s) / 2 + (y - b.y0) * s;
  ctx.fillStyle = map.theme.preview; ctx.fillRect(0, 0, w, h);
  if (map.island) drawIslandPreview(ctx, map, pts, px, py, s);
  ctx.beginPath();
  pts.forEach((p, i) => i ? ctx.lineTo(px(p.x), py(p.y)) : ctx.moveTo(px(p.x), py(p.y)));
  ctx.closePath();
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#2b2c31'; ctx.lineWidth = 7; ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,.6)'; ctx.lineWidth = 1; ctx.stroke();
  ctx.fillStyle = '#ffc400';
  (map.ramps || []).forEach(seg => { ctx.beginPath(); ctx.arc(px(pts[seg].x), py(pts[seg].y), 4, 0, Math.PI * 2); ctx.fill(); });
  if (map.loop) {                                   // el looping, como un aro naranja
    const p = pts[map.loop.seg];
    ctx.strokeStyle = '#ff7a00'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(px(p.x), py(p.y), 6, 0, Math.PI * 2); ctx.stroke();
  }
  return cv;
}

// En las islas, la arena alrededor de la pista (sin los tramos de agua)
function drawIslandPreview(ctx, map, pts, px, py, s) {
  const inWater = i => map.island.water.some(r => i >= r.from && i <= r.to);
  ctx.strokeStyle = '#e3c27f'; ctx.lineWidth = map.island.radius * 2 * s; ctx.lineCap = 'butt';
  pts.forEach((p, i) => {
    if (inWater(i)) return;
    const q = pts[(i + 1) % pts.length];
    ctx.beginPath(); ctx.moveTo(px(p.x), py(p.y)); ctx.lineTo(px(q.x), py(q.y)); ctx.stroke();
  });
}

export function showMapPicker() {
  renderMapCards($('map-list'), session.mapChoice, id => { session.mapChoice = id; hostStart(); });
  showScreen('scr-maps');
}

// ================== Sala de espera ==================
export function showLobby() {
  showScreen('scr-lobby');
  const host = isHost();
  $('share').classList.toggle('hidden', !host);
  $('btn-start').classList.toggle('hidden', !host);
  $('lobby-wait').classList.toggle('hidden', host);
  $('code-big').textContent = net.code;
  $('link').value = shareLink();
  renderLobby();
}

export function renderLobby() {
  const list = $('players');
  list.innerHTML = '';
  net.lobby.forEach(p => {
    const li = document.createElement('li'), dot = document.createElement('span');
    dot.className = 'dot';
    dot.style.background = PLAYER_COLORS[p.id];
    // texto plano: los nombres los escriben otros jugadores
    li.append(dot, p.name + (p.id === net.hostId ? ' (anfitrión)' : '') + (p.id === net.myId ? ' — tú' : ''));
    list.append(li);
  });
  $('player-count').textContent = `(${net.lobby.length}/${net.size})`;
  // el anfitrión elige cuántos caben en la sala (como en Among Us)
  $('size-row').classList.toggle('hidden', !isHost());
  $('room-size').textContent = net.size;
  renderLobbyMap();
}

// El anfitrión elige el circuito; los invitados solo ven cuál está elegido
function renderLobbyMap() {
  const host = isHost();
  $('lobby-map-pick').classList.toggle('hidden', !host);
  $('lobby-map').classList.toggle('hidden', host);
  $('lobby-map').textContent = `Circuito: ${mapName(session.mapChoice)}`;
  if (host) {
    renderMapCards($('lobby-maps'), session.mapChoice, id => {
      session.mapChoice = id;
      shareMapChoice();
      renderLobbyMap();
    }, true);
  }
}

// ================== Utilidades ==================
async function copyText(text, btn) {
  try { await navigator.clipboard.writeText(text); }
  catch { $('link').select(); document.execCommand('copy'); }
  const old = btn.textContent;
  btn.textContent = '¡Copiado!';
  setTimeout(() => { btn.textContent = old; }, 1500);
}

function saveName() {
  try { localStorage.setItem('lamboName', playerName()); } catch {}
}

export function initMenu() {
  try { $('name').value = localStorage.getItem('lamboName') || ''; } catch {}
  $('name').addEventListener('change', saveName);
  $('btn-solo').onclick = () => { saveName(); goFullscreen(); setStatus(''); showMapPicker(); };
  $('btn-create').onclick = () => { saveName(); goFullscreen(); createGame(); };
  $('btn-join').onclick = () => { setStatus(''); showScreen('scr-join'); $('code').focus(); };
  $('btn-join-go').onclick = () => { saveName(); goFullscreen(); joinGame($('code').value); };
  $('code').addEventListener('keydown', e => { if (e.key === 'Enter') $('btn-join-go').click(); });
  $('btn-start').onclick = () => hostStart();
  $('btn-size-down').onclick = () => setRoomSize(Math.max(net.size - 1, net.lobby.length));
  $('btn-size-up').onclick = () => setRoomSize(net.size + 1);
  $('btn-copy-link').onclick = e => copyText(shareLink(), e.target);
  $('btn-copy-code').onclick = e => copyText(net.code, e.target);
  document.querySelectorAll('[data-back]').forEach(b => { b.onclick = () => leaveGame(); });
  // Con un enlace de invitación (…#ABCDE) se va directo a "Unirse"
  const code = location.hash.slice(1).toUpperCase();
  if (code) {
    $('code').value = code;
    showScreen('scr-join');
    setStatus('Te han invitado. Escribe tu nombre y pulsa Unirse.');
  } else {
    showScreen('scr-main');
  }
}
