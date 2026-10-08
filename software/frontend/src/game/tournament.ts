// Torneo de 4 carreras con puntos acumulados. Espejo de backend/src/MichiRacer.Game/Rooms/Tournament.cs:
// online lo decide el servidor; la práctica local usa LocalTournament con las mismas reglas.
import type { Racer } from '../sim/physics';

/** De fácil a difícil. */
export const TOURNAMENT_ORDER = ['green-valley', 'coastal-road', 'desert-run', 'neon-city'];
export const INTERMISSION_SECONDS = 8;

const TOP = [25, 20, 16, 13, 11];

/** 1º 25, 2º 20, 3º 16, 4º 13, 5º 11, 6º 10... y uno menos por puesto hasta 0. */
export const pointsFor = (place: number) => (place <= 0 ? 0 : place <= TOP.length ? TOP[place - 1] : Math.max(0, 16 - place));

export interface Standing {
  id: string;
  name: string;
  color: number;
  bot: boolean;
  points: number;
  /** places[i] = puesto en la carrera i (0 = no corrió). */
  places: number[];
}

/** Puesto en la última carrera corrida hasta `upTo` (para desempatar). */
const lastPlace = (s: Standing, upTo: number) => {
  for (let i = Math.min(upTo, s.places.length - 1); i >= 0; i--) if (s.places[i] > 0) return s.places[i];
  return Number.MAX_SAFE_INTEGER;
};

/** Más puntos primero; empate: mejor puesto en la última carrera; luego orden de llegada. */
export function rankStandings(all: Standing[], raceIndex: number): Standing[] {
  return all
    .map((s, i) => ({ s, i }))
    .sort((a, b) => b.s.points - a.s.points || lastPlace(a.s, raceIndex) - lastPlace(b.s, raceIndex) || a.i - b.i)
    .map((x) => x.s);
}

/** Torneo de la práctica local (sin servidor). */
export class LocalTournament {
  raceIndex = 0;
  private standings: Standing[] = [];

  get trackId() {
    return TOURNAMENT_ORDER[this.raceIndex];
  }

  get final() {
    return this.raceIndex >= TOURNAMENT_ORDER.length - 1;
  }

  /** Suma la carrera terminada; devuelve los puntos ganados por id. */
  record(ranking: Racer[], colorOf: (id: string) => number): Map<string, number> {
    const earned = new Map<string, number>();
    ranking.forEach((r, i) => {
      let s = this.standings.find((x) => x.id === r.id);
      if (!s) {
        s = { id: r.id, name: r.name, color: colorOf(r.id), bot: !!r.bot, points: 0, places: TOURNAMENT_ORDER.map(() => 0) };
        this.standings.push(s);
      }
      const pts = pointsFor(i + 1);
      s.points += pts;
      s.places[this.raceIndex] = i + 1;
      earned.set(r.id, pts);
    });
    return earned;
  }

  ranked(): Standing[] {
    return rankStandings(this.standings, this.raceIndex);
  }

  /** Orden de largada de la próxima carrera: el líder adelante. */
  gridOrder(): string[] {
    return this.ranked().map((s) => s.id);
  }

  next() {
    this.raceIndex++;
  }
}
