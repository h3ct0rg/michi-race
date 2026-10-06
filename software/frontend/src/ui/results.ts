// Pantalla de resultados (versión MVP de designs/podio_y_resultados_finales).
import { fmtTime } from './hud';

const MEDALS = ['🥇', '🥈', '🥉'];

export interface ResultRow {
  name: string;
  place: number;
  finishTime: number | null;
  bestLap: number | null;
  me: boolean;
}

export interface ResultsOptions {
  trackName: string;
  rows: ResultRow[];
  actionLabel: string;
  onAction: () => void;
}

export function showResults({ trackName, rows, actionLabel, onAction }: ResultsOptions) {
  const el = document.getElementById('results')!;
  const sorted = [...rows].sort((a, b) => a.place - b.place);
  const me = sorted.find((r) => r.me);
  const body = sorted
    .map((r) => {
      const total = r.finishTime !== null ? fmtTime(r.finishTime) : 'NO TERMINÓ';
      const best = r.bestLap !== null ? fmtTime(r.bestLap) : '--:--.--';
      return `<tr${r.me ? ' class="me"' : ''}><td class="pos">${MEDALS[r.place - 1] ?? `${r.place}°`}</td><td>${escapeHtml(r.name)}</td><td>${total}</td><td>${best}</td></tr>`;
    })
    .join('');
  el.innerHTML = `
    <div class="results-card">
      <div class="results-title">🏁 ${escapeHtml(trackName.toUpperCase())} · RESULTADOS</div>
      <div class="results-sub">Ganador: <b>${escapeHtml(sorted[0]?.name ?? '-')}</b>${me ? ` · Tu posición: <b>${me.place}°</b>` : ''}</div>
      <table>
        <thead><tr><th>POS</th><th>PILOTO</th><th>TIEMPO</th><th>MEJOR VUELTA</th></tr></thead>
        <tbody>${body}</tbody>
      </table>
      <button class="results-action btn btn-secondary">${actionLabel}</button>
    </div>`;
  el.querySelector('button')!.addEventListener('click', onAction);
  el.style.display = 'flex';
}

export function hideResults() {
  document.getElementById('results')!.style.display = 'none';
}

export const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
