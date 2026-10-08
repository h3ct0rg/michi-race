// Flujo completo: Bienvenida → Crear/Unirse (link) → Lobby ⇄ Garaje → Carrera → Resultados → Lobby.
import { KART_COLORS, swatch } from './colors';
import { Controls } from './input/controls';
import { TouchControls } from './input/touch';
import { enterFullscreen, exitFullscreen, isTouch } from './device';
import { audio, sfx } from './audio/audio';
import { GameConnection, createRoom, fetchRoom } from './net/connection';
import type { JoinResponse, RaceStartDto, ResultsDto, RoomStateDto } from './net/protocol';
import { KartFrames, loadKart } from './render/sprites';
import { loadTheme } from './render/themes';
import { buildTrack, Track } from './sim/track';
import { DEFAULT_TRACK, TRACKS } from './sim/tracks';
import { OnlineSession } from './game/online';
import { PRACTICE_BOTS, PracticeSession } from './game/practice';
import { RaceView } from './game/raceView';
import { MichiPreview } from './ui/michiPreview';
import { renderStats } from './ui/stats';
import { renderLobby, showError } from './ui/lobby';
import { renderTrackCard } from './ui/trackPicker';
import { itemIcon } from './ui/hud';
import { showResults } from './ui/results';

type ScreenId = 'welcome' | 'lobby' | 'garage' | 'race';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const RANDOM_NAMES = ['TurboCat', 'Bigotes', 'ApexMiau', 'Pelusa', 'Garfi', 'Nieve', 'Ronroneo', 'Misifu', 'Zarpas', 'Michifuz'];
const store = {
  get: (k: string) => {
    try {
      return localStorage.getItem(`michi.${k}`);
    } catch {
      return null;
    }
  },
  set: (k: string, v: string) => {
    try {
      localStorage.setItem(`michi.${k}`, v);
    } catch {
      /* modo privado */
    }
  },
};

