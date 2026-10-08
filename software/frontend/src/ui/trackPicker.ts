// Tarjeta de circuito + selector de pista (bienvenida y lobby).
import { THEMES } from '../render/themes';
import { TRACKS } from '../sim/tracks';
import { escapeHtml } from './results';
import { t, type Key } from '../i18n';

export interface TrackCardIds {
  img: string;
  name: string;
  tagline: string;
  laps: string;
  difficulty: string;
  picker: string;
}

const stars = (n: number) => '★'.repeat(n) + '☆'.repeat(5 - n);

/** Muestra la pista elegida y la lista de pistas; `onPick` es null si el usuario no puede cambiarla. */
export function renderTrackCard(ids: TrackCardIds, trackId: string, onPick: ((id: string) => void) | null) {
  const def = TRACKS[trackId] ?? Object.values(TRACKS)[0];
  const theme = THEMES[def.id];
  const el = (id: string) => document.getElementById(id)!;
  (el(ids.img) as HTMLImageElement).src = theme.preview;
  el(ids.name).textContent = def.name.toUpperCase();
  el(ids.tagline).textContent = t(`track.${def.id}` as Key);
  el(ids.laps).textContent = t('track.laps', { n: def.laps });
  el(ids.difficulty).textContent = stars(theme.difficulty);

  const picker = el(ids.picker);
  picker.innerHTML = Object.values(TRACKS)
    .map(
      (t, i) => `<button class="track-option${t.id === def.id ? ' selected' : ''}" data-track="${t.id}" ${onPick ? '' : 'disabled'}>
        <img src="${THEMES[t.id].preview}" alt="" />
        <span>${String(i + 1).padStart(2, '0')} · ${escapeHtml(t.name.toUpperCase())}</span>
      </button>`,
    )
    .join('');
  picker.onclick = (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-track]');
    if (btn && onPick && btn.dataset.track !== def.id) onPick(btn.dataset.track!);
  };
}
