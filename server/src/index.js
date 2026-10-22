// Servidor de reenvío de Lambo Kart (Cloudflare Workers + Durable Objects).
//
// Cada partida es una "sala" identificada por su código de 5 letras. Todos los jugadores de
// una sala se conectan por WebSocket seguro (wss, puerto 443) al mismo Durable Object, que:
//   - asigna a cada jugador un hueco (0 = anfitrión, 1-6 = invitados),
//   - no deja entrar a más jugadores que el tamaño de sala que eligió el anfitrión (2-7),
//   - mantiene la lista de la sala de espera,
//   - y reenvía cada mensaje de un jugador a todos los demás.
// La lógica del juego sigue en el navegador del anfitrión; aquí solo se reenvía.
import { DurableObject } from 'cloudflare:workers';

const MAX_PLAYERS = 7, MIN_PLAYERS = 2, DEFAULT_ROOM = 4; // tamaño de sala (lo elige el anfitrión)
const MAX_MESSAGE = 8192; // bytes
const clampSize = n => Math.max(MIN_PLAYERS, Math.min(MAX_PLAYERS, Number(n) || DEFAULT_ROOM));
const ROOM_PATH = /^\/room\/([A-HJ-NP-Z2-9]{5})$/;

// Webs desde las que se puede jugar (evita que otras páginas usen el servidor)
const ALLOWED_ORIGINS = [
  'https://rickyrdguez.github.io',
  'http://localhost',
  'http://127.0.0.1'
];

export default {
  async fetch(request, env) {
    const match = new URL(request.url).pathname.match(ROOM_PATH);
    if (!match) return new Response('Lambo Kart relay', { status: 200 });
    if (request.headers.get('Upgrade') !== 'websocket') return new Response('Se esperaba WebSocket', { status: 426 });
    const origin = request.headers.get('Origin') || '';
    if (!ALLOWED_ORIGINS.some(o => origin === o || origin.startsWith(o + ':'))) {
      return new Response('Origen no permitido', { status: 403 });
    }
    const room = env.ROOMS.get(env.ROOMS.idFromName(match[1]));
    return room.fetch(request);
  }
};

export class Room extends DurableObject {
  async fetch(request) {
    const params = new URL(request.url).searchParams, create = params.get('create') === '1';
    const [client, server] = Object.values(new WebSocketPair());
    this.ctx.acceptWebSocket(server); // API de "hibernación": no gasta mientras nadie habla
    const players = this.players();
    const error = create && players.length ? 'taken'          // el código ya está en uso
      : !create && !players.length ? 'noroom'                  // no existe esa partida
      : players.length >= this.size(players) ? 'full' : null;
    if (error) {
      server.send(JSON.stringify({ t: error }));
      server.close(1000, error);
    } else {
      const id = freeSlot(players);
      // el anfitrión (hueco 0) guarda el tamaño de la sala
      server.serializeAttachment(create ? { id, name: '', size: clampSize(params.get('size')) } : { id, name: '' });
      server.send(JSON.stringify({ t: 'welcome', id }));
    }
    return new Response(null, { status: 101, webSocket: client });
  }

  // Tamaño de la sala: lo guarda el anfitrión
  size(players = this.players()) {
    const host = players.find(p => p.id === 0);
    return host ? host.size || DEFAULT_ROOM : DEFAULT_ROOM;
  }

  // Jugadores aceptados en la sala (con su WebSocket)
  players(except) {
    return this.ctx.getWebSockets()
      .filter(ws => ws !== except)
      .map(ws => ({ ws, ...(ws.deserializeAttachment() || {}) }))
      .filter(p => p.id !== undefined);
  }

  webSocketMessage(ws, message) {
    if (typeof message !== 'string' || message.length > MAX_MESSAGE) return;
    const me = ws.deserializeAttachment();
    if (!me) return;
    let msg;
    try { msg = JSON.parse(message); } catch { return; }
    if (msg.t === 'hello') {
      me.name = String(msg.name || '').trim().slice(0, 14) || 'Jugador';
      ws.serializeAttachment(me);
      this.sendLobby();
      return;
    }
    if (!me.name) return; // aún no se ha presentado
    if (msg.t === 'size') {   // el anfitrión cambia el tamaño (nunca por debajo de los que ya hay)
      if (me.id !== 0) return;
      me.size = Math.max(clampSize(msg.size), this.players().length);
      ws.serializeAttachment(me);
      this.sendLobby();
      return;
    }
    this.players(ws).forEach(p => safeSend(p.ws, message));
  }

  webSocketClose(ws) {
    this.leave(ws);
  }

  webSocketError(ws) {
    this.leave(ws);
  }

  // Si se va el anfitrión se cierra la partida; si no, se actualiza la sala
  leave(ws) {
    const me = ws.deserializeAttachment();
    try { ws.close(1000, 'bye'); } catch {}
    if (!me) return;
    ws.serializeAttachment(null);
    if (me.id === 0) {
      this.players(ws).forEach(p => { safeSend(p.ws, JSON.stringify({ t: 'closed' })); p.ws.close(1000, 'closed'); });
    } else {
      this.sendLobby(ws);
    }
  }

  sendLobby(except) {
    const all = this.players(except), list = all.filter(p => p.name);
    const msg = JSON.stringify({
      t: 'lobby', size: this.size(all),
      players: list.map(p => ({ id: p.id, name: p.name })).sort((a, b) => a.id - b.id)
    });
    list.forEach(p => safeSend(p.ws, msg));
  }
}

function freeSlot(players) {
  for (let i = 0; i < MAX_PLAYERS; i++) if (!players.some(p => p.id === i)) return i;
  return -1;
}

function safeSend(ws, text) {
  try { ws.send(text); } catch {}
}
