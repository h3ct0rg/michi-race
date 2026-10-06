// Simulador de red para desarrollo: agrega latencia, jitter y cortes a los mensajes en tiempo real.
// Uso: http://localhost:5173/?lag=150&jitter=30&spike=0.01   (lag = RTT en ms)
// Como SignalR va sobre TCP, el orden se conserva: un mensaje demorado retrasa a los que vienen detrás.

export interface NetSimConfig {
  lag: number; // RTT agregado en ms (se reparte mitad ida, mitad vuelta)
  jitter: number; // variación máxima en ms por mensaje
  spike: number; // probabilidad por mensaje de un corte de ~300 ms (pérdida + retransmisión TCP)
}

export function readNetSim(): NetSimConfig | null {
  const q = new URLSearchParams(location.search);
  const lag = Number(q.get('lag') ?? 0);
  const jitter = Number(q.get('jitter') ?? 0);
  const spike = Number(q.get('spike') ?? 0);
  return lag > 0 || jitter > 0 || spike > 0 ? { lag, jitter, spike } : null;
}

/** Cola con retraso que preserva el orden (como TCP). */
export class DelayLine {
  private lastAt = 0;

  constructor(private readonly cfg: NetSimConfig) {}

  push(fn: () => void) {
    const { lag, jitter, spike } = this.cfg;
    let at = performance.now() + lag / 2 + Math.random() * jitter;
    if (Math.random() < spike) at += 300;
    at = Math.max(at, this.lastAt);
    this.lastAt = at;
    setTimeout(fn, at - performance.now());
  }
}
