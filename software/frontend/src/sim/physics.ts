// Física arcade de un kart en coordenadas de pista. Sin DOM ni aleatoriedad: se porta 1:1 al servidor C#.
import type { Input } from './input';
import { PAD_HALF, ROAD_WIDTH, SEGMENT_LENGTH, Track } from './track';
import type { VehicleParams } from './vehicles';
import { HAZARD, HAZARD_HALF, ITEM, MAGNET_TIME, OIL_SPIN_TIME, SHIELD_TIME, TURBO_ITEM_MULT } from './items';

export const KART_WORLD_WIDTH = 400;
export const KART_HALF = KART_WORLD_WIDTH / ROAD_WIDTH / 2; // medio ancho en unidades de x
const OBSTACLE_HALF = 0.15;
const DRIFT_MIN_SPEED = 0.4;
const DRIFT_CHARGE_BLUE = 0.6; // segundos de derrape para mini-turbo azul
const DRIFT_CHARGE_ORANGE = 1.4; // ... y naranja
const RESPAWN_AFTER = 2.5; // segundos perdido lejos de la pista
export const SPLASH_TIME = 0.8;

export interface Racer {
  id: string;
  name: string;
  vehicle: VehicleParams;
  // estado físico
  distance: number; // s continuo (no envuelve); z en pista = distance mod length
  x: number;
  vx: number; // velocidad lateral por rebotes
  speed: number;
  steer: number; // giro efectivo aplicado
  lean: number; // giro visual suavizado
  turboLeft: number;
  boostLeft: number; // mini-turbo de derrape o pad
  drift: { active: boolean; dir: number; charge: number };
  lostTime: number;
  respawn: number; // segundos de invulnerabilidad tras reaparecer
  bump: number; // segundos desde el último golpe (para cámara/efectos)
  // ítems y efectos
  item: number; // ITEM.*, 0 = sin ítem
  itemRoll: number; // segundos de "ruleta" antes de poder usarlo
  useHeld: boolean; // botón de ítem presionado en el tick anterior (para detectar el flanco)
  pendingUse: number; // ítem ofensivo usado este tick; lo resuelve la carrera (proyectiles, rayo...)
  shieldLeft: number;
  spinLeft: number; // trompo
  shockLeft: number; // electrocutado (rayo)
  frozenLeft: number; // congelado
  magnetLeft: number;
  splash: number; // segundos desde que cayó al agua (efecto visual/sonido)
  // estado de carrera
  lap: number; // 0 = en la parrilla, antes de cruzar la salida
  nextCheckpoint: number;
  lapStart: number;
  lapTimes: number[];
  bestLap: number | null;
  finishTime: number | null;
  place: number | null;
  // para interpolación del render
  prevDistance: number;
  prevX: number;
  bot?: { skill: number; lane: number; laneTimer: number };
}

export const wrapZ = (z: number, len: number) => ((z % len) + len) % len;
export const zOf = (r: Racer, track: Track) => wrapZ(r.distance, track.length);

