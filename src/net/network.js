// Multijugador online.
//
// Todos los jugadores se conectan por WebSocket seguro (wss, puerto 443) a un servidor de
// reenvío en Cloudflare (carpeta server/). Cada partida es una sala con un código de 5 letras;
// el servidor reenvía los mensajes de cada jugador a los demás. Como usa el mismo puerto que
// cualquier web https, funciona también en redes restrictivas (universidad, datos móviles…).
//
// Reparto del trabajo:
//  - Cada jugador simula SU coche (sin retraso al conducir) y lo envía ~20 veces/s.
//  - El anfitrión simula la IA, las cajas, los plátanos y la llegada, y envía el mundo ~15 veces/s.
//
// Mensajes del servidor: welcome, lobby, taken, noroom, full, closed.
// Mensajes entre jugadores: hello, map, start, car, world, item, spin, banana.
import { RELAY_URL, CAR_SEND_MS, WORLD_SEND_MS } from '../config.js';
import { angDiff } from '../core/math.js';
import { game, setState } from '../game/state.js';
import { me, owned } from '../game/cars.js';
import { hitBanana } from '../game/items.js';
import { startRace, showMenuScene, session } from '../game/session.js';
import { showLobby, renderLobby, showScreen, setStatus, playerName } from '../ui/menu.js';

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sin letras que se confunden (O/0, I/1)
const CONNECT_TIMEOUT = 15000;
const HOST_ID = 0; // el servidor da el hueco 0 a quien crea la partida

export const net = {
  ws: null, online: false, myId: 0, hostId: HOST_ID,
  code: '', lobby: [], inRace: false, lastCar: 0, lastWorld: 0
};
export const isHost = () => net.myId === net.hostId;

const randomCode = () => Array.from({ length: 5 }, () => CODE_CHARS[Math.random() * CODE_CHARS.length | 0]).join('');

export function send(msg) {
  if (net.ws && net.ws.readyState === WebSocket.OPEN) net.ws.send(JSON.stringify(msg));
}

// ================== Conexión ==================
export function createGame() {
  connect(randomCode(), true);
}

export function joinGame(rawCode) {
  const code = rawCode.trim().toUpperCase();
  if (!/^[A-Z2-9]{5}$/.test(code)) return setStatus('Escribe el código de 5 letras', true);
  connect(code, false);
}

function connect(code, create) {
  setStatus(create ? 'Creando partida...' : 'Conectando...');
  const ws = new WebSocket(`${RELAY_URL}/room/${code}${create ? '?create=1' : ''}`);
  Object.assign(net, { ws, code, myId: -1, online: false }); // myId llega con "welcome"
  const timer = setTimeout(() => { if (net.ws === ws && !net.online) leaveGame(ERRORS.timeout); }, CONNECT_TIMEOUT);
  ws.onmessage = e => onServerMessage(JSON.parse(e.data), create);
  ws.onclose = () => {
    clearTimeout(timer);
    if (net.ws === ws) leaveGame(net.online ? 'Se ha perdido la conexión con la partida' : ERRORS.network);
  };
}

function onServerMessage(m, create) {
  if (m.t === 'taken') { net.ws = null; createGame(); return; } // código en uso: probamos otro
  if (m.t === 'welcome') {
    Object.assign(net, { myId: m.id, online: true, lobby: [] });
    send({ t: 'hello', name: playerName() });
    setStatus('');
    showLobby();
    return;
  }
  if (ERRORS[m.t]) return leaveGame(ERRORS[m.t]);
  if (handlers[m.t]) handlers[m.t](m);
}

const ERRORS = {
  noroom: 'No existe ninguna partida con ese código',
  full: 'La partida está llena (máximo 4 jugadores)',
  closed: 'El anfitrión ha cerrado la partida',
  network: 'No se pudo conectar con el servidor del juego. ¿Tienes internet?',
  timeout: 'El servidor del juego no responde. Prueba otra vez en un momento.'
};

export function leaveGame(msg = '') {
  const ws = net.ws;
  Object.assign(net, { ws: null, online: false, myId: 0, hostId: HOST_ID, code: '', lobby: [], inRace: false });
  if (ws) ws.close();
  showMenuScene();
  showScreen('scr-main');
  setStatus(msg, !!msg);
}

