import { describe, expect, it } from 'vitest';
import { LocalTournament, pointsFor, rankStandings, TOURNAMENT_ORDER } from './tournament';
import type { Racer } from '../sim/physics';

const racer = (id: string, bot = true) => ({ id, name: id.toUpperCase(), bot: bot ? { skill: 1, lane: 0, laneTimer: 0 } : undefined }) as Racer;

describe('tournament', () => {
  it('uses the same points table as the server', () => {
    expect(Array.from({ length: 20 }, (_, i) => pointsFor(i + 1))).toEqual([25, 20, 16, 13, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0, 0, 0, 0, 0]);
  });

  it('runs the four tracks from easy to hard', () => {
    expect(TOURNAMENT_ORDER).toEqual(['green-valley', 'coastal-road', 'desert-run', 'neon-city']);
  });

  it('accumulates points and breaks ties by the last race', () => {
    const t = new LocalTournament();
    const [a, b, c] = ['a', 'b', 'c'].map((id) => racer(id));
    t.record([a, b, c], () => 0); // a 25, b 20, c 16
    t.next();
    t.record([b, a, c], () => 0); // a 45, b 45, c 32 → b ganó la última
    expect(t.ranked().map((s) => [s.id, s.points])).toEqual([['b', 45], ['a', 45], ['c', 32]]);
    expect(t.gridOrder()).toEqual(['b', 'a', 'c']);
    expect(t.final).toBe(false);
  });

  it('players who missed races rank after equal points', () => {
    const s = [
      { id: 'late', name: '', color: 0, bot: false, points: 10, places: [0, 6, 0, 0] },
      { id: 'x', name: '', color: 0, bot: true, points: 10, places: [6, 0, 0, 0] },
    ];
    expect(rankStandings(s, 1).map((x) => x.id)).toEqual(['late', 'x']);
  });
});
