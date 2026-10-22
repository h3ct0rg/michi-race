import { describe, expect, it, vi } from 'vitest';
import { OnlineSession } from './online';
import type { Controls } from '../input/controls';
import type { GameConnection } from '../net/connection';
import { RACER_FIELDS, type RaceStartDto, type SnapshotDto } from '../net/protocol';
import { NO_INPUT } from '../sim/input';
import { buildTrack } from '../sim/track';
import { GREEN_VALLEY } from '../sim/tracks/greenValley';

vi.stubGlobal('window', {}); // la sesión expone window.__online en desarrollo
const track = buildTrack(GREEN_VALLEY);
const controls = { read: () => NO_INPUT } as unknown as Controls;
const start: RaceStartDto = {
  trackId: GREEN_VALLEY.id,
  goTick: 90,
  raceIndex: 0,
  totalRaces: 1,
  racers: [
    { id: 'me', name: 'Me', color: 0, bot: false },
    { id: 'bot0', name: 'Bot', color: 1, bot: true },
  ],
};
const fakeConn = () => ({ onSnapshot: (_: SnapshotDto) => {}, rtt: 0, sendInput() {}, netsimLabel: '', protocol: 'msgpack' }) as unknown as GameConnection;

/** Estado propio (orden de SnapshotLayout.Self): distancia, x... finishTime en 18, seq en 29. */
const self = (distance: number, finishTime: number) => {
  const m = new Array(30).fill(0);
  m[0] = distance;
  m[15] = GREEN_VALLEY.checkpoints;
  m[17] = -1;
  m[18] = finishTime;
  return m;
};
const snapshot = (t: number, me: number[] | null): SnapshotDto => ({ t, ph: 1, r: new Array(2 * RACER_FIELDS).fill(0), me, p: [], b: [], ev: [] });

describe('online session', () => {
  it('disposing the previous race does not unhook the next one', () => {
    const conn = fakeConn();
    const previous = new OnlineSession(track, conn, controls, start, 'me');
    const next = new OnlineSession(track, conn, controls, start, 'me');
    previous.dispose(); // RaceView.start() suelta la sesión anterior después de crear la nueva
    conn.onSnapshot(snapshot(100, self(500, -1)));
    expect(next.race.racers.find((r) => r.id === 'me')!.distance).toBe(500);
  });

  it('after finishing, server updates are not turned into a visual correction (no camera jitter)', () => {
    const conn = fakeConn();
    const s = new OnlineSession(track, conn, controls, start, 'me');
    (s as unknown as { localTick: number }).localTick = 500;
    conn.onSnapshot(snapshot(500, self(10_000, 95)));
    conn.onSnapshot(snapshot(503, self(11_000, 95)));
    expect(s.viewOffset(s.player)).toBeNull();
  });
});
