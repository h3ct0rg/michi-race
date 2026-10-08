// Genera los fixtures "golden" (uno por pista) que el backend C# usa para verificar que su simulación es idéntica.
// Regenerar con:  GOLDEN=1 npx vitest run src/sim/golden.test.ts
import { writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createRacer } from './physics';
import { Race, gridSlot } from './race';
import { createRng } from './rng';
import { buildTrack, TrackDef } from './track';
import { TRACKS } from './tracks';
import { VEHICLES, deriveParams } from './vehicles';
import type { Input } from './input';

const fixture = (trackId: string) => new URL(`../../../backend/tests/MichiRacer.Game.Tests/Fixtures/golden-${trackId}.json`, import.meta.url);
const TICKS = 4500;
const SAMPLE_EVERY = 30;

/** Input humano con guion: solo aritmética simple para que C# lo reproduzca exacto. */
export function scriptedInput(t: number): Input {
  return {
    steer: (Math.floor(t / 20) % 4 < 2 ? 1 : -1) * 0.6,
    throttle: t % 200 < 180,
    brake: false,
    drift: t % 150 >= 60 && t % 150 < 110,
    useItem: t % 90 === 0,
  };
}

export function goldenRun(def: TrackDef) {
  const track = buildTrack(def);
  const vehicle = deriveParams(VEHICLES.michi.stats);
  const racers = Array.from({ length: 20 }, (_, i) => {
    const s = gridSlot(i);
    const r = createRacer(`r${i}`, `R${i}`, vehicle, s.distance, s.x, def.checkpoints);
    if (i > 0) r.bot = { skill: 0.8 + i * 0.006, lane: s.x, laneTimer: 1 };
    return r;
  });
  const race = new Race(track, racers, 42);
  const samples: number[][][] = [];
  const events: unknown[] = [];
  for (let t = 0; t < TICKS && race.phase !== 'finished'; t++) {
    race.step(new Map([['r0', scriptedInput(t)]]));
    events.push(...race.drainEvents());
    if (t % SAMPLE_EVERY === 0) samples.push(race.racers.map((r) => [r.distance, r.x, r.speed, r.lap, r.nextCheckpoint]));
  }
  const rng = createRng(12345);
  return {
    rng: [rng(), rng(), rng(), rng(), rng()],
    track: {
      segments: track.segments.length,
      checkpoints: track.checkpoints,
      sprites: track.segments.reduce((a, s) => a + s.sprites.length, 0),
      spriteChecksum: track.segments.reduce((a, s) => a + s.sprites.reduce((b, sp) => b + sp.offset * (s.index + 1), 0), 0),
    },
    sampleEvery: SAMPLE_EVERY,
    samples,
    events,
    finish: race.racers.map((r) => r.finishTime),
  };
}

describe('golden fixture', () => {
  for (const def of Object.values(TRACKS)) {
    it(`runs a full scripted race on ${def.id}`, () => {
      const g = goldenRun(def);
      expect(g.samples.length).toBeGreaterThan(100);
      if (process.env.GOLDEN) writeFileSync(fixture(def.id), JSON.stringify(g));
    });
  }
});
