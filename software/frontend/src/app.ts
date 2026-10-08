// Flujo completo: Inicio → Bienvenida → Crear/Unirse (link) → Lobby ⇄ Garaje → Torneo (4 carreras con resultados entre
// cada una) → Podio → Reiniciar (host o votación) / Lobby.
import { KART_COLORS, colorName, swatch } from './colors';
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
import { PRACTICE_BOTS, PracticeSession } from './game/practice';
import { RaceView } from './game/raceView';
import { MichiPreview } from './ui/michiPreview';
import { renderStats } from './ui/stats';
import { renderLobby, showError } from './ui/lobby';
import { renderTrackCard } from './ui/trackPicker';
import { itemIcon } from './ui/hud';
import { hideResults, showResults } from './ui/results';
import { PodiumScene, type PodiumOptions } from './ui/podium';
import { INTERMISSION_SECONDS, LocalTournament, TOURNAMENT_ORDER } from './game/tournament';
import type { StandingDto } from './net/protocol';
import { applyI18n, getLang, onLangChange, setLang, t, tServer, type Lang } from './i18n';
import { applySettings, getSettings, updateSettings } from './settings';
import { HomeBackground } from './ui/homeBackground';
import { startPresence, type PresenceStats } from './net/presence';

type ScreenId = 'home' | 'welcome' | 'lobby' | 'garage' | 'race';

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
  const homeBg = new HomeBackground($('home-bg') as HTMLCanvasElement, kartFrames);
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
  const podium = new PodiumScene();
  /** Cambia en cada carrera/torneo nuevo: invalida temporizadores pendientes (pase al podio, siguiente carrera). */
  let flowToken = 0;
  let garageColor = localColor;

  const show = (id: ScreenId) => {
    for (const s of ['home', 'welcome', 'lobby', 'garage', 'race']) $(`screen-${s}`).classList.toggle('active', s === id);
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
  const announceRace = (trackId: string) => {
    const i = TOURNAMENT_ORDER.indexOf(trackId);
    raceView.announce(t('race.banner', { n: i + 1, total: TOURNAMENT_ORDER.length, track: trackName(trackId).toUpperCase() }));
  };
  /** Los 3 primeros de la tabla con su kart, para el podio. */
  const podiumTop = (standings: { id: string; name: string; color: number; points: number }[]) =>
    standings.slice(0, 3).map((s) => ({ id: s.id, name: s.name, points: s.points, frames: kartFrames[s.color % kartFrames.length] }));
  const toast = (msg: string) => {
    const el = $('toast');
    el.textContent = msg;
    el.hidden = false;
    setTimeout(() => (el.hidden = true), 2200);
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
  // el torneo recorre las 4 pistas en orden: la tarjeta muestra la primera y la lista completa
  const renderWelcomeTrack = () =>
    renderTrackCard(
      { img: 'w-track-img', name: 'w-track-name', tagline: 'w-track-tag', laps: 'w-track-laps', difficulty: 'w-track-diff', picker: 'w-tracks' },
      TOURNAMENT_ORDER[0],
      null,
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
  $('w-create').onclick = () => busy(async () => joinRoom(await createRoom(TOURNAMENT_ORDER[0])));
  $('w-join').onclick = () => busy(() => joinRoom($<HTMLInputElement>('w-code').value));
  $('w-invite-join').onclick = () => busy(() => joinRoom($('w-invite-code').textContent!));
  $('w-practice').onclick = () => startPractice(true);

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
    renderLobby(room, myId, conn?.rtt ?? 0);
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
    renderGarage();
    show('garage');
  }

  function renderGarage() {
    const taken = new Set(room?.players.filter((p) => p.id !== myId).map((p) => p.color) ?? []);
    $('g-colors').innerHTML = KART_COLORS.map(
      (_, i) =>
        `<li data-color="${i}" class="${i === garageColor ? 'selected' : ''}"><span class="color-dot" style="background:${swatch(i)}"></span>${colorName(i).toUpperCase()}${taken.has(i) ? `<span class="taken">${t('g.taken')}</span>` : ''}</li>`,
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
    $('hud-hint').textContent = session.spectator ? t('race.hintSpectator') : t('race.hint');
    raceView.onEvent = () => {};
    flowToken++;
    loadTheme(start.trackId).then((theme) => {
      if (currentOnline !== session) return;
      podium.hide();
      raceView.start(session, frames, theme);
      show('race');
      announceRace(start.trackId);
    });
  }
  let currentOnline: OnlineSession | null = null;

  function showOnlineResults(results: ResultsDto) {
    raceFinished();
    const next = results.final ? null : TOURNAMENT_ORDER[results.raceIndex + 1];
    showResults({
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
    podium.show({ top: podiumTop(standings), myId, myPlace: mine + 1, myPoints: standings[mine]?.points ?? 0, ...podiumActions() }).then(refreshVotes);
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

  // ---------------- práctica local ----------------
  // ---------------- práctica local: torneo de 4 carreras contra bots ----------------
  let practiceTour: LocalTournament | null = null;

  async function startPractice(fresh: boolean) {
    mode = 'practice';
    if (fresh) {
      practiceTour = new LocalTournament();
      enterFullscreen(); // dentro del gesto (clic en PRÁCTICA / REVANCHA)
    }
    const tour = practiceTour!;
    const token = ++flowToken;
    const trackId = tour.trackId;
    const theme = await loadTheme(trackId);
    if (token !== flowToken) return;
    const session = new PracticeSession(getTrack(trackId), controls, playerName(), tour.raceIndex > 0 ? tour.gridOrder() : null);
    const botColors = KART_COLORS.map((_, i) => i).filter((i) => i !== localColor);
    const colorOf = (id: string) => (id === session.player.id ? localColor : botColors[Number(id.replace('bot', '')) % botColors.length]);
    const frames = new Map<string, KartFrames>([[session.player.id, kartFrames[localColor]]]);
    PRACTICE_BOTS.forEach((_, i) => frames.set(`bot${i}`, kartFrames[colorOf(`bot${i}`)]));
    $('hud-hint').textContent = t('race.hintPractice');
    raceView.onEvent = (e) => {
      if (e.type !== 'end') return;
      raceFinished();
      const ranking = session.race.ranking();
      const earned = tour.record(ranking, colorOf);
      const standings = tour.ranked();
      const next = tour.final ? null : TOURNAMENT_ORDER[tour.raceIndex + 1];
      showResults({
        trackName: session.race.track.def.name,
        raceIndex: tour.raceIndex,
        totalRaces: TOURNAMENT_ORDER.length,
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
    announceRace(trackId);
  }

  function showPracticePodium(standings: ReturnType<LocalTournament['ranked']>, me: string) {
    hideResults();
    raceView.stop();
    const mine = standings.findIndex((s) => s.id === me);
    podium.show({
      top: podiumTop(standings),
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
          showWelcome();
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
  controls.keyboard.onPress('Escape', () => {
    // ESC cierra primero la configuración si está abierta
    const modal = $('settings');
    if (!modal.hidden) modal.hidden = true;
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
  $('h-play').onclick = () => showWelcome();
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

  // al cambiar el idioma se vuelven a dibujar las partes generadas por código
  onLangChange(() => {
    renderStatsBar();
    renderWelcomeTrack();
    renderStats($('l-stats'));
    renderStats($('g-stats'));
    if (room) refreshLobby();
    if ($('screen-garage').classList.contains('active')) renderGarage();
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
