import type { Input } from '../sim/input';

const DEADZONE = 0.15;

// Mapeo estándar (Xbox/PlayStation): A/Cruz o RT acelera, B/Círculo o LT frena,
// RB/LB derrapa, X/Y turbo; stick izquierdo o cruceta para girar.
export function readGamepad(): Input | null {
  const pad = navigator.getGamepads?.().find((p) => p && p.connected);
  if (!pad) return null;
  const b = (i: number, threshold = 0.5) => (pad.buttons[i]?.value ?? 0) > threshold;
  const axis = pad.axes[0] ?? 0;
  let steer = Math.abs(axis) > DEADZONE ? (axis - Math.sign(axis) * DEADZONE) / (1 - DEADZONE) : 0;
  if (b(14)) steer = -1;
  if (b(15)) steer = 1;
  return {
    steer,
    throttle: b(0) || b(7, 0.2),
    brake: b(1) || b(6, 0.2),
    drift: b(4) || b(5),
    turbo: b(2) || b(3),
  };
}
