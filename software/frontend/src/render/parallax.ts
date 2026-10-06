// Capas de fondo con parallax: utilidades comunes a todos los temas de pista.

export interface Layer {
  img: HTMLCanvasElement;
  ground?: string; // color para rellenar debajo de la capa (evita huecos en las colinas)
  speed: number; // cuánto se desplaza con las curvas
  y: number; // línea base en pantalla
}

const W = 960;

export function ridge(h: number, seed: number, rough: number, colors: string[], peakMin: number, peakMax: number) {
  const c = document.createElement('canvas');
  c.width = W;
  c.height = h;
  const ctx = c.getContext('2d')!;
  let s = seed;
  const rnd = () => ((s = (s * 48271) % 2147483647) / 2147483647);

  // Perfil periódico (suma de senos) para que la capa se repita sin costuras.
  const harmonics = Array.from({ length: 4 }, (_, i) => ({ f: (i + 1) * (1 + Math.floor(rnd() * 3)), p: rnd() * Math.PI * 2, a: 1 / (i + 1) ** rough }));
  const norm = harmonics.reduce((a, b) => a + b.a, 0);
  for (let x = 0; x < W; x++) {
    let v = 0;
    for (const hm of harmonics) v += hm.a * Math.sin((x / W) * Math.PI * 2 * hm.f + hm.p);
    const top = Math.round(h - (peakMin + ((v / norm + 1) / 2) * (peakMax - peakMin)));
    ctx.fillStyle = colors[0];
    ctx.fillRect(x, top, 1, h - top);
    ctx.fillStyle = colors[1];
    ctx.fillRect(x, top, 1, 2);
    // bandas horizontales para dar textura pixel
    ctx.fillStyle = colors[2];
    for (let y = top + 6; y < h; y += 7) if ((x + y) % 4 === 0) ctx.fillRect(x, y, 1, 1);
  }
  return c;
}

export function clouds() {
  const c = document.createElement('canvas');
  c.width = W;
  c.height = 90;
  const ctx = c.getContext('2d')!;
  let s = 99;
  const rnd = () => ((s = (s * 48271) % 2147483647) / 2147483647);
  for (let i = 0; i < 9; i++) {
    const cx = Math.floor(rnd() * W);
    const cy = 10 + Math.floor(rnd() * 50);
    const blobs = 3 + Math.floor(rnd() * 4);
    for (let b = 0; b < blobs; b++) {
      const r = 6 + Math.floor(rnd() * 8);
      const bx = cx + b * 9;
      for (let y = -r; y <= 0; y++) {
        const hw = Math.round(Math.sqrt(r * r - y * y));
        ctx.fillStyle = y > -2 ? '#cfefff' : '#ffffff';
        for (const off of [0, W, -W]) ctx.fillRect(bx - hw + off, cy + y, hw * 2, 1);
      }
    }
  }
  return c;
}

// Une la imagen con su espejo para que la capa se repita sin costuras.
function seamless(img: HTMLImageElement): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = img.width * 2;
  c.height = img.height;
  const ctx = c.getContext('2d')!;
  ctx.drawImage(img, 0, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(img, -img.width * 2, 0);
  return c;
}

export const loadLayer = (src: string, fallback: () => HTMLCanvasElement) =>
  new Promise<HTMLCanvasElement>((resolve) => {
    const img = new Image();
    img.onload = () => resolve(seamless(img));
    img.onerror = () => resolve(fallback());
    img.src = src;
  });

export function drawSky(ctx: CanvasRenderingContext2D, w: number, h: number, colors: [string, string]) {
  const g = ctx.createLinearGradient(0, 0, 0, h * 0.6);
  g.addColorStop(0, colors[0]);
  g.addColorStop(1, colors[1]);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

export interface SunDef {
  color: string;
  stripe: string; // color de las franjas horizontales (estilo synthwave)
  radius: number;
  y: number;
}

/** Sol pixelado con franjas, detrás de las capas; se mueve un poco con las curvas. */
export function drawSun(ctx: CanvasRenderingContext2D, sun: SunDef, offsetPx: number, yShift: number, w: number) {
  const cx = Math.round(w * 0.5 - offsetPx);
  const cy = Math.round(sun.y + yShift);
  const r = sun.radius;
  for (let dy = -r; dy <= r; dy++) {
    const half = Math.round(Math.sqrt(r * r - dy * dy));
    // franjas cada vez más gruesas hacia abajo
    const band = dy > r * 0.15 && Math.floor((dy - r * 0.15) / 4) % 2 === 1 && (dy % 4) < 1 + Math.floor((dy / r) * 3);
    ctx.fillStyle = band ? sun.stripe : sun.color;
    ctx.fillRect(cx - half, cy + dy, half * 2, 1);
  }
}

export function drawLayer(ctx: CanvasRenderingContext2D, layer: Layer, offset: number, yShift: number, w: number) {
  const img = layer.img;
  const sx = Math.floor((((offset % 1) + 1) % 1) * img.width);
  const y = Math.round(layer.y - img.height + yShift);
  const part = Math.min(w, img.width - sx);
  ctx.drawImage(img, sx, 0, part, img.height, 0, y, part, img.height);
  if (part < w) ctx.drawImage(img, 0, 0, w - part, img.height, part, y, w - part, img.height);
  if (layer.ground) {
    ctx.fillStyle = layer.ground;
    ctx.fillRect(0, y + img.height - 1, w, 400);
  }
}
