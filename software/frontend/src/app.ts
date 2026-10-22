// Flujo completo: Inicio → Jugar local (arma tu torneo) | Jugar online: Crear/Unirse (link) → Lobby ⇄ Garaje → Torneo (4 carreras con resultados entre
// cada una) → Podio → Reiniciar (host o votación) / Lobby.
import { KART_COLORS, colorName, swatch } from './colors';
import { DEFAULT_DRIVER, DRIVERS, driverBase, isDriver, keepsWarmFur, type DriverId } from './drivers';
import { Controls } from './input/controls';
import { TouchControls } from './input/touch';
import { enterFullscreen, exitFullscreen, isTouch } from './device';
import { audio, sfx } from './audio/audio';
import { music } from './audio/music';
import { GameConnection, createRoom, fetchRoom } from './net/connection';
import type { JoinResponse, RaceStartDto, ResultsDto, RoomStateDto } from './net/protocol';
import { KartFrames, loadKart } from './render/sprites';
import { loadTheme } from './render/themes';
import { buildTrack, Track } from './sim/track';
import { DEFAULT_TRACK, TRACKS } from './sim/tracks';
import { OnlineSession } from './game/online';
import { MAX_RIVALS, PRACTICE_BOTS, PracticeSession, type Difficulty } from './game/practice';
import { RaceView } from './game/raceView';
import { MichiPreview } from './ui/michiPreview';
import { renderStats } from './ui/stats';
import { renderLobby, showError, tournamentTitle } from './ui/lobby';
import { renderTrackOrder } from './ui/trackOrder';
import { renderTrackCard } from './ui/trackPicker';
import { itemIcon } from './ui/hud';
import { escapeHtml, hideResults, showResults } from './ui/results';
import { onRecords, recordsOf, submitRecord, type RecordEntry, type RecordKind } from './net/records';
import { fmtTime } from './ui/hud';
import { THEMES } from './render/themes';
import { BASE_SPEED } from './sim/vehicles';
import type { RaceEvent } from './sim/race';
import type { RaceSession } from './game/session';
import { PodiumScene, type PodiumOptions } from './ui/podium';
import { INTERMISSION_SECONDS, LocalTournament, TOURNAMENT_ORDER } from './game/tournament';
import type { StandingDto } from './net/protocol';
import { applyI18n, getLang, onLangChange, setLang, t, tServer, type Key, type Lang } from './i18n';
import { applySettings, getSettings, updateSettings } from './settings';
import { HomeBackground } from './ui/homeBackground';
import { PadMenu } from './input/padMenu';
import { activePad, bindButton, buttonName, DEFAULT_PAD, PAD_ACTIONS, padConfig, padLabel, savePadConfig, type PadAction } from './input/gamepad';
import { startPresence, type PresenceStats } from './net/presence';

