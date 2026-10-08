// Lobby multijugador (versión MVP de designs/lobby_multijugador_sala_px_8820_desktop), hasta 20 pilotos.
import { colorName, swatch } from '../colors';
import { t } from '../i18n';
import type { RoomStateDto } from '../net/protocol';
import { escapeHtml } from './results';
import { renderTrackCard } from './trackPicker';

const $ = (id: string) => document.getElementById(id)!;

export function renderLobby(room: RoomStateDto, myId: string, rtt: number) {
  const me = room.players.find((p) => p.id === myId);
  const isOwner = room.ownerId === myId;
  const waiting = room.players.filter((p) => p.id !== room.ownerId && p.connected && !p.ready).length;
  const bots = room.fillBots ? Math.max(0, room.gridSize - room.players.filter((p) => p.connected).length) : 0;

  $('l-code').textContent = room.code;
  $('l-ping').textContent = `${rtt} MS`;
  // torneo: 4 pistas en orden fijo; se resalta la carrera actual
  const tour = room.tournament;
  renderTrackCard(
    { img: 'l-track-img', name: 'l-track', tagline: 'l-track-tag', laps: 'l-laps', difficulty: 'l-diff', picker: 'l-tracks' },
    room.trackId,
    null,
  );
  $('l-track-hint').textContent = tour ? t('l.raceOf', { n: tour.race + 1, total: tour.totalRaces }) : t('w.tourPill');
  $('l-count').textContent = t('l.count', { n: room.players.length, max: room.maxPlayers, grid: Math.max(room.gridSize, room.players.length) });
  const botsInput = $('l-bots') as HTMLInputElement;
  botsInput.checked = room.fillBots;
  botsInput.disabled = !isOwner;
  const grid = $('l-grid') as HTMLSelectElement;
  grid.value = String(room.gridSize);
  grid.disabled = !isOwner || !room.fillBots;

  const status = $('l-status');
  if (room.phase === 'racing') {
    status.textContent = t('l.racing', { n: (tour?.race ?? 0) + 1, total: tour?.totalRaces ?? 4 });
    status.className = 'start-box';
  } else if (room.phase === 'intermission') {
    status.textContent = t('l.intermission');
    status.className = 'start-box';
  } else if (room.phase === 'podium') {
    status.textContent = t('l.podium');
    status.className = 'start-box';
  } else if (waiting > 0) {
    status.textContent = t('l.waiting', { n: waiting });
    status.className = 'start-box';
  } else {
    status.textContent = isOwner ? t('l.allReady') : t('l.waitHost');
    status.className = 'start-box ok';
  }

  const rows = room.players.map((p, i) => {
    const state = !p.connected
      ? `<span class="state wait">${t('l.reconnecting')}</span>`
      : p.isOwner
        ? `<span class="state host-state">${t('l.hostState')}</span>`
        : p.ready
          ? `<span class="state ready">${t('l.ready')}</span>`
          : `<span class="state wait">${t('l.notReady')}</span>`;
    return `<li class="${p.id === myId ? 'me' : ''}${p.connected ? '' : ' away'}">
      <span class="slot">P${i + 1}</span>
      <span class="color-dot" style="background:${swatch(p.color)}"></span>
      <div class="p-info">
        <div class="p-name">${p.isOwner ? '<span class="host">HOST</span>' : ''}${escapeHtml(p.name)}${p.id === myId ? t('l.you') : ''}</div>
        <div class="p-sub">${colorName(p.color).toUpperCase()} · ${p.ping} MS</div>
      </div>
      ${state}
    </li>`;
  });
  if (bots > 0) {
    rows.push(`<li class="empty"><span class="slot">🤖</span><div class="p-info"><div class="p-name">${t('l.bots', { n: bots })}</div><div class="p-sub">${t('l.botsSub')}</div></div></li>`);
  }
  if (room.players.length < room.maxPlayers) {
    rows.push(`<li class="empty"><span class="slot">+</span><div class="p-info"><div class="p-name">${t('l.free', { n: room.maxPlayers - room.players.length })}</div><div class="p-sub">${t('l.roomSub', { code: room.code })}</div></div><button class="btn btn-ghost sm" data-invite>${t('l.invite')}</button></li>`);
  }
  const list = $('l-players');
  list.innerHTML = rows.join('');
  list.classList.toggle('two-cols', room.players.length > 8);

  const ready = $('l-ready') as HTMLButtonElement;
  if (isOwner) {
    ready.textContent = t('l.start');
    ready.disabled = waiting > 0 || room.phase !== 'lobby';
    ready.classList.remove('is-ready');
  } else {
    ready.textContent = me?.ready ? t('l.readyWait') : t('l.readyBtn');
    ready.disabled = room.phase !== 'lobby';
    ready.classList.toggle('is-ready', !!me?.ready);
  }
  if (me) $('l-color-name').textContent = t('l.color', { name: colorName(me.color).toUpperCase() });
}

export function showError(id: string, message: string | null) {
  const el = $(id);
  el.hidden = !message;
  el.textContent = message ?? '';
}
