// Control (gamepad) con mapeo estándar W3C (Xbox/PlayStation) y botones reasignables.
// La configuración se guarda en el navegador. El navegador recién "ve" un control después de apretar un botón.
import type { Input } from '../sim/input';

export type PadAction = 'throttle' | 'brake' | 'drift' | 'useItem';
export const PAD_ACTIONS: PadAction[] = ['throttle', 'brake', 'drift', 'useItem'];

export interface PadConfig {
  /** Botón principal y alternativo de cada acción (índices del mapeo estándar; null = sin asignar). */
  bindings: Record<PadAction, [number | null, number | null]>;
  /** Zona muerta del stick (0..0.5). */
  deadzone: number;
  /** Girar con el stick derecho en vez del izquierdo. */
  rightStick: boolean;
  vibration: boolean;
}

/** Mapeo estándar: A/RT acelera, B/LT frena, RB/LB derrapa, X/Y usa el ítem. */
export const DEFAULT_PAD: PadConfig = {
  bindings: { throttle: [0, 7], brake: [1, 6], drift: [5, 4], useItem: [2, 3] },
  deadzone: 0.15,
  rightStick: false,
  vibration: true,
};

/** Nombres de los botones del mapeo estándar, como en un control de Xbox. */
export const BUTTON_NAMES = ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'VIEW', 'MENU', 'L3', 'R3', '▲', '▼', '◀', '▶', 'XBOX'];
export const buttonName = (i: number | null) => (i === null ? '—' : (BUTTON_NAMES[i] ?? `B${i}`));

const KEY = 'michi.gamepad';
const clone = (c: PadConfig): PadConfig => JSON.parse(JSON.stringify(c));

function load(): PadConfig {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<PadConfig> | null;
    if (!raw) return clone(DEFAULT_PAD);
    const cfg = clone(DEFAULT_PAD);
    for (const a of PAD_ACTIONS) {
      const b = raw.bindings?.[a];
      if (Array.isArray(b) && b.length === 2) cfg.bindings[a] = b.map((x) => (typeof x === 'number' && x >= 0 && x < 32 ? x : null)) as [number | null, number | null];
    }
    if (typeof raw.deadzone === 'number') cfg.deadzone = Math.min(0.5, Math.max(0, raw.deadzone));
    cfg.rightStick = raw.rightStick === true;
    cfg.vibration = raw.vibration !== false;
    return cfg;
  } catch {
    return clone(DEFAULT_PAD);
  }
}

let config = load();

export const padConfig = () => config;

export function savePadConfig(next: PadConfig) {
  config = clone(next);
  try {
    localStorage.setItem(KEY, JSON.stringify(config));
  } catch {
    /* modo privado */
  }
}

/** Asigna un botón a una acción; si otra acción lo usaba, se lo quita (no quedan botones duplicados). */
export function bindButton(cfg: PadConfig, action: PadAction, slot: 0 | 1, button: number): PadConfig {
  const next = clone(cfg);
  for (const a of PAD_ACTIONS) next.bindings[a] = next.bindings[a].map((b) => (b === button ? null : b)) as [number | null, number | null];
  next.bindings[action][slot] = button;
  return next;
}

/** Primer control conectado (los navegadores dejan huecos null en la lista). */
export const activePad = (): Gamepad | null => navigator.getGamepads?.().find((p): p is Gamepad => !!p && p.connected) ?? null;

/** Nombre legible del control ("Xbox Wireless Controller", sin el código de fabricante). */
export const padLabel = (pad: Gamepad) => pad.id.replace(/\s*\(.*?\)\s*/g, ' ').replace(/\s+/g, ' ').trim() || pad.id;

const pressed = (pad: Gamepad, i: number | null) => i !== null && (pad.buttons[i]?.value ?? 0) > (i === 6 || i === 7 ? 0.2 : 0.5);

export function readGamepad(): Input | null {
  const pad = activePad();
  if (!pad) return null;
  const { bindings, deadzone, rightStick } = config;
  const axis = pad.axes[rightStick ? 2 : 0] ?? 0;
  let steer = Math.abs(axis) > deadzone ? (axis - Math.sign(axis) * deadzone) / (1 - deadzone) : 0;
  if (pressed(pad, 14)) steer = -1;
  if (pressed(pad, 15)) steer = 1;
  const on = (a: PadAction) => bindings[a].some((b) => pressed(pad, b));
  return { steer, throttle: on('throttle'), brake: on('brake'), drift: on('drift'), useItem: on('useItem') };
}

/** Vibración (Chrome/Edge con controles de Xbox; en otros navegadores no hace nada). */
export function rumble(kind: 'bump' | 'hit' | 'item' | 'splash') {
  if (!config.vibration) return;
  const pad = activePad() as (Gamepad & { vibrationActuator?: { playEffect?: (t: string, p: object) => Promise<unknown> } }) | null;
  const fx = { bump: [120, 0.6, 0.3], hit: [350, 1, 0.6], item: [80, 0, 0.4], splash: [400, 0.8, 0.8] }[kind];
  pad?.vibrationActuator?.playEffect?.('dual-rumble', { duration: fx[0], strongMagnitude: fx[1], weakMagnitude: fx[2] })?.catch(() => {});
}
