// Reloj sincronizado con el servidor, estimado a partir de los ticks que traen los snapshots.
import { TICK_RATE } from '../sim/vehicles';

const msToTicks = (ms: number) => (ms * TICK_RATE) / 1000;

export class ServerClock {
  /** serverTick - localTick en la llegada más rápida observada (≈ tick del servidor menos el retraso mínimo). */
  private offset = NaN;
  /** Variación de llegada de los snapshots, en ticks. */
  jitter = 0;

  get synced() {
    return !Number.isNaN(this.offset);
  }

  onSnapshot(tick: number, now = performance.now()) {
    const sample = tick - msToTicks(now);
    if (Number.isNaN(this.offset)) {
      this.offset = sample;
      return;
    }
    // las llegadas tempranas corrigen rápido; las tardías (jitter) casi no mueven el reloj
    const diff = sample - this.offset;
    this.offset += diff > 0 ? diff * 0.5 : diff * 0.01;
    this.jitter = this.jitter * 0.95 + Math.abs(diff) * 0.05;
  }

  /** Tick más nuevo que debería haber llegado ya (≈ servidor - retraso de ida). */
  latestTick(now = performance.now()) {
    return msToTicks(now) + this.offset;
  }

  /**
   * Tick para el que el cliente debe simular su kart ahora: sus inputs viajan medio RTT más y llegan
   * justo cuando el servidor los necesita (+1 tick de margen). Así todos largan a la vez, sin importar el ping.
   */
  inputTick(rttMs: number, now = performance.now()) {
    return this.latestTick(now) + msToTicks(rttMs) + 1;
  }

  /** Retraso de interpolación para los rivales: cubre el hueco entre snapshots (20 Hz) y el jitter. */
  interpDelay() {
    return Math.min(8, Math.max(2.5, 2 + this.jitter * 2.5));
  }
}
