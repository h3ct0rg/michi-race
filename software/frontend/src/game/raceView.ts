// Vista de carrera: bucle de render + HUD sobre una RaceSession (local u online).
import { Renderer } from '../render/renderer';
import type { KartFrames } from '../render/sprites';
import type { LoadedTheme } from '../render/themes';
import { Hud, fmtTime } from '../ui/hud';
import { hideResults } from '../ui/results';
import { DebugPanel } from '../ui/debugPanel';
import type { RaceEvent } from '../sim/race';
import type { RaceSession } from './session';
import { Ticker } from './ticker';

export class RaceView {
  private session: RaceSession | null = null;
  private renderer: Renderer | null = null;
  private hud: Hud | null = null;
  private raf = 0;
  private last = 0;
  private readonly ticker = new Ticker(1000 / 60, () => this.session?.pump?.());
  readonly debug = new DebugPanel();
  onEvent: (e: RaceEvent) => void = () => {};

  constructor(private readonly canvas: HTMLCanvasElement) {}

  start(session: RaceSession, frames: Map<string, KartFrames>, theme: LoadedTheme) {
    this.stop();
    hideResults();
    this.session = session;
    this.renderer = new Renderer(this.canvas, theme, frames);
    this.hud = new Hud(session.race, () => session.player);
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
    this.ticker.start();
  }

  stop() {
    cancelAnimationFrame(this.raf);
    this.ticker.stop();
    this.session?.dispose();
    this.session = null;
  }

  private frame = (now: number) => {
    const dt = Math.min(0.1, Math.max(0, (now - this.last) / 1000));
    this.last = now;
    const s = this.session;
    if (!s) return;
    const alpha = s.update(dt);
    for (const e of s.drainEvents()) {
      if (e.type === 'lap' && e.id === s.player.id && e.lap > 1) {
        this.hud!.flash(e.lap === s.race.track.laps ? '¡ÚLTIMA VUELTA!' : `VUELTA ${e.lap}`);
      } else if (e.type === 'finish' && e.id === s.player.id) {
        this.hud!.flash(`🏁 ${e.place}° · ${fmtTime(e.time)}`, 4);
      }
      this.onEvent(e);
    }
    this.renderer!.render(s.race, s.player, alpha, dt, { viewOffset: s.viewOffset?.bind(s), labels: s.labels });
    this.hud!.update(s.race);
    document.getElementById('net-info')!.textContent = s.netInfo?.() ?? '';
    this.debug.frame(dt, s);
    this.raf = requestAnimationFrame(this.frame);
  };
}
