// Récords mundiales por pista, compartidos por todos los jugadores (Firebase, rama /michiracer/records).
// records/<pista>/race: top 10 de tiempo total de carrera; records/<pista>/lap: top 10 de mejor vuelta.
// Cada jugador sube su propio tiempo al terminar (online: el que calculó el servidor; local: el del navegador).
// Las altas usan transacciones para que dos récords simultáneos no se pisen.
import { firebase, ROOT } from './firebase';

export type RecordKind = 'race' | 'lap';
export const TOP = 10;

export interface RecordEntry {
  /** Apodo del piloto. */
  n: string;
  /** Tiempo en segundos. */
  t: number;
  /** Fecha (ms desde 1970). */
  d: number;
  /** Dónde se corrió. */
  m: 'online' | 'local';
}

export type TrackRecords = Record<RecordKind, RecordEntry[]>;

const valid = (e: unknown): e is RecordEntry =>
  !!e && typeof (e as RecordEntry).n === 'string' && typeof (e as RecordEntry).t === 'number' && Number.isFinite((e as RecordEntry).t) && (e as RecordEntry).t > 0;

/** Lista desde Firebase (los arrays llegan como array u objeto con claves numéricas), limpia y ordenada. */
export const toList = (raw: unknown): RecordEntry[] =>
  (Array.isArray(raw) ? raw : raw && typeof raw === 'object' ? Object.values(raw) : []).filter(valid).sort((a, b) => a.t - b.t).slice(0, TOP);

/**
 * Inserta un tiempo en un top 10: un lugar por piloto (se queda su mejor marca).
 * Devuelve la lista nueva y el puesto (0 = récord), o null si no entra o no mejora su marca.
 */
export function insertRecord(list: RecordEntry[], entry: RecordEntry): { list: RecordEntry[]; rank: number } | null {
  const key = entry.n.toLowerCase();
  const mine = list.find((e) => e.n.toLowerCase() === key);
  if (mine && mine.t <= entry.t) return null;
  const next = [...list.filter((e) => e !== mine), entry].sort((a, b) => a.t - b.t || a.d - b.d).slice(0, TOP);
  const rank = next.indexOf(entry);
  return rank < 0 ? null : { list: next, rank };
}

// ------------------------------------------------------------------ Firebase

let cache: Record<string, TrackRecords> = {};
const listeners = new Set<() => void>();
let watching = false;

/** Récords de una pista (lo que se sabe hasta ahora; vacío mientras carga). */
export const recordsOf = (trackId: string): TrackRecords => cache[trackId] ?? { race: [], lap: [] };

/** Se suscribe a los récords de todas las pistas (una sola vez); `fn` se llama cuando cambian. Devuelve cómo dejar de escuchar. */
export function onRecords(fn: () => void): () => void {
  listeners.add(fn);
  if (!watching) {
    watching = true;
    firebase()
      .then(({ db, database }) =>
        db.onValue(db.ref(database, `${ROOT}/records`), (snap) => {
          const raw = (snap.val() ?? {}) as Record<string, Partial<Record<RecordKind, unknown>>>;
          cache = Object.fromEntries(Object.entries(raw).map(([id, r]) => [id, { race: toList(r?.race), lap: toList(r?.lap) }]));
          listeners.forEach((l) => l());
        }),
      )
      .catch(() => (watching = false));
  }
  return () => listeners.delete(fn);
}

/** Sube un tiempo; resuelve con el puesto alcanzado (0 = récord mundial) o null si no entró al top 10. */
export async function submitRecord(trackId: string, kind: RecordKind, entry: RecordEntry): Promise<number | null> {
  const { db, database } = await firebase();
  let rank: number | null = null;
  const res = await db.runTransaction(db.ref(database, `${ROOT}/records/${trackId}/${kind}`), (current) => {
    const out = insertRecord(toList(current), entry);
    rank = out?.rank ?? null;
    return out ? out.list : undefined; // undefined = no escribir nada
  });
  return res.committed ? rank : null;
}
