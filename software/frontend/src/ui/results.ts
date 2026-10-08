// Resultados de una carrera del torneo: tabla general ordenada por puntos acumulados, con el puesto
// y los puntos de esta carrera, y la cuenta regresiva a la siguiente (o el pase al podio).
import { fmtTime } from './hud';
import { t } from '../i18n';

const MEDALS = ['🥇', '🥈', '🥉'];

export interface RaceRow {
  id: string;
  name: string;
  place: number;
  finishTime: number | null;
  points: number;
}

export interface StandingRow {
  id: string;
  name: string;
  points: number;
}

export interface ResultsOptions {
  trackName: string;
  raceIndex: number;
  totalRaces: number;
  rows: RaceRow[];
  /** Tabla del torneo, ya ordenada. */
  standings: StandingRow[];
  myId: string;
  /** Próxima pista; null si era la última (sigue el podio). */
  nextTrackName: string | null;
  nextRaceIn: number;
}

let countdown = 0;

export function showResults(o: ResultsOptions) {
  const el = document.getElementById('results')!;
  const race = new Map(o.rows.map((r) => [r.id, r]));
  const winner = o.rows.find((r) => r.place === 1);
  const me = race.get(o.myId);
  const body = o.standings
    .map((s, i) => {
      const r = race.get(s.id);
      const result = r ? `${r.place}° · ${r.finishTime !== null ? fmtTime(r.finishTime) : t('res.dnf')}` : '—';
      return `<tr${s.id === o.myId ? ' class="me"' : ''}>
        <td class="pos">${MEDALS[i] ?? `${i + 1}°`}</td>
        <td>${escapeHtml(s.name)}</td>
        <td class="race">${result}</td>
        <td class="gain">${r ? `+${r.points}` : ''}</td>
        <td class="total">${s.points}</td>
      </tr>`;
    })
    .join('');
  el.innerHTML = `
    <div class="results-card">
      <div class="results-title">${t('res.title', { n: o.raceIndex + 1, total: o.totalRaces, track: escapeHtml(o.trackName.toUpperCase()) })}</div>
      <div class="results-sub">${t('res.won', { name: escapeHtml(winner?.name ?? '-') })}${me ? t('res.mine', { place: me.place, pts: me.points }) : ''}</div>
      <div class="results-scroll">
        <table>
          <thead><tr><th>${t('res.colTour')}</th><th>${t('res.colDriver')}</th><th>${t('res.colRace')}</th><th>${t('res.colPts')}</th><th>${t('res.colTotal')}</th></tr></thead>
          <tbody>${body}</tbody>
        </table>
      </div>
      <div class="results-next" id="results-next"></div>
    </div>`;
  el.style.display = 'flex';

  clearInterval(countdown);
  const next = el.querySelector<HTMLElement>('#results-next')!;
  const ends = performance.now() + o.nextRaceIn * 1000;
  const tick = () => {
    if (!o.nextTrackName) {
      next.textContent = t('res.podium');
      return;
    }
    const left = Math.ceil((ends - performance.now()) / 1000);
    next.textContent = left > 0 ? t('res.next', { track: o.nextTrackName.toUpperCase(), n: left }) : t('res.preparing');
  };
  tick();
  countdown = window.setInterval(tick, 250);
}

export function hideResults() {
  clearInterval(countdown);
  document.getElementById('results')!.style.display = 'none';
}

export const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
