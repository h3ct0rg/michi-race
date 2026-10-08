import type { TrackDef } from '../track';

const L = { short: 25, medium: 50, long: 100 };
const C = { easy: 2, medium: 4, hard: 6 };
const H = { low: 20, medium: 40 };

// Neon City: avenida entre rascacielos, esquinas de 90°, un paso elevado,
// una chicana cerrada y un bulevar de neón antes de la meta.
export const NEON_CITY: TrackDef = {
  id: 'neon-city',
  name: 'Neon City',
  laps: 3,
  checkpoints: 8,
  seed: 41,
  roads: [
    [L.short, L.short, L.short, 0, 0],
    // avenida del centro (rascacielos a los lados, segmentos ~80-270)
    [L.medium, L.long, L.medium, 0, 0],
    // esquina a la derecha
    [L.short, L.short, L.short, C.hard, 0],
    // paso elevado: subida, curva arriba y bajada
    [L.medium, L.medium, L.medium, 0, H.medium],
    [L.medium, L.medium, L.medium, -C.medium, 0],
    [L.medium, L.medium, L.medium, 0, -H.medium],
    // esquina a la izquierda y chicana
    [L.short, L.short, L.short, -C.hard, 0],
    [L.short, L.short, L.short, C.hard, 0],
    [L.short, L.short, L.short, -C.hard, 0],
    // bulevar de neón (segmentos ~1030-1320)
    [L.long, L.long, L.long, 0, 0],
    [L.medium, L.medium, L.medium, C.medium, H.low],
    // horquilla a la derecha
    [L.short, L.medium, L.short, C.hard, 0],
    [L.medium, L.medium, L.medium, -C.easy, -H.low],
    // recta de regreso a la meta
    [L.long, L.medium, L.long, 0, null],
  ],
  boostPads: [
    { segment: 150, x: 0 },
    { segment: 600, x: -0.4 },
    { segment: 1100, x: 0 },
    { segment: 1250, x: 0.5 },
    { segment: 1800, x: -0.4 },
  ],
  itemBoxes: [300, 880, 1400, 1850],
  hazards: [
    { segment: 350, x: -0.3, kind: 3 },
    { segment: 700, x: 0.35, kind: 1 },
    { segment: 1150, x: 0.3, kind: 3 },
    { segment: 1600, x: 0, kind: 3 },
  ],
  decor: {
    primary: 'lamp',
    secondary: 'billboard',
    primaryRatio: 0.65,
    clusters: [
      [80, 270],
      [1030, 1320],
    ],
    cluster: 'building',
    scatter: 'barrier',
  },
};
