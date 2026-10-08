import { describe, expect, it } from 'vitest';
import { buildTrack } from './track';
import { GREEN_VALLEY } from './tracks/greenValley';
import { createRacer, stepRacer, zOf } from './physics';
import { Race, RaceEvent, gridSlot } from './race';
import { NO_INPUT } from './input';
import { TICK, VEHICLES, deriveParams } from './vehicles';

const track = buildTrack(GREEN_VALLEY);
const vehicle = deriveParams(VEHICLES.michi.stats);

function botRace(seed: number, n = 4) {
  const racers = Array.from({ length: n }, (_, i) => {
    const s = gridSlot(i);
    const r = createRacer(`r${i}`, `R${i}`, vehicle, s.distance, s.x, GREEN_VALLEY.checkpoints);
    r.bot = { skill: 0.85 + i * 0.02, lane: s.x, laneTimer: 1 };
    return r;
  });
  return new Race(track, racers, seed);
}

function runToEnd(race: Race, maxTicks = 30 * 60 * 8) {
  const events: RaceEvent[] = [];
  while (race.phase !== 'finished' && race.tick < maxTicks) {
    race.step(new Map());
    events.push(...race.drainEvents());
  }
  return events;
}

describe('race simulation', () => {
  it('completes a 3-lap race with valid laps, checkpoints and places', () => {
    const race = botRace(42);
    const events = runToEnd(race);
    expect(race.phase).toBe('finished');

    const finishes = events.filter((e) => e.type === 'finish');
    expect(finishes.length).toBe(4);
    expect(finishes.map((e) => (e.type === 'finish' ? e.place : 0))).toEqual([1, 2, 3, 4]);

    for (const r of race.racers) {
      expect(r.finishTime).not.toBeNull();
      expect(r.lapTimes.length).toBe(GREEN_VALLEY.laps);
      // cada vuelta debe pasar por los 7 checkpoints intermedios, en orden
      const cps = events.filter((e) => e.type === 'checkpoint' && e.id === r.id).map((e) => (e.type === 'checkpoint' ? e.index : 0));
      expect(cps).toEqual([1, 2, 3, 4, 5, 6, 7, 1, 2, 3, 4, 5, 6, 7, 1, 2, 3, 4, 5, 6, 7]);
    }
    // el ranking final coincide con el orden de llegada
    expect(race.ranking().map((r) => r.place)).toEqual([1, 2, 3, 4]);
  });

  it('is deterministic for the same seed and inputs', () => {
    const a = botRace(7);
    const b = botRace(7);
    runToEnd(a);
    runToEnd(b);
    expect(a.racers.map((r) => [r.distance, r.x, r.finishTime])).toEqual(b.racers.map((r) => [r.distance, r.x, r.finishTime]));
  });

  it('does not count a lap when checkpoints were skipped', () => {
    const race = botRace(1, 1);
    const r = race.racers[0];
    r.bot = undefined;
    race.countdown = 0;
    race.step(new Map()); // pasa a 'racing'
    // cruzar la salida (lap 0 -> 1) conduciendo de verdad
    while (r.lap === 0) race.step(new Map([[r.id, { ...NO_INPUT, throttle: true }]]));
    expect(r.lap).toBe(1);
    // teletransportarlo justo antes de la meta, saltándose los checkpoints
    r.distance += track.length - zOf(r, track) - 50;
    r.prevDistance = r.distance;
    for (let i = 0; i < 10; i++) race.step(new Map([[r.id, { ...NO_INPUT, throttle: true }]]));
    expect(r.lap).toBe(1);
    expect(r.lapTimes.length).toBe(0);
  });

  it('drift release gives a mini-turbo', () => {
    const r = createRacer('d', 'D', vehicle, 0, 0, GREEN_VALLEY.checkpoints);
    r.speed = vehicle.maxSpeed * 0.8;
    const drifting = { steer: -1, throttle: true, brake: false, drift: true, useItem: false };
    for (let i = 0; i < 45; i++) {
      stepRacer(r, drifting, track, TICK); // 1.5 s derrapando
      r.x = 0; // mantenerlo sobre la pista como si estuviera en una curva
    }
    expect(r.drift.active).toBe(true);
    stepRacer(r, { ...drifting, drift: false }, track, TICK);
    expect(r.drift.active).toBe(false);
    expect(r.boostLeft).toBeGreaterThan(0.9);
  });

  it('items: boxes are picked, items used, hits land and the shield blocks', () => {
    const race = botRace(9, 8);
    const events = runToEnd(race);
    const count = (t: string) => events.filter((e) => e.type === t).length;
    expect(count('item')).toBeGreaterThan(10);
    expect(count('use')).toBeGreaterThan(3);
    expect(count('hit') + count('blocked')).toBeGreaterThan(0);
    expect(race.projectiles.every((p) => p.state <= 2)).toBe(true);
  });

  it('shield absorbs one hit', () => {
    const race = botRace(3, 2);
    race.countdown = 0;
    race.step(new Map());
    const [a, b] = race.racers;
    b.shieldLeft = 5;
    b.distance = a.distance + 1000;
    a.bot = undefined;
    a.item = 6; // hielo al de adelante
    race.step(new Map([[a.id, { ...NO_INPUT, useItem: true }]]));
    const events = race.drainEvents();
    expect(events.some((e) => e.type === 'blocked' && e.id === b.id)).toBe(true);
    expect(b.frozenLeft).toBe(0);
    expect(b.shieldLeft).toBe(0);
  });
});
