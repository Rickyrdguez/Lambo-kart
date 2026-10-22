// Ajustes del juego. Todo lo que quieras "tunear" está aquí.

// ---- Dispositivo ----
// Pantallas táctiles (móvil, tablet): controles en pantalla y gráficos algo más ligeros
export const IS_TOUCH = matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
export const MAX_DPR = IS_TOUCH ? 2 : 1.5; // resolución máxima respecto a la pantalla (limitada para no castigar la GPU)

// ---- Carrera ----
export const LAPS = 3;
export const TRACK_WIDTH = 230;
export const CAR_RADIUS = 20;   // radio de colisión de los coches

// ---- Jugadores ----
// Hasta 4 coches. Cada jugador lleva un Lamborghini; los huecos libres son karts con IA.
export const MAX_PLAYERS = 7;   // tamaño máximo de una sala online
export const MIN_PLAYERS = 2;
export const DEFAULT_ROOM = 4;  // tamaño de sala al crearla (el anfitrión lo puede cambiar)
export const MIN_CARS = 4;      // si hay menos jugadores, karts con IA rellenan hasta este número
export const PLAYER_COLORS = ['#ffb400', '#5ed12a', '#ff6a00', '#8e44ff', '#e53935', '#1e88e5', '#f2f2f2'];
export const KARTS = [['Rojo', '#d32f2f'], ['Azul', '#1e6fd9'], ['Verde', '#2e9e44'], ['Rosa', '#e91e8c']];
// Parrilla de salida en filas de dos: [segmento, carril]
export const GRID = [[4, -55], [4, 55], [10, -55], [10, 55], [16, -55], [16, 55], [22, 0]];

// ---- Cámara trasera ----
export const FOV_DEG = 72;   // campo de visión horizontal (se abre un poco con la velocidad)
export const CAM_DIST = 170; // distancia detrás del coche
export const CAM_H = 70;     // altura de la cámara

// ---- Sombras (la luz y los colores de cada circuito están en game/maps.js) ----
export const SHADOW_SIZE = 2048;  // resolución del mapa de sombras
export const SHADOW_RANGE = 900;  // zona con sombras alrededor del jugador

// ---- Red ----
// Servidor de reenvío (carpeta server/, publicado en Cloudflare Workers)
export const RELAY_URL = 'wss://lambokart.rickyrdguez.workers.dev';
export const CAR_SEND_MS = 50;   // cada cuánto envío mi coche (~20 veces/s)
export const WORLD_SEND_MS = 66; // cada cuánto envía el anfitrión el mundo (~15 veces/s)
