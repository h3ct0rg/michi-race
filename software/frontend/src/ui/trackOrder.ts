// Selector de pistas del torneo con orden: se tocan en el orden en que se van a correr (1, 2, 3...).
// Tocar una elegida la quita (siempre queda al menos una). Se usa en el modo local y en el lobby online.
import { THEMES } from '../render/themes';
import { TRACKS } from '../sim/tracks';
import { escapeHtml } from './results';
import { recordsOf } from '../net/records';
import { fmtTime } from './hud';

export const MAX_RACES = 4;

/** Récord mundial de carrera de la pista (si hay). */
const record = (id: string) => {
  const r = recordsOf(id).race[0];
  return r ? `<span class="rec">🏆 ${fmtTime(r.t)} · ${escapeHtml(r.n)}</span>` : '';
};

export function renderTrackOrder(el: HTMLElement, selected: string[], onChange: ((tracks: string[]) => void) | null) {
  el.innerHTML = Object.values(TRACKS)
    .map((t) => {
      const n = selected.indexOf(t.id);
      return `<button class="track-option ordered${n >= 0 ? ' selected' : ''}" data-track="${t.id}" ${onChange ? '' : 'disabled'}>
        ${n >= 0 ? `<span class="order-badge">${n + 1}</span>` : ''}
        <img src="${THEMES[t.id].preview}" alt="" />
        <span>${escapeHtml(t.name.toUpperCase())}</span>
        ${record(t.id)}
      </button>`;
    })
    .join('');
  el.onclick = (e) => {
    const id = (e.target as HTMLElement).closest<HTMLElement>('[data-track]')?.dataset.track;
    if (!id || !onChange) return;
    if (selected.includes(id)) {
      if (selected.length > 1) onChange(selected.filter((x) => x !== id));
    } else if (selected.length < MAX_RACES) onChange([...selected, id]);
  };
}
