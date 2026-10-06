// HUD en HTML sobre el canvas, siguiendo designs/carrera_2.5d_green_valley_hud.
import { zOf, type Racer } from '../sim/physics';
import type { Race } from '../sim/race';
import { BASE_SPEED } from '../sim/vehicles';
import { Minimap } from './minimap';
import { isTouch } from '../device';

const METERS_PER_SEGMENT = 4;
const $ = (id: string) => document.getElementById(id)!;

export const fmtTime = (t: number) => {
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${String(m).padStart(2, '0')}:${s.toFixed(2).padStart(5, '0')}`;
};

export class Hud {
  private readonly minimap: Minimap;
  private flashUntil = 0;
  private flashText = '';

  constructor(
    race: Race,
    private readonly getPlayer: () => Racer,
  ) {
    this.minimap = new Minimap($('minimap') as HTMLCanvasElement, race.track);
  }

  /** Mensaje grande temporal en el centro (vuelta, meta...). */
  flash(text: string, seconds = 1.6) {
    this.flashText = text;
    this.flashUntil = performance.now() + seconds * 1000;
  }

  update(race: Race) {
    const p = this.getPlayer();
    const ranking = race.ranking();
    const laps = race.track.laps;

    $('hud-pos').textContent = `${ranking.indexOf(p) + 1}°`;
    $('hud-of').textContent = `/${ranking.length}`;
    $('hud-lap').textContent = `VUELTA ${Math.min(laps, Math.max(1, p.lap))} / ${laps}`;
    $('hud-time').textContent = fmtTime(p.finishTime ?? race.time);
    $('hud-best').textContent = p.bestLap === null ? '--:--.--' : fmtTime(p.bestLap);
    $('hud-speed').textContent = String(Math.round((p.speed / BASE_SPEED) * 160));
    ($('hud-turbo') as HTMLElement).style.width = `${(p.turboLeft > 0 ? 1 : p.turbo) * 100}%`;
    $('hud-turbo-label').textContent = p.turboLeft > 0 ? 'TURBO ACTIVO' : p.turbo >= 1 ? (isTouch ? 'TURBO LISTO' : 'TURBO LISTO [ESPACIO]') : 'TURBO CARGANDO';

    const drift = $('hud-drift');
    const c = p.drift.charge;
    drift.className = 'drift ' + (!p.drift.active ? '' : c >= 1.4 ? 'orange' : c >= 0.6 ? 'blue' : 'on');
    drift.textContent = !p.drift.active ? (isTouch ? 'DERRAPE' : 'DERRAPE [SHIFT]') : c >= 1.4 ? 'MINI-TURBO ★★' : c >= 0.6 ? 'MINI-TURBO ★' : 'DERRAPANDO...';

    this.updateStandings(ranking, p);
    this.updateWarning(race, p);
    this.minimap.draw(race, p.id);

    const banner = $('banner');
    if (race.phase === 'countdown') banner.textContent = race.countdown > 2 ? '3' : race.countdown > 1 ? '2' : '1';
    else if (race.time < 0.8) banner.textContent = '¡YA!';
    else banner.textContent = performance.now() < this.flashUntil ? this.flashText : '';
  }

  private updateStandings(ranking: Racer[], p: Racer) {
    const leader = ranking[0];
    const rows = ranking.slice(0, 4);
    if (!rows.includes(p)) rows[3] = p;
    $('standings').innerHTML = rows
      .map((r) => {
        const pos = ranking.indexOf(r) + 1;
        let gap: string;
        if (r === leader) gap = 'LÍDER';
        else if (r.finishTime !== null && leader.finishTime !== null) gap = `+${(r.finishTime - leader.finishTime).toFixed(2)}s`;
        else gap = `+${Math.max(0, (leader.distance - r.distance) / (BASE_SPEED * 0.85)).toFixed(2)}s`;
        const me = r === p ? ' class="me"' : '';
        return `<li${me}><span>P${pos} ${r.name}</span><span class="gap">${gap}</span></li>`;
      })
      .join('');
  }

  // Aviso de curva cerrada próxima.
  private updateWarning(race: Race, p: Racer) {
    const el = $('warning');
    const segs = race.track.segments;
    const start = race.track.findSegment(zOf(p, race.track)).index;
    let text = '';
    if (race.phase === 'racing' && p.finishTime === null && Math.abs(segs[start].curve) < 1.5) {
      for (let i = 15; i < 70; i++) {
        const curve = segs[(start + i) % segs.length].curve;
        if (Math.abs(curve) >= 3.5) {
          const meters = Math.round((i * METERS_PER_SEGMENT) / 10) * 10;
          const dir = curve > 0 ? 'DERECHA' : 'IZQUIERDA';
          const arrow = curve > 0 ? '➜ ➜' : '⬅ ⬅';
          text = `${arrow}  CURVA CERRADA A LA ${dir} EN ${meters}M`;
          break;
        }
      }
    }
    el.textContent = text;
    el.style.display = text ? 'block' : 'none';
  }
}
