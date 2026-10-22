// Práctica local contra bots: la simulación corre entera en el navegador.
import type { Controls } from '../input/controls';
import { createRacer, Racer } from '../sim/physics';
import { Race, RaceEvent, gridSlot } from '../sim/race';
import type { Track } from '../sim/track';
import { TICK, VEHICLES, deriveParams } from '../sim/vehicles';
import type { RaceSession } from './session';
import { t } from '../i18n';

/** Nombres de los bots (mismos que el servidor). */
export const PRACTICE_BOTS = [
  'TurboCat', 'ApexMiau', 'Bigotes', 'Pelusa', 'Garfi', 'Nieve', 'Ronroneo', 'Misifú', 'Zarpas', 'Michifuz',
  'Tigrito', 'Canela', 'Bolita', 'Copito', 'Manchas', 'Sombra', 'Galleta', 'Pimienta', 'Rayo',
];
export const MAX_RIVALS = PRACTICE_BOTS.length;

export type Difficulty = 'easy' | 'normal' | 'hard';
/** Habilidad de los bots (fracción de la velocidad máxima que buscan): del más lento al más rápido. */
const SKILL: Record<Difficulty, [number, number]> = { easy: [0.7, 0.8], normal: [0.8, 0.92], hard: [0.9, 1] };

export interface PracticeOptions {
  rivals: number;
  difficulty: Difficulty;
  /** ids en orden de largada (torneo: el líder adelante); sin él, el jugador sale último. */
  gridOrder?: string[] | null;
}

export class PracticeSession implements RaceSession {
  readonly race: Race;
  readonly player: Racer;
  private acc = 0;

  constructor(
    track: Track,
    private readonly controls: Controls,
    playerName: string,
    { rivals, difficulty, gridOrder = null }: PracticeOptions = { rivals: 7, difficulty: 'normal' },
  ) {
    const vehicle = deriveParams(VEHICLES.michi.stats);
    const checkpoints = track.def.checkpoints;
    const count = Math.max(1, Math.min(MAX_RIVALS, rivals));
    const [lo, hi] = SKILL[difficulty];
    const entries = [
      ...PRACTICE_BOTS.slice(0, count).map((name, i) => ({ id: `bot${i}`, name, skill: lo + (count > 1 ? i / (count - 1) : 0.5) * (hi - lo) })),
      { id: 'player', name: playerName, skill: null },
    ];
    if (gridOrder) entries.sort((a, b) => gridOrder.indexOf(a.id) - gridOrder.indexOf(b.id));
    const racers = entries.map((e, i) => {
      const slot = gridSlot(i);
      const r = createRacer(e.id, e.name, vehicle, slot.distance, slot.x, checkpoints);
      if (e.skill !== null) r.bot = { skill: e.skill, lane: slot.x, laneTimer: 2 };
      return r;
    });
    this.player = racers.find((r) => r.id === 'player')!;
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
    return t('race.practice');
  }

  drainEvents(): RaceEvent[] {
    return this.race.drainEvents();
  }

  dispose() {}
}
