// Multijugador online con PeerJS (WebRTC).
//
// El anfitrión hace de "servidor": los invitados se conectan directamente a su navegador
// y él reenvía los mensajes a los demás. El servidor gratuito de PeerJS solo sirve para
// que los navegadores se encuentren a partir del código de la partida.
//
// Reparto del trabajo:
//  - Cada jugador simula SU coche (sin retraso al conducir) y lo envía ~30 veces/s.
//  - El anfitrión simula la IA, las cajas, los plátanos y la llegada, y envía el mundo ~20 veces/s.
//
// Mensajes: hello, welcome, full, lobby, start, car, world, item, spin, banana.
import { PEER_PREFIX, MAX_PLAYERS, CAR_SEND_MS, WORLD_SEND_MS } from '../config.js';
import { angDiff } from '../core/math.js';
import { game, setState } from '../game/state.js';
import { me, owned } from '../game/cars.js';
import { hitBanana } from '../game/items.js';
import { startRace, showMenuScene } from '../game/session.js';
import { showLobby, renderLobby, showScreen, setStatus, playerName, cleanName } from '../ui/menu.js';

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sin letras que se confunden (O/0, I/1)
const CONNECT_TIMEOUT = 15000;

export const net = {
  peer: null, conns: [], hostConn: null, online: false,
  myId: 0, hostId: 0, code: '', lobby: [], inRace: false, lastCar: 0, lastWorld: 0
};
export const isHost = () => net.myId === net.hostId;

const randomCode = () => Array.from({ length: 5 }, () => CODE_CHARS[Math.random() * CODE_CHARS.length | 0]).join('');

// El anfitrión lo manda a todos; un invitado se lo manda al anfitrión, que lo reenvía
export function send(msg) {
  if (!net.online) return;
  if (isHost()) relay(msg, null);
  else if (net.hostConn && net.hostConn.open) net.hostConn.send(msg);
}

function relay(msg, except) {
  net.conns.forEach(c => { if (c !== except && c.open) c.send(msg); });
}

// ================== Anfitrión ==================
export function createGame() {
  setStatus('Creando partida...');
  net.code = randomCode();
  const peer = new window.Peer(PEER_PREFIX + net.code);
  net.peer = peer;
  peer.on('open', () => {
    Object.assign(net, { online: true, myId: 0, hostId: 0, lobby: [{ id: 0, name: playerName() }] });
    setStatus('');
    showLobby();
  });
  peer.on('connection', hostAccept);
  peer.on('disconnected', () => { if (!peer.destroyed) peer.reconnect(); });
  peer.on('error', e => {
    if (e.type === 'unavailable-id') { peer.destroy(); createGame(); } // código ya usado: otro
    else netError(e);
  });
}

function freeSlot() {
  for (let i = 1; i < MAX_PLAYERS; i++) if (!net.conns.some(c => c.slot === i)) return i;
  return -1;
}

function hostAccept(conn) {
  conn.on('open', () => {
    const id = freeSlot();
    if (id < 0) { conn.send({ t: 'full' }); setTimeout(() => conn.close(), 500); return; }
    conn.slot = id;
    net.conns.push(conn);
    conn.send({ t: 'welcome', id });
  });
  conn.on('data', m => hostReceive(conn, m));
  conn.on('close', () => hostDrop(conn));
}

function hostReceive(conn, m) {
  if (m.t === 'hello') {
    const player = { id: conn.slot, name: cleanName(m.name) || 'Jugador' };
    net.lobby = net.lobby.filter(p => p.id !== conn.slot).concat(player);
    sendLobby();
    return;
  }
  relay(m, conn);
  if (handlers[m.t]) handlers[m.t](m);
}

function hostDrop(conn) {
  if (!net.conns.includes(conn)) return;
  net.conns = net.conns.filter(c => c !== conn);
  net.lobby = net.lobby.filter(p => p.id !== conn.slot);
  sendLobby();
}

function sendLobby() {
  const msg = { t: 'lobby', players: net.lobby };
  relay(msg, null);
  handlers.lobby(msg);
}

// ================== Invitado ==================
export function joinGame(rawCode) {
  const code = rawCode.trim().toUpperCase();
  if (code.length < 5) return setStatus('Escribe el código de 5 letras', true);
  setStatus('Conectando...');
  const peer = new window.Peer();
  Object.assign(net, { peer, myId: -1, hostId: 0, code }); // myId llega con "welcome"
  peer.on('open', () => connectToHost(peer, code));
  peer.on('error', netError);
}

