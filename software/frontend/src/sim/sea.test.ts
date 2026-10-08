import { describe, expect, it } from 'vitest';
import { buildTrack, SEGMENT_LENGTH } from './track';
import { COASTAL_ROAD } from './tracks/coastalRoad';
import { createRacer, stepRacer } from './physics';
import { NO_INPUT } from './input';
import { TICK, VEHICLES, deriveParams } from './vehicles';

const track = buildTrack(COASTAL_ROAD);
const vehicle = deriveParams(VEHICLES.michi.stats);
const at = (segment: number, x: number) => {
  const r = createRacer('a', 'A', vehicle, segment * SEGMENT_LENGTH + 10, x, COASTAL_ROAD.checkpoints);
  r.speed = vehicle.maxSpeed * 0.8;
  return r;
};

describe('sea', () => {
  it('splashes and respawns when crossing the shore', () => {
    const r = at(400, -1.8);
    stepRacer(r, NO_INPUT, track, TICK);
    expect(r.splash).toBeGreaterThan(0);
    expect(r.x).toBe(0);
    expect(r.respawn).toBeGreaterThan(0);
  });

  it('the island side and the beach are safe', () => {
    for (const x of [1.8, -1.5]) {
      const r = at(400, x);
      stepRacer(r, NO_INPUT, track, TICK);
      expect(r.splash).toBe(0);
    }
  });

  it('on the bridge there is water on both sides', () => {
    for (const x of [-1.3, 1.3]) {
      const r = at(1100, x);
      stepRacer(r, NO_INPUT, track, TICK);
      expect(r.splash).toBeGreaterThan(0);
    }
  });

  it('no solid decor ends up in the water', () => {
    for (const seg of track.segments)
      for (const sp of seg.sprites)
        if (sp.collides && seg.water) {
          const bit = sp.offset < 0 ? 1 : 2;
          expect((seg.water & bit) !== 0 && Math.abs(sp.offset) > seg.shore).toBe(false);
        }
  });
});