type ScreenId = 'home' | 'local' | 'records' | 'welcome' | 'lobby' | 'garage' | 'race';

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
  applyI18n();
  applySettings();
  // frames de cada piloto en los 8 colores de kart (online por ahora corre todo el mundo con el michi)
  const karts = Object.fromEntries(
    await Promise.all(DRIVERS.map(async (d) => [d, await Promise.all(KART_COLORS.map((c) => loadKart(driverBase(d), c.shift, keepsWarmFur(d))))] as const)),
  ) as Record<DriverId, KartFrames[]>;
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
  // música de menú (portada, bienvenida, lobby, garaje). El navegador solo deja sonar audio después
  // del primer toque o tecla, así que también se intenta en cada gesto hasta que arranque.
  const menuMusic = () => {
    if ($('screen-race').classList.contains('active') || !audio.ctx || music.current === 'menu') return;
    music.start('menu');
  };
  for (const ev of ['pointerdown', 'keydown']) document.addEventListener(ev, () => menuMusic());
  // controles táctiles (joystick + GAS/DRIFT/TURBO) solo en celular/tablet
  const touch = isTouch ? new TouchControls($('touch-controls')) : null;
  controls.touch = touch;
  refreshSoundButtons(audio.muted); // incluye el botón 🔊 de los controles táctiles
  if (import.meta.env.DEV) (window as unknown as { __controls: Controls }).__controls = controls; // depuración
  const raceView = new RaceView($('game') as HTMLCanvasElement);
  const homeBg = new HomeBackground($('home-bg') as HTMLCanvasElement, DRIVERS.flatMap((d) => karts[d]));
  const previews = {
    welcome: new MichiPreview($('w-preview') as HTMLCanvasElement),
    local: new MichiPreview($('lo-preview') as HTMLCanvasElement),
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
  let localDriver: DriverId = isDriver(store.get('driver')) ? (store.get('driver') as DriverId) : DEFAULT_DRIVER;
  const podium = new PodiumScene();
  /** Cambia en cada carrera/torneo nuevo: invalida temporizadores pendientes (pase al podio, siguiente carrera). */
  let flowToken = 0;
  let garageColor = localColor;
  let garageDriver: DriverId = DEFAULT_DRIVER;

  const show = (id: ScreenId) => {
    for (const s of ['home', 'local', 'records', 'welcome', 'lobby', 'garage', 'race']) $(`screen-${s}`).classList.toggle('active', s === id);
    if (id === 'home') homeBg.start();
    else homeBg.stop();
    if (id === 'race') {
      if (music.current === 'menu') music.stop();
    } else menuMusic();
    // en táctil: controles visibles solo en carrera; al salir de la carrera se deja la pantalla completa
    touch?.setVisible(id === 'race');
    if (id !== 'race') {
      flowToken++;
      podium.hide();
      exitFullscreen();
    }
  };
  /** Fin de una carrera (resultados): se ocultan los controles; la pantalla completa sigue hasta salir del torneo. */
  const raceFinished = () => {
    raceView.finishAudio();
    touch?.setVisible(false);
  };
  const trackName = (id: string) => TRACKS[id]?.name ?? id;
  /** Cartel de largada: "CARRERA 2/4 · COASTAL ROAD". */
  const announceRace = (trackId: string, index: number, total: number) =>
    raceView.announce(t('race.banner', { n: index + 1, total, track: trackName(trackId).toUpperCase() }));
  /** Los 3 primeros de la tabla con su kart, para el podio. */
  const podiumTop = (standings: { id: string; name: string; color: number; points: number }[], driverOf: (id: string) => DriverId = () => DEFAULT_DRIVER) =>
    standings.slice(0, 3).map((s) => ({ id: s.id, name: s.name, points: s.points, frames: karts[driverOf(s.id)][s.color % KART_COLORS.length] }));
  /** Piloto de cada corredor en el modo local: el elegido para el jugador; los bots alternan (uno de cada tres es ragdoll). */
  const practiceDriver = (id: string): DriverId => (id === 'player' ? localDriver : Number(id.replace('bot', '')) % 3 === 1 ? 'ragdoll' : 'michi');
  const toast = (msg: string) => {
    const el = $('toast');
    el.textContent = msg;
    el.hidden = false;
    setTimeout(() => (el.hidden = true), 2200);
  };
  const myColor = () => room?.players.find((p) => p.id === myId)?.color ?? localColor;
  /** Piloto del jugador en la sala (o el elegido localmente si todavía no está en una). */
  const myDriver = (): DriverId => {
    const d = room?.players.find((p) => p.id === myId)?.driver;
    return isDriver(d) ? d : localDriver;
  };
  /** Frames del kart de un piloto/color que llegan del servidor (texto libre: se valida). */
  const kartOf = (driver: string | undefined, color: number) => karts[isDriver(driver) ? driver : DEFAULT_DRIVER][color % KART_COLORS.length];
  const nameInput = $<HTMLInputElement>('w-name');
  /** Apodo del input indicado (bienvenida online o modo local); si está vacío se inventa uno. */
  const playerName = (input = nameInput) => {
    const n = input.value.trim() || RANDOM_NAMES[Math.floor(Math.random() * RANDOM_NAMES.length)];
    input.value = n;
    store.set('name', n);
    return n;
  };
  const inviteLink = (code: string) => `${location.origin}/room/${code}`;

  // ---------------- bienvenida ----------------
  // el torneo recorre las 4 pistas en orden: la tarjeta muestra la primera y la lista completa
  const renderWelcomeTrack = () =>
    renderTrackCard(
      { img: 'w-track-img', name: 'w-track-name', tagline: 'w-track-tag', laps: 'w-track-laps', difficulty: 'w-track-diff', picker: 'w-tracks' },
      TOURNAMENT_ORDER[0],
      null,
    );
  renderWelcomeTrack();
  nameInput.value = store.get('name') ?? '';
  previews.welcome.setFrames(karts[localDriver][localColor]);
  $('w-random').onclick = () => {
    nameInput.value = RANDOM_NAMES[Math.floor(Math.random() * RANDOM_NAMES.length)] + Math.floor(Math.random() * 90 + 10);
  };
  $('w-paste').onclick = async () => {
    try {
      const text = await navigator.clipboard.readText();
      const code = text.match(/PX-?\d{4}/i)?.[0] ?? text.trim();
      $<HTMLInputElement>('w-code').value = code.toUpperCase();
    } catch {
      toast(t('w.clipboardFail'));
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
  $('w-create').onclick = () =>
    busy(async () => {
      await joinRoom(await createRoom(TOURNAMENT_ORDER[0]));
      // nombre del torneo (opcional): las pistas se eligen después en el lobby
      const name = $<HTMLInputElement>('w-tname').value.trim();
      if (name && conn && room) await conn.setTournament(name, room.trackList).catch(() => {});
    });
  $('w-join').onclick = () => busy(() => joinRoom($<HTMLInputElement>('w-code').value));
  $('w-invite-join').onclick = () => busy(() => joinRoom($('w-invite-code').textContent!));

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
    if (!code) throw new Error(t('w.needCode'));
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
      toast(t('l.reconnected'));
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
    // y el gato que eligió la última vez
    if (requestColor && myDriver() !== localDriver) await conn!.selectDriver(localDriver).catch(() => {});
    // invitado que entra por primera vez: "¡Bienvenido al torneo {nombre}!"
    if (requestColor && room.ownerId !== myId) welcomeBanner(room);
    if (res.race) startOnlineRace(res.race); // carrera en curso: a tu kart, o como espectador
    else if (room.phase === 'podium' && room.tournament) {
      // recargó la página durante el podio: vuelve a la escena final (con su voto)
      mode = 'online';
      show('race');
      touch?.setVisible(false);
      showOnlinePodium(room.tournament.standings);
    } else enterLobby();
  }

  function createConnection() {
    const c = new GameConnection();
    c.onRoomState = (state) => {
      room = state;
      const inRace = mode === 'online' && $('screen-race').classList.contains('active');
      if (!inRace) refreshLobby();
      else if (state.phase === 'lobby') {
        // el host eligió "nuevo torneo" desde el podio (o se canceló el torneo)
        raceView.stop();
        mode = null;
        enterLobby();
      } else if (podium.visible) refreshVotes();
    };
    c.onRaceStarted = (start) => startOnlineRace(start);
    c.onResults = (results) => showOnlineResults(results);
    c.onReconnecting = () => toast(t('l.unstable'));
    c.onReconnected = () => {
      // la conexión nueva tiene otro id: el servidor nos devuelve el mismo lugar con el token
      const saved = savedSession();
      if (!saved) return;
      c.rejoin(saved.code, saved.playerId, saved.token)
        .then((res) => {
          toast(t('l.reconnectedShort'));
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
      showError('w-error', t('w.connLost', { reason }));
    };
    c.onConnectionLost = (reason) => lose(reason);
    return c;
  }

  async function leaveRoom() {
    raceView.stop();
    mode = null;
    await conn?.leave().catch(() => {});
    saveSession(null);
    room = null;
    history.replaceState(null, '', `/${location.search}`);
    showWelcome();
  }

  function refreshLobby() {
    if (!room) return;
    renderLobby(room, myId, conn?.rtt ?? 0, (name, tracks) => lobbyAction(() => conn!.setTournament(name, tracks)));
    loadTheme(room.trackId); // precarga mientras se espera en el lobby
    previews.lobby.setFrames(kartOf(myDriver(), myColor()));
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
          text: t('l.inviteText', { code: room.code }),
          url: inviteLink(room.code),
        })
        .catch(() => {}); // cancelado por el usuario
      return;
    }
    navigator.clipboard
      .writeText(inviteLink(room.code))
      .then(() => toast(t('share.copied', { url: inviteLink(room!.code) })))
      .catch(() => toast(inviteLink(room!.code)));
  }

  // ---------------- garaje ----------------
  function openGarage() {
    garageColor = myColor();
    garageDriver = myDriver();
    renderGarage();
    show('garage');
  }

  function renderGarage() {
    const taken = new Set(room?.players.filter((p) => p.id !== myId).map((p) => p.color) ?? []);
    $('g-colors').innerHTML = KART_COLORS.map(
      (_, i) =>
        `<li data-color="${i}" class="${i === garageColor ? 'selected' : ''}"><span class="color-dot" style="background:${swatch(i)}"></span>${colorName(i).toUpperCase()}${taken.has(i) ? `<span class="taken">${t('g.taken')}</span>` : ''}</li>`,
    ).join('');
    previews.garage.setFrames(karts[garageDriver][garageColor]);
    $('g-drivers').innerHTML = DRIVERS.map(
      (d) => `<button data-driver="${d}" class="${d === garageDriver ? 'selected' : ''}"><img src="${driverBase(d)}/south.png" alt="" />${t(`driver.${d}` as Key)}</button>`,
    ).join('');
  }

  $('g-drivers').onclick = (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-driver]');
    if (!b || !isDriver(b.dataset.driver)) return;
    garageDriver = b.dataset.driver;
    renderGarage();
  };

  $('g-colors').onclick = (e) => {
    const li = (e.target as HTMLElement).closest<HTMLElement>('[data-color]');
    if (!li) return;
    garageColor = Number(li.dataset.color);
    renderGarage();
  };
  $('g-back').onclick = () => enterLobby();
  $('g-equip').onclick = async () => {
    localColor = garageColor;
    localDriver = garageDriver;
    store.set('color', String(localColor));
    store.set('driver', localDriver);
    previews.welcome.setFrames(karts[localDriver][localColor]);
    if (conn && room) {
      await lobbyAction(() => conn!.selectColor(garageColor));
      await lobbyAction(() => conn!.selectDriver(garageDriver));
    }
    enterLobby();
  };

  // ---------------- carrera online ----------------
  function startOnlineRace(start: RaceStartDto) {
    if (!conn) return;
    mode = 'online';
    const frames = new Map<string, KartFrames>(start.racers.map((r) => [r.id, kartOf(r.driver, r.color)]));
    // la sesión se crea ya (para no perder snapshots); el tema suele estar precargado desde el lobby
    const session = new OnlineSession(getTrack(start.trackId), conn, controls, start, myId);
    currentOnline = session;
    $('hud-hint').textContent = session.spectator ? t('race.hintSpectator') : t('race.hint');
    raceView.onEvent = (e) => {
      if (!session.spectator) submitTimes(session, e, 'online');
    };
    flowToken++;
    loadTheme(start.trackId).then((theme) => {
      if (currentOnline !== session) return;
      podium.hide();
      raceView.start(session, frames, theme);
      show('race');
      announceRace(start.trackId, start.raceIndex, start.totalRaces);
    });
  }

  /** Cartel de bienvenida al torneo para los invitados (unos segundos, sin bloquear). */
  let welcomeTimer = 0;
  function welcomeBanner(r: RoomStateDto) {
    const host = r.players.find((p) => p.isOwner)?.name ?? '';
    $('l-welcome-name').textContent = tournamentTitle(r).toUpperCase();
    $('l-welcome-by').textContent = t('l.welcomeBy', { host });
    $('l-welcome').hidden = false;
    clearTimeout(welcomeTimer);
    welcomeTimer = window.setTimeout(() => ($('l-welcome').hidden = true), 3500);
  }
  let currentOnline: OnlineSession | null = null;

  function showOnlineResults(results: ResultsDto) {
    raceFinished();
    const next = results.final ? null : results.nextTrackId;
    showResults({
      tournamentName: room ? tournamentTitle(room) : '',
      trackName: results.trackName,
      raceIndex: results.raceIndex,
      totalRaces: results.totalRaces,
      rows: results.rows,
      standings: results.standings,
      myId,
      nextTrackName: next ? trackName(next) : null,
      nextRaceIn: results.nextRaceIn,
    });
    if (next) loadTheme(next); // precarga durante el intermedio
    if (results.final) {
      const token = ++flowToken;
      setTimeout(() => token === flowToken && showOnlinePodium(results.standings), 4500);
    }
  }

  // ---------------- podio (online) ----------------
  function showOnlinePodium(standings: StandingDto[]) {
    hideResults();
    raceView.stop();
    const mine = standings.findIndex((s) => s.id === myId);
    podium
      .show({
        tournamentName: room ? tournamentTitle(room) : '',
        top: podiumTop(standings, (id) => {
          const d = standings.find((s) => s.id === id)?.driver;
          return isDriver(d) ? d : DEFAULT_DRIVER;
        }),
        myId,
        myPlace: mine + 1,
        myPoints: standings[mine]?.points ?? 0,
        ...podiumActions(),
      })
      .then(refreshVotes);
  }

  /** Host: reiniciar o nuevo torneo. Invitado: votar reinicio o salir. */
  function podiumActions(): Pick<PodiumOptions, 'primary' | 'secondary'> {
    const isHost = room?.ownerId === myId;
    const restart = () => conn?.voteRestart().catch((e) => toast(cleanError(e)));
    return isHost
      ? {
          primary: { label: t('pod.restart'), onClick: restart },
          secondary: { label: t('pod.newTour'), onClick: () => conn?.backToLobby().catch((e) => toast(cleanError(e))) },
        }
      : { primary: { label: t('pod.vote'), onClick: restart }, secondary: { label: t('pod.leave'), onClick: () => leaveRoom() } };
  }

  /** Votos para reiniciar: "2/3"; el invitado que ya votó ve su botón marcado. */
  function refreshVotes() {
    const tour = room?.tournament;
    if (!tour || !podium.visible) return;
    const isHost = room!.ownerId === myId;
    const actions = podiumActions();
    podium.setActions(actions.primary, actions.secondary);
    const voted = tour.votes.includes(myId);
    const text = t('pod.votes', { n: tour.votes.length, need: tour.votesNeeded });
    if (isHost) podium.setVotes(text);
    else podium.setVotes(text, voted ? t('pod.voted') : t('pod.vote'), voted);
  }

  // ---------------- jugar local: arma tu torneo contra bots ----------------
  interface LocalConfig {
    rivals: number;
    difficulty: Difficulty;
    tracks: string[];
  }
  const loadLocalConfig = (): LocalConfig => {
    try {
      const c = JSON.parse(store.get('local') ?? '{}') as Partial<LocalConfig>;
      const tracks = (c.tracks ?? []).filter((id) => TRACKS[id]).filter((id, i, a) => a.indexOf(id) === i).slice(0, 4);
      return {
        rivals: Math.max(1, Math.min(MAX_RIVALS, Number(c.rivals) || 7)),
        difficulty: c.difficulty === 'easy' || c.difficulty === 'hard' ? c.difficulty : 'normal',
        tracks: tracks.length ? tracks : [...TOURNAMENT_ORDER],
      };
    } catch {
      return { rivals: 7, difficulty: 'normal', tracks: [...TOURNAMENT_ORDER] };
    }
  };
  let localCfg = loadLocalConfig();
  const saveLocalConfig = () => store.set('local', JSON.stringify(localCfg));
  const localName = $<HTMLInputElement>('lo-name');

  function renderLocal() {
    $('lo-colors').innerHTML = KART_COLORS.map(
      (_, i) => `<button data-color="${i}" class="${i === localColor ? 'selected' : ''}" style="background:${swatch(i)}" aria-label="${colorName(i)}"></button>`,
    ).join('');
    $('lo-color-name').textContent = colorName(localColor).toUpperCase();
    previews.local.setFrames(karts[localDriver][localColor]);
    $('lo-drivers').innerHTML = DRIVERS.map(
      (d) => `<button data-driver="${d}" class="${d === localDriver ? 'selected' : ''}"><img src="${driverBase(d)}/south.png" alt="" />${t(`driver.${d}` as Key)}</button>`,
    ).join('');
    renderTrackOrder($('lo-tracks'), localCfg.tracks, (tracks) => {
      localCfg.tracks = tracks;
      saveLocalConfig();
      renderLocal();
    });
    $('lo-races').textContent = t('lo.races', { n: localCfg.tracks.length });
    $<HTMLInputElement>('lo-rivals').value = String(localCfg.rivals);
    $('lo-rivals-v').textContent = String(localCfg.rivals);
    document.querySelectorAll<HTMLElement>('#lo-diff [data-diff]').forEach((b) => b.classList.toggle('selected', b.dataset.diff === localCfg.difficulty));
  }

  function openLocal() {
    localName.value = store.get('name') ?? nameInput.value;
    renderLocal();
    show('local');
  }

  $('lo-drivers').onclick = (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-driver]');
    if (!b || !isDriver(b.dataset.driver)) return;
    localDriver = b.dataset.driver;
    store.set('driver', localDriver);
    renderLocal();
  };
  $('lo-colors').onclick = (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-color]');
    if (!b) return;
    localColor = Number(b.dataset.color);
    store.set('color', String(localColor));
    previews.welcome.setFrames(karts[localDriver][localColor]);
    renderLocal();
  };
  $('lo-random').onclick = () => {
    localName.value = RANDOM_NAMES[Math.floor(Math.random() * RANDOM_NAMES.length)] + Math.floor(Math.random() * 90 + 10);
  };
  $<HTMLInputElement>('lo-rivals').oninput = (e) => {
    localCfg.rivals = Number((e.target as HTMLInputElement).value);
    saveLocalConfig();
    $('lo-rivals-v').textContent = String(localCfg.rivals);
  };
  $('lo-diff').onclick = (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-diff]');
    if (!b) return;
    localCfg.difficulty = b.dataset.diff as Difficulty;
    saveLocalConfig();
    renderLocal();
  };
  $('lo-start').onclick = () => {
    const name = playerName(localName);
    nameInput.value = name;
    startPractice(true);
  };

  let practiceTour: LocalTournament | null = null;

  async function startPractice(fresh: boolean) {
    mode = 'practice';
    if (fresh) {
      practiceTour = new LocalTournament([...localCfg.tracks]);
      enterFullscreen(); // dentro del gesto (clic en ¡A CORRER! / REVANCHA)
    }
    const tour = practiceTour!;
    const token = ++flowToken;
    const trackId = tour.trackId;
    const theme = await loadTheme(trackId);
    if (token !== flowToken) return;
    const session = new PracticeSession(getTrack(trackId), controls, playerName(localName), {
      rivals: localCfg.rivals,
      difficulty: localCfg.difficulty,
      gridOrder: tour.raceIndex > 0 ? tour.gridOrder() : null,
    });
    const botColors = KART_COLORS.map((_, i) => i).filter((i) => i !== localColor);
    const colorOf = (id: string) => (id === session.player.id ? localColor : botColors[Number(id.replace('bot', '')) % botColors.length]);
    const frames = new Map<string, KartFrames>([[session.player.id, karts[localDriver][localColor]]]);
    PRACTICE_BOTS.slice(0, localCfg.rivals).forEach((_, i) => frames.set(`bot${i}`, karts[practiceDriver(`bot${i}`)][colorOf(`bot${i}`)]));
    $('hud-hint').textContent = t('race.hintPractice');
    raceView.onEvent = (e) => {
      submitTimes(session, e, 'local');
      if (e.type !== 'end') return;
      raceFinished();
      const ranking = session.race.ranking();
      const earned = tour.record(ranking, colorOf);
      const standings = tour.ranked();
      const next = tour.nextTrackId;
      showResults({
        tournamentName: t('lo.tourName'),
        trackName: session.race.track.def.name,
        raceIndex: tour.raceIndex,
        totalRaces: tour.tracks.length,
        rows: ranking.map((r, i) => ({ id: r.id, name: r.name, place: i + 1, finishTime: r.finishTime, points: earned.get(r.id) ?? 0 })),
        standings,
        myId: session.player.id,
        nextTrackName: next ? trackName(next) : null,
        nextRaceIn: INTERMISSION_SECONDS,
      });
      const after = ++flowToken;
      if (next) {
        loadTheme(next);
        setTimeout(() => {
          if (after !== flowToken || practiceTour !== tour) return;
          tour.next();
          startPractice(false);
        }, INTERMISSION_SECONDS * 1000);
      } else {
        setTimeout(() => after === flowToken && showPracticePodium(standings, session.player.id), 4500);
      }
    };
    raceView.start(session, frames, theme);
    show('race');
    announceRace(trackId, tour.raceIndex, tour.tracks.length);
  }

  function showPracticePodium(standings: ReturnType<LocalTournament['ranked']>, me: string) {
    hideResults();
    raceView.stop();
    const mine = standings.findIndex((s) => s.id === me);
    podium.show({
      tournamentName: t('lo.tourName'),
      top: podiumTop(standings, practiceDriver),
      myId: me,
      myPlace: mine + 1,
      myPoints: standings[mine]?.points ?? 0,
      primary: {
        label: t('pod.rematch'),
        onClick: () => {
          podium.hide();
          startPractice(true);
        },
      },
      secondary: {
        label: t('pod.leave'),
        onClick: () => {
          mode = null;
          openLocal();
        },
      },
    });
  }

  // ESC (o ✕ en táctil): sale de la práctica; en online pide confirmación porque abandona la sala.
  let escArmedUntil = 0;
  const exitRace = (again: string) => {
    if (mode === 'practice') {
      raceView.stop();
      mode = null;
      openLocal();
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
  controls.keyboard.onPress('Escape', () => {
    // ESC cierra primero la configuración si está abierta
    const modal = $('settings');
    if (padMenu.capturing) {
      padMenu.captureNext(null); // cancela la reasignación en curso
      renderPad();
    } else if (!modal.hidden) modal.hidden = true;
    else exitRace(t('race.escAgain'));
  });
  raceView.onFrame = (s) => {
    const p = s.player;
    touch?.setItemIcon(p.item !== 0 && p.itemRoll <= 0 ? itemIcon(p.item) : null);
  };
  if (touch) {
    touch.onExit = () => exitRace(t('race.tapAgain'));
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
        showError('w-error', t('w.roomGone', { code }));
        return;
      }
      const host = info.players.find((p) => p.isOwner)?.name;
      $('w-invite-tour').textContent = t('w.invite.tour', { name: tournamentTitle(info), host: host ?? '' });
      $('w-invite-tour').hidden = false;
      $('w-invite-code').textContent = info.code;
      $('w-invite-info').textContent =
        t('w.invite.info', { host: host ? t('w.invite.host', { name: host }) : '', n: info.players.length, max: info.maxPlayers }) +
        (info.phase !== 'lobby' ? t('w.invite.racing') : '');
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

  // ---------------- inicio (portada) ----------------
  function showHome() {
    show('home');
    ogFile ??= fetch('/og/michi-racer.png')
      .then((r) => r.blob())
      .then((b) => new File([b], 'michi-racer.png', { type: 'image/png' }))
      .then((f) => (ogReady = f))
      .catch(() => null);
  }
  $('h-local').onclick = () => openLocal();
  $('h-records').onclick = () => showRecordsScreen();
  $('h-play-online').onclick = () => showWelcome();
  document.querySelectorAll<HTMLElement>('[data-go-home]').forEach((b) => (b.onclick = () => showHome()));
  $('w-home').onclick = () => showHome();
  $('h-share').onclick = () => shareGame();

  // compartir el juego: en celular, menú nativo con la imagen del juego + texto + link; en PC, copiar
  let ogFile: Promise<File | null> | null = null;
  let ogReady: File | null = null;
  function shareGame() {
    const url = `${location.origin}/`;
    const text = t('share.text');
    if (isTouch && navigator.share) {
      // navigator.share debe llamarse en el mismo gesto: se usa la imagen solo si ya está cargada
      if (ogReady && navigator.canShare?.({ files: [ogReady] })) {
        navigator.share({ files: [ogReady], title: t('share.title'), text: `${text}\n${url}` }).catch(() => {});
      } else {
        navigator.share({ title: t('share.title'), text, url }).catch(() => {});
      }
      return;
    }
    navigator.clipboard
      .writeText(`${text}\n${url}`)
      .then(() => toast(t('share.copied', { url })))
      .catch(() => toast(url));
  }

  // configuración (modal): brillo, volúmenes e idioma
  const settingsModal = $('settings');
  const sliders: [string, 'brightness' | 'master' | 'music' | 'sfx'][] = [
    ['s-brightness', 'brightness'],
    ['s-master', 'master'],
    ['s-music', 'music'],
    ['s-sfx', 'sfx'],
  ];
  const renderSettings = () => {
    const s = getSettings();
    for (const [id, key] of sliders) {
      $<HTMLInputElement>(id).value = String(Math.round(s[key] * 100));
      $(`${id}-v`).textContent = `${Math.round(s[key] * 100)}%`;
    }
    document.querySelectorAll<HTMLElement>('#s-lang [data-lang]').forEach((b) => b.classList.toggle('selected', b.dataset.lang === getLang()));
    renderPad();
  };

  // ---------------- control (gamepad) ----------------
  /** Reasignación en curso: acción y casillero (principal/alternativo). */
  let capturing: { action: PadAction; slot: 0 | 1 } | null = null;
  function renderPad() {
    const pad = activePad();
    const status = $('s-pad-status');
    status.textContent = pad ? `${t('pad.connected', { name: padLabel(pad) })} · ${t('pad.menus')}` : t('pad.none');
    status.classList.toggle('on', !!pad);
    const cfg = padConfig();
    const slotBtn = (a: PadAction, slot: 0 | 1) => {
      const active = capturing?.action === a && capturing.slot === slot;
      return `<button class="btn btn-ghost sm${active ? ' capturing' : ''}" data-bind="${a}" data-slot="${slot}">${active ? t('pad.press') : buttonName(cfg.bindings[a][slot])}</button>`;
    };
    $('s-pad-binds').innerHTML =
      `<span class="th">${t('pad.action')}</span><span class="th">${t('pad.main')}</span><span class="th">${t('pad.alt')}</span>` +
      `<span>${t('pad.steer')}</span><span class="muted">${t('pad.steerKeys')}</span><span></span>` +
      PAD_ACTIONS.map((a) => `<span>${t(`pad.${a}` as Key)}</span>${slotBtn(a, 0)}${slotBtn(a, 1)}`).join('');
    $<HTMLInputElement>('s-pad-dead').value = String(Math.round(cfg.deadzone * 100));
    $('s-pad-dead-v').textContent = `${Math.round(cfg.deadzone * 100)}%`;
    $<HTMLInputElement>('s-pad-right').checked = cfg.rightStick;
    $<HTMLInputElement>('s-pad-vib').checked = cfg.vibration;
  }
  $('s-pad-binds').onclick = (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-bind]');
    if (!b) return;
    capturing = { action: b.dataset.bind as PadAction, slot: Number(b.dataset.slot) as 0 | 1 };
    renderPad();
    // el clic pudo venir del propio botón A: se espera a que se suelte antes de escuchar
    setTimeout(() => {
      padMenu.captureNext((button) => {
        if (capturing) savePadConfig(bindButton(padConfig(), capturing.action, capturing.slot, button));
        capturing = null;
        renderPad();
      });
    }, 250);
  };
  $<HTMLInputElement>('s-pad-dead').oninput = (e) => {
    savePadConfig({ ...padConfig(), deadzone: Number((e.target as HTMLInputElement).value) / 100 });
    renderPad();
  };
  $<HTMLInputElement>('s-pad-right').onchange = (e) => savePadConfig({ ...padConfig(), rightStick: (e.target as HTMLInputElement).checked });
  $<HTMLInputElement>('s-pad-vib').onchange = (e) => savePadConfig({ ...padConfig(), vibration: (e.target as HTMLInputElement).checked });
  $('s-pad-reset').onclick = () => {
    capturing = null;
    padMenu.captureNext(null);
    savePadConfig(DEFAULT_PAD);
    renderPad();
  };
  for (const [id, key] of sliders) {
    $<HTMLInputElement>(id).oninput = (e) => {
      updateSettings({ [key]: Number((e.target as HTMLInputElement).value) / 100 });
      renderSettings();
    };
  }
  // al soltar el volumen de efectos, un "blip" de prueba
  $('s-sfx').onchange = () => sfx.click();
  $('s-lang').onclick = (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-lang]');
    if (!b) return;
    setLang(b.dataset.lang as Lang);
    renderSettings();
  };
  document.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).closest('[data-open-settings]')) {
      renderSettings();
      settingsModal.hidden = false;
    } else if (e.target === settingsModal) settingsModal.hidden = true;
  });
  $('s-done').onclick = () => (settingsModal.hidden = true);

  // navegación de menús con el control y avisos de conexión
  const padMenu = new PadMenu({
    container: () => {
      if (!settingsModal.hidden) return settingsModal.querySelector<HTMLElement>('.modal-card');
      if (podium.visible) return $('podium-ui');
      const active = document.querySelector<HTMLElement>('.screen.active');
      return active && active.id !== 'screen-race' ? active : null;
    },
    back: () => {
      if (!settingsModal.hidden) {
        settingsModal.hidden = true;
        return;
      }
      const active = document.querySelector<HTMLElement>('.screen.active');
      active?.querySelector<HTMLElement>('[data-go-home], #g-back, #w-home')?.click();
    },
  });
  padMenu.onConnect = (pad) => {
    toast(t('pad.connected', { name: padLabel(pad) }));
    if (!settingsModal.hidden) renderPad();
  };
  padMenu.onDisconnect = () => {
    toast(t('pad.disconnected'));
    if (!settingsModal.hidden) renderPad();
  };

  // contadores (Firebase): en línea ahora y total histórico
  let stats: PresenceStats = { online: null, total: null };
  const fmt = (n: number) => n.toLocaleString(getLang() === 'es' ? 'es' : 'en');
  const renderStatsBar = () => {
    $('h-online').textContent = stats.online === null ? t('home.loadingStats') : t('home.online', { n: fmt(stats.online) });
    $('h-total-wrap').hidden = stats.total === null;
    if (stats.total !== null) $('h-total').textContent = t('home.total', { n: fmt(stats.total) });
  };
  startPresence((s) => {
    stats = s;
    renderStatsBar();
  }).catch(() => {
    $('h-online').textContent = '—';
  });

  // ---------------- récords mundiales (Firebase) ----------------
  /**
   * Al cruzar la meta, el jugador sube su tiempo total y su mejor vuelta. Se descartan tiempos imposibles
   * (más rápidos que recorrer la pista al doble de la velocidad base). Avisa si entró al top 10.
   */
  function submitTimes(session: RaceSession, e: RaceEvent, mode: RecordEntry['m']) {
    const me = session.player;
    if (e.type !== 'finish' || e.id !== me.id) return;
    const track = session.race.track;
    const minLap = track.length / (BASE_SPEED * 2);
    const round = (x: number) => Math.round(x * 1000) / 1000;
    const entry = (time: number): RecordEntry => ({ n: me.name, t: round(time), d: Date.now(), m: mode });
    const tries: Promise<[RecordKind, number | null]>[] = [];
    if (e.time >= minLap * track.laps) tries.push(submitRecord(track.def.id, 'race', entry(e.time)).then((r) => ['race', r]));
    if (me.bestLap !== null && me.bestLap >= minLap) tries.push(submitRecord(track.def.id, 'lap', entry(me.bestLap)).then((r) => ['lap', r]));
    Promise.all(tries)
      .then((res) => {
        const race = res.find(([k]) => k === 'race')?.[1] ?? null;
        const lap = res.find(([k]) => k === 'lap')?.[1] ?? null;
        const msg = race === 0 ? t('rec.newWorld') : lap === 0 ? t('rec.newLap') : race !== null ? t('rec.top', { n: race + 1 }) : lap !== null ? t('rec.top', { n: lap + 1 }) : null;
        if (!msg) return;
        if (race === 0 || lap === 0) sfx.record();
        raceView.flash(msg, 3.5);
        toast(msg);
      })
      .catch(() => {});
  }

  let recordsTrack = TOURNAMENT_ORDER[0];
  function renderRecordsScreen() {
    $('rec-tabs').innerHTML = Object.values(TRACKS)
      .map((tr) => {
        const best = recordsOf(tr.id).race[0];
        return `<button class="track-option${tr.id === recordsTrack ? ' selected' : ''}" data-track="${tr.id}">
          <img src="${THEMES[tr.id].preview}" alt="" />
          <span>${escapeHtml(tr.name.toUpperCase())}</span>
          <span class="rec">${best ? `🏆 ${fmtTime(best.t)}` : '—'}</span>
        </button>`;
      })
      .join('');
    const rec = recordsOf(recordsTrack);
    const list = (entries: RecordEntry[]) =>
      entries.length === 0
        ? `<li class="empty">${t('rec.empty')}</li>`
        : entries
            .map(
              (e, i) => `<li><span>${['🥇', '🥈', '🥉'][i] ?? `${i + 1}°`}</span>
                <span class="who">${escapeHtml(e.n)}<small>${new Date(e.d).toLocaleDateString(getLang())} · ${t(e.m === 'online' ? 'rec.online' : 'rec.local')}</small></span>
                <span class="time">${fmtTime(e.t)}</span></li>`,
            )
            .join('');
    $('rec-race').innerHTML = list(rec.race);
    $('rec-lap').innerHTML = list(rec.lap);
  }
  $('rec-tabs').onclick = (e) => {
    const id = (e.target as HTMLElement).closest<HTMLElement>('[data-track]')?.dataset.track;
    if (!id) return;
    recordsTrack = id;
    renderRecordsScreen();
  };
  function showRecordsScreen() {
    renderRecordsScreen();
    show('records');
  }
  // los récords llegan en vivo: se redibujan las pantallas que los muestran
  onRecords(() => {
    if ($('screen-records').classList.contains('active')) renderRecordsScreen();
    if ($('screen-local').classList.contains('active')) renderLocal();
    if (room && $('screen-lobby').classList.contains('active')) refreshLobby();
  });

  // al cambiar el idioma se vuelven a dibujar las partes generadas por código
  onLangChange(() => {
    renderStatsBar();
    renderWelcomeTrack();
    renderStats($('l-stats'));
    renderStats($('g-stats'));
    if (room) refreshLobby();
    if ($('screen-garage').classList.contains('active')) renderGarage();
    if ($('screen-local').classList.contains('active')) renderLocal();
    if ($('screen-records').classList.contains('active')) renderRecordsScreen();
  });

  // con link de sala (/room/PX-1234) se va directo a unirse; si no, la portada
  if (/^\/room\//i.test(location.pathname)) showWelcome();
  else showHome();
}

function normalizeCode(raw: string) {
  const c = raw.trim().toUpperCase().replace(/^#/, '');
  if (!c) return '';
  return c.startsWith('PX-') ? c : /^\d+$/.test(c) ? `PX-${c}` : c.replace(/^PX/, 'PX-');
}

function cleanError(e: unknown) {
  const msg = e instanceof Error ? e.message : String(e);
  // SignalR envuelve los HubException: "An unexpected error occurred invoking 'X' on the server. HubException: mensaje"
  return tServer(msg.split('HubException: ').pop()!.replace(/^Error: /, ''));
}
