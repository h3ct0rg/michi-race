// Escena final del torneo: el 3º, el 2º y el 1º llegan manejando a su escalón del podio, les cae la
// medalla de bronce, la de plata y la copa dorada, y aparece el nombre del ganador en grande.
// Canvas 480x270 (pixel art) + botones en HTML encima.
import { audio, sfx } from '../audio/audio';
import { loadImage, type Img, type KartFrames } from '../render/sprites';
import { escapeHtml } from './results';
import { t } from '../i18n';

const W = 480;
const H = 270;
const KART = 64; // tamaño de dibujo del kart (frames de 96 px)
const FLOOR = 266;
const PODIUM_SCALE = 1.6;
const PODIUM_X = 35;
const PODIUM_BOTTOM = 258;
const PODIUM_Y = PODIUM_BOTTOM - 112 * PODIUM_SCALE;
/** Escalones (coordenadas de la imagen del podio): centro x y borde superior. Índice 0 = 1er puesto. */
const STEPS = [
  { x: PODIUM_X + 128 * PODIUM_SCALE, top: PODIUM_Y + 61 * PODIUM_SCALE, from: 1, digit: '#ffd23f' },
  { x: PODIUM_X + 77 * PODIUM_SCALE, top: PODIUM_Y + 88 * PODIUM_SCALE, from: -1, digit: '#d7e1ee' },
  { x: PODIUM_X + 180.5 * PODIUM_SCALE, top: PODIUM_Y + 90 * PODIUM_SCALE, from: 1, digit: '#ffb07a' },
];
/** Momento en que entra cada puesto (el 3º primero, el 1º al final). */
const ENTER_AT = [4.1, 2.2, 0.3];
const DRIVE = 1.3;
const HOP = 0.45;
const DROP = 0.7;
const TEXT_AT = 6.6;

export interface PodiumEntry {
  id: string;
  name: string;
  points: number;
  frames: KartFrames;
}

export interface PodiumOptions {
  /** Los 3 primeros de la tabla (índice 0 = campeón). */
  top: PodiumEntry[];
  myId: string;
  myPlace: number;
  myPoints: number;
  /** Botón principal (reiniciar / votar / revancha) y secundario (nuevo torneo / salir). */
  primary: { label: string; onClick: () => void };
  secondary: { label: string; onClick: () => void };
}

interface Confetti {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  color: string;
}

let art: Promise<Record<string, Img>> | null = null;
const loadArt = () =>
  (art ??= (async () => {
    const names = ['stage', 'podium', 'bronze', 'silver', 'trophy'];
    const imgs = await Promise.all(names.map((n) => loadImage(`/assets/podium/${n}.png`)));
    return Object.fromEntries(names.map((n, i) => [n, imgs[i]]));
  })());

const easeOut = (p: number) => 1 - (1 - p) ** 3;
const clamp01 = (p: number) => Math.max(0, Math.min(1, p));

export class PodiumScene {
  private readonly root = document.getElementById('podium')!;
  private readonly canvas = document.getElementById('podium-canvas') as HTMLCanvasElement;
  private readonly ui = document.getElementById('podium-ui')!;
  private readonly ctx = this.canvas.getContext('2d')!;
  private raf = 0;
  private t = 0;
  private last = 0;
  private opts: PodiumOptions | null = null;
  private imgs: Record<string, Img> = {};
  private confetti: Confetti[] = [];
  private played = new Set<string>();

  constructor() {
    this.ctx.imageSmoothingEnabled = false;
    // clic en la escena: saltar la animación
    this.canvas.addEventListener('click', () => {
      if (this.t < TEXT_AT) this.t = TEXT_AT;
    });
  }

