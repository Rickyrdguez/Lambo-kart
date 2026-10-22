// Circuitos disponibles. Cada uno tiene su trazado, sus rampas y su ambientación.
//   points: puntos de control por los que pasa la pista (se suavizan con una curva)
//   ramps:  segmentos de la pista donde hay una rampa de salto (mejor en rectas)
//   theme:  colores, luz, cielo, árboles y montañas
import { norm3 } from '../core/math.js';

export const MAPS = [
  {
    id: 'valle',
    name: 'Valle Verde',
    subtitle: 'Prados, pinos y una rampa',
    points: [[0, 0], [1200, 0], [1800, 300], [1900, 900], [1500, 1300], [1000, 1100],
             [600, 1400], [0, 1500], [-500, 1100], [-400, 500], [-700, 200]],
    ramps: [22],
    theme: {
      preview: '#3f8f3a',
      sun: norm3([-0.55, 0.6, -0.58]),
      sunCol: [2.6, 2.4, 2.1],
      horizon: [0.62, 0.74, 0.9],
      zenith: [0.14, 0.32, 0.75],
      clouds: 0.5,                 // cuanto más bajo, más nubes
      fog: 0.00011,
      ground: [[0.04, 0.11, 0.015], [0.13, 0.24, 0.04], [0.16, 0.14, 0.06]], // hierba, hierba clara, tierra
      asphalt: '#3d3d40',
      curbs: ['#f2f2f2', '#c81e1e'],
      mountains: { low: '#3f5a34', mid: '#6f746b', snow: '#e9eef2', midAt: 500, snowAt: 900 },
      trees: { count: 260, pine: 0.7, snowy: false }
    }
  },
  {
    id: 'nieve',
    name: 'Pico Nevado',
    subtitle: 'Nieve, curvas en S y dos rampas',
    points: [[0, 0], [1400, 0], [1700, 250], [1500, 600], [900, 700], [700, 1000], [1000, 1300],
             [1600, 1300], [1900, 1600], [1500, 1950], [400, 1900], [-200, 1500], [-100, 900], [-400, 400]],
    ramps: [24, 378],
    theme: {
      preview: '#c9d6e6',
      sun: norm3([0.5, 0.5, -0.7]),
      sunCol: [2.2, 2.25, 2.4],
      horizon: [0.78, 0.84, 0.93],
      zenith: [0.3, 0.45, 0.75],
      clouds: 0.42,
      fog: 0.00017,
      ground: [[0.62, 0.67, 0.75], [0.8, 0.84, 0.9], [0.5, 0.58, 0.7]], // nieve, nieve fresca, hielo
      asphalt: '#3a3c43',
      curbs: ['#f2f2f2', '#1e5bd8'],
      mountains: { low: '#b8c4d0', mid: '#8a96a3', snow: '#f4f7fb', midAt: 350, snowAt: 600 },
      trees: { count: 220, pine: 1, snowy: true }
    }
  }
];

export const RANDOM_MAP = 'random';

export const getMap = id => MAPS.find(m => m.id === id) || MAPS[0];

// Convierte la elección del menú (un mapa o "aleatorio") en un mapa concreto
export const resolveMap = choice => choice === RANDOM_MAP ? MAPS[Math.random() * MAPS.length | 0].id : getMap(choice).id;
