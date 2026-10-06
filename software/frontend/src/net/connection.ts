// Conexión SignalR con el servidor de juego: MessagePack sobre WebSocket, reconexión automática
// y simulador de latencia opcional para desarrollo.
import { HttpTransportType, HubConnection, HubConnectionBuilder, HubConnectionState, LogLevel } from '@microsoft/signalr';
import { MessagePackHubProtocol } from '@microsoft/signalr-protocol-msgpack';
import type { Input } from '../sim/input';
import { DelayLine, NetSimConfig, readNetSim } from './netsim';
import type { JoinResponse, RaceStartDto, ResultsDto, RoomStateDto, SnapshotDto } from './protocol';

type Handler<T> = (msg: T) => void;

/** MessagePack (C#) envía PascalCase; el resto del cliente trabaja en camelCase. */
function camelize<T>(value: unknown): T {
  if (Array.isArray(value)) return (typeof value[0] === 'number' ? value : value.map((v) => camelize(v))) as T;
  if (value instanceof Uint8Array || value === null || typeof value !== 'object') return value as T;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) out[k.charAt(0).toLowerCase() + k.slice(1)] = camelize(v);
  return out as T;
}

export const encodeButtons = (i: Input) => (i.throttle ? 1 : 0) | (i.brake ? 2 : 0) | (i.drift ? 4 : 0) | (i.turbo ? 8 : 0);

export class GameConnection {
  private readonly hub: HubConnection;
  private pingTimer = 0;
  private readonly netsim: NetSimConfig | null = readNetSim();
  private readonly incoming: DelayLine | null;
  private readonly outgoing: DelayLine | null;

  onRoomState: Handler<RoomStateDto> = () => {};
  onRaceStarted: Handler<RaceStartDto> = () => {};
  onSnapshot: Handler<SnapshotDto> = () => {};
  onResults: Handler<ResultsDto> = () => {};
  onReconnecting: () => void = () => {};
  onReconnected: () => void = () => {};
  onConnectionLost: Handler<string> = () => {};

  /** Última latencia medida (ida y vuelta, ms), incluida la simulada. */
  rtt = 0;
  readonly protocol: 'msgpack' | 'json';

  constructor() {
    this.protocol = new URLSearchParams(location.search).get('proto') === 'json' ? 'json' : 'msgpack';
    const builder = new HubConnectionBuilder()
      .withUrl('/hubs/race', { skipNegotiation: true, transport: HttpTransportType.WebSockets })
      .withAutomaticReconnect([0, 1000, 2000, 4000, 8000, 15000])
      .configureLogging(LogLevel.Warning);
    if (this.protocol === 'msgpack') builder.withHubProtocol(new MessagePackHubProtocol());
    this.hub = builder.build();
    this.hub.serverTimeoutInMilliseconds = 15000;

    this.incoming = this.netsim ? new DelayLine(this.netsim) : null;
    this.outgoing = this.netsim ? new DelayLine(this.netsim) : null;

    const on = <T>(name: string, handler: () => Handler<T>) =>
      this.hub.on(name, (raw: unknown) => {
        const msg = camelize<T>(raw);
        if (this.incoming) this.incoming.push(() => handler()(msg));
        else handler()(msg);
      });
    on<RoomStateDto>('RoomState', () => this.onRoomState);
    on<RaceStartDto>('RaceStarted', () => this.onRaceStarted);
    on<SnapshotDto>('Snapshot', () => this.onSnapshot);
    on<ResultsDto>('Results', () => this.onResults);

    this.hub.onreconnecting(() => this.onReconnecting());
    this.hub.onreconnected(() => this.onReconnected());
    this.hub.onclose((e) => {
      clearInterval(this.pingTimer);
      this.onConnectionLost(e?.message ?? 'Conexión cerrada');
    });
  }

  get connected() {
    return this.hub.state === HubConnectionState.Connected;
  }

  get netsimLabel() {
    return this.netsim ? `SIM +${this.netsim.lag}ms ±${this.netsim.jitter}ms` : '';
  }

  async connect() {
    if (this.hub.state === HubConnectionState.Disconnected) await this.hub.start();
  }

  private async invoke<T>(method: string, ...args: unknown[]): Promise<T> {
    return camelize<T>(await this.hub.invoke(method, ...args));
  }

  async join(code: string, name: string): Promise<JoinResponse> {
    await this.connect();
    const res = await this.invoke<JoinResponse>('JoinRoom', code, name);
    this.startPing();
    return res;
  }

  async rejoin(code: string, playerId: string, token: string): Promise<JoinResponse> {
    await this.connect();
    const res = await this.invoke<JoinResponse>('RejoinRoom', code, playerId, token);
    this.startPing();
    return res;
  }

  leave() {
    clearInterval(this.pingTimer);
    return this.connected ? this.hub.invoke('LeaveRoom') : Promise.resolve();
  }

  async stop() {
    clearInterval(this.pingTimer);
    await this.hub.stop();
  }

  setReady = (ready: boolean) => this.hub.invoke('SetReady', ready);
  selectColor = (color: number) => this.hub.invoke('SelectColor', color);
  setFillBots = (fill: boolean) => this.hub.invoke('SetFillBots', fill);
  setGridSize = (size: number) => this.hub.invoke('SetGridSize', size);
  setTrack = (trackId: string) => this.hub.invoke('SetTrack', trackId);
  startRace = () => this.hub.invoke('StartRace');

  /** Fire-and-forget: los inputs viajan cada tick y no esperan respuesta. */
  sendInput(seq: number, input: Input) {
    if (!this.connected) return;
    const send = () => this.hub.send('SendInput', seq, input.steer, encodeButtons(input)).catch(() => {});
    if (this.outgoing) this.outgoing.push(send);
    else send();
  }

  private startPing() {
    clearInterval(this.pingTimer);
    const measure = async () => {
      if (!this.connected) return;
      const t0 = performance.now();
      await this.hub.invoke('Ping');
      if (this.netsim) await new Promise((r) => setTimeout(r, this.netsim!.lag + Math.random() * this.netsim!.jitter));
      this.rtt = Math.round(performance.now() - t0);
      await this.hub.invoke('ReportPing', this.rtt);
    };
    measure().catch(() => {});
    this.pingTimer = window.setInterval(() => measure().catch(() => {}), 3000);
  }
}

/** Crea una sala vía REST y devuelve su código. */
export async function createRoom(trackId: string): Promise<string> {
  const res = await fetch(`/api/rooms?track=${encodeURIComponent(trackId)}`, { method: 'POST' });
  if (!res.ok) throw new Error('No se pudo crear la sala. ¿Está corriendo el servidor?');
  return (await res.json()).code;
}

/** Estado público de una sala, o null si no existe (destruida, vacía o expirada). */
export async function fetchRoom(code: string): Promise<RoomStateDto | null> {
  const res = await fetch(`/api/rooms/${encodeURIComponent(code)}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error('No se pudo consultar la sala. ¿Está corriendo el servidor?');
  return res.json();
}