export function createRacer(id: string, name: string, vehicle: VehicleParams, distance: number, x: number, checkpoints: number): Racer {
  return {
    id,
    name,
    vehicle,
    distance,
    x,
    vx: 0,
    speed: 0,
    steer: 0,
    lean: 0,
    turboLeft: 0,
    boostLeft: 0,
    drift: { active: false, dir: 0, charge: 0 },
    lostTime: 0,
    respawn: 0,
    bump: 99,
    item: 0,
    itemRoll: 0,
    useHeld: false,
    pendingUse: 0,
    shieldLeft: 0,
    spinLeft: 0,
    shockLeft: 0,
    frozenLeft: 0,
    magnetLeft: 0,
    splash: 0,
    lap: 0,
    nextCheckpoint: checkpoints, // la meta es el siguiente objetivo desde la parrilla
    lapStart: 0,
    lapTimes: [],
    bestLap: null,
    finishTime: null,
    place: null,
    prevDistance: distance,
    prevX: x,
  };
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export function stepRacer(r: Racer, input: Input, track: Track, dt: number) {
  const p = r.vehicle;
  const seg = track.findSegment(zOf(r, track));
  const speedPct = r.speed / p.maxSpeed;
  const offroad = r.x < -1 || r.x > 1;
  const stunned = r.spinLeft > 0 || r.frozenLeft > 0;
  // en trompo o congelado no hay control
  const steerIn = stunned ? 0 : clamp(input.steer, -1, 1);
  const throttle = input.throttle && !stunned;
  const brake = input.brake && !stunned;

  // --- ítem: se usa al presionar (flanco). Los de efecto propio se aplican aquí (el cliente los predice);
  // los ofensivos quedan en pendingUse y los resuelve la carrera.
  const press = input.useItem && !r.useHeld;
  r.useHeld = input.useItem;
  if (press && r.item !== ITEM.none && r.itemRoll <= 0 && !stunned) {
    if (r.item === ITEM.turbo) r.turboLeft = Math.max(r.turboLeft, p.turboTime * TURBO_ITEM_MULT);
    else if (r.item === ITEM.shield) r.shieldLeft = SHIELD_TIME;
    else if (r.item === ITEM.magnet) r.magnetLeft = MAGNET_TIME;
    else r.pendingUse = r.item;
    r.item = ITEM.none;
  }

  // --- derrape: se inicia con drift + dirección, al soltar da mini-turbo según la carga
  const d = r.drift;
  if (!d.active && !stunned && input.drift && steerIn !== 0 && speedPct > DRIFT_MIN_SPEED && !offroad) {
    d.active = true;
    d.dir = Math.sign(steerIn);
    d.charge = 0;
  } else if (d.active && (!input.drift || speedPct < DRIFT_MIN_SPEED * 0.75 || offroad || stunned)) {
    if (!offroad && !stunned) {
      if (d.charge >= DRIFT_CHARGE_ORANGE) r.boostLeft = Math.max(r.boostLeft, 1.0);
      else if (d.charge >= DRIFT_CHARGE_BLUE) r.boostLeft = Math.max(r.boostLeft, 0.5);
    }
    d.active = false;
    d.charge = 0;
  }

  let steer = steerIn;
  let centrifugal = p.centrifugal;
  if (d.active) {
    // girar hacia el derrape lo cierra, girar en contra lo abre; carga más rápido cerrado
    const toward = clamp(steerIn * d.dir, -1, 1);
    steer = d.dir * (0.75 + 0.35 * toward);
    centrifugal *= 0.5;
    d.charge += dt * (1 + 0.5 * Math.max(0, toward));
  }
  r.steer = steer;
  r.lean += ((d.active ? d.dir * 1.2 : steer) - r.lean) * Math.min(1, dt * 6);

  // --- pads de turbo
  if (seg.pad !== null && !offroad && Math.abs(r.x - seg.pad) < PAD_HALF + KART_HALF * 0.5) {
    r.boostLeft = Math.max(r.boostLeft, 0.8);
  }

  // --- obstáculos pintados: aceite (trompo), arena (frena), charco (resbala)
  const hz = seg.hazard;
  if (hz !== null && !offroad && r.respawn <= 0 && Math.abs(r.x - hz.x) < HAZARD_HALF + KART_HALF * 0.5) {
    if (hz.kind === HAZARD.oil && r.spinLeft <= 0) {
      if (r.shieldLeft > 0) r.shieldLeft = 0;
      else r.spinLeft = OIL_SPIN_TIME;
    } else if (hz.kind === HAZARD.sand && r.speed > p.offroadLimit) {
      r.speed -= p.offroadDecel * 0.7 * dt;
    } else if (hz.kind === HAZARD.puddle) {
      r.vx += (r.x >= hz.x ? 1 : -1) * 4 * dt;
    }
  }

  // --- movimiento lateral
  const dx = dt * p.steer * speedPct;
  r.x += steer * dx;
  r.x -= dx * speedPct * seg.curve * centrifugal;
  r.x += r.vx * dt;
  r.vx *= Math.max(0, 1 - dt * 6);

  // --- velocidad
  const boosting = (r.turboLeft > 0 || r.boostLeft > 0) && !stunned;
  let maxSpeed = boosting ? p.maxSpeed * p.turboMult : p.maxSpeed;
  if (r.magnetLeft > 0) maxSpeed *= 1.12;
  if (r.shockLeft > 0) maxSpeed *= 0.55;
  if (boosting) r.speed += p.accel * 2 * dt;
  else if (throttle) r.speed += p.accel * (r.magnetLeft > 0 ? 1.5 : 1) * dt;
  else if (brake) r.speed -= p.braking * dt;
  else r.speed -= p.decel * dt;
  if (r.spinLeft > 0) r.speed -= p.braking * 0.5 * dt;
  if (r.frozenLeft > 0) r.speed -= r.speed * 1.5 * dt;
  if (offroad && r.speed > p.offroadLimit) r.speed -= p.offroadDecel * dt;
  if (r.speed > maxSpeed) r.speed = Math.max(maxSpeed, r.speed - p.decel * 2 * dt);
  r.speed = Math.max(0, r.speed);

  // --- timers
  r.turboLeft = Math.max(0, r.turboLeft - dt);
  r.boostLeft = Math.max(0, r.boostLeft - dt);
  r.itemRoll = Math.max(0, r.itemRoll - dt);
  r.shieldLeft = Math.max(0, r.shieldLeft - dt);
  r.spinLeft = Math.max(0, r.spinLeft - dt);
  r.shockLeft = Math.max(0, r.shockLeft - dt);
  r.frozenLeft = Math.max(0, r.frozenLeft - dt);
  r.magnetLeft = Math.max(0, r.magnetLeft - dt);
  r.splash = Math.max(0, r.splash - dt);
  r.respawn = Math.max(0, r.respawn - dt);
  r.bump += dt;

  // --- avance (revisando todos los segmentos recorridos en este tick para no atravesar objetos)
  const from = r.distance;
  r.distance += r.speed * dt;
  if (r.x < -1 || r.x > 1) {
    for (let s = from; s <= r.distance; s += SEGMENT_LENGTH) {
      if (hitObstacle(r, track.findSegment(wrapZ(s, track.length)))) break;
    }
  }

  // --- caer al mar: salpicón y reaparición inmediata en el centro de la pista
  if (seg.water !== 0 && r.respawn <= 0) {
    const fell = (r.x < -seg.shore && (seg.water & 1) !== 0) || (r.x > seg.shore && (seg.water & 2) !== 0);
    if (fell) {
      r.x = 0;
      r.vx = 0;
      r.speed *= 0.3;
      r.respawn = 1.5;
      r.splash = SPLASH_TIME;
      r.drift.active = false;
      r.lostTime = 0;
    }
  }

  // --- perdido lejos de la pista: reaparecer en el centro
  if (Math.abs(r.x) > 2.2) {
    r.lostTime += dt;
    if (r.lostTime > RESPAWN_AFTER) {
      r.x = 0;
      r.vx = 0;
      r.speed = 0;
      r.lostTime = 0;
      r.respawn = 1.5;
    }
  } else {
    r.lostTime = 0;
  }
  r.x = clamp(r.x, -3, 3);
}

function hitObstacle(r: Racer, seg: { sprites: { collides: boolean; offset: number }[] }): boolean {
  for (const s of seg.sprites) {
    if (s.collides && Math.abs(s.offset - r.x) < KART_HALF + OBSTACLE_HALF) {
      r.speed *= 0.25;
      r.vx = -Math.sign(r.x) * 2; // rebote hacia la carretera
      r.drift.active = false;
      r.bump = 0;
      return true;
    }
  }
  return false;
}

/**
 * Choques entre todos los karts con broad-phase: se ordenan por distancia y solo se comparan vecinos
 * cercanos (O(n log n) en vez de O(n²) para 20 karts). Desempate por índice: mismo orden en C#.
 */
export function collideAll(racers: Racer[]) {
  const order = racers.map((_, i) => i).sort((a, b) => racers[a].distance - racers[b].distance || a - b);
  for (let i = 0; i < order.length; i++) {
    const a = racers[order[i]];
    for (let j = i + 1; j < order.length; j++) {
      const b = racers[order[j]];
      if (b.distance - a.distance > SEGMENT_LENGTH * 1.2) break;
      collideKarts(a, b);
    }
  }
}

/**
 * Choque predicho en el cliente contra un rival "fantasma" (su posición extrapolada del último snapshot).
 * Solo afecta al kart propio: el servidor decide el resultado real y la reconciliación lo corrige.
 */
export function collideWithGhost(me: Racer, ghost: Pick<Racer, 'distance' | 'x' | 'speed' | 'vehicle' | 'respawn'>) {
  const copy = { ...ghost, vx: 0, bump: 99 } as Racer;
  collideKarts(me, copy);
}

// Choque entre karts: el más pesado empuja más; el de atrás pierde velocidad.
export function collideKarts(a: Racer, b: Racer) {
  if (a.respawn > 0 || b.respawn > 0) return;
  const dz = a.distance - b.distance;
  if (Math.abs(dz) > SEGMENT_LENGTH * 1.2 || Math.abs(a.x - b.x) > KART_HALF * 1.6) return;
  const [back, front] = dz < 0 ? [a, b] : [b, a];
  if (back.speed > front.speed) back.speed = front.speed * 0.92;
  const side = a.x < b.x ? -1 : 1;
  const total = a.vehicle.mass + b.vehicle.mass;
  a.vx = side * 1.6 * (b.vehicle.mass / total);
  b.vx = -side * 1.6 * (a.vehicle.mass / total);
  a.bump = 0;
  b.bump = 0;
}
