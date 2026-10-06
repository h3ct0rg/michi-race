// Lobby multijugador (versión MVP de designs/lobby_multijugador_sala_px_8820_desktop), hasta 20 pilotos.
import { KART_COLORS, swatch } from '../colors';
import type { RoomStateDto } from '../net/protocol';
import { escapeHtml } from './results';
import { renderTrackCard } from './trackPicker';

const $ = (id: string) => document.getElementById(id)!;

export function renderLobby(room: RoomStateDto, myId: string, rtt: number, onPickTrack: (id: string) => void) {
  const me = room.players.find((p) => p.id === myId);
  const isOwner = room.ownerId === myId;
  const waiting = room.players.filter((p) => p.id !== room.ownerId && p.connected && !p.ready).length;
  const bots = room.fillBots ? Math.max(0, room.gridSize - room.players.filter((p) => p.connected).length) : 0;

  $('l-code').textContent = room.code;
  $('l-ping').textContent = `${rtt} MS`;
  const canPick = isOwner && room.phase === 'lobby';
  renderTrackCard(
    { img: 'l-track-img', name: 'l-track', tagline: 'l-track-tag', laps: 'l-laps', difficulty: 'l-diff', picker: 'l-tracks' },
    room.trackId,
    canPick ? onPickTrack : null,
  );
  $('l-track-hint').textContent = canPick ? 'TÚ ELIGES' : 'ELIGE EL HOST';
  $('l-count').textContent = `${room.players.length}/${room.maxPlayers} PILOTOS · PARRILLA DE ${Math.max(room.gridSize, room.players.length)}`;
  const botsInput = $('l-bots') as HTMLInputElement;
  botsInput.checked = room.fillBots;
  botsInput.disabled = !isOwner;
  const grid = $('l-grid') as HTMLSelectElement;
  grid.value = String(room.gridSize);
  grid.disabled = !isOwner || !room.fillBots;

  const status = $('l-status');
  if (room.phase === 'racing') {
    status.textContent = 'CARRERA EN CURSO';
    status.className = 'start-box';
  } else if (waiting > 0) {
    status.textContent = `ESPERANDO ${waiting} PILOTO${waiting > 1 ? 'S' : ''}`;
    status.className = 'start-box';
  } else {
    status.textContent = isOwner ? '¡TODOS LISTOS!' : 'ESPERANDO AL HOST';
    status.className = 'start-box ok';
  }

  const rows = room.players.map((p, i) => {
    const state = !p.connected
      ? '<span class="state wait">⟳ RECONECTANDO</span>'
      : p.isOwner
        ? '<span class="state host-state">👑 HOST</span>'
        : p.ready
          ? '<span class="state ready">✔ LISTO</span>'
          : '<span class="state wait">✖ NO LISTO</span>';
    return `<li class="${p.id === myId ? 'me' : ''}${p.connected ? '' : ' away'}">
      <span class="slot">P${i + 1}</span>
      <span class="color-dot" style="background:${swatch(p.color)}"></span>
      <div class="p-info">
        <div class="p-name">${p.isOwner ? '<span class="host">HOST</span>' : ''}${escapeHtml(p.name)}${p.id === myId ? ' (TÚ)' : ''}</div>
        <div class="p-sub">${KART_COLORS[p.color].name.toUpperCase()} · ${p.ping} MS</div>
      </div>
      ${state}
    </li>`;
  });
  if (bots > 0) {
    rows.push(`<li class="empty"><span class="slot">🤖</span><div class="p-info"><div class="p-name">+${bots} BOTS DE RELLENO</div><div class="p-sub">COMPLETAN LA PARRILLA AL INICIAR</div></div></li>`);
  }
  if (room.players.length < room.maxPlayers) {
    rows.push(`<li class="empty"><span class="slot">+</span><div class="p-info"><div class="p-name">[${room.maxPlayers - room.players.length} LUGARES LIBRES]</div><div class="p-sub">SALA ${room.code}</div></div><button class="btn btn-ghost sm" data-invite>+ INVITAR</button></li>`);
  }
  const list = $('l-players');
  list.innerHTML = rows.join('');
  list.classList.toggle('two-cols', room.players.length > 8);

  const ready = $('l-ready') as HTMLButtonElement;
  if (isOwner) {
    ready.textContent = '🏁 ¡INICIAR CARRERA! ⚡';
    ready.disabled = waiting > 0 || room.phase !== 'lobby';
    ready.classList.remove('is-ready');
  } else {
    ready.textContent = me?.ready ? '✔ LISTO — ESPERANDO AL HOST' : '🏁 ¡LISTO PARA CORRER! ⚡';
    ready.disabled = room.phase !== 'lobby';
    ready.classList.toggle('is-ready', !!me?.ready);
  }
  if (me) $('l-color-name').textContent = `COLOR: ${KART_COLORS[me.color].name.toUpperCase()}`;
}

export function showError(id: string, message: string | null) {
  const el = $(id);
  el.hidden = !message;
  el.textContent = message ?? '';
}
