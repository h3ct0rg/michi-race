import type { TrackDef } from '../track';

// Cosmic Rainbow: una ruta arcoíris flotando en el espacio, de noche profunda. Subidas y bajadas muy
// empinadas (con física: subiendo frenas, bajando aceleras) y sin barandas: salirse es caer al vacío.
// Las alturas suman 0 para que la vuelta cierre a nivel.
export const COSMIC_RAINBOW: TrackDef = {
  id: 'cosmic-rainbow',
  name: 'Cosmic Rainbow',
  laps: 3,
  checkpoints: 8,
  seed: 77,
  slopePhysics: true,
  roads: [
    [25, 25, 25, 0, 0],
    // primera subida empinada y su bajada
    [25, 50, 25, 0, 60],
    [25, 50, 25, 0, -60],
    [50, 50, 50, 4, 0],
    // subida a una horquilla en la cima y bajada
    [25, 25, 25, 0, 50],
    [25, 25, 25, -6, 0],
    [25, 50, 25, 0, -50],
    // recta larga bajo los arcos de neón
    [50, 100, 50, 0, 0],
    // la gran subida, meseta y caída en picada
    [25, 50, 25, 0, 80],
    [25, 25, 25, 0, 0],
    [50, 25, 50, 0, -80],
    [50, 50, 50, -4, 0],
    // eses que suben y bajan
    [50, 25, 50, 4, 30],
    [50, 25, 50, -4, -30],
    [25, 50, 25, 0, 60],
    [25, 50, 25, 0, -60],
    [50, 50, 50, 6, 0],
    [100, 50, 100, 0, 0],
  ],
  boostPads: [
    { segment: 180, x: 0 },
    { segment: 600, x: 0 },
    { segment: 720, x: -0.35 },
    { segment: 780, x: 0.35 },
    { segment: 1070, x: 0 },
    { segment: 1690, x: 0 },
    { segment: 2000, x: 0 },
  ],
  itemBoxes: [300, 820, 1250, 1850],
  hazards: [],
  // vacío a ambos lados en toda la pista (un "puente" de punta a punta)
  sea: { side: -1, shore: 1.25, bridges: [[0, 9999]], bridgeShore: 1.25 },
  landmarks: [
    { segment: 700, kind: 'arch', offset: 0 },
    { segment: 760, kind: 'arch', offset: 0 },
    { segment: 820, kind: 'arch', offset: 0 },
    { segment: 1000, kind: 'arch', offset: 0 },
    { segment: 1990, kind: 'arch', offset: 0 },
    { segment: 2080, kind: 'arch', offset: 0 },
  ],
  decor: {
    primary: 'star',
    secondary: 'star',
    primaryRatio: 1,
    sea: ['star', 'star', 'comet'],
    clusters: [],
    cluster: 'star',
    scatter: 'star',
  },
};
