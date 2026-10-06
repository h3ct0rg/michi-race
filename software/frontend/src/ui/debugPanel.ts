// Panel de diagnóstico de red y rendimiento (F3). Muestra datos del cliente y de GET /api/metrics.
import type { RaceSession } from '../game/session';

interface ServerMetrics {
  rooms: number;
  racing: number;
  players: number;
  connected: number;
  server: {
    tickMsAvg: number;
    tickMsMax: number;
    tickBudgetMs: number;
    snapshotBytes: number;
    snapshotRacers: number;
    snapshotsPerSecond: number;
    inputsPerSecond: number;
    estimatedKBpsPerPlayer: number;
  };
}

export class DebugPanel {
  private readonly el: HTMLElement;
  private visible = new URLSearchParams(location.search).has('debug');
  private fps = 60;
  private server: ServerMetrics | null = null;
  private pollTimer = 0;
  private lastRender = 0;

  constructor() {
    this.el = document.getElementById('debug-panel')!;
    window.addEventListener('keydown', (e) => {
      if (e.code === 'F3') {
        e.preventDefault();
        this.toggle();
      }
    });
    if (this.visible) this.toggle(true);
  }

  private toggle(force?: boolean) {
    this.visible = force ?? !this.visible;
    this.el.hidden = !this.visible;
    clearInterval(this.pollTimer);
    if (this.visible) {
      const poll = () =>
        fetch('/api/metrics')
          .then((r) => (r.ok ? r.json() : null))
          .then((m) => (this.server = m))
          .catch(() => (this.server = null));
      poll();
      this.pollTimer = window.setInterval(poll, 2000);
    }
  }

  frame(dt: number, session: RaceSession) {
    if (dt > 0) this.fps = this.fps * 0.95 + (1 / dt) * 0.05;
    if (!this.visible || performance.now() - this.lastRender < 250) return;
    this.lastRender = performance.now();
    const rows: [string, string | number][] = [
      ['fps', this.fps.toFixed(0)],
      ['karts', session.race.racers.length],
      ...Object.entries(session.stats?.() ?? { modo: 'práctica local' }),
    ];
    const s = this.server;
    if (s) {
      rows.push(
        ['— servidor —', ''],
        ['salas / en carrera', `${s.rooms} / ${s.racing}`],
        ['jugadores', `${s.connected} conectados`],
        ['tick', `${s.server.tickMsAvg} ms (máx ${s.server.tickMsMax}) / ${s.server.tickBudgetMs}`],
        ['snapshot', `${s.server.snapshotBytes} B · ${s.server.snapshotRacers} karts`],
        ['banda / jugador', `~${s.server.estimatedKBpsPerPlayer} KB/s`],
        ['snapshots enviados', `${s.server.snapshotsPerSecond}/s`],
        ['inputs recibidos', `${s.server.inputsPerSecond}/s`],
      );
    }
    this.el.innerHTML = `<div class="debug-title">DIAGNÓSTICO [F3]</div>${rows.map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join('')}`;
  }
}
