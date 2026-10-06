// Práctica local contra bots: la simulación corre entera en el navegador.
import type { Controls } from '../input/controls';
import { createRacer, Racer } from '../sim/physics';
import { Race, RaceEvent, gridSlot } from '../sim/race';
import type { Track } from '../sim/track';
import { TICK, VEHICLES, deriveParams } from '../sim/vehicles';
import type { RaceSession } from './session';

export const PRACTICE_BOTS = ['TurboCat', 'ApexMiau', 'Bigotes', 'Pelusa', 'Garfi', 'Nieve', 'Ronroneo'];

export class PracticeSession implements RaceSession {
  readonly race: Race;
  readonly player: Racer;
  private acc = 0;

  constructor(
    track: Track,
    private readonly controls: Controls,
    playerName: string,
  ) {
    const vehicle = deriveParams(VEHICLES.michi.stats);
    const checkpoints = track.def.checkpoints;
    const racers = PRACTICE_BOTS.map((name, i) => {
      const slot = gridSlot(i);
      const r = createRacer(`bot${i}`, name, vehicle, slot.distance, slot.x, checkpoints);
      r.bot = { skill: 0.8 + (i / PRACTICE_BOTS.length) * 0.12, lane: slot.x, laneTimer: 2 };
      return r;
    });
    const slot = gridSlot(PRACTICE_BOTS.length);
    this.player = createRacer('player', playerName, vehicle, slot.distance, slot.x, checkpoints);
    racers.push(this.player);
    this.race = new Race(track, racers, (Math.random() * 2 ** 31) | 0);
    if (import.meta.env.DEV) (window as unknown as { __race: Race }).__race = this.race; // depuración
  }

  update(dt: number): number {
    this.acc += dt;
    while (this.acc >= TICK) {
      this.race.step(new Map([[this.player.id, this.controls.read()]]));
      this.acc -= TICK;
    }
    return this.acc / TICK;
  }

  netInfo() {
    return 'PRÁCTICA LOCAL';
  }

  drainEvents(): RaceEvent[] {
    return this.race.drainEvents();
  }

  dispose() {}
}
