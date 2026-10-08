import type { Input } from '../sim/input';

export class Keyboard {
  private readonly down = new Set<string>();
  private readonly handlers = new Map<string, () => void>();

  constructor() {
    window.addEventListener('keydown', (e) => {
      if (!this.down.has(e.code)) this.handlers.get(e.code)?.();
      this.down.add(e.code);
      if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.down.delete(e.code));
    window.addEventListener('blur', () => this.down.clear());
  }

  onPress(code: string, fn: () => void) {
    this.handlers.set(code, fn);
  }

  input(): Input {
    const k = (...codes: string[]) => codes.some((c) => this.down.has(c));
    return {
      steer: (k('ArrowRight', 'KeyD') ? 1 : 0) - (k('ArrowLeft', 'KeyA') ? 1 : 0),
      throttle: k('ArrowUp', 'KeyW'),
      brake: k('ArrowDown', 'KeyS'),
      drift: k('ShiftLeft', 'ShiftRight', 'KeyK'),
      useItem: k('Space'),
    };
  }
}
