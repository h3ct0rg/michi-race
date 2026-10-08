// Renderer pseudo-3D: proyecta segmentos, dibuja la carretera por scanlines (bordes pixel nítidos)
// y luego sprites y karts de atrás hacia adelante. Solo lee el estado de la simulación.

import { LANES, PAD_HALF, ROAD_WIDTH, SEGMENT_LENGTH, ScreenPoint, Segment } from '../sim/track';
import { KART_WORLD_WIDTH, Racer, wrapZ } from '../sim/physics';
import { BOX_LANES, HAZARD, HAZARD_HALF, HAZARD_LENGTH, ITEM, PROJ_STATE } from '../sim/items';
import type { Race } from '../sim/race';
import type { Direction, Img, KartFrames } from './sprites';
import { drawLayer, drawSky, drawSun } from './parallax';
import type { LoadedTheme } from './themes';

export const WIDTH = 480;
export const HEIGHT = 270;
const BASE_FOV = 100;
const BOOST_FOV = 14;
const CAMERA_HEIGHT = 1000;
const DRAW_DISTANCE = 220;
const FOG_DENSITY = 3.5;
const RAIL_HEIGHT = 260; // altura de la baranda del puente (unidades de mundo)
const SPLASH_SHOW = 0.8; // segundos que dura el salpicón dibujado


interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  size: number;
  color: string;
  g?: number; // gravedad (gotas de agua)
}

type RearIndex = -2 | -1 | 0 | 1 | 2;

export interface RenderOptions {
  viewOffset?: (r: Racer) => { d: number; x: number } | null;
  labels?: Map<string, string>;
}

const lerp = (a: number, b: number, p: number) => a + (b - a) * p;
const pctRemaining = (n: number, total: number) => (((n % total) + total) % total) / total;

export class Renderer {
  private readonly ctx: CanvasRenderingContext2D;
  private particles: Particle[] = [];
  private skyOffset = 0;
  private bounce = 0;
  private fovBoost = 0;
  private rain: { x: number; y: number; len: number; v: number }[] = [];
  private flashColor = '#ffffff';
  private flashLeft = 0;
  private explosionStart = new Map<string, number>();
  private cameraDepth = 1;
  private time = 0;
  /** Último valor de `splash` visto por kart y momento en que empezó su salpicón. */
  private lastSplash = new Map<string, number>();
  private splashAt = new Map<string, number>();

  constructor(
    canvas: HTMLCanvasElement,
    private readonly assets: LoadedTheme,
    private readonly frames: Map<string, KartFrames>,
  ) {
    this.ctx = canvas.getContext('2d')!;
    this.ctx.imageSmoothingEnabled = false;
  }

  private project(p: ScreenPoint, camX: number, camY: number, camZ: number) {
    p.camera.x = p.world.x - camX;
    p.camera.y = p.world.y - camY;
    p.camera.z = p.world.z - camZ;
    p.screen.scale = this.cameraDepth / p.camera.z;
    p.screen.x = WIDTH / 2 + p.screen.scale * p.camera.x * (WIDTH / 2);
    p.screen.y = HEIGHT / 2 - p.screen.scale * p.camera.y * (HEIGHT / 2);
    p.screen.w = p.screen.scale * ROAD_WIDTH * (WIDTH / 2);
  }

