import { describe, expect, it } from 'vitest';
import { insertRecord, toList, type RecordEntry } from './records';

const e = (n: string, t: number, d = 1): RecordEntry => ({ n, t, d, m: 'local' });

describe('world records', () => {
  it('a new best time becomes the record (rank 0)', () => {
    const out = insertRecord([e('Ana', 90), e('Beto', 95)], e('Gaston', 88));
    expect(out?.rank).toBe(0);
    expect(out?.list.map((x) => x.n)).toEqual(['Gaston', 'Ana', 'Beto']);
  });

  it('one place per driver: keeps only their best mark', () => {
    expect(insertRecord([e('Gaston', 88)], e('gaston', 90))).toBeNull(); // peor que su marca
    const out = insertRecord([e('Gaston', 88), e('Ana', 89)], e('GASTON', 87));
    expect(out?.list.map((x) => [x.n, x.t])).toEqual([['GASTON', 87], ['Ana', 89]]);
  });

  it('keeps a top 10 and rejects times that do not make it', () => {
    const full = Array.from({ length: 10 }, (_, i) => e(`P${i}`, 80 + i));
    expect(insertRecord(full, e('Slow', 99))).toBeNull();
    const out = insertRecord(full, e('Fast', 84.5));
    expect(out?.rank).toBe(5);
    expect(out?.list).toHaveLength(10);
    expect(out?.list.some((x) => x.n === 'P9')).toBe(false);
  });

  it('ties keep the older time first', () => {
    const out = insertRecord([e('Ana', 90, 1)], e('Beto', 90, 2));
    expect(out?.rank).toBe(1);
  });

  it('reads Firebase data defensively (arrays as objects, junk filtered, sorted)', () => {
    const raw = { 0: e('B', 92), 1: { n: 'X', t: 'fast' }, 2: e('A', 91), 3: null };
    expect(toList(raw).map((x) => x.n)).toEqual(['A', 'B']);
    expect(toList(undefined)).toEqual([]);
  });
});
