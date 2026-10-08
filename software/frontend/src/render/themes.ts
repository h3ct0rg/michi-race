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
  /** Ambientación nocturna: estrellas, lluvia y líneas de neón en la pista. */
  night?: { stars: boolean; rain: boolean; laneGlow: string; edgeGlow: string };
  road: { light: RoadColors; dark: RoadColors; fog: string };
  layers: ThemeLayer[];
  sprites: Record<string, ThemeSprite>;
  /** Mar junto a la pista (sim: segment.water/shore): agua, espuma, tablero y baranda del puente. */
  coast?: { water: [string, string]; deep: string; foam: string; deck: [string, string]; rail: string; post: string };
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

const NEON_CITY: TrackTheme = {
  trackId: 'neon-city',
  preview: '/assets/neoncity/preview.png',
  tagline: 'Ciudad nocturna, neón y lluvia',
  difficulty: 5,
  // el cielo empata con el color superior del skyline (que viene con su propio degradado)
  sky: ['#101e51', '#101e51'],
  night: { stars: true, rain: true, laneGlow: '#00f0ff', edgeGlow: '#ff4fd8' },
  road: {
    light: { road: '#2b2842', grass: '#1a1833', rumble: '#ff4fd8', lane: '#00f0ff' },
    dark: { road: '#26233b', grass: '#16152d', rumble: '#00c8e0', lane: '' },
    fog: '#1d1745',
  },
  layers: [
    { src: '/assets/neoncity/skyline.png', fallback: () => ridge(120, 3, 0.6, ['#1b1a4a', '#3b2a7a', '#151440'], 60, 115), speed: 0.001, y: 150 },
    { src: '/assets/neoncity/buildings.png', fallback: () => ridge(80, 13, 0.4, ['#1c1838', '#ff4fd8', '#141230'], 30, 70), speed: 0.002, y: 154, ground: '#141230' },
  ],
  sprites: {
    lamp: { src: '/assets/neoncity/lamp.png', fallback: bush, worldWidth: 420 },
    billboard: { src: '/assets/neoncity/billboard.png', fallback: bush, worldWidth: 1300 },
    building: { src: '/assets/neoncity/building.png', fallback: proceduralTree, worldWidth: 2100 },
    barrier: { src: '/assets/neoncity/barrier.png', fallback: bush, worldWidth: 750 },
  },
  dust: ['#9fd8ff', '#ff9ae6'],
};

const COASTAL_ROAD: TrackTheme = {
  trackId: 'coastal-road',
  preview: '/assets/coastal/preview.png',
  tagline: 'Isla tropical al mediodía, playa y un puente sobre el mar',
  difficulty: 3,
  sky: ['#2f9bff', '#bfeaff'],
  sun: { color: '#fff6c2', stripe: '#fff6c2', radius: 14, y: 34 },
  road: {
    light: { road: '#7a7d8c', grass: '#f3d99c', rumble: '#ffffff', lane: '#f4f4f4' },
    dark: { road: '#727585', grass: '#ecd090', rumble: '#ff506e', lane: '' },
    fog: '#b5ecf5',
  },
  coast: {
    water: ['#1cc6e0', '#16bbd8'],
    deep: '#0fa5c9',
    foam: '#f4fdff',
    deck: ['#b98a5a', '#a9794b'],
    rail: '#ffffff',
    post: '#d9432b',
  },
  layers: [
    { fallback: clouds, speed: 0.0005, y: 92 },
    { src: '/assets/coastal/volcano.png', fallback: () => ridge(120, 3, 0.8, ['#7a4b3a', '#4f9a4a', '#5c3a2c'], 40, 100), speed: 0.0008, y: 137 },
    { src: '/assets/coastal/ocean.png', fallback: () => ridge(40, 5, 0.3, ['#1cc6e0', '#7fe6f5', '#16bbd8'], 4, 10), speed: 0.0015, y: 154, ground: '#09d4ea' },
  ],
  sprites: {
    palm: { src: '/assets/coastal/palm.png', fallback: proceduralTree, worldWidth: 1500 },
    hut: { src: '/assets/coastal/hut.png', fallback: bush, worldWidth: 1500 },
    rock: { src: '/assets/greenvalley/rock.png', fallback: bush, worldWidth: 700 },
    searock: { src: '/assets/coastal/searock.png', fallback: bush, worldWidth: 1300 },
    boat: { src: '/assets/coastal/boat.png', fallback: bush, worldWidth: 1500 },
    lighthouse: { src: '/assets/coastal/lighthouse.png', fallback: proceduralTree, worldWidth: 1600 },
  },
  dust: ['#f3d99c', '#fff4d6'],
};

export const THEMES: Record<string, TrackTheme> = {
  [GREEN_VALLEY.trackId]: GREEN_VALLEY,
  [DESERT_RUN.trackId]: DESERT_RUN,
  [NEON_CITY.trackId]: NEON_CITY,
  [COASTAL_ROAD.trackId]: COASTAL_ROAD,
};

const cache = new Map<string, Promise<LoadedTheme>>();

// Power-ups y efectos (pack de PixelLab en /assets/items). Clave 'fx-<nombre>'.
const FX: Record<string, number> = { box: 330, bomb: 300, rocket: 280, ice: 560, shield: 620, bolt: 360, dizzy: 380 };
let fxCache: Promise<Record<string, SpriteDef>> | null = null;
function loadFxSprites(): Promise<Record<string, SpriteDef>> {
  fxCache ??= (async () => {
    const out: Record<string, SpriteDef> = {};
    const load = async (key: string, file: string, worldWidth: number) => {
      out[key] = { img: await loadImage(`/assets/items/${file}.png`).catch(() => bush()), worldWidth };
    };
    await Promise.all([
      ...Object.entries(FX).map(([name, w]) => load(`fx-${name}`, name, w)),
      ...Array.from({ length: 7 }, (_, i) => load(`fx-explosion-${i}`, `explosion-${i}`, 820)),
    ]);
    return out;
  })();
  return fxCache;
}

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
      return { theme, sprites: { ...sharedSprites(), ...(await loadFxSprites()), ...Object.fromEntries(entries) }, layers };
    })();
    cache.set(theme.trackId, loaded);
  }
  return loaded;
}
