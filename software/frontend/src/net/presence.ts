// Contadores públicos en Firebase Realtime Database (rama /michiracer):
// - online/<id>: una entrada por pestaña con el juego abierto; Firebase la borra sola al desconectarse.
// - totalPlayers: suma 1 la primera vez que entra cada navegador (solo crece).
// El SDK se carga aparte (import dinámico) para no demorar el arranque del juego.

const DATABASE_URL = 'https://spud-survival-default-rtdb.firebaseio.com';
const ROOT = 'michiracer';
const COUNTED_KEY = 'michi.counted';

export interface PresenceStats {
  online: number | null;
  total: number | null;
}

/** Empieza a registrar la presencia y avisa cada vez que cambian los números. */
export async function startPresence(onStats: (s: PresenceStats) => void) {
  const [{ initializeApp }, db] = await Promise.all([import('firebase/app'), import('firebase/database')]);
  const app = initializeApp({ databaseURL: DATABASE_URL }, 'michiracer');
  const database = db.getDatabase(app);
  const stats: PresenceStats = { online: null, total: null };
  const emit = () => onStats({ ...stats });

  // presencia: al (re)conectar se crea la entrada y se programa su borrado en el servidor
  const me = db.push(db.ref(database, `${ROOT}/online`));
  db.onValue(db.ref(database, '.info/connected'), (snap) => {
    if (snap.val() !== true) return;
    db.onDisconnect(me)
      .remove()
      .then(() => db.set(me, { at: db.serverTimestamp() }))
      .catch(() => {});
  });
  db.onValue(db.ref(database, `${ROOT}/online`), (snap) => {
    stats.online = Math.max(1, snap.size);
    emit();
  });

  // total histórico: una vez por navegador
  const total = db.ref(database, `${ROOT}/totalPlayers`);
  if (!counted()) {
    db.runTransaction(total, (v) => (typeof v === 'number' ? v : 0) + 1)
      .then((r) => r.committed && markCounted())
      .catch(() => {});
  }
  db.onValue(total, (snap) => {
    stats.total = typeof snap.val() === 'number' ? snap.val() : 0;
    emit();
  });
}

function counted() {
  try {
    return localStorage.getItem(COUNTED_KEY) === '1';
  } catch {
    return true; // sin almacenamiento no podemos evitar contar de más: mejor no contar
  }
}

function markCounted() {
  try {
    localStorage.setItem(COUNTED_KEY, '1');
  } catch {
    /* modo privado */
  }
}