  /** alpha: fracción del tick actual (0..1) para interpolar entre el estado previo y el actual. */
  render(race: Race, player: Racer, alpha: number, dt: number, opts: RenderOptions = {}) {
    const ctx = this.ctx;
    const track = race.track;
    this.time += dt;

    const view = (r: Racer) => {
      const off = opts.viewOffset?.(r);
      return {
        z: wrapZ(lerp(r.prevDistance, r.distance, alpha) + (off?.d ?? 0), track.length),
        x: lerp(r.prevX, r.x, alpha) + (off?.x ?? 0),
      };
    };
    const pv = view(player);

    // cámara: el FOV se abre con el turbo para dar sensación de velocidad
    const boosting = player.turboLeft > 0 || player.boostLeft > 0;
    this.fovBoost += ((boosting ? 1 : 0) - this.fovBoost) * Math.min(1, dt * 4);
    const fov = BASE_FOV + BOOST_FOV * this.fovBoost;
    this.cameraDepth = 1 / Math.tan(((fov / 2) * Math.PI) / 180);
    const playerZ = CAMERA_HEIGHT * this.cameraDepth;

    const camZ = wrapZ(pv.z - playerZ, track.length);
    const base = track.findSegment(camZ);
    const basePct = pctRemaining(camZ, SEGMENT_LENGTH);
    const playerSeg = track.findSegment(pv.z);
    const playerPct = pctRemaining(pv.z, SEGMENT_LENGTH);
    const playerY = lerp(playerSeg.p1.world.y, playerSeg.p2.world.y, playerPct);
    const speedPct = player.speed / player.vehicle.maxSpeed;
    this.detectSplashes(race, player);

    this.skyOffset += playerSeg.curve * speedPct * dt * 60;

    ctx.save();
    if (player.bump < 0.25) ctx.translate(Math.round((Math.random() - 0.5) * 4), Math.round((Math.random() - 0.5) * 3));

    const { theme, layers } = this.assets;
    const yShift = Math.round(-playerY / 400);
    drawSky(ctx, WIDTH, HEIGHT, theme.sky);
    if (theme.night?.stars) this.drawStars(yShift);
    if (theme.sun) drawSun(ctx, theme.sun, ((this.skyOffset * 0.0004) % 1) * WIDTH, yShift, WIDTH);
    for (const layer of layers) drawLayer(ctx, layer, this.skyOffset * layer.speed, yShift, WIDTH);

    // carretera, de adelante hacia el horizonte
    let maxy = HEIGHT;
    let x = 0;
    let dx = -(base.curve * basePct);
    const drawn: Segment[] = [];
    for (let n = 0; n < DRAW_DISTANCE; n++) {
      const seg = track.segments[(base.index + n) % track.segments.length];
      seg.looped = seg.index < base.index;
      seg.fog = 1 / Math.exp((n / DRAW_DISTANCE) ** 2 * FOG_DENSITY);
      seg.clip = maxy;
      const loop = seg.looped ? track.length : 0;
      const camX = pv.x * ROAD_WIDTH;
      this.project(seg.p1, camX - x, playerY + CAMERA_HEIGHT, camZ - loop);
      this.project(seg.p2, camX - x - dx, playerY + CAMERA_HEIGHT, camZ - loop);
      x += dx;
      dx += seg.curve;
      drawn.push(seg);

      if (seg.p1.camera.z <= this.cameraDepth || seg.p2.screen.y >= seg.p1.screen.y || seg.p2.screen.y >= maxy) continue;
      this.drawSegment(seg, maxy);
      maxy = Math.max(0, Math.ceil(seg.p2.screen.y));
    }

    // sprites y karts rivales de atrás hacia adelante
    const others = race.racers.filter((r) => r !== player).map((r) => ({ r, ...view(r) }));
    for (let n = drawn.length - 1; n > 0; n--) {
      const seg = drawn[n];
      if (seg.water === 3) this.drawRails(seg);
      for (const s of seg.sprites) {
        const def = this.assets.sprites[s.kind];
        if (!def) continue;
        const scale = seg.p1.screen.scale;
        const sx = seg.p1.screen.x + scale * s.offset * ROAD_WIDTH * (WIDTH / 2);
        const align = s.kind === 'banner' ? -0.5 : s.offset < 0 ? -1 : 0;
        this.drawSprite(def.img, def.worldWidth, scale, sx, seg.p1.screen.y, align, seg.clip);
      }
      if (seg.itemRow !== null) this.drawItemBoxes(race, seg);
      for (const p of race.projectiles) {
        if (track.findSegment(wrapZ(p.distance, track.length)) === seg) this.drawProjectile(p, seg, track.length);
      }
      for (const o of others) {
        if (track.findSegment(o.z) !== seg) continue;
        const pct = pctRemaining(o.z, SEGMENT_LENGTH);
        const scale = lerp(seg.p1.screen.scale, seg.p2.screen.scale, pct);
        const sx = lerp(seg.p1.screen.x, seg.p2.screen.x, pct) + scale * o.x * ROAD_WIDTH * (WIDTH / 2);
        const sy = lerp(seg.p1.screen.y, seg.p2.screen.y, pct);
        const rect = this.drawKart(o.r, seg, scale, sx, sy);
        const label = opts.labels?.get(o.r.id);
        if (rect && label && rect.w >= 18) this.drawLabel(label, rect.x + rect.w / 2, rect.y + rect.w * 0.12);
      }
    }

    this.drawPlayer(player, playerSeg, playerPct, playerZ, speedPct, dt);
    ctx.restore();

    if (theme.night?.rain) this.drawRain(dt, speedPct, player.steer);
    if (this.flashLeft > 0) {
      this.flashLeft -= dt;
      ctx.globalAlpha = Math.max(0, Math.min(0.7, this.flashLeft * 3));
      ctx.fillStyle = this.flashColor;
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
      ctx.globalAlpha = 1;
    }

    if (race.phase === 'countdown' || race.time < 1) this.drawStartLights(race);
  }

