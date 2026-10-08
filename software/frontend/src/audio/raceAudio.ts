// Sonido de una carrera: observa el estado del kart seguido por la cámara y dispara efectos
// en los cambios (turbo, pads, choques...), además del motor continuo y la música de la pista.
import type { RaceSession } from '../game/session';
import type { Racer } from '../sim/physics';
import type { RaceEvent } from '../sim/race';
import { audio, sfx } from './audio';
import { EngineSound } from './engine';
import { music } from './music';
import { HIT, ITEM, PROJ_STATE } from '../sim/items';

const DRIFT_BLUE = 0.6;
const DRIFT_ORANGE = 1.4;

export class RaceAudio {
  private engine: EngineSound | null = null;
  private trackId = '';
  private watched: Racer | null = null;
  private lastCount = 0;
  private wasCountdown = true;
  private prev = { turboLeft: 0, boostLeft: 0, drift: false, charge: 0, bump: 99, respawn: 0, splash: 0, shield: 0, magnet: 0, rolling: false };
  private explosions = new Set<string>();
  private ended = false;

  start(trackId: string) {
    this.stop();
    this.trackId = trackId;
    this.ended = false;
    this.lastCount = 0;
    this.wasCountdown = true;
    this.watched = null;
    this.ensureRunning();
  }

  /** El audio puede desbloquearse a mitad de carrera (primer toque): arranca motor y música si faltan. */
  private ensureRunning() {
    if (this.ended || !audio.ctx) return;
    this.engine ??= EngineSound.create();
    if (this.engine && !this.musicStarted) {
      music.start(this.trackId);
      this.musicStarted = true;
    }
  }
  private musicStarted = false;

  stop() {
    this.engine?.stop();
    this.engine = null;
    music.stop();
    this.musicStarted = false;
  }

  frame(session: RaceSession) {
    if (this.ended) return;
    this.ensureRunning();
    const race = session.race;
    const r = session.player;

    // cuenta regresiva: 3, 2, 1, ¡YA!
    if (race.phase === 'countdown') {
      const n = Math.ceil(race.countdown);
      if (n >= 1 && n <= 3 && n !== this.lastCount) sfx.countdown();
      this.lastCount = n;
    } else if (this.wasCountdown && race.phase === 'racing') {
      sfx.go();
    }
    this.wasCountdown = race.phase === 'countdown';

    // si la cámara cambia de kart (espectador), no comparar con el estado del anterior
    if (r !== this.watched) {
      this.watched = r;
      this.snapshot(r);
    }

    const p = this.prev;
    if (r.turboLeft > p.turboLeft + 0.2) sfx.turbo();
    else if (r.boostLeft > p.boostLeft + 0.05) {
      // el boost llega al soltar un derrape cargado (mini-turbo) o al pisar un pad
      if (p.drift && !r.drift.active && p.charge >= DRIFT_BLUE) sfx.miniTurbo(p.charge >= DRIFT_ORANGE);
      else sfx.pad();
    }
    if (r.drift.active) {
      if (p.charge < DRIFT_BLUE && r.drift.charge >= DRIFT_BLUE) sfx.driftLevel(1);
      if (p.charge < DRIFT_ORANGE && r.drift.charge >= DRIFT_ORANGE) sfx.driftLevel(2);
    }
    if (r.bump < p.bump && r.bump < 0.15) sfx.bump();
    if (r.splash > p.splash + 0.05) sfx.splash();
    else if (r.respawn > p.respawn + 0.5) sfx.respawn();
    if (r.shieldLeft > p.shield + 1) sfx.shieldUp();
    if (r.magnetLeft > p.magnet + 1) sfx.magnet();
    const rolling = r.item !== 0 && r.itemRoll > 0;
    if (p.rolling && !rolling && r.item !== 0) sfx.itemReady();
    this.snapshot(r);

    // explosiones cercanas (bombas y cohetes), una vez cada una
    for (const pr of race.projectiles) {
      if (pr.state !== PROJ_STATE.exploding) continue;
      const key = `${pr.kind}:${Math.round(pr.distance / 50)}:${Math.round(pr.x * 10)}`;
      if (this.explosions.has(key)) continue;
      this.explosions.add(key);
      const dist = Math.abs(pr.distance - r.distance);
      if (dist < 6000) sfx.explosion(1 - dist / 7000);
    }
    if (this.explosions.size > 60) this.explosions.clear();

    const speedPct = r.speed / r.vehicle.maxSpeed;
    const boosting = r.turboLeft > 0 || r.boostLeft > 0;
    this.engine?.update(speedPct, boosting, r.drift.active, Math.abs(r.x) > 1 && r.speed > 200, race.phase !== 'finished');
  }

  event(e: RaceEvent, session: RaceSession) {
    const me = session.player.id;
    if (e.type === 'item' && e.id === me) {
      sfx.boxBreak();
      sfx.itemRoulette();
    } else if (e.type === 'use') {
      if (e.item === ITEM.lightning) sfx.lightning(); // todos lo escuchan
      else if (e.id === me && e.item === ITEM.bomb) sfx.throwBomb();
      else if (e.id === me && e.item === ITEM.rocket) sfx.rocketLaunch();
      else if (e.id === me && e.item === ITEM.freeze) sfx.freeze();
    } else if (e.type === 'hit' && e.id === me) {
      if (e.hit === HIT.spin) sfx.spinHit();
      else if (e.hit === HIT.freeze) sfx.freeze();
      else if (e.hit === HIT.shock) sfx.shocked();
    } else if (e.type === 'blocked' && e.id === me) sfx.shieldBlock();
    else if (e.type === 'lap' && e.id === me && e.lap > 1) sfx.lap(e.lap === session.race.track.laps);
    else if (e.type === 'finish' && e.id === me) sfx.finish(e.place === 1);
    else if (e.type === 'end') this.finish();
  }

  /** Fin de carrera (resultados): se apaga motor y música. */
  finish() {
    this.ended = true;
    this.stop();
  }

  private snapshot(r: Racer) {
    const p = this.prev;
    p.turboLeft = r.turboLeft;
    p.boostLeft = r.boostLeft;
    p.drift = r.drift.active;
    p.charge = r.drift.charge;
    p.bump = r.bump;
    p.respawn = r.respawn;
    p.splash = r.splash;
    p.shield = r.shieldLeft;
    p.magnet = r.magnetLeft;
    p.rolling = r.item !== 0 && r.itemRoll > 0;
  }
}
