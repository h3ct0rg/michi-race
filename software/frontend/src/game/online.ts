// Carrera online. El servidor es la autoridad; el cliente:
//  - predice su propio kart con la misma física y lo reconcilia con cada snapshot (corrección suave),
//  - simula en el "tick de input" (reloj del servidor + RTT) para que todos larguen a la vez,
//  - dibuja a los rivales interpolando entre snapshots por tick del servidor,
//  - puede ser espectador (entró a mitad de carrera): la cámara sigue al líder.
import type { Controls } from '../input/controls';
import { ServerClock } from '../net/clock';
import type { GameConnection } from '../net/connection';
import { FLAG, PROJECTILE_FIELDS, R, RACER_FIELDS, RaceStartDto, SnapshotDto } from '../net/protocol';
import type { Input } from '../sim/input';
import { collideWithGhost, createRacer, KART_HALF, Racer, stepRacer } from '../sim/physics';
import { Race, RaceEvent } from '../sim/race';
import { SEGMENT_LENGTH, Track } from '../sim/track';
import { TICK, TICK_RATE, VEHICLES, deriveParams } from '../sim/vehicles';
import type { RaceSession } from './session';
import { t as tr } from '../i18n';

const MAX_CATCH_UP = 5;
const SNAP_CORRECTION = 2500; // por encima de esto (reaparición) la corrección es instantánea
const SMOOTHING = 10; // 1/s: la corrección visual se reduce ~63 % cada 100 ms

interface Buffered {
  t: number;
  r: number[];
}

/** Estado propio completo (orden de SnapshotLayout.Self en C#). El último valor (seq) lo usa el llamador. */
const SELF_SEQ = 29;
function applySelf(r: Racer, m: number[]) {
  [r.distance, r.x, r.vx, r.speed, r.steer, r.lean, r.turboLeft, r.boostLeft] = m;
  r.drift.active = m[8] === 1;
  r.drift.dir = m[9];
  r.drift.charge = m[10];
  [r.lostTime, r.respawn, r.bump, r.lap, r.nextCheckpoint, r.lapStart] = m.slice(11, 17);
  r.bestLap = m[17] < 0 ? null : m[17];
  r.finishTime = m[18] < 0 ? null : m[18];
  r.place = m[19] === 0 ? null : m[19];
  r.item = m[20];
  r.itemRoll = m[21];
  r.useHeld = m[22] === 1;
  [r.shieldLeft, r.spinLeft, r.shockLeft, r.frozenLeft, r.magnetLeft, r.splash] = m.slice(23, 29);
  r.pendingUse = 0; // los ítems ofensivos los resuelve el servidor
}