export async function startApp() {
  const kartFrames = await Promise.all(KART_COLORS.map((c) => loadKart('/assets/michi', c.shift)));
  loadTheme(DEFAULT_TRACK); // precarga del tema por defecto
  const tracks = new Map<string, Track>();
  const getTrack = (id: string) => {
    const def = TRACKS[id] ?? TRACKS[DEFAULT_TRACK];
    if (!tracks.has(def.id)) tracks.set(def.id, buildTrack(def));
    return tracks.get(def.id)!;
  };
  const controls = new Controls();

  // ---------------- sonido ----------------
  // botones 🔊 (menús y controles táctiles), tecla M y "blip" al tocar botones de la interfaz
  const refreshSoundButtons = (muted: boolean) =>
    document.querySelectorAll<HTMLElement>('[data-sound]').forEach((b) => {
      b.textContent = muted ? '🔇' : '🔊';
      b.classList.toggle('muted', muted);
    });
  audio.onMutedChange(refreshSoundButtons);
  document.addEventListener('click', (e) => {
    const el = e.target as HTMLElement;
    if (el.closest('[data-sound]')) {
      audio.toggleMuted();
      return;
    }
    if (el.closest('.btn, .track-option, .color-list li')) sfx.click();
  });
  controls.keyboard.onPress('KeyM', () => audio.toggleMuted());
  // controles táctiles (joystick + GAS/DRIFT/TURBO) solo en celular/tablet
  const touch = isTouch ? new TouchControls($('touch-controls')) : null;
  controls.touch = touch;
  refreshSoundButtons(audio.muted); // incluye el botón 🔊 de los controles táctiles
  if (import.meta.env.DEV) (window as unknown as { __controls: Controls }).__controls = controls; // depuración
  const raceView = new RaceView($('game') as HTMLCanvasElement);
  const previews = {
    welcome: new MichiPreview($('w-preview') as HTMLCanvasElement),
    lobby: new MichiPreview($('l-preview') as HTMLCanvasElement),
    garage: new MichiPreview($('g-preview') as HTMLCanvasElement),
  };
  renderStats($('l-stats'));
  renderStats($('g-stats'));

  let conn: GameConnection | null = null;
  let room: RoomStateDto | null = null;
  let myId = '';
  let mode: 'practice' | 'online' | null = null;
  let localColor = Number(store.get('color') ?? 0) % KART_COLORS.length;
  let localTrack = TRACKS[store.get('track') ?? ''] ? store.get('track')! : DEFAULT_TRACK;
  let garageColor = localColor;

  const show = (id: ScreenId) => {
    for (const s of ['welcome', 'lobby', 'garage', 'race']) $(`screen-${s}`).classList.toggle('active', s === id);
    // en táctil: controles visibles solo en carrera; al salir de la carrera se deja la pantalla completa
    touch?.setVisible(id === 'race');
    if (id !== 'race') exitFullscreen();
  };
  /** Fin de carrera (resultados): se ocultan los controles y se sale de pantalla completa. */
  const raceFinished = () => {
    raceView.finishAudio();
    touch?.setVisible(false);
    exitFullscreen();
  };
  const toast = (msg: string) => {
    const t = $('toast');
    t.textContent = msg;
    t.hidden = false;
    setTimeout(() => (t.hidden = true), 2200);
  };
  const myColor = () => room?.players.find((p) => p.id === myId)?.color ?? localColor;
  const nameInput = $<HTMLInputElement>('w-name');
  const playerName = () => {
    const n = nameInput.value.trim() || RANDOM_NAMES[Math.floor(Math.random() * RANDOM_NAMES.length)];
    nameInput.value = n;
    store.set('name', n);
    return n;
  };
  const inviteLink = (code: string) => `${location.origin}/room/${code}`;

  // ---------------- bienvenida ----------------
  const renderWelcomeTrack = () =>
    renderTrackCard(
      { img: 'w-track-img', name: 'w-track-name', tagline: 'w-track-tag', laps: 'w-track-laps', difficulty: 'w-track-diff', picker: 'w-tracks' },
      localTrack,
      (id) => {
        localTrack = id;
        store.set('track', id);
        loadTheme(id);
        renderWelcomeTrack();
      },
    );
  renderWelcomeTrack();
  nameInput.value = store.get('name') ?? '';
  previews.welcome.setFrames(kartFrames[localColor]);
  $('w-random').onclick = () => {
    nameInput.value = RANDOM_NAMES[Math.floor(Math.random() * RANDOM_NAMES.length)] + Math.floor(Math.random() * 90 + 10);
  };
  $('w-paste').onclick = async () => {
    try {
      const text = await navigator.clipboard.readText();
      const code = text.match(/PX-?\d{4}/i)?.[0] ?? text.trim();
      $<HTMLInputElement>('w-code').value = code.toUpperCase();
    } catch {
      toast('No se pudo leer el portapapeles');
    }
  };
  const busy = async (fn: () => Promise<void>) => {
    showError('w-error', null);
    document.querySelectorAll<HTMLButtonElement>('#screen-welcome button').forEach((b) => (b.disabled = true));
    try {
      await fn();
    } catch (e) {
      const msg = cleanError(e);
      // la sala pudo cerrarse entre que se mostró la invitación y el clic en "unirse"
      if (/no existe|expir/i.test(msg)) forgetInvite();
      showError('w-error', msg);
    } finally {
      document.querySelectorAll<HTMLButtonElement>('#screen-welcome button').forEach((b) => (b.disabled = false));
    }
  };
  $('w-create').onclick = () => busy(async () => joinRoom(await createRoom(localTrack)));
  $('w-join').onclick = () => busy(() => joinRoom($<HTMLInputElement>('w-code').value));
  $('w-invite-join').onclick = () => busy(() => joinRoom($('w-invite-code').textContent!));
  $('w-practice').onclick = () => startPractice();

  // ---------------- conexión / sala ----------------
  // La sesión (código + id + token) se guarda por pestaña para volver al mismo lugar tras recargar o caerse la red.
  type SavedSession = { code: string; playerId: string; token: string };
  const SESSION_KEY = 'michi.session';
  const saveSession = (v: SavedSession | null) => {
    try {
      if (v) sessionStorage.setItem(SESSION_KEY, JSON.stringify(v));
      else sessionStorage.removeItem(SESSION_KEY);
    } catch {
      /* almacenamiento bloqueado */
    }
  };
  const savedSession = (): SavedSession | null => {
    try {
      return JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? 'null');
    } catch {
      return null;
    }
  };

  async function joinRoom(rawCode: string) {
    const code = normalizeCode(rawCode);
    if (!code) throw new Error('Escribe el código de la sala (ej: PX-4412).');
    const name = playerName();
    conn ??= createConnection();
    const res = await conn.join(code, name);
    await enterRoom(res, true);
  }

  /** Intenta recuperar el lugar guardado en esta pestaña. Devuelve false si ya no existe. */
  async function rejoinRoom(code: string): Promise<boolean> {
    const saved = savedSession();
    if (!saved || saved.code !== code) return false;
    try {
      conn ??= createConnection();
      const res = await conn.rejoin(code, saved.playerId, saved.token);
      await enterRoom(res, false);
      toast('Reconectado a la sala');
      return true;
    } catch {
      saveSession(null);
      return false;
    }
  }

  async function enterRoom(res: JoinResponse, requestColor: boolean) {
    myId = res.playerId;
    room = res.room;
    saveSession({ code: room.code, playerId: res.playerId, token: res.token });
    history.replaceState(null, '', `/room/${room.code}${location.search}`);
    // al entrar, pedimos el color que el jugador usó la última vez si está libre
    if (requestColor && myColor() !== localColor && !room.players.some((p) => p.id !== myId && p.color === localColor)) {
      await conn!.selectColor(localColor).catch(() => {});
    }
    if (res.race) startOnlineRace(res.race); // carrera en curso: a tu kart, o como espectador
    else enterLobby();
  }

  function createConnection() {
    const c = new GameConnection();
    c.onRoomState = (state) => {
      room = state;
      if (mode !== 'online' || !$('screen-race').classList.contains('active')) refreshLobby();
    };
    c.onRaceStarted = (start) => startOnlineRace(start);
    c.onResults = (results) => showOnlineResults(results);
    c.onReconnecting = () => toast('Conexión inestable, reconectando…');
    c.onReconnected = () => {
      // la conexión nueva tiene otro id: el servidor nos devuelve el mismo lugar con el token
      const saved = savedSession();
      if (!saved) return;
      c.rejoin(saved.code, saved.playerId, saved.token)
        .then((res) => {
          toast('Reconectado');
          const racing = mode === 'online' && $('screen-race').classList.contains('active');
          myId = res.playerId;
          room = res.room;
          if (res.race) startOnlineRace(res.race);
          else if (!racing) enterLobby();
        })
        .catch((e) => lose(cleanError(e)));
    };
    const lose = (reason: string) => {
      conn = null;
      room = null;
      raceView.stop();
      mode = null;
      saveSession(null);
      history.replaceState(null, '', `/${location.search}`);
      showWelcome();
      showError('w-error', `Se perdió la conexión con el servidor (${reason}).`);
    };
    c.onConnectionLost = (reason) => lose(reason);
    return c;
  }

  async function leaveRoom() {
    await conn?.leave().catch(() => {});
    saveSession(null);
    room = null;
    history.replaceState(null, '', `/${location.search}`);
    showWelcome();
  }

  function refreshLobby() {
    if (!room) return;
    renderLobby(room, myId, conn?.rtt ?? 0, (id) => lobbyAction(() => conn!.setTrack(id)));
    loadTheme(room.trackId); // precarga mientras se espera en el lobby
    previews.lobby.setFrames(kartFrames[myColor()]);
  }

  function enterLobby() {
    showError('l-error', null);
    refreshLobby();
    show('lobby');
  }

  const lobbyAction = async (fn: () => Promise<unknown>) => {
    showError('l-error', null);
    try {
      await fn();
    } catch (e) {
      showError('l-error', cleanError(e));
    }
  };
  $('l-ready').onclick = () =>
    lobbyAction(async () => {
      if (!conn || !room) return;
      if (room.ownerId === myId) {
        enterFullscreen();
        await conn.startRace();
      }
      else await conn.setReady(!room.players.find((p) => p.id === myId)?.ready);
    });
  $<HTMLInputElement>('l-bots').onchange = (e) => lobbyAction(() => conn!.setFillBots((e.target as HTMLInputElement).checked));
  $<HTMLSelectElement>('l-grid').onchange = (e) => lobbyAction(() => conn!.setGridSize(Number((e.target as HTMLSelectElement).value)));
  $('l-copy').onclick = () => copyInvite();
  $('l-players').onclick = (e) => {
    if ((e.target as HTMLElement).closest('[data-invite]')) copyInvite();
  };
  $('l-leave').onclick = () => leaveRoom();
  $('l-garage').onclick = () => openGarage();

  function copyInvite() {
    if (!room) return;
    // en el celular: menú nativo de compartir (WhatsApp, Telegram...); en PC: copiar al portapapeles
    if (isTouch && navigator.share) {
      navigator
        .share({
          title: 'Michi Racer',
          text: `🏁 ¡Únete a mi carrera de michis en Michi Racer! Sala ${room.code}`,
          url: inviteLink(room.code),
        })
        .catch(() => {}); // cancelado por el usuario
      return;
    }
    navigator.clipboard
      .writeText(inviteLink(room.code))
      .then(() => toast(`Link copiado: ${inviteLink(room!.code)}`))
      .catch(() => toast(inviteLink(room!.code)));
  }

  // ---------------- garaje ----------------
  function openGarage() {
    garageColor = myColor();
    renderGarage();
    show('garage');
  }

  function renderGarage() {
    const taken = new Set(room?.players.filter((p) => p.id !== myId).map((p) => p.color) ?? []);
    $('g-colors').innerHTML = KART_COLORS.map(
      (c, i) =>
        `<li data-color="${i}" class="${i === garageColor ? 'selected' : ''}"><span class="color-dot" style="background:${swatch(i)}"></span>${c.name.toUpperCase()}${taken.has(i) ? '<span class="taken">EN USO</span>' : ''}</li>`,
    ).join('');
    previews.garage.setFrames(kartFrames[garageColor]);
  }

  $('g-colors').onclick = (e) => {
    const li = (e.target as HTMLElement).closest<HTMLElement>('[data-color]');
    if (!li) return;
    garageColor = Number(li.dataset.color);
    renderGarage();
  };
  $('g-back').onclick = () => enterLobby();
  $('g-equip').onclick = async () => {
    localColor = garageColor;
    store.set('color', String(localColor));
    previews.welcome.setFrames(kartFrames[localColor]);
    if (conn && room) await lobbyAction(() => conn!.selectColor(garageColor));
    enterLobby();
  };

  // ---------------- carrera online ----------------
  function startOnlineRace(start: RaceStartDto) {
    if (!conn) return;
    mode = 'online';
    const frames = new Map<string, KartFrames>(start.racers.map((r) => [r.id, kartFrames[r.color]]));
    // la sesión se crea ya (para no perder snapshots); el tema suele estar precargado desde el lobby
    const session = new OnlineSession(getTrack(start.trackId), conn, controls, start, myId);
    currentOnline = session;
    $('hud-hint').textContent = session.spectator
      ? '👁 MODO ESPECTADOR · entrarás a correr en la próxima carrera · M sonido · ESC×2 salir · F3 diagnóstico'
      : '← → dirección · ↑ gas · ↓ freno · SHIFT derrape · ESPACIO ítem · 🎮 gamepad · M sonido · ESC×2 salir · F3 diagnóstico';
    raceView.onEvent = () => {};
    loadTheme(start.trackId).then((theme) => {
      if (currentOnline !== session) return;
      raceView.start(session, frames, theme);
      show('race');
    });
  }
  let currentOnline: OnlineSession | null = null;

  function showOnlineResults(results: ResultsDto) {
    raceFinished();
    showResults({
      trackName: results.trackName,
      rows: results.rows.map((r) => ({ name: r.name, place: r.place, finishTime: r.finishTime, bestLap: r.bestLap, me: r.id === myId })),
      actionLabel: 'VOLVER AL LOBBY ⟶',
      onAction: () => {
        raceView.stop();
        mode = null;
        enterLobby();
      },
    });
  }

  // ---------------- práctica local ----------------
  async function startPractice() {
    mode = 'practice';
    enterFullscreen(); // dentro del gesto (clic en PRÁCTICA / REVANCHA)
    const theme = await loadTheme(localTrack);
    const session = new PracticeSession(getTrack(localTrack), controls, playerName());
    const frames = new Map<string, KartFrames>([[session.player.id, kartFrames[localColor]]]);
    const botColors = KART_COLORS.map((_, i) => i).filter((i) => i !== localColor);
    PRACTICE_BOTS.forEach((_, i) => frames.set(`bot${i}`, kartFrames[botColors[i % botColors.length]]));
    $('hud-hint').textContent = '← → dirección · ↑ gas · ↓ freno · SHIFT derrape · ESPACIO ítem · 🎮 gamepad · M sonido · ESC salir';
    raceView.onEvent = (e) => {
      if (e.type !== 'end') return;
      raceFinished();
      showResults({
        trackName: session.race.track.def.name,
        rows: session.race.ranking().map((r, i) => ({ name: r.name, place: i + 1, finishTime: r.finishTime, bestLap: r.bestLap, me: r === session.player })),
        actionLabel: '⟳ REVANCHA',
        onAction: () => startPractice(),
      });
    };
    raceView.start(session, frames, theme);
    show('race');
  }

  // ESC (o ✕ en táctil): sale de la práctica; en online pide confirmación porque abandona la sala.
  let escArmedUntil = 0;
  const exitRace = (again: string) => {
    if (mode === 'practice') {
      raceView.stop();
      mode = null;
      showWelcome();
    } else if (mode === 'online' && $('screen-race').classList.contains('active')) {
      if (performance.now() > escArmedUntil) {
        escArmedUntil = performance.now() + 2000;
        toast(again);
        return;
      }
      raceView.stop();
      mode = null;
      leaveRoom();
    }
  };
  controls.keyboard.onPress('Escape', () => exitRace('Presiona ESC otra vez para salir de la sala'));
  raceView.onFrame = (s) => {
    const p = s.player;
    touch?.setItemIcon(p.item !== 0 && p.itemRoll <= 0 ? itemIcon(p.item) : null);
  };
  if (touch) {
    touch.onExit = () => exitRace('Toca ✕ otra vez para salir de la sala');
    // los invitados entran a la carrera sin gesto propio: el primer toque activa la pantalla completa
    touch.onFirstTouch = () => enterFullscreen();
  }

  // ---------------- arranque ----------------
  // La invitación solo se muestra si el servidor confirma que la sala sigue abierta.
  async function showWelcome() {
    $('w-invite').hidden = true;
    show('welcome');
    nameInput.focus();
    const raw = location.pathname.match(/^\/room\/([\w-]+)/i)?.[1];
    if (!raw) return;
    const code = normalizeCode(raw);
    if (await rejoinRoom(code)) return;
    try {
      const info = await fetchRoom(code);
      if (!info) {
        forgetInvite();
        showError('w-error', `La sala ${code} ya no existe o se cerró. Crea una sala nueva o únete con otro código.`);
        return;
      }
      const host = info.players.find((p) => p.isOwner)?.name;
      $('w-invite-code').textContent = info.code;
      $('w-invite-info').textContent =
        `${host ? `Host: ${host} · ` : ''}${info.players.length}/${info.maxPlayers} pilotos` + (info.phase === 'racing' ? ' · carrera en curso, entrarás en la próxima' : '');
      $('w-invite').hidden = false;
      $('w-invite-join').focus();
    } catch (e) {
      showError('w-error', cleanError(e));
    }
  }

  /** Quita el código de la URL para que no se vuelva a ofrecer una sala que ya no sirve. */
  function forgetInvite() {
    $('w-invite').hidden = true;
    history.replaceState(null, '', `/${location.search}`);
  }

  showWelcome();
}

function normalizeCode(raw: string) {
  const c = raw.trim().toUpperCase().replace(/^#/, '');
  if (!c) return '';
  return c.startsWith('PX-') ? c : /^\d+$/.test(c) ? `PX-${c}` : c.replace(/^PX/, 'PX-');
}

function cleanError(e: unknown) {
  const msg = e instanceof Error ? e.message : String(e);
  // SignalR envuelve los HubException: "An unexpected error occurred invoking 'X' on the server. HubException: mensaje"
  return msg.split('HubException: ').pop()!.replace(/^Error: /, '');
}
