// Configuración del jugador (se guarda en el navegador): brillo y volúmenes. El idioma vive en i18n.ts.
import { audio } from './audio/audio';

export interface Settings {
  brightness: number; // 0.5..1.5
  master: number; // 0..1
  music: number;
  sfx: number;
}

const KEY = 'michi.settings';
const DEFAULTS: Settings = { brightness: 1, master: 1, music: 1, sfx: 1 };

const clamp = (v: unknown, lo: number, hi: number, def: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : def);

function load(): Settings {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Settings>;
    return {
      brightness: clamp(raw.brightness, 0.5, 1.5, DEFAULTS.brightness),
      master: clamp(raw.master, 0, 1, DEFAULTS.master),
      music: clamp(raw.music, 0, 1, DEFAULTS.music),
      sfx: clamp(raw.sfx, 0, 1, DEFAULTS.sfx),
    };
  } catch {
    return { ...DEFAULTS };
  }
}

let current = load();

export const getSettings = () => current;

/** Aplica el brillo (a toda la página) y los volúmenes. */
export function applySettings() {
  document.documentElement.style.filter = current.brightness === 1 ? '' : `brightness(${current.brightness})`;
  audio.setVolumes(current);
}

export function updateSettings(change: Partial<Settings>) {
  current = { ...current, ...change };
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    /* modo privado */
  }
  applySettings();
}
