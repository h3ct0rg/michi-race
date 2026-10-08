import type { TrackDef } from '../track';

const L = { short: 25, medium: 50, long: 100 };
const C = { easy: 2, medium: 4, hard: 6 };
const H = { low: 20, medium: 40 };

// Coastal Road: vuelta a una isla en sentido horario, con el mar siempre a la izquierda.
// Playa, subida al acantilado, un puente sobre el agua (mar a ambos lados), el puerto
// con el faro y curvas en S entre palmeras. Salirse por la orilla = caer al agua.
export const COASTAL_ROAD: TrackDef = {
  id: 'coastal-road',
  name: 'Coastal Road',
  laps: 3,
  checkpoints: 8,
  seed: 57,
  roads: [
    [L.short, L.short, L.short, 0, 0],
    // recta de la playa
    [L.medium, L.long, L.medium, 0, 0],
    // curva larga a la derecha bordeando la bahía
    [L.long, L.long, L.long, C.easy, H.low],
    // subida al acantilado, curva arriba y bajada
    [L.medium, L.medium, L.medium, 0, H.medium],
    [L.medium, L.medium, L.medium, C.medium, 0],
    [L.medium, L.medium, L.medium, 0, -H.medium],
    // puente sobre el mar (segmentos ~1030-1220)
    [L.medium, L.long, L.medium, 0, 0],
    // quiebre a la izquierda y curva cerrada a la derecha
    [L.short, L.short, L.short, -C.medium, 0],
    [L.medium, L.medium, L.medium, C.hard, 0],
    // recta del puerto (faro)
    [L.long, L.medium, L.long, 0, 0],
    // curvas en S entre palmeras
    [L.medium, L.short, L.medium, -C.easy, 0],
    [L.medium, L.short, L.medium, C.medium, 0],
    // última curva a la derecha y regreso a la meta
    [L.medium, L.medium, L.medium, C.medium, H.low],
    [L.long, L.medium, L.long, 0, null],
  ],
  boostPads: [
    { segment: 130, x: 0 },
    { segment: 1100, x: 0 },
    { segment: 1480, x: -0.4 },
    { segment: 2150, x: 0.3 },
  ],
  itemBoxes: [320, 950, 1500, 2000],
  hazards: [
    { segment: 180, x: 0.3, kind: 2 },
    { segment: 1550, x: 0.35, kind: 1 },
    { segment: 1600, x: -0.3, kind: 2 },
  ],
  sea: { side: -1, shore: 1.7, bridges: [[1030, 1220]], bridgeShore: 1.2 },
  landmarks: [
    { segment: 1460, kind: 'lighthouse', offset: -2.6 },
    { segment: 300, kind: 'lighthouse', offset: -6 },
  ],
  decor: {
    primary: 'palm',
    secondary: 'hut',
    primaryRatio: 0.6,
    sea: ['searock', 'boat', 'searock'],
    clusters: [[600, 860]],
    cluster: 'palm',
    scatter: 'rock',
  },
};
