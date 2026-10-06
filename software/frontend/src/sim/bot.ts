// Pilotos automáticos: los rivales locales y el autopiloto del jugador al cruzar la meta.
// Usan el RNG de la carrera para que la simulación siga siendo determinista.
import type { Input } from './input';
import { KART_HALF, Racer, zOf } from './physics';
import type { Race } from './race';
import { SEGMENT_LENGTH } from './track';
import { TICK } from './vehicles';

const LANES = [-0.55, 0, 0.55];

export function botInput(r: Racer, race: Race): Input {
  const rng = race.rng;
  const bot = (r.bot ??= { skill: 0.9, lane: 0, laneTimer: 0 });
  bot.laneTimer -= TICK;
  if (bot.laneTimer <= 0) {
    bot.lane = LANES[Math.floor(rng() * LANES.length)];
    bot.laneTimer = 3 + rng() * 4;
  }
  // esquivar a quien tenga justo delante
  for (const o of race.racers) {
    const ahead = o.distance - r.distance;
    if (o !== r && ahead > 0 && ahead < SEGMENT_LENGTH * 8 && Math.abs(o.x - r.x) < KART_HALF * 2 && r.speed > o.speed) {
      bot.lane = o.x > 0 ? o.x - 0.6 : o.x + 0.6;
      bot.laneTimer = 2;
    }
  }
  const seg = race.track.findSegment(zOf(r, race.track));
  const target = Math.max(-0.8, Math.min(0.8, bot.lane + seg.curve * 0.06));
  return {
    steer: Math.max(-1, Math.min(1, (target - r.x) * 4)),
    throttle: r.speed < r.vehicle.maxSpeed * bot.skill,
    brake: false,
    drift: false,
    turbo: rng() < 0.004,
  };
}
