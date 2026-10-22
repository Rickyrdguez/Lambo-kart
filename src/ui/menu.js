// Menú HTML: jugar solo, iniciar partida, unirse y sala de espera.
import { PLAYER_COLORS } from '../config.js';
import { net, isHost, createGame, joinGame, leaveGame } from '../net/network.js';
import { hostStart } from '../game/session.js';

const $ = id => document.getElementById(id);
const SCREENS = ['scr-main', 'scr-join', 'scr-lobby'];

export function showScreen(id) {
  $('ui').classList.remove('hidden');
  SCREENS.forEach(s => $(s).classList.toggle('hidden', s !== id));
  $('name-row').classList.toggle('hidden', id === 'scr-lobby');
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
const shareLink = () => location.href.split('#')[0] + '#' + net.code;

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
  $('player-count').textContent = `(${net.lobby.length}/4)`;
}

async function copyText(text, btn) {
  try { await navigator.clipboard.writeText(text); }
  catch { $('link').select(); document.execCommand('copy'); }
  const old = btn.textContent;
  btn.textContent = '¡Copiado!';
  setTimeout(() => { btn.textContent = old; }, 1500);
}

function needPeer() {
  if (window.Peer) return true;
  setStatus('Para jugar online hace falta internet (no se pudo cargar PeerJS).', true);
  return false;
}

function saveName() {
  try { localStorage.setItem('lamboName', playerName()); } catch {}
}

export function initMenu() {
  try { $('name').value = localStorage.getItem('lamboName') || ''; } catch {}
  $('name').addEventListener('change', saveName);
  $('btn-solo').onclick = () => { saveName(); hostStart(); };
  $('btn-create').onclick = () => { saveName(); if (needPeer()) createGame(); };
  $('btn-join').onclick = () => { setStatus(''); showScreen('scr-join'); $('code').focus(); };
  $('btn-join-go').onclick = () => { saveName(); if (needPeer()) joinGame($('code').value); };
  $('code').addEventListener('keydown', e => { if (e.key === 'Enter') $('btn-join-go').click(); });
  $('btn-start').onclick = () => hostStart();
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
