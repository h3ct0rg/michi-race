import type { TrackDef } from '../track';

const L = { short: 25, medium: 50, long: 100 };
const C = { easy: 2, medium: 4, hard: 6 };
const H = { low: 20, medium: 40, high: 60 };

export const GREEN_VALLEY: TrackDef = {
  id: 'green-valley',
  name: 'Green Valley',
  laps: 3,
  checkpoints: 8,
  seed: 7,
  roads: [
    [L.short, L.short, L.short, 0, 0],
    [L.medium, L.medium, L.medium, C.easy, H.low],
    [L.medium, L.medium, L.medium, 0, H.medium],
    [L.medium, L.medium, L.medium, -C.medium, 0],
    // curvas en S
    [L.medium, L.medium, L.medium, -C.easy, 0],
    [L.medium, L.medium, L.medium, C.medium, -H.low],
    [L.medium, L.medium, L.medium, -C.easy, 0],
    // colinas
    [L.short, L.short, L.short, 0, H.low],
    [L.short, L.short, L.short, 0, -H.low],
    [L.short, L.short, L.short, 0, H.medium],
    [L.short, L.short, L.short, 0, -H.medium],
    [L.long, L.long, L.long, C.medium, H.high],
    [L.medium, L.medium, L.medium, -C.hard, -H.medium],
    [L.long, L.long, L.long, C.easy, 0],
    [L.medium, L.medium, L.medium, -C.medium, -H.medium],
    // bajada final a la meta
    [L.long, L.medium, L.long, 0, null],
  ],
  boostPads: [
    { segment: 120, x: 0 },
    { segment: 420, x: -0.5 },
    { segment: 560, x: 0.5 },
    { segment: 1150, x: 0 },
    { segment: 1700, x: -0.4 },
  ],
  decor: { primary: 'tree', secondary: 'bush', primaryRatio: 0.75, clusters: [[600, 780]], cluster: 'tree', scatter: 'rock' },
};
