// Carga los sprites de PixelLab y genera variantes y placeholders por código.

export type Img = HTMLImageElement | HTMLCanvasElement;

export const DIRECTIONS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'] as const;
export type Direction = (typeof DIRECTIONS)[number];

// Vista trasera para la carrera: índice 0 = recto, ±1 = giro suave, ±2 = giro fuerte (negativo = izquierda).
export type RearFrames = Record<-2 | -1 | 0 | 1 | 2, Img>;

export interface KartFrames {
  dirs: Record<Direction, Img>;
  rear: RearFrames;
  /** Perfil puro mirando a la derecha (portada); si falta, la vista 3/4 'east'. */
  side: Img;
}

export interface SpriteDef {
  img: Img;
  worldWidth: number; // ancho en unidades de mundo
}

export const loadImage = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`No se pudo cargar ${src}`));
    img.src = src;
  });

const canvas = (w: number, h: number) => {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
};

// Recolorea solo los píxeles saturados (kart, traje, ojos); el pelaje blanco-azulado queda intacto.
function hueShift(img: Img, degrees: number): Img {
  if (degrees === 0) return img;
  const c = canvas(img.width, img.height);
  const ctx = c.getContext('2d')!;
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, c.width, c.height);
  const px = data.data;
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] === 0) continue;
    const [h, s, l] = rgbToHsl(px[i], px[i + 1], px[i + 2]);
    if (s < 0.35 || l > 0.9 || l < 0.12) continue;
    const [r, g, b] = hslToRgb((h + degrees / 360 + 1) % 1, s, l);
    px[i] = r;
    px[i + 1] = g;
    px[i + 2] = b;
  }
  ctx.putImageData(data, 0, 0);
  return c;
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h / 6, s, l];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = (t: number) => {
    t = (t + 1) % 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [Math.round(f(h + 1 / 3) * 255), Math.round(f(h) * 255), Math.round(f(h - 1 / 3) * 255)];
}

// Los giros a la derecha son el espejo de los giros a la izquierda (técnica clásica de OutRun).
export function mirror(img: Img): HTMLCanvasElement {
  const c = canvas(img.width, img.height);
  const ctx = c.getContext('2d')!;
  ctx.scale(-1, 1);
  ctx.drawImage(img, -img.width, 0);
  return c;
}

export async function loadKart(base: string, hue = 0): Promise<KartFrames> {
  const load = async (name: string) => hueShift(await loadImage(`${base}/${name}.png`), hue);
  const entries = await Promise.all(DIRECTIONS.map(async (d) => [d, await load(d)] as const));
  const dirs = Object.fromEntries(entries) as Record<Direction, Img>;
  const straight = await load('rear-straight');
  const left1 = await load('rear-left1').catch(() => straight);
  const left2 = await load('rear-left2').catch(() => left1);
  const side = await load('side').catch(() => dirs.east);
  return { dirs, rear: { [-2]: left2, [-1]: left1, 0: straight, 1: mirror(left1), 2: mirror(left2) } as RearFrames, side };
}

// Dibuja un sprite pixel a pixel desde un mapa de caracteres.
function pixelSprite(rows: string[], palette: Record<string, string>): HTMLCanvasElement {
  const c = canvas(rows[0].length, rows.length);
  const ctx = c.getContext('2d')!;
  rows.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      if (palette[ch]) {
        ctx.fillStyle = palette[ch];
        ctx.fillRect(x, y, 1, 1);
      }
    }),
  );
  return c;
}

export function proceduralTree(): HTMLCanvasElement {
  const c = canvas(48, 64);
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#6b3f22';
  ctx.fillRect(21, 50, 6, 14);
  const tiers = [
    { y: 4, w: 10, h: 16 },
    { y: 14, w: 18, h: 18 },
    { y: 26, w: 24, h: 20 },
    { y: 36, w: 30, h: 18 },
  ];
  for (const t of tiers) {
    for (let r = 0; r < t.h; r++) {
      const half = Math.round(((r + 1) / t.h) * t.w * 0.5) + 2;
      ctx.fillStyle = '#1f6b34';
      ctx.fillRect(24 - half, t.y + r, half * 2, 1);
      ctx.fillStyle = '#3fa34d';
      ctx.fillRect(24 - half + 1, t.y + r, half - 1, 1);
      ctx.fillStyle = '#8fd65a';
      ctx.fillRect(24 - half + 2, t.y + r, Math.max(1, Math.floor(half / 3)), 1);
    }
  }
  return c;
}

export const bush = () =>
  pixelSprite(
    [
      '....gggg....',
      '..gghhhhgg..',
      '.ghhhllhhhg.',
      'ghhllhhhhhhg',
      'ghhhhhhllhhg',
      'gghhhhhhhhgg',
      '.gggggggggg.',
    ],
    { g: '#1f6b34', h: '#3fa34d', l: '#8fd65a' },
  );

const sign = () =>
  pixelSprite(
    [
      'kkkkkkkkkkkk',
      'kyyyyyyyyyyk',
      'kyyykyyyyyyk',
      'kyykkkkkkkyk',
      'kyyykyyyyyyk',
      'kyyyyyyyyyyk',
      'kkkkkkkkkkkk',
      '.....kk.....',
      '.....kk.....',
      '.....kk.....',
      '.....kk.....',
    ],
    { k: '#11131c', y: '#f3db00' },
  );

// Arco de salida/meta con los colores del sistema de diseño.
function banner(): HTMLCanvasElement {
  const c = canvas(160, 64);
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#11131c';
  ctx.fillRect(0, 0, 8, 64);
  ctx.fillRect(152, 0, 8, 64);
  ctx.fillRect(0, 0, 160, 22);
  ctx.fillStyle = '#00f0ff';
  ctx.fillRect(2, 2, 4, 62);
  ctx.fillRect(154, 2, 4, 62);
  for (let x = 0; x < 152; x += 8) {
    for (let y = 0; y < 2; y++) {
      ctx.fillStyle = (x / 8 + y) % 2 === 0 ? '#ffffff' : '#11131c';
      ctx.fillRect(4 + x, 4 + y * 7, 8, 7);
    }
  }
  ctx.fillStyle = '#ff506e';
  ctx.fillRect(8, 18, 144, 3);
  return c;
}

/** Objetos comunes a todas las pistas: carteles de curva y arco de meta. */
export function sharedSprites(): Record<string, SpriteDef> {
  const arrow = sign();
  return {
    'sign-left': { img: arrow, worldWidth: 500 },
    'sign-right': { img: mirror(arrow), worldWidth: 500 },
    banner: { img: banner(), worldWidth: 3600 },
  };
}