function connectToHost(peer, code) {
  const conn = peer.connect(PEER_PREFIX + code, { reliable: true });
  net.hostConn = conn;
  const timer = setTimeout(() => { if (!conn.open) netError({ type: 'timeout' }); }, CONNECT_TIMEOUT);
  conn.on('open', () => {
    clearTimeout(timer);
    net.online = true;
    conn.send({ t: 'hello', name: playerName() });
    setStatus('');
    showLobby();
  });
  conn.on('data', m => { if (handlers[m.t]) handlers[m.t](m); });
  conn.on('close', () => { if (net.peer === peer) leaveGame('El anfitrión ha cerrado la partida'); });
}

// ================== Común ==================
const ERRORS = {
  'peer-unavailable': 'No existe ninguna partida con ese código',
  'network': 'No hay conexión con el servidor de PeerJS. ¿Tienes internet?',
  'socket-error': 'No hay conexión con el servidor de PeerJS. ¿Tienes internet?',
  'server-error': 'El servidor de PeerJS no responde. Prueba en un rato.',
  'browser-incompatible': 'Tu navegador no permite jugar online. Usa Chrome, Edge o Firefox.',
  'timeout': 'No se pudo conectar con el anfitrión. Si estáis en la red del instituto, probad con el hotspot del móvil.'
};

function netError(e) {
  leaveGame(ERRORS[e.type] || 'Error de conexión: ' + e.type);
}

export function leaveGame(msg = '') {
  const peer = net.peer;
  Object.assign(net, { peer: null, conns: [], hostConn: null, online: false, myId: 0, hostId: 0, code: '', lobby: [], inRace: false });
  if (peer) peer.destroy();
  showMenuScene();
  showScreen('scr-main');
  setStatus(msg, !!msg);
}

const handlers = {
  welcome: m => { net.myId = m.id; renderLobby(); },
  full: () => leaveGame('La partida está llena (máximo 4 jugadores)'),
  lobby: m => { net.lobby = m.players; dropMissingPlayers(); renderLobby(); },
  start: m => startRace(m.humans),
  car: m => { if (net.inRace) applyRemote(game.cars[m.id], m.s); },
  world: m => { if (net.inRace && !isHost()) applyWorld(m); },
  item: m => { if (m.id === net.myId) me().item = m.item; },
  spin: m => { if (m.id === net.myId) hitBanana(me()); },
  banana: m => { if (isHost()) game.bananas.push({ x: m.x, y: m.y }); }
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
    lap: c.lap, seg: c.seg, boost: Math.max(0, Math.round(c.boost)), spin: Math.max(0, Math.round(c.spin)),
    done: c.done, item: c.item
  };
}

function applyRemote(c, s) {
  if (!c || owned(c)) return;
  c.net = s;
  ['lap', 'seg', 'boost', 'spin', 'done', 'item'].forEach(k => { c[k] = s[k]; });
}

function worldMsg() {
  return {
    t: 'world', state: game.state, countdown: game.countdown,
    ai: game.cars.filter(c => !c.human).map(carState),
    boxes: game.boxes.map(b => Math.max(0, Math.round(b.t))),
    bananas: game.bananas.map(b => [Math.round(b.x), Math.round(b.y)]),
    finish: game.finishOrder.map(c => c.id)
  };
}

function applyWorld(m) {
  if (m.state !== game.state) setState(m.state);
  game.countdown = m.countdown;
  m.ai.forEach(s => applyRemote(game.cars[s.id], s));
  game.boxes.forEach((b, i) => { b.t = m.boxes[i]; });
  game.bananas = m.bananas.map(([x, y]) => ({ x, y }));
  game.finishOrder = m.finish.map(id => game.cars[id]);
}

// Mueve un coche remoto hacia su última posición conocida, prediciendo hacia dónde va
export function followNet(c, dt) {
  const n = c.net;
  if (!n) return;
  n.x += Math.cos(n.angle) * n.speed * dt;
  n.y += Math.sin(n.angle) * n.speed * dt;
  c.x += (n.x - c.x) * 0.3;
  c.y += (n.y - c.y) * 0.3;
  c.angle += angDiff(n.angle, c.angle) * 0.3;
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
