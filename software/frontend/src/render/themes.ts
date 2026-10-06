// Ambientación de cada pista: paleta, cielo, sol, capas de fondo y objetos del borde.
// La lógica de la pista (curvas, checkpoints, colisiones) vive en sim/tracks; esto es solo cómo se ve.
import { clouds, Layer, loadLayer, ridge, SunDef } from './parallax';
import { bush, Img, loadImage, proceduralTree, sharedSprites, SpriteDef } from './sprites';

interface RoadColors {
  road: string;
  grass: string;
  rumble: string;
  lane: string;
}

interface ThemeSprite {
  src: string;
  fallback: () => Img;
  worldWidth: number;
}

interface ThemeLayer {
  src?: string;
  fallback: () => HTMLCanvasElement;
  speed: number;
  y: number;
  ground?: string;
}

export interface TrackTheme {
  trackId: string;
  preview: string;
  tagline: string;
  difficulty: number; // 1..5
  sky: [string, string];
  sun?: SunDef;
  road: { light: RoadColors; dark: RoadColors; fog: string };
  layers: ThemeLayer[];
  sprites: Record<string, ThemeSprite>;
  /** Colores del polvo que levantan los karts fuera de pista. */
  dust: [string, string];
}

export interface LoadedTheme {
  theme: TrackTheme;
  sprites: Record<string, SpriteDef>;
  layers: Layer[];
}

const GREEN_VALLEY: TrackTheme = {
  trackId: 'green-valley',
  preview: '/assets/greenvalley/preview.png',
  tagline: 'Bosques, colinas y montañas nevadas',
  difficulty: 3,
  sky: ['#3aa6ff', '#bdefff'],
  road: {
    light: { road: '#6b6d7a', grass: '#52b85c', rumble: '#ffffff', lane: '#f4f4f4' },
    dark: { road: '#63656f', grass: '#47a651', rumble: '#ff506e', lane: '' },
    fog: '#a9dfb4',
  },
  layers: [
    { fallback: clouds, speed: 0.0005, y: 90 },
    { src: '/assets/greenvalley/mountains.png', fallback: () => ridge(120, 11, 1.2, ['#7b8fe0', '#b8c4ff', '#6a7dd0'], 40, 110), speed: 0.001, y: 150 },
    { src: '/assets/greenvalley/hills.png', fallback: () => ridge(80, 23, 1.6, ['#2f8a4a', '#6cc66a', '#28763f'], 20, 60), speed: 0.002, y: 152, ground: '#7fc98a' },
  ],
  sprites: {
    tree: { src: '/assets/greenvalley/tree.png', fallback: proceduralTree, worldWidth: 1300 },
    bush: { src: '/assets/greenvalley/bush.png', fallback: bush, worldWidth: 800 },
    rock: { src: '/assets/greenvalley/rock.png', fallback: bush, worldWidth: 750 },
  },
  dust: ['#8a6a3d', '#3f8f45'],
};

const DESERT_RUN: TrackTheme = {
  trackId: 'desert-run',
  preview: '/assets/desertrun/preview.png',
  tagline: 'Dunas, cañones y mesas al atardecer',
  difficulty: 4,
  sky: ['#f2683a', '#ffd38a'],
  sun: { color: '#ffe46b', stripe: '#f2683a', radius: 34, y: 92 },
  road: {
    light: { road: '#8a7c74', grass: '#ebc27c', rumble: '#ffffff', lane: '#fff1d6' },
    dark: { road: '#81736b', grass: '#e0b46c', rumble: '#d9432b', lane: '' },
    fog: '#f8c58e',
  },
  layers: [
    { src: '/assets/desertrun/mesas.png', fallback: () => ridge(120, 5, 0.8, ['#b5524a', '#e98a5c', '#8e3d45'], 50, 110), speed: 0.001, y: 152 },
    { src: '/assets/desertrun/dunes.png', fallback: () => ridge(70, 9, 2, ['#e3a85a', '#f6cf8a', '#cf9550'], 15, 45), speed: 0.002, y: 154, ground: '#fa9d28' },
  ],
  sprites: {
    cactus: { src: '/assets/desertrun/cactus.png', fallback: proceduralTree, worldWidth: 900 },
    drybush: { src: '/assets/desertrun/drybush.png', fallback: bush, worldWidth: 650 },
    canyonrock: { src: '/assets/desertrun/rock.png', fallback: bush, worldWidth: 1900 },
    ruin: { src: '/assets/desertrun/ruin.png', fallback: bush, worldWidth: 1000 },
  },
  dust: ['#d8a35a', '#f3d29a'],
};

export const THEMES: Record<string, TrackTheme> = {
  [GREEN_VALLEY.trackId]: GREEN_VALLEY,
  [DESERT_RUN.trackId]: DESERT_RUN,
};

const cache = new Map<string, Promise<LoadedTheme>>();

/** Carga (una vez) las imágenes de un tema; si falta un archivo usa un placeholder procedural. */
export function loadTheme(trackId: string): Promise<LoadedTheme> {
  const theme = THEMES[trackId] ?? GREEN_VALLEY;
  let loaded = cache.get(theme.trackId);
  if (!loaded) {
    loaded = (async () => {
      const entries = await Promise.all(
        Object.entries(theme.sprites).map(async ([kind, s]) => {
          const img = await loadImage(s.src).catch(() => s.fallback());
          return [kind, { img, worldWidth: s.worldWidth }] as const;
        }),
      );
      const layers = await Promise.all(
        theme.layers.map(async (l) => ({
          img: l.src ? await loadLayer(l.src, l.fallback) : l.fallback(),
          speed: l.speed,
          y: l.y,
          ground: l.ground,
        })),
      );
      return { theme, sprites: { ...sharedSprites(), ...Object.fromEntries(entries) }, layers };
    })();
    cache.set(theme.trackId, loaded);
  }
  return loaded;
}
