import { describe, expect, it } from 'vitest';
import { buildTrack, SEGMENT_LENGTH } from './track';
import { COSMIC_RAINBOW } from './tracks/cosmicRainbow';
import { GREEN_VALLEY } from './tracks/greenValley';
import { createRacer, stepRacer } from './physics';
import { TICK, VEHICLES, deriveParams } from './vehicles';

const vehicle = deriveParams(VEHICLES.michi.stats);
const cosmic = buildTrack(COSMIC_RAINBOW);
const gas = { steer: 0, throttle: true, brake: false, drift: false, useItem: false };

/** Velocidad tras manejar `ticks` a fondo empezando en `segment` a velocidad máxima. */
function speedAfter(track: ReturnType<typeof buildTrack>, segment: number, ticks = 12) {
  const r = createRacer('a', 'A', vehicle, segment * SEGMENT_LENGTH, 0, track.def.checkpoints);
  r.speed = vehicle.maxSpeed;
  for (let i = 0; i < ticks; i++) stepRacer(r, gas, track, TICK);
  return r.speed;
}

describe('slope physics', () => {
  it('climbs (segments ~75-175) slow you down and drops speed you up', () => {
    expect(cosmic.segments[125].slope).toBeGreaterThan(0.5);
    expect(cosmic.segments[225].slope).toBeLessThan(-0.5);
    const flat = speedAfter(cosmic, 700);
    expect(speedAfter(cosmic, 115)).toBeLessThan(flat * 0.95);
    expect(speedAfter(cosmic, 215)).toBeGreaterThan(flat * 1.05);
  });

  it('tracks without slopePhysics keep hills purely visual', () => {
    const gv = buildTrack(GREEN_VALLEY);
    expect(gv.segments.every((s) => s.slope === 0)).toBe(true);
  });

  it('each piece climbs its hill (the lap closes level)', () => {
    let i = 0;
    for (const [enter, hold, leave, , hill] of COSMIC_RAINBOW.roads) {
      const total = enter + hold + leave;
      const rise = cosmic.segments.slice(i, i + total).reduce((a, s) => a + s.slope, 0);
      expect(rise).toBeCloseTo(hill ?? 0, 1); // perfil triangular discreto: ±0,01
      i += total;
    }
    expect(COSMIC_RAINBOW.roads.reduce((a, r) => a + (r[4] ?? 0), 0)).toBe(0);
  });
});
