// Ajustes del juego. Todo lo que quieras "tunear" está aquí.
import { norm3 } from './core/math.js';

// ---- Carrera ----
export const LAPS = 3;
export const TRACK_WIDTH = 230;
export const CAR_RADIUS = 20;   // radio de colisión de los coches

// ---- Jugadores ----
// Hasta 4 coches. Cada jugador lleva un Lamborghini; los huecos libres son karts con IA.
export const MAX_PLAYERS = 4;
export const PLAYER_COLORS = ['#ffb400', '#5ed12a', '#ff6a00', '#8e44ff'];
export const KARTS = [['Rojo', '#d32f2f'], ['Azul', '#1e6fd9'], ['Verde', '#2e9e44'], ['Rosa', '#e91e8c']];
export const GRID = [[4, -55], [4, 55], [10, -55], [10, 55]]; // [segmento, carril] de salida

// ---- Cámara trasera ----
export const FOV_DEG = 72;   // campo de visión horizontal (se abre un poco con la velocidad)
export const CAM_DIST = 170; // distancia detrás del coche
export const CAM_H = 70;     // altura de la cámara

// ---- Luz y sombras ----
export const SUN = norm3([-0.55, 0.6, -0.58]); // dirección hacia el sol
export const SUN_COL = [2.6, 2.4, 2.1];        // color e intensidad del sol
export const SHADOW_SIZE = 2048;               // resolución del mapa de sombras
export const SHADOW_RANGE = 900;               // zona con sombras alrededor del jugador

// ---- Red ----
// Servidor de reenvío (carpeta server/, publicado en Cloudflare Workers)
export const RELAY_URL = 'wss://lambokart.rickyrdguez.workers.dev';
export const CAR_SEND_MS = 50;   // cada cuánto envío mi coche (~20 veces/s)
export const WORLD_SEND_MS = 66; // cada cuánto envía el anfitrión el mundo (~15 veces/s)
