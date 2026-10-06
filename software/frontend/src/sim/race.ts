// Estado autoritativo de una carrera: cuenta regresiva, checkpoints, vueltas, ranking y fin.
// Avanza en ticks fijos (TICK); el cliente solo dibuja este estado.
import { Input, NO_INPUT } from './input';
import { Racer, collideAll, stepRacer, zOf } from './physics';
import { createRng, Rng } from './rng';
import { SEGMENT_LENGTH, Track } from './track';
import { TICK } from './vehicles';
import { botInput } from './bot';

export const COUNTDOWN = 3;
const END_AFTER_FIRST = 25; // segundos de espera tras el primer finisher

export type RaceEvent =
  | { type: 'go' }
  | { type: 'checkpoint'; id: string; index: number }
  | { type: 'lap'; id: string; lap: number; time: number }
  | { type: 'finish'; id: string; place: number; time: number }
  | { type: 'end' };

export type RacePhase = 'countdown' | 'racing' | 'finished';

export class Race {
  tick = 0;
  time = 0; // segundos desde la largada
  countdown = COUNTDOWN;
  phase: RacePhase = 'countdown';
  readonly rng: Rng;
  private events: RaceEvent[] = [];
  private firstFinish: number | null = null;

  constructor(
    readonly track: Track,
    readonly racers: Racer[],
    seed: number,
  ) {
    this.rng = createRng(seed);
  }

  /** Avanza un tick. `inputs` trae el input de los humanos por id; los bots deciden solos. */
  step(inputs: Map<string, Input>) {
    this.tick++;
    for (const r of this.racers) {
      r.prevDistance = r.distance;
      r.prevX = r.x;
    }

    if (this.phase === 'countdown') {
      this.countdown -= TICK;
      if (this.countdown <= 0) {
        this.phase = 'racing';
        this.events.push({ type: 'go' });
      }
      return;
    }

    this.time += TICK;
    for (const r of this.racers) {
      const human = !r.bot && r.finishTime === null;
      const input = human ? (inputs.get(r.id) ?? NO_INPUT) : botInput(r, this);
      const before = zOf(r, this.track);
      stepRacer(r, input, this.track, TICK);
      this.checkProgress(r, before, zOf(r, this.track));
    }
    collideAll(this.racers);

    if (this.phase === 'racing') {
      const allDone = this.racers.every((r) => r.finishTime !== null);
      const timeout = this.firstFinish !== null && this.time - this.firstFinish > END_AFTER_FIRST;
      if (allDone || timeout) {
        this.phase = 'finished';
        this.events.push({ type: 'end' });
      }
    }
  }

  // Un checkpoint solo cuenta si es el siguiente esperado; la vuelta solo si se pasaron todos.
  private checkProgress(r: Racer, before: number, after: number) {
    if (r.finishTime !== null) return;
    const len = this.track.length;
    const crossed = (s: number) => (after >= before ? before < s && s <= after : before < s || s <= after);
    const total = this.track.def.checkpoints;

    if (r.nextCheckpoint < total && crossed(this.track.checkpoints[r.nextCheckpoint - 1])) {
      this.events.push({ type: 'checkpoint', id: r.id, index: r.nextCheckpoint });
      r.nextCheckpoint++;
    }
    // cruzar la meta = envolver de z ~ len a z ~ 0 avanzando
    const wrapped = after < before && before - after > len / 2;
    if (wrapped && r.nextCheckpoint === total) {
      if (r.lap > 0) {
        const lapTime = this.time - r.lapStart;
        r.lapTimes.push(lapTime);
        r.bestLap = r.bestLap === null ? lapTime : Math.min(r.bestLap, lapTime);
      }
      r.lapStart = this.time;
      r.nextCheckpoint = 1;
      if (r.lap === this.track.laps && r.finishTime === null) {
        r.finishTime = this.time;
        r.place = this.racers.filter((o) => o.finishTime !== null).length;
        this.firstFinish ??= this.time;
        this.events.push({ type: 'finish', id: r.id, place: r.place, time: this.time });
      } else if (r.finishTime === null) {
        r.lap++;
        this.events.push({ type: 'lap', id: r.id, lap: r.lap, time: this.time });
      }
    }
  }

  /** Progreso comparable: vueltas, checkpoints y distancia dentro del tramo. */
  progress(r: Racer): number {
    const len = this.track.length;
    return (r.lap * this.track.def.checkpoints + r.nextCheckpoint) * len * 2 + zOf(r, this.track);
  }

  ranking(): Racer[] {
    return [...this.racers].sort((a, b) => {
      if (a.finishTime !== null && b.finishTime !== null) return a.finishTime - b.finishTime;
      if (a.finishTime !== null) return -1;
      if (b.finishTime !== null) return 1;
      return this.progress(b) - this.progress(a);
    });
  }

  drainEvents(): RaceEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }
}

/** Parrilla de 2 columnas detrás de la línea de salida. */
export function gridSlot(slot: number): { distance: number; x: number } {
  return { distance: -(Math.floor(slot / 2) * 6 + 4) * SEGMENT_LENGTH, x: slot % 2 === 0 ? -0.4 : 0.4 };
}
