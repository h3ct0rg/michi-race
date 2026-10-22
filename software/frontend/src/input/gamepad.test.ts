import { afterEach, describe, expect, it, vi } from 'vitest';
import { bindButton, buttonName, DEFAULT_PAD, padConfig, readGamepad, savePadConfig } from './gamepad';

/** Control falso con el mapeo estándar: `down` son los índices de botones apretados. */
function fakePad(down: number[], axes = [0, 0, 0, 0]) {
  const buttons = Array.from({ length: 17 }, (_, i) => ({ pressed: down.includes(i), value: down.includes(i) ? 1 : 0, touched: false }));
  vi.stubGlobal('navigator', { getGamepads: () => [null, { id: 'Xbox Wireless Controller (STANDARD GAMEPAD)', connected: true, buttons, axes }] });
}

afterEach(() => {
  vi.unstubAllGlobals();
  savePadConfig(DEFAULT_PAD);
});

describe('gamepad', () => {
  it('uses the standard Xbox layout by default', () => {
    fakePad([0, 5]); // A + RB
    expect(readGamepad()).toEqual({ steer: 0, throttle: true, brake: false, drift: true, useItem: false });
    fakePad([7, 2]); // RT + X
    expect(readGamepad()).toMatchObject({ throttle: true, useItem: true });
  });

  it('steers with the stick (dead zone) or the D-pad', () => {
    fakePad([], [0.1, 0, 0, 0]);
    expect(readGamepad()!.steer).toBe(0);
    fakePad([], [1, 0, 0, 0]);
    expect(readGamepad()!.steer).toBeCloseTo(1);
    fakePad([14]);
    expect(readGamepad()!.steer).toBe(-1);
  });

  it('can steer with the right stick', () => {
    savePadConfig({ ...DEFAULT_PAD, rightStick: true });
    fakePad([], [1, 0, -1, 0]);
    expect(readGamepad()!.steer).toBeCloseTo(-1);
  });

  it('rebinding moves a button between actions without duplicates', () => {
    const cfg = bindButton(DEFAULT_PAD, 'drift', 0, 0); // A pasa a derrapar
    expect(cfg.bindings.drift).toEqual([0, 4]);
    expect(cfg.bindings.throttle).toEqual([null, 7]); // A ya no acelera
    savePadConfig(cfg);
    fakePad([0]);
    expect(readGamepad()).toMatchObject({ throttle: false, drift: true });
    expect(padConfig().bindings.drift[0]).toBe(0);
  });

  it('names buttons like an Xbox controller', () => {
    expect([0, 3, 4, 7, 14, null].map(buttonName)).toEqual(['A', 'Y', 'LB', 'RT', '◀', '—']);
  });

  it('no controller connected: no input', () => {
    vi.stubGlobal('navigator', { getGamepads: () => [null, null] });
    expect(readGamepad()).toBeNull();
  });
});
