// Controles táctiles de carrera: joystick virtual a la izquierda (girar; abajo = frenar)
// y botones de acelerar, derrape y turbo a la derecha. Multitáctil con Pointer Events.
import type { Input } from '../sim/input';

const DEADZONE = 0.12;
const BRAKE_THRESHOLD = 0.55; // joystick hacia abajo más allá de esto = freno

/** Captura el dedo en el elemento (si el navegador lo rechaza, el control sigue funcionando sin captura). */
const capture = (el: HTMLElement, pointerId: number) => {
  try {
    el.setPointerCapture(pointerId);
  } catch {
    /* puntero no capturable */
  }
};

export class TouchControls {
  private readonly root: HTMLElement;
  private readonly base: HTMLElement;
  private readonly knob: HTMLElement;
  private stickPointer: number | null = null;
  private steer = 0;
  private brake = false;
  private readonly held = { throttle: false, drift: false, turbo: false };
  onExit: () => void = () => {};
  /** Se llama en el primer toque (para pedir pantalla completa dentro del gesto). */
  onFirstTouch: () => void = () => {};

  constructor(root: HTMLElement) {
    this.root = root;
    root.innerHTML = `
      <button class="tc-exit" aria-label="Salir">✕</button>
      <div class="tc-stick"><div class="tc-knob"></div></div>
      <div class="tc-buttons">
        <button class="tc-btn tc-turbo" data-key="turbo">TURBO</button>
        <button class="tc-btn tc-drift" data-key="drift">DRIFT</button>
        <button class="tc-btn tc-gas" data-key="throttle">GAS</button>
      </div>`;
    this.base = root.querySelector('.tc-stick')!;
    this.knob = root.querySelector('.tc-knob')!;

    root.addEventListener('pointerdown', () => this.onFirstTouch(), { capture: true });
    root.querySelector('.tc-exit')!.addEventListener('click', () => this.onExit());
    root.addEventListener('contextmenu', (e) => e.preventDefault());

    // joystick
    this.base.addEventListener('pointerdown', (e) => {
      if (this.stickPointer !== null) return;
      this.stickPointer = e.pointerId;
      capture(this.base, e.pointerId);
      this.moveStick(e);
    });
    this.base.addEventListener('pointermove', (e) => {
      if (e.pointerId === this.stickPointer) this.moveStick(e);
    });
    const release = (e: PointerEvent) => {
      if (e.pointerId !== this.stickPointer) return;
      this.stickPointer = null;
      this.steer = 0;
      this.brake = false;
      this.knob.style.transform = '';
      this.base.classList.remove('active');
    };
    this.base.addEventListener('pointerup', release);
    this.base.addEventListener('pointercancel', release);
    this.base.addEventListener('lostpointercapture', release);

    // botones (cada uno puede tener su propio dedo)
    root.querySelectorAll<HTMLElement>('.tc-btn').forEach((btn) => {
      const key = btn.dataset.key as keyof typeof this.held;
      const set = (on: boolean) => {
        this.held[key] = on;
        btn.classList.toggle('pressed', on);
      };
      btn.addEventListener('pointerdown', (e) => {
        capture(btn, e.pointerId);
        set(true);
        navigator.vibrate?.(8);
      });
      for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) btn.addEventListener(ev, () => set(false));
    });
  }

  private moveStick(e: PointerEvent) {
    const rect = this.base.getBoundingClientRect();
    const radius = rect.width / 2;
    let dx = e.clientX - (rect.left + radius);
    let dy = e.clientY - (rect.top + radius);
    const len = Math.hypot(dx, dy);
    if (len > radius) {
      dx = (dx / len) * radius;
      dy = (dy / len) * radius;
    }
    this.knob.style.transform = `translate(${dx}px, ${dy}px)`;
    this.base.classList.add('active');
    const nx = dx / radius;
    // zona muerta y respuesta lineal desde su borde
    this.steer = Math.abs(nx) < DEADZONE ? 0 : (nx - Math.sign(nx) * DEADZONE) / (1 - DEADZONE);
    this.brake = dy / radius > BRAKE_THRESHOLD;
  }

  setVisible(visible: boolean) {
    this.root.hidden = !visible;
    if (!visible) this.reset();
  }

  private reset() {
    this.stickPointer = null;
    this.steer = 0;
    this.brake = false;
    this.held.throttle = this.held.drift = this.held.turbo = false;
    this.knob.style.transform = '';
    this.root.querySelectorAll('.pressed').forEach((b) => b.classList.remove('pressed'));
  }

  input(): Input {
    return {
      steer: this.steer,
      throttle: this.held.throttle && !this.brake,
      brake: this.brake,
      drift: this.held.drift,
      turbo: this.held.turbo,
    };
  }
}
