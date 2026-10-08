// Estado autoritativo de una carrera: cuenta regresiva, checkpoints, vueltas, ítems, proyectiles,
// ranking y fin. Avanza en ticks fijos (TICK); el cliente solo dibuja este estado.
import { Input, NO_INPUT } from './input';
import { KART_HALF, Racer, collideAll, stepRacer, zOf } from './physics';
import { createRng, Rng } from './rng';
import { SEGMENT_LENGTH, Track } from './track';
import { TICK } from './vehicles';
import { botInput } from './bot';
import {
  BOMB_BLAST_X,
  BOMB_BLAST_Z,
  BOMB_FLIGHT,
  BOMB_FUSE,
  BOMB_THROW,
  BOMB_TRIGGER_X,
  BOMB_TRIGGER_Z,
  BOX_HALF,
  BOX_LANES,
  BOX_RESPAWN,
  EXPLOSION_TIME,
  FREEZE_TIME,
  HIT,
  ITEM,
  ITEM_ROLL_TIME,
  MAGNET_BOX_HALF,
  PROJ_STATE,
  Projectile,
  ROCKET_HIT_X,
  ROCKET_HIT_Z,
  ROCKET_LAUNCH,
  ROCKET_LIFE,
  ROCKET_SPEED_MULT,
  ROCKET_TURN,
  SHOCK_TIME,
  SPIN_TIME,
  rollItem,
} from './items';

export const COUNTDOWN = 3;
const END_AFTER_FIRST = 25; // segundos de espera tras el primer finisher

export type RaceEvent =
  | { type: 'go' }
  | { type: 'checkpoint'; id: string; index: number }
  | { type: 'lap'; id: string; lap: number; time: number }
  | { type: 'finish'; id: string; place: number; time: number }
  | { type: 'item'; id: string; item: number } // recogió un ítem
  | { type: 'use'; id: string; item: number } // usó un ítem ofensivo
  | { type: 'hit'; id: string; hit: number } // recibió un golpe (HIT.*)
  | { type: 'blocked'; id: string } // el escudo absorbió un golpe
  | { type: 'end' };