// El anfitrión avisa del circuito elegido (también cuando entra alguien nuevo a la sala)
export function shareMapChoice() {
  if (isHost()) send({ t: 'map', choice: session.mapChoice });
}

const handlers = {
  lobby: m => { net.lobby = m.players; dropMissingPlayers(); renderLobby(); shareMapChoice(); },
  map: m => { if (!isHost()) { session.mapChoice = m.choice; renderLobby(); } },
  start: m => startRace(m.humans, m.map),
  car: m => { if (net.inRace) applyRemote(game.cars[m.id], m.s); },
  world: m => { if (net.inRace && !isHost()) applyWorld(m); },
  item: m => { if (m.id === net.myId) me().item = m.item; },
  spin: m => { if (m.id === net.myId) hitBanana(me()); },
  banana: m => { if (isHost()) game.bananas.push({ x: m.x, y: m.y, h: m.h || 0 }); }
};

// Si alguien se va en mitad de la carrera, su coche pasa a llevarlo la IA
function dropMissingPlayers() {
  game.cars.forEach(c => {
    if (c.human && net.inRace && !net.lobby.some(p => p.id === c.id)) { c.human = false; c.net = null; }
  });
}

// ================== Sincronización ==================
function carState(c) {
  return {
    id: c.id, x: +c.x.toFixed(1), y: +c.y.toFixed(1), angle: +c.angle.toFixed(3), speed: +c.speed.toFixed(2),
    z: +c.z.toFixed(1), vz: +c.vz.toFixed(2), pitch: +c.pitch.toFixed(2), ground: Math.round(c.ground), lap: c.lap, seg: c.seg, boost: Math.max(0, Math.round(c.boost)), spin: Math.max(0, Math.round(c.spin)),
    done: c.done, item: c.item
  };
}

function applyRemote(c, s) {
  if (!c || owned(c)) return;
  c.net = s;
  ['lap', 'seg', 'boost', 'spin', 'done', 'item', 'ground'].forEach(k => { c[k] = s[k]; });
}

function worldMsg() {
  return {
    t: 'world', state: game.state, countdown: game.countdown,
    ai: game.cars.filter(c => !c.human).map(carState),
    boxes: game.boxes.map(b => Math.max(0, Math.round(b.t))),
    bananas: game.bananas.map(b => [Math.round(b.x), Math.round(b.y), Math.round(b.h)]),
    finish: game.finishOrder.map(c => c.id)
  };
}

function applyWorld(m) {
  if (m.state !== game.state) setState(m.state);
  game.countdown = m.countdown;
  m.ai.forEach(s => applyRemote(game.cars[s.id], s));
  game.boxes.forEach((b, i) => { b.t = m.boxes[i]; });
  game.bananas = m.bananas.map(([x, y, h]) => ({ x, y, h: h || 0 }));
  game.finishOrder = m.finish.map(id => game.cars[id]);
}

// Mueve un coche remoto hacia su última posición conocida, prediciendo hacia dónde va
export function followNet(c, dt) {
  const n = c.net;
  if (!n) return;
  n.x += Math.cos(n.angle) * n.speed * dt;
  n.y += Math.sin(n.angle) * n.speed * dt;
  const floor = n.ground || 0;
  if (n.z > floor) { n.vz -= 0.12 * dt; n.z = Math.max(floor, n.z + n.vz * dt); } // sigue cayendo si va en el aire
  if (Math.hypot(n.x - c.x, n.y - c.y) > 150) Object.assign(c, { x: n.x, y: n.y, z: n.z }); // ha reaparecido lejos
  c.x += (n.x - c.x) * 0.3;
  c.y += (n.y - c.y) * 0.3;
  c.z += (n.z - c.z) * 0.3;
  c.angle += angDiff(n.angle, c.angle) * 0.3;
  c.pitch += (n.pitch - c.pitch) * 0.3;
  c.speed = n.speed;
}

// Llamar cada fotograma: envía lo que toque según el tiempo t (ms)
export function netTick(t) {
  if (!net.online || !net.inRace) return;
  if (t - net.lastCar > CAR_SEND_MS && me().human) {
    net.lastCar = t;
    send({ t: 'car', id: net.myId, s: carState(me()) });
  }
  if (isHost() && t - net.lastWorld > WORLD_SEND_MS) {
    net.lastWorld = t;
    send(worldMsg());
  }
}
