// Circuitos disponibles. Cada uno tiene su trazado, sus rampas y su ambientación.
//   points: puntos de control por los que pasa la pista (se suavizan con una curva)
//   ramps:  segmentos de la pista donde hay una rampa de salto (mejor en rectas)
//   theme:  colores, luz, cielo, árboles y montañas
//   mobileQuality: resolución máxima en móvil (1 = la más alta). Los circuitos más
//                  sencillos de dibujar pueden permitirse más calidad.
import { norm3 } from '../core/math.js';

export const MAPS = [
  {
    id: 'valle',
    name: 'Valle Verde',
    subtitle: 'Prados, pinos y una rampa',
    mobileQuality: 1,
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
      trees: { kind: 'pine', count: 260, pine: 0.7, snowy: false }
    }
  },
  {
    id: 'nieve',
    name: 'Pico Nevado',
    subtitle: 'Nieve, curvas en S y dos rampas',
    mobileQuality: 0.85,
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
      trees: { kind: 'pine', count: 220, pine: 1, snowy: true }
    }
  },
  {
    id: 'isla',
    name: 'Isla Tropical',
    subtitle: 'Muelle, salto sobre el mar y atajo',
    mobileQuality: 0.7,                             // mar animado y muchas palmeras: más pesado
    points: [[0, 0], [1300, 0], [1850, 300], [1950, 900], [1900, 1500], [1550, 1950], [900, 2050],
             [250, 2000], [-300, 1650], [150, 1300], [700, 1250], [650, 750], [150, 650], [-350, 400]],
    ramps: [228],                                   // salto sobre la cala
    boostPads: [223],                               // placa de turbo justo antes de la rampa
    boxes: [0.1, 0.55, 0.85],                       // dónde hay cajas (fracción de la vuelta)
    shortcuts: [{ from: 285, to: 352, width: 80 }], // atajo de arena por dentro de la horquilla
    arches: [420],                                  // arco de roca sobre la pista
    island: {
      radius: 520,                                  // la tierra llega hasta esta distancia de la pista
      water: [
        { from: 95, to: 150, type: 'pier' },        // muelle de madera: agua a los lados
        { from: 233, to: 249, type: 'cove' }        // cala: hay que saltarla
      ]
    },
    theme: {
      preview: '#1d8fb0',
      sun: norm3([0.65, 0.2, 0.55]),                // sol bajo de atardecer
      sunCol: [2.7, 1.8, 1.1],
      horizon: [1.3, 0.5, 0.2],
      zenith: [0.12, 0.15, 0.42],
      clouds: 0.6,
      fog: 0.00006,
      ground: [[0.58, 0.45, 0.26], [0.75, 0.6, 0.36], [0.5, 0.4, 0.25]], // arena
      asphalt: '#46474d',
      curbs: ['#f2f2f2', '#ff7a1a'],
      mountains: { low: '#2c5a2e', mid: '#3f6b3a', snow: '#3f6b3a', midAt: 400, snowAt: 99999 }, // islas lejanas
      trees: { kind: 'palm', count: 150 },
      decor: { rocks: 40, umbrellas: 26, lighthouse: { seg: 70, side: -1 } }
    }
  },
  {
    id: 'ciudad',
    name: 'Ciudad Neón',
    subtitle: 'Noche, puente, túnel y callejón',
    mobileQuality: 0.75,
    // Trazado en 8: se cruza en los segmentos 160 (abajo) y 440 (por el puente)
    points: [[1600, -350], [1650, 300], [1100, 700], [450, 450], [0, 0], [-450, -450], [-1050, -700],
             [-1600, -350], [-1650, 300], [-1100, 700], [-450, 450], [0, 0], [450, -450], [1050, -700]],
    bridge: { from: 395, up: 425, down: 455, to: 485, height: 100 }, // sube, recto arriba, baja
    // la pista baja por una trinchera, pasa bajo tierra (con un parque encima) y vuelve a subir
    tunnel: { from: 35, down: 60, up: 90, to: 115, depth: 90 },
    boostPads: [20, 135, 430],                      // la última, arriba del puente
    boxes: [0.12, 0.5, 0.8],
    shortcuts: [{ from: 296, to: 386, width: 70, speed: 0.95, style: 'alley' }], // callejón: ahorra ~480 unidades
    theme: {
      preview: '#141a2e',
      night: true,
      sun: norm3([-0.35, 0.14, 0.6]),               // la luna hace de "sol" (baja, para que se vea)
      sunCol: [0.45, 0.55, 0.8],
      disc: 600,                                    // disco grande (luna)
      stars: 1,
      ambient: 0.35,                                // luz ambiente baja: es de noche
      horizon: [0.03, 0.045, 0.1],
      zenith: [0.005, 0.008, 0.03],
      clouds: 0.9,
      fog: 0.00014,
      ground: [[0.05, 0.05, 0.06], [0.08, 0.08, 0.09], [0.035, 0.035, 0.045]], // cemento
      asphalt: '#2c2d33',
      curbs: ['#26262e', '#d6249f'],
      lines: '#3fd2ff',                             // bordes brillantes para ver bien la pista
      skyline: true,                                // edificios lejanos en vez de montañas
      trees: { kind: 'pine', count: 0 },
      decor: { buildings: 110, lamps: 7 }           // edificios y una farola cada 7 segmentos
    }
  },
  {
    id: 'cielo',
    name: 'Carrera en el Cielo',
    subtitle: 'Pista flotante, looping, peralte y rasante',
    mobileQuality: 0.85,
    // Trazado en 8 por encima de las nubes. Las diagonales se cruzan en el centro:
    // la de los segmentos 160-200 por abajo y la de 480-520 por el puente.
    points: [[-1725, -300], [-1725, 300], [-1275, 790], [-675, 675], [-225, 225], [225, -225], [675, -675],
             [1275, -790], [1725, -300], [1725, 300], [1275, 790], [675, 675], [225, 225], [-225, -225],
             [-675, -675], [-1275, -790]],
    bridge: { from: 460, up: 485, down: 515, to: 540, height: 110 },
    loop: { seg: 162, radius: 105 },                // looping vertical (game/loop.js)
    boostPads: [140, 148, 183, 252],                // dos antes del looping, una antes del salto y otra antes del peralte
    ramps: [186],                                   // salto sobre el hueco
    crest: { from: 46, peak: 60, to: 81, height: 100 },   // rasante: se vuela por encima de la curva
    bank: { from: 262, to: 418 },                   // curva peraltada como en Trackmania: obligatorio ir por la pared
    sky: {
      gaps: [{ from: 190, to: 197 }],               // hueco sin pista: hay que saltarlo
      open: [{ from: 43, to: 100 }]                 // sin barreras en el rasante: si fallas la curva, caes
    },
    boxes: [0.025, 0.38, 0.7],
    theme: {
      preview: '#7ec3f2',
      sky: true,
      sun: norm3([0.5, 0.55, -0.6]),
      sunCol: [2.5, 2.3, 2.0],
      horizon: [0.72, 0.84, 0.99],
      zenith: [0.1, 0.32, 0.88],
      clouds: 0.45,
      fog: 0.00005,
      ground: [[0.5, 0.62, 0.8], [0.98, 0.99, 1], [0.72, 0.8, 0.93]], // no hay suelo (solo se usa en el shader)
      asphalt: '#3a3f4c',
      curbs: ['#ffffff', '#29b6f6'],
      lines: '#7fe3ff',                             // líneas y bordes que brillan
      trees: { kind: 'pine', count: 0 },
      decor: { clouds: 70, airBalloons: 12 }        // nubes y globos aerostáticos
    }
  }
];

export const RANDOM_MAP = 'random';

export const getMap = id => MAPS.find(m => m.id === id) || MAPS[0];

// Convierte la elección del menú (un mapa o "aleatorio") en un mapa concreto
export const resolveMap = choice => choice === RANDOM_MAP ? MAPS[Math.random() * MAPS.length | 0].id : getMap(choice).id;
