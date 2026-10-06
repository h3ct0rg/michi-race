import type { Input } from '../sim/input';
import { readGamepad } from './gamepad';
import { Keyboard } from './keyboard';

// Combina teclado y gamepad en un solo Input.
export class Controls {
  readonly keyboard = new Keyboard();

  read(): Input {
    const kb = this.keyboard.input();
    const pad = readGamepad();
    if (!pad) return kb;
    return {
      steer: kb.steer !== 0 ? kb.steer : pad.steer,
      throttle: kb.throttle || pad.throttle,
      brake: kb.brake || pad.brake,
      drift: kb.drift || pad.drift,
      turbo: kb.turbo || pad.turbo,
    };
  }
}
