// Minimapa: integra las curvas de la pista en un trazado 2D cerrado.
import { zOf } from '../sim/physics';
import type { Race } from '../sim/race';
import type { Track } from '../sim/track';

interface Pt {
  x: number;
  y: number;
}

export class Minimap {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly path: Pt[];
  private readonly bg: HTMLCanvasElement;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly track: Track,
  ) {
    this.ctx = canvas.getContext('2d')!;
    this.path = buildPath(track, canvas.width, canvas.height);
    this.bg = this.drawBackground();
  }

  private drawBackground() {
    const c = document.createElement('canvas');
    c.width = this.canvas.width;
    c.height = this.canvas.height;
    const ctx = c.getContext('2d')!;
    const stroke = (color: string, width: number) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      this.path.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
      ctx.closePath();
      ctx.stroke();
    };
    stroke('#0c0e17', 7);
    stroke('#006970', 4);
    const start = this.path[0];
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(Math.round(start.x) - 3, Math.round(start.y) - 1, 6, 3);
    return c;
  }

  draw(race: Race, playerId: string) {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.drawImage(this.bg, 0, 0);
    const n = this.path.length;
    // el jugador se dibuja al final para que quede encima
    const racers = [...race.racers.filter((r) => r.id !== playerId), ...race.racers.filter((r) => r.id === playerId)];
    for (const r of racers) {
      const i = Math.floor((zOf(r, this.track) / this.track.length) * n) % n;
      const p = this.path[i];
      const me = r.id === playerId;
      ctx.fillStyle = '#0c0e17';
      ctx.fillRect(Math.round(p.x) - (me ? 4 : 3), Math.round(p.y) - (me ? 4 : 3), me ? 8 : 6, me ? 8 : 6);
      ctx.fillStyle = me ? '#00f0ff' : '#ff506e';
      ctx.fillRect(Math.round(p.x) - (me ? 3 : 2), Math.round(p.y) - (me ? 3 : 2), me ? 6 : 4, me ? 6 : 4);
    }
  }
}

function buildPath(track: Track, w: number, h: number): Pt[] {
  // La pista pseudo-3D no tiene geometría real: las curvas se integran con una escala fija y el giro
  // que falta para completar 360° se reparte en todo el trazado, así el dibujo siempre cierra.
  const segs = track.segments;
  const K = 0.0026;
  const totalCurve = segs.reduce((a, s) => a + s.curve, 0);
  const sign = totalCurve >= 0 ? 1 : -1;
  const extra = (sign * 2 * Math.PI - totalCurve * K) / segs.length;
  const pts: Pt[] = [];
  let x = 0;
  let y = 0;
  let heading = 0;
  for (const s of segs) {
    pts.push({ x, y });
    heading += s.curve * K + extra;
    x += Math.sin(heading);
    y -= Math.cos(heading);
  }
  // repartir el error de cierre a lo largo del trazado
  const ex = x;
  const ey = y;
  const closed = pts.map((p, i) => ({ x: p.x - (ex * i) / pts.length, y: p.y - (ey * i) / pts.length }));
  const xs = closed.map((p) => p.x);
  const ys = closed.map((p) => p.y);
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const pad = 10;
  const scale = Math.min((w - pad * 2) / (maxX - minX || 1), (h - pad * 2) / (maxY - minY || 1));
  const ox = (w - (maxX - minX) * scale) / 2;
  const oy = (h - (maxY - minY) * scale) / 2;
  return closed.map((p) => ({ x: ox + (p.x - minX) * scale, y: oy + (p.y - minY) * scale }));
}
