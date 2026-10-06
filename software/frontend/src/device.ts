// Detección de dispositivo táctil y pantalla completa.
// Forzar el modo táctil en un PC para probar: http://localhost:5173/?touch=1

const forced = new URLSearchParams(location.search).get('touch');

/** Dispositivo táctil sin mouse (celular / tablet). */
export const isTouch =
  forced === '1' || (forced !== '0' && (window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0));

export function applyDeviceClasses() {
  document.documentElement.classList.toggle('touch', isTouch);
}

type FullscreenElement = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> | void };
type FullscreenDocument = Document & { webkitFullscreenElement?: Element; webkitExitFullscreen?: () => Promise<void> | void };

const fsElement = () => document.fullscreenElement ?? (document as FullscreenDocument).webkitFullscreenElement ?? null;

/**
 * Pasa a pantalla completa (solo táctil). Debe llamarse dentro de un gesto del usuario (toque/clic);
 * si el navegador no lo permite (p. ej. iPhone) se ignora.
 */
export function enterFullscreen() {
  if (!isTouch || fsElement()) return;
  const el = document.documentElement as FullscreenElement;
  try {
    const req = el.requestFullscreen ? el.requestFullscreen({ navigationUI: 'hide' }) : el.webkitRequestFullscreen?.();
    Promise.resolve(req)
      .then(() => (screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }).lock?.('landscape'))
      .catch(() => {});
  } catch {
    /* sin soporte */
  }
}

export function exitFullscreen() {
  if (!fsElement()) return;
  const doc = document as FullscreenDocument;
  try {
    Promise.resolve(doc.exitFullscreen ? doc.exitFullscreen() : doc.webkitExitFullscreen?.()).catch(() => {});
  } catch {
    /* sin soporte */
  }
}
