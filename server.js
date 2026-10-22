// Servidor de Lambo Kart para jugar en red local (LAN).
// Sin librerías: solo módulos que trae Node.
// Uso:  node server.js   y abre en el navegador la dirección que aparece.
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');

const PORT = 8080;
const MAX_PLAYERS = 4;
const clients = []; // { socket, id, name, buf } en orden de llegada (el primero es el anfitrión)

// ---------- HTTP: sirve el juego ----------
const server = http.createServer((req, res) => {
  const page = req.url.split('?')[0];
  if (page === '/' || page === '/index.html') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    fs.createReadStream(path.join(__dirname, 'index.html')).pipe(res);
  } else {
    res.writeHead(404);
    res.end('No encontrado');
  }
});

// ---------- WebSocket: apretón de manos ----------
server.on('upgrade', (req, socket) => {
  if (req.url !== '/ws') return socket.destroy();
  const accept = crypto.createHash('sha1')
    .update(req.headers['sec-websocket-key'] + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
    .digest('base64');
  socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\n' +
               'Connection: Upgrade\r\nSec-WebSocket-Accept: ' + accept + '\r\n\r\n');
  join(socket);
});

// ---------- WebSocket: tramas ----------
function encode(text) {
  const data = Buffer.from(text);
  const n = data.length;
  let head;
  if (n < 126) head = Buffer.from([0x81, n]);
  else if (n < 65536) { head = Buffer.alloc(4); head[0] = 0x81; head[1] = 126; head.writeUInt16BE(n, 2); }
  else { head = Buffer.alloc(10); head[0] = 0x81; head[1] = 127; head.writeBigUInt64BE(BigInt(n), 2); }
  return Buffer.concat([head, data]);
}

// Lee todas las tramas completas que haya en el búfer del cliente
function readFrames(client) {
  let buf = client.buf;
  while (buf.length >= 2) {
    const op = buf[0] & 15, masked = buf[1] & 128;
    let len = buf[1] & 127, off = 2;
    if (len === 126) { if (buf.length < 4) break; len = buf.readUInt16BE(2); off = 4; }
    else if (len === 127) { if (buf.length < 10) break; len = Number(buf.readBigUInt64BE(2)); off = 10; }
    const maskAt = off;
    if (masked) off += 4;
    if (buf.length < off + len) break;
    let payload = buf.subarray(off, off + len);
    if (masked) payload = Buffer.from(payload.map((b, i) => b ^ buf[maskAt + (i & 3)]));
    buf = buf.subarray(off + len);
    onFrame(client, op, payload);
  }
  client.buf = buf;
}

function onFrame(client, op, payload) {
  if (op === 8) return client.socket.end();                       // cerrar
  if (op === 9) return client.socket.write(Buffer.concat([Buffer.from([0x8a, payload.length]), payload])); // ping
  if (op !== 1) return;
  let msg;
  try { msg = JSON.parse(payload.toString()); } catch { return; }
  if (msg.t === 'hello') {
    client.name = String(msg.name || '').slice(0, 14) || 'Jugador ' + (client.id + 1);
    sendLobby();
  } else {
    broadcast(payload.toString(), client); // el resto se reenvía a los demás
  }
}

// ---------- Jugadores ----------
function send(client, obj) { client.socket.write(encode(typeof obj === 'string' ? obj : JSON.stringify(obj))); }

function broadcast(text, except) {
  clients.forEach(c => { if (c !== except) send(c, text); });
}

function sendLobby() {
  const msg = {
    t: 'lobby',
    host: clients.length ? clients[0].id : -1,
    players: clients.filter(c => c.name).map(c => ({ id: c.id, name: c.name }))
  };
  clients.forEach(c => send(c, msg));
}

function freeId() {
  for (let i = 0; i < MAX_PLAYERS; i++) if (!clients.some(c => c.id === i)) return i;
  return -1;
}

function join(socket) {
  const id = freeId();
  if (id < 0) { socket.write(encode(JSON.stringify({ t: 'full' }))); return socket.end(); }
  const client = { socket, id, name: '', buf: Buffer.alloc(0) };
  clients.push(client);
  send(client, { t: 'welcome', id });
  console.log(`Jugador ${id + 1} conectado`);
  socket.on('data', d => { client.buf = Buffer.concat([client.buf, d]); readFrames(client); });
  socket.on('close', () => leave(client));
  socket.on('error', () => leave(client));
}

function leave(client) {
  const i = clients.indexOf(client);
  if (i < 0) return;
  clients.splice(i, 1);
  console.log(`Jugador ${client.id + 1} desconectado`);
  sendLobby();
}

// ---------- Arranque ----------
function lanAddresses() {
  return Object.values(os.networkInterfaces()).flat()
    .filter(a => a && a.family === 'IPv4' && !a.internal && !a.address.startsWith('169.254.')) // 169.254 = sin red real
    .map(a => a.address);
}

server.listen(PORT, () => {
  console.log('\n  LAMBO KART - servidor en marcha\n');
  console.log(`  En este ordenador:   http://localhost:${PORT}`);
  lanAddresses().forEach(ip => console.log(`  Para tus amigos:     http://${ip}:${PORT}`));
  console.log('\n  (Ctrl+C para cerrar)\n');
});