export type RacePhase = 'countdown' | 'racing' | 'finished';

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export class Race {
  tick = 0;
  time = 0; // segundos desde la largada
  countdown = COUNTDOWN;
  phase: RacePhase = 'countdown';
  readonly rng: Rng;
  /** Momento (race.time) en que cada caja vuelve a estar disponible; índice = fila * 3 + carril. */
  readonly boxRespawn: number[];
  projectiles: Projectile[] = [];
  private nextProjectileId = 1;
  private events: RaceEvent[] = [];
  private firstFinish: number | null = null;

  constructor(
    readonly track: Track,
    readonly racers: Racer[],
    seed: number,
  ) {
    this.rng = createRng(seed);
    this.boxRespawn = new Array(track.itemRows.length * BOX_LANES.length).fill(0);
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
      const after = zOf(r, this.track);
      this.checkProgress(r, before, after);
      this.pickBoxes(r, before, after);
      if (r.pendingUse !== ITEM.none) this.resolveUse(r);
    }
    this.updateProjectiles(TICK);
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

  private crossed(before: number, after: number, s: number) {
    return after >= before ? before < s && s <= after : before < s || s <= after;
  }

  // Un checkpoint solo cuenta si es el siguiente esperado; la vuelta solo si se pasaron todos.
  private checkProgress(r: Racer, before: number, after: number) {
    if (r.finishTime !== null) return;
    const len = this.track.length;
    const total = this.track.def.checkpoints;

    if (r.nextCheckpoint < total && this.crossed(before, after, this.track.checkpoints[r.nextCheckpoint - 1])) {
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

  // ------------------------------------------------------------------ ítems

  /** Al pasar por una fila de cajas: rompe la caja tocada y, si no tiene ítem, recibe uno. */
  private pickBoxes(r: Racer, before: number, after: number) {
    const rows = this.track.itemRows;
    for (let row = 0; row < rows.length; row++) {
      if (!this.crossed(before, after, rows[row])) continue;
      const reach = KART_HALF + (r.magnetLeft > 0 ? MAGNET_BOX_HALF : BOX_HALF);
      for (let lane = 0; lane < BOX_LANES.length; lane++) {
        const idx = row * BOX_LANES.length + lane;
        if (this.time < this.boxRespawn[idx] || Math.abs(r.x - BOX_LANES[lane]) >= reach) continue;
        this.boxRespawn[idx] = this.time + BOX_RESPAWN;
        if (r.item === ITEM.none && r.itemRoll <= 0) {
          let ahead = 0;
          for (const o of this.racers) if (o !== r && o.distance > r.distance) ahead++;
          const frac = this.racers.length > 1 ? ahead / (this.racers.length - 1) : 0;
          r.item = rollItem(this.rng(), frac);
          r.itemRoll = ITEM_ROLL_TIME;
          this.events.push({ type: 'item', id: r.id, item: r.item });
        }
      }
    }
  }

  /** El kart inmediatamente adelante en la carrera (el objetivo de cohete y hielo). */
  private racerAhead(r: Racer): Racer | null {
    let best: Racer | null = null;
    for (const o of this.racers) {
      if (o === r || o.finishTime !== null || o.distance <= r.distance) continue;
      if (best === null || o.distance < best.distance) best = o;
    }
    return best;
  }

  /** Ítems ofensivos usados por stepRacer (los de efecto propio ya se aplicaron allí). */
  private resolveUse(r: Racer) {
    const item = r.pendingUse;
    r.pendingUse = ITEM.none;
    this.events.push({ type: 'use', id: r.id, item });
    if (item === ITEM.bomb) {
      this.projectiles.push({
        id: this.nextProjectileId++,
        kind: ITEM.bomb,
        owner: r.id,
        target: null,
        distance: r.distance + BOMB_THROW,
        x: r.x,
        speed: r.speed + 3000,
        state: PROJ_STATE.flying,
        timer: BOMB_FLIGHT,
      });
    } else if (item === ITEM.rocket) {
      const target = this.racerAhead(r);
      this.projectiles.push({
        id: this.nextProjectileId++,
        kind: ITEM.rocket,
        owner: r.id,
        target: target ? target.id : null,
        distance: r.distance + ROCKET_LAUNCH,
        x: r.x,
        speed: r.vehicle.maxSpeed * ROCKET_SPEED_MULT,
        state: PROJ_STATE.flying,
        timer: ROCKET_LIFE,
      });
    } else if (item === ITEM.lightning) {
      for (const o of this.racers) {
        if (o !== r && o.finishTime === null && o.distance > r.distance) this.hit(o, HIT.shock);
      }
    } else if (item === ITEM.freeze) {
      const target = this.racerAhead(r);
      if (target) this.hit(target, HIT.freeze);
    }
  }

  /** Aplica un golpe; el escudo lo absorbe una vez. */
  private hit(t: Racer, kind: number) {
    if (t.respawn > 0) return;
    if (t.shieldLeft > 0) {
      t.shieldLeft = 0;
      this.events.push({ type: 'blocked', id: t.id });
      return;
    }
    if (kind === HIT.spin) {
      t.spinLeft = SPIN_TIME;
      t.speed *= 0.5;
      t.drift.active = false;
      t.bump = 0;
    } else if (kind === HIT.shock) {
      t.shockLeft = SHOCK_TIME;
      t.speed *= 0.6;
    } else if (kind === HIT.freeze) {
      t.frozenLeft = FREEZE_TIME;
      t.speed *= 0.5;
      t.drift.active = false;
    }
    this.events.push({ type: 'hit', id: t.id, hit: kind });
  }

  private explode(p: Projectile, blast: boolean) {
    p.state = PROJ_STATE.exploding;
    p.timer = EXPLOSION_TIME;
    if (!blast) return;
    for (const o of this.racers) {
      if (Math.abs(o.distance - p.distance) < BOMB_BLAST_Z && Math.abs(o.x - p.x) < BOMB_BLAST_X) this.hit(o, HIT.spin);
    }
  }

  private updateProjectiles(dt: number) {
    for (const p of this.projectiles) {
      if (p.state === PROJ_STATE.exploding) {
        p.timer -= dt;
      } else if (p.kind === ITEM.bomb) {
        if (p.state === PROJ_STATE.flying) {
          p.distance += p.speed * dt;
          p.timer -= dt;
          if (p.timer <= 0) {
            p.state = PROJ_STATE.armed;
            p.timer = BOMB_FUSE;
          }
        } else {
          p.timer -= dt;
          let touched = false;
          for (const o of this.racers) {
            if (o.respawn <= 0 && Math.abs(o.distance - p.distance) < BOMB_TRIGGER_Z && Math.abs(o.x - p.x) < BOMB_TRIGGER_X) touched = true;
          }
          if (touched || p.timer <= 0) this.explode(p, true);
        }
      } else {
        // cohete: avanza y gira hacia su objetivo
        p.distance += p.speed * dt;
        p.timer -= dt;
        const target = p.target === null ? null : (this.racers.find((o) => o.id === p.target) ?? null);
        if (target) {
          p.x += clamp(target.x - p.x, -ROCKET_TURN * dt, ROCKET_TURN * dt);
          if (Math.abs(target.distance - p.distance) < ROCKET_HIT_Z && Math.abs(target.x - p.x) < ROCKET_HIT_X) {
            this.hit(target, HIT.spin);
            this.explode(p, false);
            continue;
          }
        }
        if (p.timer <= 0) this.explode(p, false);
      }
    }
    this.projectiles = this.projectiles.filter((p) => !(p.state === PROJ_STATE.exploding && p.timer <= 0));
  }

  /** ¿La caja está disponible? */
  boxActive(index: number) {
    return this.time >= this.boxRespawn[index];
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
