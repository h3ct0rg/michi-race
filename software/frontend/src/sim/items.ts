// Power-ups, cajas de ítems, proyectiles y obstáculos. Constantes compartidas con el servidor C# (Sim/Items.cs).

export const ITEM = { none: 0, turbo: 1, shield: 2, bomb: 3, lightning: 4, magnet: 5, freeze: 6, rocket: 7 } as const;
export type ItemId = (typeof ITEM)[keyof typeof ITEM];
export const ITEM_KEYS = ['none', 'turbo', 'shield', 'bomb', 'lightning', 'magnet', 'freeze', 'rocket'] as const;
export const ITEM_LABELS = ['', 'TURBO', 'ESCUDO', 'BOMBA', 'RAYO', 'IMÁN', 'HIELO', 'COHETE'];

export const ITEM_ROLL_TIME = 1.2; // "ruleta" antes de poder usar el ítem
export const SHIELD_TIME = 8;
export const MAGNET_TIME = 3;
export const TURBO_ITEM_MULT = 1.25; // duración del turbo-ítem respecto del turbo del vehículo

export const BOX_LANES = [-0.55, 0, 0.55];
export const BOX_RESPAWN = 2.5;
export const BOX_HALF = 0.15;
export const MAGNET_BOX_HALF = 0.55; // el imán atrae cajas desde más lejos

/** Efectos de golpe sobre un kart. */
export const HIT = { spin: 1, shock: 2, freeze: 3 } as const;
export const SPIN_TIME = 1.2;
export const SHOCK_TIME = 2.5;
export const FREEZE_TIME = 1.8;

/** Obstáculos pintados sobre la pista. */
export const HAZARD = { oil: 1, sand: 2, puddle: 3 } as const;
export const HAZARD_HALF = 0.25;
export const HAZARD_LENGTH = 6; // segmentos
export const OIL_SPIN_TIME = 0.9;

// Proyectiles
export const PROJ_STATE = { flying: 0, armed: 1, exploding: 2 } as const;
export const BOMB_THROW = 300;
export const BOMB_FLIGHT = 0.5;
export const BOMB_FUSE = 4;
export const BOMB_TRIGGER_Z = 220;
export const BOMB_TRIGGER_X = 0.35;
export const BOMB_BLAST_Z = 500;
export const BOMB_BLAST_X = 0.7;
export const ROCKET_LAUNCH = 250;
export const ROCKET_SPEED_MULT = 1.6;
export const ROCKET_LIFE = 6;
export const ROCKET_TURN = 2.5; // unidades de x por segundo
export const ROCKET_HIT_Z = 250;
export const ROCKET_HIT_X = 0.35;
export const EXPLOSION_TIME = 0.5;

/**
 * Probabilidades por posición (índice = ítem). Los de atrás reciben ítems ofensivos;
 * los de adelante, defensivos: caótico pero justo.
 */
const ODDS: number[][] = [
  // none turbo shield bomb lightning magnet freeze rocket
  [0, 2, 3, 3, 0, 1, 1, 0], // adelante (primer cuarto)
  [0, 3, 2, 2, 0.5, 2, 2, 2], // medio
  [0, 4, 0, 0, 2, 2, 1, 3], // atrás (último 30 %)
];

/** Elige un ítem. roll ∈ [0,1) del RNG de la carrera; rankFrac 0 = líder, 1 = último. */
export function rollItem(roll: number, rankFrac: number): number {
  const odds = ODDS[rankFrac < 0.25 ? 0 : rankFrac < 0.7 ? 1 : 2];
  let total = 0;
  for (const w of odds) total += w;
  let pick = roll * total;
  for (let i = 1; i < odds.length; i++) {
    pick -= odds[i];
    if (pick < 0) return i;
  }
  return ITEM.turbo;
}

export interface Projectile {
  id: number;
  kind: number; // ITEM.bomb | ITEM.rocket
  owner: string;
  target: string | null;
  distance: number;
  x: number;
  speed: number;
  state: number;
  timer: number;
}
