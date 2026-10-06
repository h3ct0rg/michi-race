// Michi girando sobre una plataforma (bienvenida, lobby y garaje). Solo dibuja si el canvas está visible.
import type { Direction, KartFrames } from '../render/sprites';

const ORDER: Direction[] = ['south', 'south-east', 'east', 'north-east', 'north', 'north-west', 'west', 'south-west'];

export class MichiPreview {
  private readonly ctx: CanvasRenderingContext2D;
  private frames: KartFrames | null = null;
  private t = 0;
  private last = performance.now();

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
    this.ctx.imageSmoothingEnabled = false;
    requestAnimationFrame(this.loop);
  }

  setFrames(frames: KartFrames) {
    this.frames = frames;
  }

  private loop = (now: number) => {
    // el timestamp del primer frame puede ser anterior a performance.now() del constructor
    const dt = Math.max(0, (now - this.last) / 1000);
    this.last = now;
    if (this.frames && this.canvas.offsetParent !== null) {
      this.t += dt;
      this.draw();
    }
    requestAnimationFrame(this.loop);
  };

  private draw() {
    const { ctx, canvas } = this;
    const img = this.frames!.dirs[ORDER[Math.floor(this.t * 3) % ORDER.length]];
    const scale = Math.max(1, Math.floor(Math.min(canvas.width / img.width, canvas.height / img.height)));
    const w = img.width * scale;
    const h = img.height * scale;
    const x = Math.round((canvas.width - w) / 2);
    const y = Math.round(canvas.height - h - 6 * scale);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // plataforma
    ctx.fillStyle = '#1d1f29';
    ctx.fillRect(Math.round(canvas.width * 0.15), canvas.height - 14 * scale, Math.round(canvas.width * 0.7), 8 * scale);
    ctx.fillStyle = '#00f0ff';
    ctx.fillRect(Math.round(canvas.width * 0.15), canvas.height - 14 * scale, Math.round(canvas.width * 0.7), scale * 2);
    ctx.drawImage(img, x, y, w, h);
  }
}
