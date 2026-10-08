import type { TrackDef } from '../track';
import { COASTAL_ROAD } from './coastalRoad';
import { DESERT_RUN } from './desertRun';
import { GREEN_VALLEY } from './greenValley';
import { NEON_CITY } from './neonCity';

/** Pistas disponibles, en el orden del torneo (ver game/tournament.ts). Espejo de Tracks.All en el backend. */
export const TRACKS: Record<string, TrackDef> = {
  [GREEN_VALLEY.id]: GREEN_VALLEY,
  [COASTAL_ROAD.id]: COASTAL_ROAD,
  [DESERT_RUN.id]: DESERT_RUN,
  [NEON_CITY.id]: NEON_CITY,
};

export const DEFAULT_TRACK = GREEN_VALLEY.id;
