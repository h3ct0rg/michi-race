import type { TrackDef } from '../track';

const L = { short: 25, medium: 50, long: 100 };
const C = { easy: 2, medium: 4, hard: 6 };
const H = { low: 20, medium: 40 };

// Liberty Run: Nueva York de día. Avenidas entre rascacielos, salida al puerto con el mar a la izquierda
// (la Estatua de la Libertad aparece a lo lejos y se va acercando), un puente que pasa junto a su isla y
// la vuelta a la ciudad por curvas en S.
export const LIBERTY_RUN: TrackDef = {
  id: 'liberty-run',
  name: 'Liberty Run',
  laps: 3,
  checkpoints: 8,
  seed: 63,
  roads: [
    [L.short, L.short, L.short, 0, 0],
    // Quinta avenida (rascacielos, segmentos ~80-280)
    [L.medium, L.long, L.medium, 0, 0],
    // esquina a la derecha
    [L.short, L.short, L.short, C.hard, 0],
    [L.medium, L.medium, L.medium, 0, H.low],
    // bajada al puerto
    [L.medium, L.medium, L.medium, -C.medium, 0],
    // malecón con el mar a la izquierda (la estatua se ve al fondo)
    [L.long, L.long, L.long, 0, 0],
    [L.medium, L.medium, L.medium, -C.easy, 0],
    // puente junto a la isla de la estatua (segmentos ~1110-1290)
    [L.medium, L.long, L.medium, 0, H.medium],
    [L.medium, L.medium, L.medium, C.medium, -H.medium],
    // regreso a la ciudad
    [L.long, L.medium, L.long, 0, 0],
    // curvas en S de Downtown (rascacielos, ~1720-1940)
    [L.medium, L.short, L.medium, -3, 0],
    [L.medium, L.short, L.medium, 3, 0],
    [L.medium, L.medium, L.medium, C.medium, H.low],
    [L.long, L.medium, L.long, 0, null],
  ],
  boostPads: [
    { segment: 130, x: 0 },
    { segment: 700, x: 0.3 },
    { segment: 1150, x: 0 },
    { segment: 2150, x: -0.3 },
  ],
  itemBoxes: [320, 900, 1500, 2000],
  hazards: [
    { segment: 400, x: 0.3, kind: 1 },
    { segment: 1600, x: -0.3, kind: 3 },
    { segment: 1880, x: 0.25, kind: 3 },
  ],
  sea: { side: -1, shore: 1.7, bridges: [[1110, 1290]], bridgeShore: 1.2, ranges: [[650, 1480]] },
  landmarks: [{ segment: 1200, kind: 'liberty', offset: -2.4, far: true }],
  decor: {
    primary: 'nylamp',
    secondary: 'taxi',
    primaryRatio: 0.55,
    sea: ['ferry', 'boat', 'ferry'],
    clusters: [
      [80, 280],
      [1720, 1940],
    ],
    cluster: 'tower',
    scatter: 'hotdog',
  },
};
