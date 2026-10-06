import type { TrackDef } from '../track';
import { DESERT_RUN } from './desertRun';
import { GREEN_VALLEY } from './greenValley';

/** Pistas disponibles, en el orden en que se muestran. Espejo de Tracks.All en el backend. */
export const TRACKS: Record<string, TrackDef> = {
  [GREEN_VALLEY.id]: GREEN_VALLEY,
  [DESERT_RUN.id]: DESERT_RUN,
};

export const DEFAULT_TRACK = GREEN_VALLEY.id;
