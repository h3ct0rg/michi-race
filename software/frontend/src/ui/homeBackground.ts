// Fondo de la pantalla de inicio: paisaje de una pista (cielo, sol, capas con parallax) visto de costado,
// con una carretera y michis en kart cruzando de izquierda a derecha. Cambia de pista con un fundido.
import { drawLayer, drawSky, drawSun } from '../render/parallax';
import type { KartFrames } from '../render/sprites';
import { loadTheme, type LoadedTheme } from '../render/themes';
import { TOURNAMENT_ORDER } from '../game/tournament';

const H = 270;
const SCENE_SECONDS = 9;
const FADE = 1.2;
const ROAD_TOP = 206;
const ROAD_BOTTOM = 248;
const KART = 72;

interface Runner {
  frames: KartFrames;
  x: number;
  speed: number; // px/s respecto de la pantalla
  lane: number; // y de las ruedas
}

export class HomeBackground {
  private readonly ctx: CanvasRenderingContext2D;
  private themes: LoadedTheme[] = [];
  private raf = 0;
  private last = 0;
  private t = 0;
  private scroll = 0;
  private runners: Runner[] = [];
  private w = 480;
  /** Alto del canvas: 270 en pantallas anchas; más alto (cielo extra) en pantallas cuadradas o verticales. */
  private h = H;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly karts: KartFrames[],
  ) {
    this.ctx = canvas.getContext('2d')!;
    // el primer tema llega rápido (precargado); el resto en segundo plano
    loadTheme(TOURNAMENT_ORDER[0]).then((th) => {
      this.themes[0] = th;
      TOURNAMENT_ORDER.slice(1).forEach((id, i) => loadTheme(id).then((x) => (this.themes[i + 1] = x)));
    });
  }

  start() {
    if (this.raf) return;
    this.resize();
    if (this.runners.length === 0) this.spawn();
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  stop() {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  /**
   * Escena de 270 px de alto (pixel art escalado): en pantallas anchas se agranda el ancho; en las
   * cuadradas o verticales el ancho queda en 480 y se agrega cielo arriba, así los karts no se ven gigantes.
   */
  private resize() {
    const r = this.canvas.getBoundingClientRect();
    const aspect = r.width > 0 && r.height > 0 ? r.width / r.height : 16 / 9;
    this.w = Math.round(Math.min(720, Math.max(480, H * aspect)));
    this.h = Math.max(H, Math.round(this.w / aspect));
    if (this.canvas.width !== this.w || this.canvas.height !== this.h) {
      this.canvas.width = this.w;
      this.canvas.height = this.h;
      this.ctx.imageSmoothingEnabled = false;
    }
  }

  private spawn() {
    const pick = () => this.karts[Math.floor(Math.random() * this.karts.length)];
    this.runners = [
      { frames: pick(), x: -KART, speed: 70, lane: ROAD_TOP + 22 },
      { frames: pick(), x: -KART * 4, speed: 95, lane: ROAD_BOTTOM - 4 },
    ];
  }

  private frame = (now: number) => {
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    this.t += dt;
    this.scroll += dt * 140;
    this.resize();
    this.draw(dt);
    this.raf = requestAnimationFrame(this.frame);
  };

  private draw(dt: number) {
    const ctx = this.ctx;
    const loaded = this.themes.filter(Boolean);
    if (loaded.length === 0) {
      ctx.fillStyle = '#11131c';
      ctx.fillRect(0, 0, this.w, this.h);
      return;
    }
    ctx.save();
    ctx.translate(0, this.h - H); // la escena va abajo; arriba solo cielo
    const scene = Math.floor(this.t / SCENE_SECONDS);
    const cur = loaded[scene % loaded.length];
    const next = loaded[(scene + 1) % loaded.length];
    const into = this.t - scene * SCENE_SECONDS;
    this.drawScene(cur, 1);
    if (into > SCENE_SECONDS - FADE && next !== cur) this.drawScene(next, (into - (SCENE_SECONDS - FADE)) / FADE);

    // karts (el de atrás primero)
    for (const r of this.runners) {
      r.x += r.speed * dt;
      if (r.x > this.w + KART) {
        r.x = -KART - Math.random() * 160;
        r.frames = this.karts[Math.floor(Math.random() * this.karts.length)];
      }
      const y = r.lane - KART + 5; // perfectamente horizontal, sin rebote
      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      ctx.fillRect(Math.round(r.x + KART * 0.15), r.lane - 2, Math.round(KART * 0.7), 3);
      ctx.drawImage(r.frames.side, Math.round(r.x), y, KART, KART);
      // estela de velocidad
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      for (let k = 0; k < 3; k++) {
        const len = 6 + ((Math.floor(this.t * 20) + k * 3) % 8);
        ctx.fillRect(Math.round(r.x - len - 2), r.lane - 10 - k * 6, len, 1);
      }
    }
    ctx.restore();
  }

  /** Cielo, sol, capas y carretera de costado de un tema. */
  private drawScene(theme: LoadedTheme, alpha: number) {
    const ctx = this.ctx;
    const w = this.w;
    ctx.save();
    ctx.globalAlpha = alpha;
    const th = theme.theme;
    // cielo extra arriba (pantallas altas) con el color superior
    const extra = this.h - H;
    if (extra > 0) {
      ctx.fillStyle = th.sky[0];
      ctx.fillRect(0, -extra, w, extra);
    }
    drawSky(ctx, w, H, th.sky);
    if (th.night?.stars) {
      for (let i = 0; i < 60; i++) {
        ctx.fillStyle = Math.sin(this.t * 3 + i) > 0.6 ? '#ffffff' : '#7df4ff';
        ctx.fillRect((i * 97) % w, (i * 53) % 80 + 4, 1, 1);
      }
    }
    if (th.sun) drawSun(ctx, th.sun, 0, 0, w);
    for (const layer of theme.layers) drawLayer(ctx, layer, this.scroll * layer.speed * 0.1, 0, w);

    // banquina, pianos (rumble), asfalto y líneas
    const road = th.road.light;
    const roadDark = th.road.dark;
    ctx.fillStyle = road.grass;
    ctx.fillRect(0, ROAD_TOP - 14, w, 14);
    ctx.fillStyle = roadDark.grass;
    ctx.fillRect(0, ROAD_BOTTOM + 4, w, H - ROAD_BOTTOM - 4);
    const stripe = 16;
    const off = Math.floor(this.scroll) % (stripe * 2);
    for (const y of [ROAD_TOP - 4, ROAD_BOTTOM]) {
      for (let x = -off; x < w; x += stripe * 2) {
        ctx.fillStyle = road.rumble;
        ctx.fillRect(x, y, stripe, 4);
        ctx.fillStyle = roadDark.rumble;
        ctx.fillRect(x + stripe, y, stripe, 4);
      }
    }
    ctx.fillStyle = road.road;
    ctx.fillRect(0, ROAD_TOP, w, ROAD_BOTTOM - ROAD_TOP);
    ctx.fillStyle = road.lane || '#f4f4f4';
    const dash = 24;
    const doff = Math.floor(this.scroll * 1.0) % (dash * 2);
    for (let x = -doff; x < w; x += dash * 2) ctx.fillRect(x, Math.round((ROAD_TOP + ROAD_BOTTOM) / 2) - 1, dash, 2);
    if (th.night) {
      ctx.fillStyle = th.night.edgeGlow;
      ctx.fillRect(0, ROAD_TOP, w, 1);
      ctx.fillRect(0, ROAD_BOTTOM - 1, w, 1);
    }
    ctx.restore();
  }
}
