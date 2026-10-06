import type { Input } from '../sim/input';
import { readGamepad } from './gamepad';
import { Keyboard } from './keyboard';
import type { TouchControls } from './touch';

// Combina teclado, gamepad y controles táctiles en un solo Input.
export class Controls {
  readonly keyboard = new Keyboard();
  touch: TouchControls | null = null;

  read(): Input {
    const sources = [this.keyboard.input(), readGamepad(), this.touch?.input()].filter((s): s is Input => !!s);
    return {
      steer: sources.find((s) => s.steer !== 0)?.steer ?? 0,
      throttle: sources.some((s) => s.throttle),
      brake: sources.some((s) => s.brake),
      drift: sources.some((s) => s.drift),
      turbo: sources.some((s) => s.turbo),
    };
  }
}