/** Estados visuales de un kart remoto a partir de sus flags (solo para dibujar). */
function applyFlags(r: Racer, flags: number) {
  r.drift.active = (flags & FLAG.drift) !== 0;
  r.boostLeft = flags & FLAG.boost ? 0.1 : 0;
  r.respawn = flags & FLAG.respawn ? 0.1 : 0;
  r.shieldLeft = flags & FLAG.shield ? 0.1 : 0;
  r.spinLeft = flags & FLAG.spin ? 0.1 : 0;
  r.shockLeft = flags & FLAG.shock ? 0.1 : 0;
  r.frozenLeft = flags & FLAG.frozen ? 0.1 : 0;
  r.magnetLeft = flags & FLAG.magnet ? 0.1 : 0;
  r.splash = flags & FLAG.splash ? 0.1 : 0;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export class OnlineSession implements RaceSession {
  readonly race: Race;
  readonly labels = new Map<string, string>();
  readonly spectator: boolean;
  private readonly me: Racer | null;
  private readonly clock = new ServerClock();
  private follow: Racer;
  private followUntil = 0;
  private localTick: number | null = null;
  private tickFloat = 0;
  private pending: { seq: number; input: Input }[] = [];
  private buffer: Buffered[] = [];
  private events: RaceEvent[] = [];
  private serverPhase: 0 | 1 | 2 = 0;
  private errD = 0;
  private errX = 0;
  private lastFrame = performance.now();
  // diagnóstico
  private snapCount = 0;
  private snapRate = 0;
  private rateWindow = performance.now();
  private corrections: number[] = [];

  constructor(
    private readonly track: Track,
    private readonly conn: GameConnection,
    private readonly controls: Controls,
    private readonly start: RaceStartDto,
    myId: string,
  ) {
    const vehicle = deriveParams(VEHICLES.michi.stats);
    const racers = start.racers.map((r) => {
      const racer = createRacer(r.id, r.name, vehicle, 0, 0, track.def.checkpoints);
      if (r.bot) racer.bot = { skill: 0, lane: 0, laneTimer: 0 };
      else if (r.id !== myId) this.labels.set(r.id, r.name);
      return racer;
    });
    this.race = new Race(track, racers, 0);
    this.me = racers.find((r) => r.id === myId) ?? null;
    this.spectator = this.me === null;
    this.follow = this.me ?? racers[0];
    conn.onSnapshot = (s) => this.onSnapshot(s);
    if (import.meta.env.DEV) (window as unknown as { __online: OnlineSession }).__online = this; // depuración
  }

  get player(): Racer {
    return this.follow;
  }

  // ------------------------------------------------------------------ snapshots

  private onSnapshot(s: SnapshotDto) {
    this.clock.onSnapshot(s.t);
    this.serverPhase = s.ph;
    this.buffer.push({ t: s.t, r: s.r });
    if (this.buffer.length > 40) this.buffer.shift();
    this.snapCount++;

    // proyectiles y cajas: estado del servidor tal cual (solo se dibujan)
    const projectiles = [];
    for (let i = 0; i + PROJECTILE_FIELDS <= s.p.length; i += PROJECTILE_FIELDS) {
      projectiles.push({ id: i, kind: s.p[i], owner: '', target: null, distance: s.p[i + 1], x: s.p[i + 2], speed: 0, state: s.p[i + 3], timer: 0 });
    }
    this.race.projectiles = projectiles;
    this.race.boxRespawn.fill(0);
    for (const b of s.b) if (b < this.race.boxRespawn.length) this.race.boxRespawn[b] = Number.MAX_VALUE;

    for (const e of s.ev) {
      if (e.type === 'lap') this.events.push({ type: 'lap', id: e.id!, lap: e.value!, time: e.time! });
      else if (e.type === 'finish') this.events.push({ type: 'finish', id: e.id!, place: e.value!, time: e.time! });
      else if (e.type === 'go') this.events.push({ type: 'go' });
      else if (e.type === 'item') this.events.push({ type: 'item', id: e.id!, item: e.value! });
      else if (e.type === 'use') this.events.push({ type: 'use', id: e.id!, item: e.value! });
      else if (e.type === 'hit') this.events.push({ type: 'hit', id: e.id!, hit: e.value! });
      else if (e.type === 'blocked') this.events.push({ type: 'blocked', id: e.id! });
    }

    const me = this.me;
    if (!me || !s.me) return;
    // reconciliación: estado del servidor + reaplicar los inputs que aún no procesó
    const before = { d: me.distance, x: me.x };
    applySelf(me, s.me);
    const ack = s.me[SELF_SEQ];
    this.pending = this.pending.filter((p) => p.seq > ack);
    if (this.predicting) for (const p of this.pending) this.simulate(p.input, p.seq);

    const dd = before.d - me.distance;
    const dx = before.x - me.x;
    if (Math.abs(dd) > SNAP_CORRECTION || this.localTick === null) {
      this.errD = this.errX = 0;
    } else {
      this.errD += dd;
      this.errX += dx;
    }
    this.corrections.push(Math.hypot(dd, dx * 1500));
    if (this.corrections.length > 60) this.corrections.shift();
  }

  /** Predice el kart propio solo cuando corre y está al mando (no terminó, no en piloto automático). */
  private get predicting() {
    const me = this.me;
    if (!me || me.finishTime !== null || this.serverPhase === 2) return false;
    return this.localTick !== null && this.localTick > this.start.goTick;
  }

  private simulate(input: Input, tick: number) {
    const me = this.me!;
    stepRacer(me, input, this.track, TICK);
    // choque predicho contra la posición extrapolada de los rivales cercanos
    const latest = this.buffer[this.buffer.length - 1];
    if (!latest) return;
    const ahead = (tick - latest.t) * TICK;
    this.race.racers.forEach((r, i) => {
      if (r === me) return;
      const o = i * RACER_FIELDS;
      const d = latest.r[o + R.d] + latest.r[o + R.s] * ahead;
      if (Math.abs(d - me.distance) > SEGMENT_LENGTH * 1.2 || Math.abs(latest.r[o + R.x] - me.x) > KART_HALF * 1.6) return;
      collideWithGhost(me, { distance: d, x: latest.r[o + R.x], speed: latest.r[o + R.s], vehicle: me.vehicle, respawn: latest.r[o + R.flags] & FLAG.respawn ? 1 : 0 });
    });
  }

  // ------------------------------------------------------------------ avance

  pump() {
    const me = this.me;
    if (!me || !this.clock.synced) return;
    this.tickFloat = this.clock.inputTick(this.conn.rtt);
    const target = Math.floor(this.tickFloat);
    if (target <= this.start.goTick || me.finishTime !== null || this.serverPhase === 2) return;
    if (this.localTick === null || target - this.localTick > MAX_CATCH_UP) this.localTick = Math.max(this.start.goTick, target - 1);
    while (this.localTick < target) {
      this.localTick++;
      me.prevDistance = me.distance;
      me.prevX = me.x;
      const input = this.controls.read();
      this.conn.sendInput(this.localTick, input);
      this.pending.push({ seq: this.localTick, input });
      if (this.pending.length > 90) this.pending.shift();
      this.simulate(input, this.localTick);
    }
  }

  update(dt: number): number {
    const now = performance.now();
    this.pump();
    this.updateClockView();
    this.interpolate();
    this.chooseFollow(now);

    const decay = Math.exp(-SMOOTHING * Math.min(0.1, (now - this.lastFrame) / 1000 || dt));
    this.lastFrame = now;
    this.errD *= decay;
    this.errX *= decay;

    if (now - this.rateWindow > 1000) {
      this.snapRate = (this.snapCount * 1000) / (now - this.rateWindow);
      this.snapCount = 0;
      this.rateWindow = now;
    }
    return this.predicting ? Math.max(0, Math.min(1, this.tickFloat - Math.floor(this.tickFloat))) : 1;
  }

  /** Cuenta regresiva, fase y tiempo vistos desde el reloj local: el semáforo se pone verde cuando tu kart puede moverse. */
  private updateClockView() {
    const race = this.race;
    if (!this.clock.synced) return;
    const t = this.spectator ? this.clock.latestTick() : this.clock.inputTick(this.conn.rtt);
    if (this.serverPhase === 2) race.phase = 'finished';
    else if (t <= this.start.goTick + 1) {
      race.phase = 'countdown';
      race.countdown = Math.max(0, (this.start.goTick + 1 - t) / TICK_RATE);
    } else {
      race.phase = 'racing';
      race.countdown = 0;
    }
    race.time = Math.max(0, (t - this.start.goTick - 1) / TICK_RATE);
  }

  /** Rivales (y el propio kart si no se predice) interpolados en tick de servidor con un pequeño retraso. */
  private interpolate() {
    if (this.buffer.length === 0) return;
    const renderTick = this.clock.latestTick() - this.clock.interpDelay();
    let a = this.buffer[0];
    let b = this.buffer[this.buffer.length - 1];
    for (let i = this.buffer.length - 1; i > 0; i--) {
      if (this.buffer[i - 1].t <= renderTick) {
        a = this.buffer[i - 1];
        b = this.buffer[i];
        break;
      }
    }
    const t = b.t === a.t ? 1 : Math.max(0, Math.min(1, (renderTick - a.t) / (b.t - a.t)));
    const predicting = this.predicting;
    this.race.racers.forEach((r, i) => {
      if (r === this.me && predicting) return;
      const o = i * RACER_FIELDS;
      const flags = b.r[o + R.flags];
      r.distance = r.prevDistance = lerp(a.r[o + R.d], b.r[o + R.d], t);
      r.x = r.prevX = lerp(a.r[o + R.x], b.r[o + R.x], t);
      r.lean = lerp(a.r[o + R.ln], b.r[o + R.ln], t);
      r.speed = b.r[o + R.s];
      r.lap = b.r[o + R.lap];
      r.nextCheckpoint = b.r[o + R.cp];
      r.finishTime = b.r[o + R.ft] < 0 ? null : b.r[o + R.ft];
      r.place = b.r[o + R.pl] || null;
      applyFlags(r, flags);
      if (r !== this.me && !r.bot) this.labels.set(r.id, flags & FLAG.away ? tr('race.away', { name: r.name }) : r.name);
    });
  }

  /** Espectador: la cámara sigue al líder (cambia como mucho cada 3 s para no marear). */
  private chooseFollow(now: number) {
    if (!this.spectator || now < this.followUntil) return;
    this.follow = this.race.ranking()[0] ?? this.follow;
    this.followUntil = now + 3000;
  }

  viewOffset(r: Racer) {
    return r === this.me && (this.errD !== 0 || this.errX !== 0) ? { d: this.errD, x: this.errX } : null;
  }

  netInfo() {
    const avg = this.corrections.length ? this.corrections.reduce((a, b) => a + b, 0) / this.corrections.length : 0;
    const sim = this.conn.netsimLabel;
    return `${this.spectator ? tr('race.spectator') : ''}PING ${this.conn.rtt} MS · CORR ${avg.toFixed(0)}${sim ? ` · ${sim}` : ''}`;
  }

  stats() {
    const avg = this.corrections.length ? this.corrections.reduce((a, b) => a + b, 0) / this.corrections.length : 0;
    return {
      protocolo: this.conn.protocol,
      ping: `${this.conn.rtt} ms`,
      snapshots: `${this.snapRate.toFixed(1)}/s`,
      jitter: `${((this.clock.jitter * 1000) / TICK_RATE).toFixed(1)} ms`,
      interp: `${((this.clock.interpDelay() * 1000) / TICK_RATE).toFixed(0)} ms`,
      'inputs sin ack': this.pending.length,
      'corrección media': avg.toFixed(1),
      'corrección visual': Math.hypot(this.errD, this.errX * 1500).toFixed(0),
      tick: this.localTick ?? '-',
    };
  }

  drainEvents(): RaceEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }

  dispose() {
    this.conn.onSnapshot = () => {};
  }
}