  async show(opts: PodiumOptions) {
    this.hide();
    this.opts = opts;
    this.imgs = await loadArt();
    if (this.opts !== opts) return;
    this.t = 0;
    this.confetti = [];
    this.played.clear();
    const champ = opts.top[0];
    const iWon = champ?.id === opts.myId;
    this.ui.innerHTML = `
      <div class="podium-text">
        <div class="podium-title">${t(iWon ? 'pod.youWin' : 'pod.wins')}</div>
        <div class="podium-name">${escapeHtml(champ?.name.toUpperCase() ?? '')}</div>
      </div>
      <div class="podium-sub">${iWon ? t('pod.champ', { pts: champ.points }) : opts.myPlace > 0 ? t('pod.mine', { place: opts.myPlace, pts: opts.myPoints }) : t('pod.over')}</div>
      <div class="podium-actions">
        <button class="btn btn-primary" data-act="primary">${opts.primary.label}</button>
        <button class="btn btn-secondary" data-act="secondary">${opts.secondary.label}</button>
      </div>
      <div class="podium-votes" id="podium-votes"></div>`;
    // el título del ganador va arriba y el nombre debajo: "¡YOU WIN!" / "GASTON"; para los demás "GASTON" / "WINS!"
    if (!iWon) this.ui.querySelector('.podium-text')!.prepend(this.ui.querySelector('.podium-name')!);
    this.ui.querySelector<HTMLElement>('[data-act=primary]')!.onclick = () => this.opts?.primary.onClick();
    this.ui.querySelector<HTMLElement>('[data-act=secondary]')!.onclick = () => this.opts?.secondary.onClick();
    this.ui.classList.remove('show');
    this.root.hidden = false;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  /** Cambia los botones (p. ej. si el mando de la sala pasa a otro jugador durante el podio). */
  setActions(primary: PodiumOptions['primary'], secondary: PodiumOptions['secondary']) {
    if (!this.opts) return;
    this.opts.primary = primary;
    this.opts.secondary = secondary;
    const p = this.ui.querySelector<HTMLButtonElement>('[data-act=primary]');
    const s = this.ui.querySelector<HTMLButtonElement>('[data-act=secondary]');
    if (p) p.textContent = primary.label;
    if (s) s.textContent = secondary.label;
  }

  /** Texto de votos (online) y estado del botón principal. */
  setVotes(text: string, primaryLabel?: string, primaryDisabled = false) {
    const v = this.ui.querySelector('#podium-votes');
    if (v) v.textContent = text;
    const btn = this.ui.querySelector<HTMLButtonElement>('[data-act=primary]');
    if (btn && primaryLabel) btn.textContent = primaryLabel;
    if (btn) btn.disabled = primaryDisabled;
  }

  get visible() {
    return !this.root.hidden;
  }

  hide() {
    cancelAnimationFrame(this.raf);
    this.opts = null;
    this.root.hidden = true;
  }

  private once(key: string, fn: () => void) {
    if (this.played.has(key)) return;
    this.played.add(key);
    if (audio.ctx) fn();
  }

  private frame = (now: number) => {
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    this.t += dt;
    this.draw(dt);
    if (this.t >= TEXT_AT && !this.ui.classList.contains('show')) {
      this.ui.classList.add('show');
      this.once('win', () => sfx.finish(this.opts?.top[0]?.id === this.opts?.myId));
    }
    this.raf = requestAnimationFrame(this.frame);
  };

  private draw(dt: number) {
    const ctx = this.ctx;
    const o = this.opts!;
    const { stage, podium } = this.imgs;
    ctx.fillStyle = '#0c0e17';
    ctx.fillRect(0, 0, W, H);
    ctx.drawImage(stage, 0, 0, W, Math.round(stage.height * (W / stage.width)));
    // reflectores que barren el escenario
    ctx.globalAlpha = 0.12;
    ctx.fillStyle = '#fff6c2';
    for (const [base, speed] of [[120, 0.7], [360, -0.6]]) {
      const tip = base + Math.sin(this.t * speed) * 90;
      ctx.beginPath();
      ctx.moveTo(base, 0);
      ctx.lineTo(tip - 40, FLOOR);
      ctx.lineTo(tip + 40, FLOOR);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    ctx.drawImage(podium, PODIUM_X, Math.round(PODIUM_Y), Math.round(podium.width * PODIUM_SCALE), Math.round(podium.height * PODIUM_SCALE));
    STEPS.forEach((s, i) => {
      const face = PODIUM_BOTTOM - s.top - 4;
      this.text(String(i + 1), s.x, s.top + Math.min(28, face * 0.6), 18, s.digit);
      const e = o.top[i];
      if (e) this.text(t('pod.pts', { n: e.points }), s.x, s.top + face - 2, 7, '#11131c', false);
    });

    // karts: entran del costado, suben al escalón y miran al público
    for (let i = o.top.length - 1; i >= 0; i--) this.drawEntry(i);

    // medallas y copa
    const prizes = ['trophy', 'silver', 'bronze'];
    for (let i = 0; i < o.top.length; i++) {
      const at = ENTER_AT[i] + DRIVE + HOP;
      const p = clamp01((this.t - at) / DROP);
      if (this.t < at) continue;
      if (p >= 1) this.once(`medal${i}`, () => sfx.itemReady());
      const s = STEPS[i];
      const size = i === 0 ? 44 : 34;
      const restY = s.top - KART - size + 14;
      // caída con rebote
      const bounce = p < 0.7 ? easeOut(p / 0.7) : 1 - Math.sin(((p - 0.7) / 0.3) * Math.PI) * 0.08;
      const y = -size + (restY + size) * bounce + (p >= 1 ? Math.sin(this.t * 3 + i) * 1.5 : 0);
      const img = this.imgs[prizes[i]];
      ctx.drawImage(img, Math.round(s.x - size / 2), Math.round(y), size, size);
      if (p >= 1 && i === 0) this.sparkle(s.x, restY + size / 2, size);
      if (p >= 1) this.text(o.top[i].name.toUpperCase(), s.x, restY - 4, 8, i === 0 ? '#f3db00' : '#e1e1ef');
    }

    // confeti cuando ya tiene la copa el campeón
    if (this.t > ENTER_AT[0] + DRIVE + HOP + DROP) {
      const colors = ['#ff506e', '#f3db00', '#00f0ff', '#7dff8a', '#ffffff', '#ff9ae6'];
      for (let k = 0; k < 3; k++)
        this.confetti.push({ x: Math.random() * W, y: -4, vx: (Math.random() - 0.5) * 30, vy: 30 + Math.random() * 40, rot: Math.random() * 6, color: colors[(Math.random() * colors.length) | 0] });
    }
    this.confetti = this.confetti.filter((c) => c.y < H + 4);
    for (const c of this.confetti) {
      c.x += (c.vx + Math.sin(this.t * 3 + c.rot) * 20) * dt;
      c.y += c.vy * dt;
      c.rot += dt * 8;
      ctx.fillStyle = c.color;
      ctx.fillRect(Math.round(c.x), Math.round(c.y), Math.cos(c.rot) > 0 ? 2 : 1, 2);
    }
  }

  /** Kart del puesto i: manejando hacia su escalón, salto y de frente al público. */
  private drawEntry(i: number) {
    const o = this.opts!;
    const e = o.top[i];
    const s = STEPS[i];
    const t = this.t - ENTER_AT[i];
    if (!e || t < 0) return;
    const startX = s.from > 0 ? W + KART : -KART;
    let x: number;
    let feet: number;
    let frame: Img;
    if (t < DRIVE) {
      const p = easeOut(t / DRIVE);
      x = startX + (s.x - startX) * p;
      feet = FLOOR;
      frame = e.frames.dirs[s.from > 0 ? 'west' : 'east'];
    } else {
      const p = clamp01((t - DRIVE) / HOP);
      x = s.x;
      feet = FLOOR + (s.top - FLOOR) * p - Math.sin(p * Math.PI) * 26;
      frame = p < 1 ? e.frames.dirs[s.from > 0 ? 'west' : 'east'] : e.frames.dirs.south;
      if (p >= 1) this.once(`land${i}`, () => sfx.pad());
      // el campeón festeja con saltitos
      if (p >= 1 && i === 0 && this.t > TEXT_AT) feet -= Math.abs(Math.sin(this.t * 6)) * 4;
    }
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(Math.round(x - KART * 0.32), Math.round((t < DRIVE ? FLOOR : s.top) - 3), Math.round(KART * 0.64), 3);
    ctx.drawImage(frame, Math.round(x - KART / 2), Math.round(feet - KART + 4), KART, KART);
  }

  private sparkle(x: number, y: number, size: number) {
    const ctx = this.ctx;
    ctx.fillStyle = '#fffbe0';
    for (let k = 0; k < 4; k++) {
      const a = this.t * 2 + (k * Math.PI) / 2;
      const r = size * 0.7 + Math.sin(this.t * 5 + k) * 3;
      if (Math.sin(this.t * 7 + k * 1.3) > 0.2) ctx.fillRect(Math.round(x + Math.cos(a) * r), Math.round(y + Math.sin(a) * r), 2, 2);
    }
  }

  private text(s: string, x: number, y: number, size: number, color: string, outline = true) {
    const ctx = this.ctx;
    ctx.font = `bold ${size}px "Space Mono", monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    const tx = Math.round(x);
    const ty = Math.round(y);
    if (outline) {
      ctx.fillStyle = '#0c0e17';
      for (const [ox, oy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [1, 1]]) ctx.fillText(s, tx + ox, ty + oy);
    }
    ctx.fillStyle = color;
    ctx.fillText(s, tx, ty);
  }
}
