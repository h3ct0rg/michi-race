// Estadísticas de vehículo (1..5 estrellas) y los parámetros físicos que se derivan de ellas.
import { SEGMENT_LENGTH } from './track';

export const TICK_RATE = 30;
export const TICK = 1 / TICK_RATE;
// Velocidad de referencia: 1 segmento cada 1/60 s.
export const BASE_SPEED = SEGMENT_LENGTH * 60;

export interface VehicleStats {
  speed: number;
  acceleration: number;
  handling: number;
  weight: number;
  braking: number;
  boost: number;
}

export interface VehicleParams {
  maxSpeed: number;
  accel: number;
  braking: number;
  decel: number;
  steer: number;
  centrifugal: number;
  offroadDecel: number;
  offroadLimit: number;
  turboTime: number;
  turboRecharge: number;
  turboMult: number;
  mass: number;
}

export interface VehicleDef {
  id: string;
  name: string;
  stats: VehicleStats;
}

export const VEHICLES: Record<string, VehicleDef> = {
  michi: {
    id: 'michi',
    name: 'Michi Racer',
    stats: { speed: 4, acceleration: 3, handling: 4, weight: 2, braking: 3, boost: 3 },
  },
};

export function deriveParams(s: VehicleStats): VehicleParams {
  const maxSpeed = BASE_SPEED * (0.8 + 0.05 * s.speed);
  return {
    maxSpeed,
    accel: maxSpeed / (7 - s.acceleration),
    braking: maxSpeed * (0.6 + 0.15 * s.braking),
    decel: maxSpeed / 5,
    steer: 1.4 + 0.15 * s.handling,
    centrifugal: 0.38 - 0.02 * s.handling,
    offroadDecel: maxSpeed * (0.6 - 0.05 * s.weight),
    offroadLimit: maxSpeed / 4,
    turboTime: 1.2 + 0.15 * s.boost,
    turboRecharge: 6,
    turboMult: 1.25 + 0.03 * s.boost,
    mass: 0.6 + 0.2 * s.weight,
  };
}