  private drawSegment(seg: Segment, maxy: number) {
    const ctx = this.ctx;
    const { p1, p2 } = seg;
    const palette = this.assets.theme.road;
    const colors = seg.dark ? palette.dark : palette.light;
    const top = Math.max(0, Math.ceil(p2.screen.y));
    const bottom = Math.min(maxy, Math.ceil(p1.screen.y), HEIGHT);
    const span = p1.screen.y - p2.screen.y;
    for (let y = top; y < bottom; y++) {
      const t = (y - p2.screen.y) / span;
      const cx = lerp(p2.screen.x, p1.screen.x, t);
      const w = lerp(p2.screen.w, p1.screen.w, t);
      const rumble = w / Math.max(6, 2 * LANES);
      const left = Math.round(cx - w);
      const right = Math.round(cx + w);

      ctx.fillStyle = colors.grass;
      ctx.fillRect(0, y, WIDTH, 1);
      if (seg.water !== 0) this.drawWaterRow(seg, cx, w, y, t);
      ctx.fillStyle = colors.rumble;
      ctx.fillRect(Math.round(cx - w - rumble), y, Math.round(rumble), 1);
      ctx.fillRect(right, y, Math.round(rumble), 1);
      ctx.fillStyle = colors.road;
      ctx.fillRect(left, y, right - left, 1);

      if (seg.start) {
        const cells = 12;
        const cw = (right - left) / cells;
        const row = Math.floor(t * 2);
        for (let c = 0; c < cells; c++) {
          ctx.fillStyle = (c + row + seg.index) % 2 === 0 ? '#ffffff' : '#11131c';
          ctx.fillRect(Math.round(left + c * cw), y, Math.ceil(cw), 1);
        }
      } else if (colors.lane) {
        const lw = Math.max(1, Math.round(w / Math.max(32, 8 * LANES)));
        const glow = this.assets.theme.night?.laneGlow;
        for (let l = 1; l < LANES; l++) {
          const lx = Math.round(left + ((right - left) * l) / LANES - lw / 2);
          if (glow) {
            // halo del neón alrededor de la línea
            ctx.globalAlpha = 0.3;
            ctx.fillStyle = glow;
            ctx.fillRect(lx - 1 - Math.floor(lw / 2), y, lw + 2 + Math.floor(lw / 2) * 2, 1);
            ctx.globalAlpha = 1;
          }
          ctx.fillStyle = colors.lane;
          ctx.fillRect(lx, y, lw, 1);
        }
      }

      // bordes de neón continuos a lo largo de la pista (noche)
      const edge = this.assets.theme.night?.edgeGlow;
      if (edge) {
        const ew = Math.max(1, Math.round(w / 90));
        ctx.fillStyle = edge;
        ctx.fillRect(left, y, ew, 1);
        ctx.fillRect(right - ew, y, ew, 1);
      }

      if (seg.pad !== null) this.drawPadRow(seg, cx, w, y, t);
      if (seg.hazard !== null) this.drawHazardRow(seg, cx, w, y, t);

      if (seg.fog < 1) {
        ctx.globalAlpha = 1 - seg.fog;
        ctx.fillStyle = palette.fog;
        ctx.fillRect(0, y, WIDTH, 1);
        ctx.globalAlpha = 1;
      }
    }
  }

  // Mar al costado (o a ambos lados en el puente): orilla con espuma que va y viene, agua con
  // destellos. En el puente, el tablero de madera va del borde de la pista a la baranda.
  private drawWaterRow(seg: Segment, cx: number, w: number, y: number, t: number) {
    const coast = this.assets.theme.coast;
    if (!coast) return;
    const ctx = this.ctx;
    const shore = seg.shore * w;
    const wave = Math.sin(seg.index * 0.45 + this.time * 2.2) * 0.5 + 0.5;
    const foam = Math.max(1, Math.round(w * (0.02 + 0.05 * wave)));
    const water = coast.water[seg.dark ? 1 : 0];
    const sides: number[] = [];
    if (seg.water & 1) sides.push(-1);
    if (seg.water & 2) sides.push(1);
    if (seg.water === 3) {
      ctx.fillStyle = coast.deck[seg.dark ? 1 : 0];
      ctx.fillRect(Math.round(cx - shore), y, Math.round(shore * 2), 1);
    }
    for (const side of sides) {
      const edge = Math.round(cx + side * shore);
      const from = side < 0 ? 0 : edge;
      const to = side < 0 ? edge : WIDTH;
      if (to <= from) continue;
      ctx.fillStyle = water;
      ctx.fillRect(from, y, to - from, 1);
      // más lejos de la orilla el agua es más profunda
      const deepAt = Math.round(cx + side * shore * 2.2);
      ctx.fillStyle = coast.deep;
      if (side < 0 && deepAt > 0) ctx.fillRect(0, y, Math.min(deepAt, edge), 1);
      if (side > 0 && deepAt < WIDTH) ctx.fillRect(Math.max(deepAt, edge), y, WIDTH - Math.max(deepAt, edge), 1);
      // destellos del sol sobre el agua
      for (let k = 0; k < 3; k++) {
        const h = (seg.index * 73 + k * 151 + Math.floor(this.time * 3 + k) * 37) % 101;
        if (h > 18 || Math.floor(t * 3) !== k % 3) continue;
        const sx = Math.round(edge + side * (h / 18) * Math.max(20, w * 1.5));
        ctx.fillStyle = '#e8fdff';
        ctx.fillRect(sx, y, Math.max(1, Math.round(w / 50)), 1);
      }
      // espuma en la orilla (en el puente: base de la baranda)
      ctx.fillStyle = coast.foam;
      ctx.fillRect(side < 0 ? edge - foam : edge, y, foam, 1);
    }
  }

