// Control en los menús: cruceta o stick para moverse entre botones, A para elegir, B para volver.
// También avisa cuando se conecta/desconecta un control y captura botones para reasignarlos.
import { activePad } from './gamepad';

type Dir = 'up' | 'down' | 'left' | 'right';

const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), select:not([disabled]), .color-list li';
const REPEAT_DELAY = 380;
const REPEAT_EVERY = 130;

export interface PadMenuOptions {
  /** Contenedor donde se navega ahora, o null si el control maneja el kart (carrera). */
  container: () => HTMLElement | null;
  /** Botón B: cerrar o volver. */
  back: () => void;
}

export class PadMenu {
  onConnect: (pad: Gamepad) => void = () => {};
  onDisconnect: () => void = () => {};
  private prev: boolean[] = [];
  private capture: ((button: number) => void) | null = null;
  private connected = false;
  private held: Dir | null = null;
  private heldSince = 0;
  private lastRepeat = 0;

  constructor(private readonly opts: PadMenuOptions) {
    window.addEventListener('gamepadconnected', () => this.poll());
    window.addEventListener('gamepaddisconnected', () => this.poll());
    const loop = () => {
      this.poll();
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  /** El próximo botón que se apriete se entrega a `fn` (para reasignar); null cancela. */
  captureNext(fn: ((button: number) => void) | null) {
    this.capture = fn;
  }

  get capturing() {
    return this.capture !== null;
  }

  private poll() {
    const pad = activePad();
    if (!pad) {
      if (this.connected) this.onDisconnect();
      this.connected = false;
      this.prev = [];
      return;
    }
    if (!this.connected) {
      this.connected = true;
      this.onConnect(pad);
    }
    const now = pad.buttons.map((b) => b.pressed || b.value > 0.5);
    const edge = (i: number) => !!now[i] && !this.prev[i];

    if (this.capture) {
      const i = now.findIndex((v, k) => v && !this.prev[k]);
      if (i >= 0) {
        const fn = this.capture;
        this.capture = null;
        fn(i);
      }
      this.prev = now;
      return;
    }

    const root = this.opts.container();
    if (root) {
      const ax = pad.axes[0] ?? 0;
      const ay = pad.axes[1] ?? 0;
      const dir: Dir | null = now[12] || ay < -0.6 ? 'up' : now[13] || ay > 0.6 ? 'down' : now[14] || ax < -0.6 ? 'left' : now[15] || ax > 0.6 ? 'right' : null;
      const t = performance.now();
      if (dir !== this.held) {
        this.held = dir;
        this.heldSince = this.lastRepeat = t;
        if (dir) this.move(root, dir);
      } else if (dir && t - this.heldSince > REPEAT_DELAY && t - this.lastRepeat > REPEAT_EVERY) {
        this.lastRepeat = t;
        this.move(root, dir);
      }
      if (edge(0)) this.activate(root);
      if (edge(1)) this.opts.back();
    } else {
      this.held = null;
    }
    this.prev = now;
  }

  private focusables(root: HTMLElement) {
    return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => {
      if (el.offsetParent === null && getComputedStyle(el).position !== 'fixed') return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    });
  }

  private current(list: HTMLElement[]) {
    const el = document.activeElement as HTMLElement | null;
    return el && list.includes(el) ? el : null;
  }

  private focus(el: HTMLElement) {
    document.querySelectorAll('.pad-focus').forEach((x) => x.classList.remove('pad-focus'));
    if (el.tabIndex < 0 && !['BUTTON', 'INPUT', 'SELECT'].includes(el.tagName)) el.tabIndex = 0;
    el.classList.add('pad-focus');
    el.focus({ preventScroll: true });
    el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  private move(root: HTMLElement, dir: Dir) {
    const list = this.focusables(root);
    const cur = this.current(list);
    if (!cur) {
      if (list[0]) this.focus(list[0]);
      return;
    }
    // sliders y selects: izquierda/derecha cambian el valor
    if ((dir === 'left' || dir === 'right') && cur instanceof HTMLInputElement && cur.type === 'range') {
      const step = Number(cur.step) || 1;
      cur.value = String(Number(cur.value) + (dir === 'right' ? step : -step));
      cur.dispatchEvent(new Event('input', { bubbles: true }));
      cur.dispatchEvent(new Event('change', { bubbles: true }));
      return;
    }
    if ((dir === 'left' || dir === 'right') && cur instanceof HTMLSelectElement) {
      cur.selectedIndex = Math.max(0, Math.min(cur.options.length - 1, cur.selectedIndex + (dir === 'right' ? 1 : -1)));
      cur.dispatchEvent(new Event('change', { bubbles: true }));
      return;
    }
    // el más cercano en esa dirección (penalizando el desvío lateral)
    const a = cur.getBoundingClientRect();
    const ax = a.left + a.width / 2;
    const ay = a.top + a.height / 2;
    let best: HTMLElement | null = null;
    let bestScore = Infinity;
    for (const el of list) {
      if (el === cur) continue;
      const b = el.getBoundingClientRect();
      const dx = b.left + b.width / 2 - ax;
      const dy = b.top + b.height / 2 - ay;
      const main = dir === 'left' ? -dx : dir === 'right' ? dx : dir === 'up' ? -dy : dy;
      const cross = dir === 'left' || dir === 'right' ? Math.abs(dy) : Math.abs(dx);
      if (main <= 4) continue;
      const score = main + cross * 2.5;
      if (score < bestScore) {
        bestScore = score;
        best = el;
      }
    }
    if (best) this.focus(best);
  }

  private activate(root: HTMLElement) {
    const list = this.focusables(root);
    const cur = this.current(list);
    if (!cur) {
      if (list[0]) this.focus(list[0]);
      return;
    }
    if (cur instanceof HTMLInputElement && cur.type !== 'checkbox' && cur.type !== 'range') cur.focus();
    else cur.click();
  }
}
