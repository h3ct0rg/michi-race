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
import { RaceAudio } from '../audio/raceAudio';
import { HIT, ITEM } from '../sim/items';
import { t } from '../i18n';

export class RaceView {
  private session: RaceSession | null = null;
  private renderer: Renderer | null = null;
  private hud: Hud | null = null;
  private raf = 0;
  private last = 0;
  private readonly ticker = new Ticker(1000 / 60, () => this.session?.pump?.());
  readonly debug = new DebugPanel();
  private readonly audio = new RaceAudio();
  onEvent: (e: RaceEvent) => void = () => {};
  /** Se llama en cada frame (p. ej. para actualizar el botón táctil de ítem). */
  onFrame: (s: RaceSession) => void = () => {};

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
    this.audio.start(theme.theme.trackId);
  }

  stop() {
    cancelAnimationFrame(this.raf);
    this.ticker.stop();
    this.audio.stop();
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
        this.hud!.flash(e.lap === s.race.track.laps ? t('flash.lastLap') : t('flash.lap', { n: e.lap }));
      } else if (e.type === 'finish' && e.id === s.player.id) {
        this.hud!.flash(`🏁 ${e.place}° · ${fmtTime(e.time)}`, 4);
      } else if (e.type === 'use' && e.item === ITEM.lightning) {
        this.renderer!.flash('#fff6a0', 0.35);
        if (e.id !== s.player.id) this.hud!.flash(t('flash.lightning'), 1.2);
      } else if (e.type === 'hit' && e.id === s.player.id) {
        if (e.hit === HIT.freeze) {
          this.renderer!.flash('#9fe8ff', 0.4);
          this.hud!.flash(t('flash.frozen'), 1.4);
        } else if (e.hit === HIT.spin) {
          this.renderer!.flash('#ff8a5c', 0.3);
          this.hud!.flash(t('flash.ouch'), 1.2);
        }
      } else if (e.type === 'blocked' && e.id === s.player.id) {
        this.hud!.flash(t('flash.blocked'), 1.2);
      }
      this.audio.event(e, s);
      this.onEvent(e);
    }
    this.audio.frame(s);
    this.renderer!.render(s.race, s.player, alpha, dt, { viewOffset: s.viewOffset?.bind(s), labels: s.labels });
    this.hud!.update(s.race);
    document.getElementById('net-info')!.textContent = s.netInfo?.() ?? '';
    this.debug.frame(dt, s);
    this.onFrame(s);
    this.raf = requestAnimationFrame(this.frame);
  };

  /** Subtítulo de la largada (p. ej. "CARRERA 2/4 · COASTAL ROAD"). */
  announce(text: string) {
    this.hud?.setSubtitle(text);
  }

  /** Resultados en pantalla: se apagan motor y música (los resultados online llegan por mensaje aparte). */
  finishAudio() {
    this.audio.finish();
  }
}
