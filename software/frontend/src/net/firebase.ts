// Firebase Realtime Database (pública) compartida por los contadores y los récords. El SDK se carga
// aparte (import dinámico) y una sola vez, para no demorar el arranque del juego.
const DATABASE_URL = 'https://spud-survival-default-rtdb.firebaseio.com';
/** Todo lo del juego vive bajo esta rama para no tocar otros datos de la base. */
export const ROOT = 'michiracer';

type DatabaseModule = typeof import('firebase/database');

let loading: Promise<{ db: DatabaseModule; database: ReturnType<DatabaseModule['getDatabase']> }> | null = null;

export function firebase() {
  loading ??= (async () => {
    const [{ initializeApp }, db] = await Promise.all([import('firebase/app'), import('firebase/database')]);
    const app = initializeApp({ databaseURL: DATABASE_URL }, 'michiracer');
    return { db, database: db.getDatabase(app) };
  })();
  return loading;
}
