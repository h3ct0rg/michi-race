import type { TrackDef } from '../track';

const L = { short: 25, medium: 50, long: 100 };
const C = { easy: 2, medium: 4, hard: 6 };
const H = { low: 20, medium: 40, high: 60 };

// Desert Run: curva larga y rápida, dunas grandes, cañón de curvas en S entre paredes de roca,
// recta en bajada con turbos y una horquilla antes de la meta.
export const DESERT_RUN: TrackDef = {
  id: 'desert-run',
  name: 'Desert Run',
  laps: 3,
  checkpoints: 8,
  seed: 23,
  roads: [
    [L.short, L.short, L.short, 0, 0],
    // gran curva rápida a la derecha subiendo una duna suave
    [L.long, L.long, L.long, C.easy, H.low],
    // dunas grandes
    [L.medium, L.medium, L.medium, 0, H.high],
    [L.medium, L.medium, L.medium, 0, -H.high],
    [L.medium, L.medium, L.medium, 0, H.medium],
    [L.medium, L.medium, L.medium, 0, -H.medium],
    // cañón: curvas en S cerradas (segmentos ~975-1349)
    [L.medium, L.short, L.medium, -C.hard, 0],
    [L.medium, L.short, L.medium, C.hard, 0],
    [L.medium, L.short, L.medium, -C.medium, 0],
    // recta larga en bajada
    [L.long, L.long, L.long, 0, -H.low],
    // horquilla a la derecha
    [L.medium, L.medium, L.medium, C.hard, 0],
    // barrida larga a la izquierda
    [L.long, L.medium, L.long, -C.easy, 0],
    // saltitos finales
    [L.short, L.short, L.short, 0, H.low],
    [L.short, L.short, L.short, 0, -H.low],
    // regreso a la altura de la meta
    [L.medium, L.medium, L.medium, 0, null],
  ],
  boostPads: [
    { segment: 200, x: 0 },
    { segment: 450, x: -0.5 },
    { segment: 1400, x: 0 },
    { segment: 1500, x: 0.5 },
    { segment: 1900, x: -0.4 },
  ],
  decor: { primary: 'cactus', secondary: 'drybush', primaryRatio: 0.6, clusters: [[990, 1340]], cluster: 'canyonrock', scatter: 'ruin' },
};