  // Baranda del puente: pasamanos continuo y postes cada 4 segmentos, a ambos lados.
  private drawRails(seg: Segment) {
    const coast = this.assets.theme.coast;
    const { p1, p2 } = seg;
    if (!coast || p1.camera.z <= this.cameraDepth || p2.camera.z <= this.cameraDepth) return;
    const ctx = this.ctx;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, WIDTH, seg.clip);
    ctx.clip();
    const h1 = p1.screen.scale * RAIL_HEIGHT * (HEIGHT / 2);
    const h2 = p2.screen.scale * RAIL_HEIGHT * (HEIGHT / 2);
    for (const side of [-1, 1]) {
      const x1 = p1.screen.x + side * seg.shore * p1.screen.w;
      const x2 = p2.screen.x + side * seg.shore * p2.screen.w;
      // pasamanos y travesaño medio
      for (const [a, b] of [[1, 0.8], [0.5, 0.38]]) {
        ctx.fillStyle = coast.rail;
        ctx.beginPath();
        ctx.moveTo(x2, p2.screen.y - h2 * a);
        ctx.lineTo(x1, p1.screen.y - h1 * a);
        ctx.lineTo(x1, p1.screen.y - h1 * b);
        ctx.lineTo(x2, p2.screen.y - h2 * b);
        ctx.closePath();
        ctx.fill();
      }
      if (seg.index % 4 === 0) {
        const pw = Math.max(1, Math.round(h1 * 0.18));
        ctx.fillStyle = coast.post;
        ctx.fillRect(Math.round(x1 - pw / 2), Math.round(p1.screen.y - h1), pw, Math.max(1, Math.round(h1)));
      }
    }
    ctx.restore();
  }

  // Detecta karts que acaban de caer al agua (splash sube) para animar el salpicón.
  private detectSplashes(race: Race, player: Racer) {
    for (const r of race.racers) {
      const prev = this.lastSplash.get(r.id) ?? 0;
      if (r.splash > prev + 0.05) {
        this.splashAt.set(r.id, this.time);
        if (r === player) this.playerSplash(Math.sign(r.prevX) || -1);
      }
      this.lastSplash.set(r.id, r.splash);
    }
  }

  // Salpicón del kart propio: gotas que suben y caen por el lado donde cayó, más un destello.
  private playerSplash(side: number) {
    const coast = this.assets.theme.coast;
    const colors = coast ? [coast.foam, coast.water[0], '#bff6ff', '#ffffff'] : ['#ffffff'];
    const cx = WIDTH / 2 + side * 70;
    const cy = HEIGHT - 50;
    for (let i = 0; i < 70; i++) {
      this.particles.push({
        x: cx + (Math.random() - 0.5) * 70,
        y: cy + Math.random() * 10,
        vx: (Math.random() - 0.5) * 160 + side * 30,
        vy: -120 - Math.random() * 180,
        life: 0.6 + Math.random() * 0.5,
        size: Math.random() < 0.3 ? 3 : 2,
        color: colors[Math.floor(Math.random() * colors.length)],
        g: 420,
      });
    }
    this.flash('#d8faff', 0.15);
  }

  /** Destello de pantalla completa (rayo, golpe). */
  flash(color: string, seconds: number) {
    this.flashColor = color;
    this.flashLeft = seconds;
  }

  // Obstáculo pintado: mancha redondeada (aceite brillante, arena con granos, charco con reflejos).
  private drawHazardRow(seg: Segment, cx: number, w: number, y: number, t: number) {
    const ctx = this.ctx;
    const hz = seg.hazard!;
    const along = (hz.part + t) / HAZARD_LENGTH; // 0..1 a lo largo del obstáculo
    const shape = Math.sin(along * Math.PI);
    const half = HAZARD_HALF * w * (0.35 + 0.65 * shape);
    const l = Math.round(cx + hz.x * w - half);
    const width = Math.round(half * 2);
    if (width < 1) return;
    const base = hz.kind === HAZARD.oil ? '#14121f' : hz.kind === HAZARD.sand ? '#d8ac63' : '#3d7fd1';
    ctx.globalAlpha = hz.kind === HAZARD.puddle ? 0.65 : 0.95;
    ctx.fillStyle = base;
    ctx.fillRect(l, y, width, 1);
    // brillo / textura
    const step = Math.max(2, Math.floor(width / 10));
    for (let px = 0; px < width; px += step) {
      const n = (seg.index * 7 + px * 13 + Math.floor(t * 6) * 5) % 17;
      if (hz.kind === HAZARD.oil && n < 2) ctx.fillStyle = ['#7df4ff', '#ff9ae6', '#f3db00'][n % 3];
      else if (hz.kind === HAZARD.sand && n < 4) ctx.fillStyle = '#b8873f';
      else if (hz.kind === HAZARD.puddle && n < 3) ctx.fillStyle = '#bfe8ff';
      else continue;
      ctx.fillRect(l + px, y, 1, 1);
    }
    ctx.globalAlpha = 1;
  }

  // Cajas de ítems: flotan y giran suavemente sobre la pista.
  private drawItemBoxes(race: Race, seg: Segment) {
    const def = this.assets.sprites['fx-box'];
    if (!def) return;
    const scale = seg.p1.screen.scale;
    BOX_LANES.forEach((lane, i) => {
      if (!race.boxActive(seg.itemRow! * BOX_LANES.length + i)) return;
      const sx = seg.p1.screen.x + scale * lane * ROAD_WIDTH * (WIDTH / 2);
      const bob = (Math.sin(this.time * 4 + i * 2) + 1.4) * def.worldWidth * 0.18 * scale * (WIDTH / 2);
      this.drawSprite(def.img, def.worldWidth, scale, sx, seg.p1.screen.y - bob, -0.5, seg.clip);
    });
  }

  private drawProjectile(p: { kind: number; distance: number; x: number; state: number; timer: number }, seg: Segment, trackLength: number) {
    const pct = pctRemaining(wrapZ(p.distance, trackLength), SEGMENT_LENGTH);
    const scale = lerp(seg.p1.screen.scale, seg.p2.screen.scale, pct);
    const sx = lerp(seg.p1.screen.x, seg.p2.screen.x, pct) + scale * p.x * ROAD_WIDTH * (WIDTH / 2);
    const sy = lerp(seg.p1.screen.y, seg.p2.screen.y, pct);
    if (p.state === PROJ_STATE.exploding) {
      const key = `${p.kind}:${Math.round(p.distance / 50)}:${Math.round(p.x * 10)}`;
      const start = this.explosionStart.get(key) ?? this.time;
      this.explosionStart.set(key, start);
      const frame = Math.min(6, Math.floor((this.time - start) * 14));
      const def = this.assets.sprites[`fx-explosion-${frame}`];
      if (def) this.drawSprite(def.img, def.worldWidth, scale, sx, sy + def.worldWidth * 0.25 * scale * (WIDTH / 2), -0.5, seg.clip);
      if (this.explosionStart.size > 40) this.explosionStart.clear();
      return;
    }
    const def = this.assets.sprites[p.kind === ITEM.bomb ? 'fx-bomb' : 'fx-rocket'];
    if (!def) return;
    // la bomba vuela en arco; armada parpadea
    const lift = p.kind === ITEM.bomb && p.state === PROJ_STATE.flying ? def.worldWidth * 0.6 * scale * (WIDTH / 2) : 0;
    if (p.kind === ITEM.bomb && p.state === PROJ_STATE.armed && Math.floor(this.time * 8) % 2 === 0) this.ctx.globalAlpha = 0.7;
    this.drawSprite(def.img, def.worldWidth, scale, sx, sy - lift, -0.5, seg.clip);
    this.ctx.globalAlpha = 1;
  }

  /** Kart rival con sus efectos (escudo, hielo, trompo, rayo). */
  private drawKart(r: Racer, seg: Segment, scale: number, sx: number, sy: number) {
    const ctx = this.ctx;
    if (r.shockLeft > 0 && Math.floor(this.time * 20) % 2 === 0) ctx.globalAlpha = 0.55;
    const rect = this.drawSprite(this.rearFrame(r, seg), KART_WORLD_WIDTH, scale, sx, sy, -0.5, seg.clip);
    ctx.globalAlpha = 1;
    if (rect) this.drawKartEffects(r, rect.x, rect.y, rect.w, rect.w);
    return rect;
  }

  /** Superposiciones de estado sobre un kart dibujado en (x, y, w, h). */
  private drawKartEffects(r: Racer, x: number, y: number, w: number, h: number) {
    const ctx = this.ctx;
    const sp = this.assets.sprites;
    const over = (key: string, scaleW: number, alpha: number, dy = 0) => {
      const def = sp[key];
      if (!def) return;
      const dw = Math.round(w * scaleW);
      const dh = Math.round(dw * (def.img.height / def.img.width));
      ctx.globalAlpha = alpha;
      ctx.drawImage(def.img, Math.round(x + w / 2 - dw / 2), Math.round(y + h / 2 - dh / 2 + dy), dw, dh);
      ctx.globalAlpha = 1;
    };
    if (r.frozenLeft > 0) over('fx-ice', 1.05, 0.8, h * 0.05);
    if (r.shieldLeft > 0) over('fx-shield', 1.3, 0.35 + 0.1 * Math.sin(this.time * 6));
    if (r.spinLeft > 0) over('fx-dizzy', 0.7, 1, -h * 0.45);
    if (r.shockLeft > 0 && Math.floor(this.time * 10) % 2 === 0) over('fx-bolt', 0.55, 0.9, -h * 0.4);
    const since = this.time - (this.splashAt.get(r.id) ?? -99);
    if (since < SPLASH_SHOW) this.drawSplash(x + w / 2, y + h, w, since / SPLASH_SHOW);
  }

  // Corona de agua alrededor de un kart que cayó al mar (p: 0..1 del salpicón).
  private drawSplash(cx: number, bottom: number, w: number, p: number) {
    const coast = this.assets.theme.coast;
    const ctx = this.ctx;
    const size = Math.max(1, Math.round(w / 16));
    ctx.globalAlpha = 1 - p * 0.7;
    for (let i = 0; i < 14; i++) {
      const a = (i / 13) * Math.PI;
      const reach = w * (0.35 + 0.45 * p) * (0.7 + ((i * 37) % 10) / 30);
      const up = Math.sin(a) * w * 0.9 * Math.sin(Math.min(1, p * 1.4) * Math.PI);
      ctx.fillStyle = i % 3 === 0 ? (coast?.water[0] ?? '#7fe6f5') : '#ffffff';
      ctx.fillRect(Math.round(cx - Math.cos(a) * reach), Math.round(bottom - up - w * 0.1), size, size);
    }
    // anillo de espuma en la base
    ctx.fillStyle = coast?.foam ?? '#ffffff';
    const ring = Math.round(w * (0.5 + 0.4 * p));
    ctx.fillRect(Math.round(cx - ring / 2), Math.round(bottom - w * 0.12), ring, size);
    ctx.globalAlpha = 1;
  }

  // Pad de turbo: chevrones animados que apuntan hacia adelante.
  private drawPadRow(seg: Segment, cx: number, w: number, y: number, t: number) {
    const ctx = this.ctx;
    const l = Math.round(cx + (seg.pad! - PAD_HALF) * w);
    const r = Math.round(cx + (seg.pad! + PAD_HALF) * w);
    const width = r - l;
    if (width < 2) return;
    ctx.fillStyle = '#00f0ff';
    ctx.fillRect(l, y, width, 1);
    const phase = seg.index * 2 + t * 2 - this.time * 6;
    const step = Math.max(1, Math.floor(width / 24));
    for (let px = 1; px < width - 1; px += step) {
      const u = Math.abs((px / width) * 2 - 1);
      const band = Math.floor(phase + u * 1.6);
      ctx.fillStyle = band % 2 === 0 ? '#f3db00' : '#ff506e';
      ctx.fillRect(l + px, y, step, 1);
    }
  }

  // Estrellas fijas con titileo (solo arriba del skyline).
  private drawStars(yShift: number) {
    const ctx = this.ctx;
    for (let i = 0; i < 70; i++) {
      const x = (i * 97 + Math.floor(this.skyOffset * 0.02)) % WIDTH;
      const y = ((i * 53) % 70) + 4 + Math.min(0, yShift);
      const twinkle = Math.sin(this.time * 3 + i * 1.7) > 0.6;
      ctx.fillStyle = twinkle ? '#ffffff' : i % 3 === 0 ? '#ff9ae6' : '#7df4ff';
      ctx.globalAlpha = twinkle ? 1 : 0.55;
      ctx.fillRect(((x % WIDTH) + WIDTH) % WIDTH, y, 1, 1);
    }
    ctx.globalAlpha = 1;
  }

  // Lluvia en pantalla: gotas inclinadas según la velocidad y el giro.
  private drawRain(dt: number, speedPct: number, steer: number) {
    const ctx = this.ctx;
    if (this.rain.length === 0) {
      for (let i = 0; i < 140; i++) this.rain.push({ x: Math.random() * WIDTH, y: Math.random() * HEIGHT, len: 4 + Math.random() * 6, v: 260 + Math.random() * 140 });
    }
    const slant = -steer * 40 - 30 * speedPct;
    ctx.fillStyle = '#9fd8ff';
    ctx.globalAlpha = 0.35;
    for (const d of this.rain) {
      d.y += (d.v + speedPct * 160) * dt;
      d.x += slant * dt;
      if (d.y > HEIGHT) {
        d.y = -d.len;
        d.x = Math.random() * WIDTH;
      }
      if (d.x < 0) d.x += WIDTH;
      if (d.x > WIDTH) d.x -= WIDTH;
      const len = d.len * (1 + speedPct * 0.6);
      ctx.fillRect(Math.round(d.x), Math.round(d.y), 1, Math.round(len));
    }
    ctx.globalAlpha = 1;
  }

  // align: -0.5 centra el sprite, -1 lo alinea a la derecha del punto, 0 a la izquierda
  private drawSprite(img: Img, worldWidth: number, scale: number, x: number, y: number, align: number, clipY: number) {
    const destW = worldWidth * scale * (WIDTH / 2);
    if (destW < 1) return null;
    const destH = destW * (img.height / img.width);
    const dx = Math.round(x + destW * align);
    const dy = Math.round(y - destH);
    const clipH = clipY ? Math.max(0, dy + destH - clipY) : 0;
    if (clipH >= destH) return null;
    const srcH = img.height - (img.height * clipH) / destH;
    this.ctx.drawImage(img, 0, 0, img.width, srcH, dx, dy, Math.round(destW), Math.round(destH - clipH));
    return { x: dx, y: dy, w: destW };
  }

  // Nombre de un piloto humano sobre su kart (pixel font con contorno oscuro).
  private drawLabel(text: string, cx: number, y: number) {
    const ctx = this.ctx;
    ctx.font = 'bold 8px "Space Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    const tx = Math.round(cx);
    const ty = Math.round(y);
    ctx.fillStyle = '#0c0e17';
    for (const [ox, oy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) ctx.fillText(text, tx + ox, ty + oy);
    ctx.fillStyle = text.endsWith('(AUSENTE)') ? '#b9cacb' : '#7df4ff';
    ctx.fillText(text, tx, ty);
  }

  // Frame trasero según el giro del kart más la curva de la pista bajo él.
  private rearFrame(r: Racer, seg: Segment): Img {
    if (r.spinLeft > 0) {
      const order: Direction[] = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
      return this.frames.get(r.id)!.dirs[order[Math.floor(this.time * 18) % 8]];
    }
    const turn = r.lean + (Math.abs(seg.curve) > 3 ? Math.sign(seg.curve) * 0.4 : 0);
    const a = Math.abs(turn);
    const idx = (a < 0.3 ? 0 : a < 0.8 ? Math.sign(turn) : Math.sign(turn) * 2) as RearIndex;
    return this.frames.get(r.id)!.rear[idx];
  }

  private drawPlayer(r: Racer, seg: Segment, pct: number, playerZ: number, speedPct: number, dt: number) {
    const ctx = this.ctx;
    const img = this.rearFrame(r, seg);
    const camY = lerp(seg.p1.camera.y, seg.p2.camera.y, pct);
    const baseY = HEIGHT / 2 - (this.cameraDepth / playerZ) * camY * (HEIGHT / 2);
    const offroad = Math.abs(r.x) > 1;

    this.bounce += dt * (offroad ? 40 : 18) * speedPct;
    const jitter = speedPct > 0.05 ? Math.round(Math.sin(this.bounce) * (offroad ? 2 : 0.6)) : 0;
    // tamaño nativo 1:1 para que el michi quede pixel-perfect
    const dx = Math.round(WIDTH / 2 - img.width / 2);
    const dy = Math.round(baseY - img.height + 6 + jitter);
    const wheelY = dy + img.height - 14;

    const spawn = (n: number, make: () => Particle) => {
      for (let i = 0; i < n; i++) this.particles.push(make());
    };
    if (r.turboLeft > 0 || r.boostLeft > 0) {
      const colors = r.boostLeft > 0 && r.turboLeft <= 0 ? ['#00f0ff', '#ffffff', '#7df4ff'] : ['#00f0ff', '#ff506e', '#f3db00', '#ffffff'];
      spawn(4, () => ({
        x: WIDTH / 2 + (Math.random() < 0.5 ? -14 : 14),
        y: wheelY - 8,
        vx: (Math.random() - 0.5) * 30,
        vy: 40 + Math.random() * 60,
        life: 0.35,
        size: 2,
        color: colors[Math.floor(Math.random() * colors.length)],
      }));
    }
    if (r.drift.active) {
      const c = r.drift.charge;
      const spark = c >= 1.4 ? '#ff9a1f' : c >= 0.6 ? '#00f0ff' : null;
      for (const wx of [dx + 24, dx + img.width - 24]) {
        spawn(1, () => ({ x: wx, y: wheelY, vx: (Math.random() - 0.5) * 40, vy: 10 + Math.random() * 20, life: 0.5, size: 3, color: '#e9eef5' }));
        if (spark) spawn(2, () => ({ x: wx, y: wheelY + 4, vx: (Math.random() - 0.5) * 120, vy: -20 - Math.random() * 60, life: 0.25, size: 1, color: spark }));
      }
    }
    if (offroad && speedPct > 0.1) {
      spawn(1, () => ({
        x: WIDTH / 2 + (Math.random() - 0.5) * 60,
        y: wheelY + 6,
        vx: (Math.random() - 0.5) * 60,
        vy: 20 + Math.random() * 30,
        life: 0.4,
        size: 2,
        color: this.assets.theme.dust[Math.random() < 0.5 ? 0 : 1],
      }));
    }
    this.particles = this.particles.filter((p) => (p.life -= dt) > 0);
    for (const p of this.particles) {
      if (p.g) p.vy += p.g * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      ctx.fillStyle = p.color;
      ctx.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
    }

    // parpadeo mientras reaparece
    if (r.respawn > 0 && Math.floor(this.time * 10) % 2 === 0) return;
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(dx + 14, dy + img.height - 10, img.width - 28, 4);
    if (r.shockLeft > 0 && Math.floor(this.time * 20) % 2 === 0) ctx.globalAlpha = 0.55;
    ctx.drawImage(img, dx, dy);
    ctx.globalAlpha = 1;
    this.drawKartEffects(r, dx, dy, img.width, img.height);
  }

  private drawStartLights(race: Race) {
    const ctx = this.ctx;
    const reds = race.phase !== 'countdown' ? 0 : race.countdown > 2 ? 1 : race.countdown > 1 ? 2 : 3;
    const green = race.phase !== 'countdown';
    const w = 74;
    const x0 = Math.round(WIDTH / 2 - w / 2);
    const y0 = 34;
    ctx.fillStyle = '#0c0e17';
    ctx.fillRect(x0 - 2, y0 - 2, w + 4, 30);
    ctx.fillStyle = '#1d1f29';
    ctx.fillRect(x0, y0, w, 26);
    for (let i = 0; i < 3; i++) {
      const on = green || i < reds;
      const color = green ? '#3dff7a' : '#ff3b4e';
      const cx = x0 + 13 + i * 24;
      ctx.fillStyle = on ? color : '#32343e';
      ctx.fillRect(cx - 7, y0 + 6, 14, 14);
      ctx.fillRect(cx - 9, y0 + 8, 18, 10);
      if (on) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(cx - 4, y0 + 8, 3, 3);
      }
    }
  }

  // vista "garaje": el michi girando en sus 8 direcciones para revisar la consistencia
  renderGarage(kart: KartFrames, t: number) {
    const ctx = this.ctx;
    const frames = kart.dirs;
    ctx.fillStyle = '#11131c';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    for (let y = 0; y < HEIGHT; y += 16) {
      ctx.fillStyle = '#191b24';
      ctx.fillRect(0, y, WIDTH, 8);
    }
    const order: Direction[] = ['south', 'south-east', 'east', 'north-east', 'north', 'north-west', 'west', 'south-west'];
    const img = frames[order[Math.floor(t * 4) % 8]];
    ctx.fillStyle = '#00f0ff';
    ctx.fillRect(WIDTH / 2 - 80, 214, 160, 4);
    ctx.drawImage(img, WIDTH / 2 - img.width, 214 - img.height * 2 + 12, img.width * 2, img.height * 2);
    order.forEach((d, i) => ctx.drawImage(frames[d], 6 + i * 59, 226, 40, 40));
  }
}

