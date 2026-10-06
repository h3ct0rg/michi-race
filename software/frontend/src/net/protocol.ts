// Tipos de los mensajes SignalR; espejo de backend/src/MichiRacer.Game/Rooms/Dtos.cs.
// Con MessagePack las claves llegan en PascalCase: connection.ts las normaliza a camelCase.

export interface PlayerDto {
  id: string;
  name: string;
  color: number;
  ready: boolean;
  ping: number;
  isOwner: boolean;
  connected: boolean;
}

export interface RoomStateDto {
  code: string;
  ownerId: string;
  phase: 'lobby' | 'racing';
  trackId: string;
  trackName: string;
  laps: number;
  fillBots: boolean;
  gridSize: number;
  maxPlayers: number;
  players: PlayerDto[];
}

export interface RaceRacerDto {
  id: string;
  name: string;
  color: number;
  bot: boolean;
}

/** goTick: último tick de la cuenta regresiva; los karts se mueven desde goTick + 1. */
export interface RaceStartDto {
  trackId: string;
  racers: RaceRacerDto[];
  goTick: number;
}

export interface JoinResponse {
  playerId: string;
  token: string;
  room: RoomStateDto;
  race: RaceStartDto | null;
}

export interface ServerRaceEvent {
  type: 'go' | 'checkpoint' | 'lap' | 'finish' | 'end';
  id?: string | null;
  value?: number | null;
  time?: number | null;
}

/** Snapshot compacto. r: RACER_FIELDS números por kart (orden de RaceStartDto.racers). me: estado propio completo. */
export interface SnapshotDto {
  t: number;
  ph: 0 | 1 | 2;
  r: number[];
  me: number[] | null;
  ev: ServerRaceEvent[];
}

export const RACER_FIELDS = 9;
export const R = { d: 0, x: 1, s: 2, ln: 3, lap: 4, cp: 5, ft: 6, pl: 7, flags: 8 } as const;
export const FLAG = { drift: 1, boost: 2, respawn: 4, away: 8 } as const;

export interface ResultRowDto {
  id: string;
  name: string;
  color: number;
  bot: boolean;
  place: number;
  finishTime: number | null;
  bestLap: number | null;
}

export interface ResultsDto {
  trackName: string;
  rows: ResultRowDto[];
}
