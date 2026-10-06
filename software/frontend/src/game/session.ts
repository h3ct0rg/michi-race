import type { Racer } from '../sim/physics';
import type { Race, RaceEvent } from '../sim/race';

/** Una carrera en curso, local u online. La vista solo necesita esto para dibujar y mostrar el HUD. */
export interface RaceSession {
  readonly race: Race;
  /** Kart que sigue la cámara (el propio, o el líder si se es espectador). */
  readonly player: Racer;
  /** Avanza la sesión y devuelve alpha (0..1) para interpolar entre ticks. */
  update(dt: number): number;
  /** Avance de la simulación sin dibujar (lo llama un temporizador aunque la pestaña esté en segundo plano). */
  pump?(): void;
  /** Desplazamiento visual (corrección suave tras reconciliar) a sumar al dibujar un kart. */
  viewOffset?(r: Racer): { d: number; x: number } | null;
  /** Nombres a mostrar sobre los karts (pilotos humanos). */
  readonly labels?: Map<string, string>;
  /** Texto para la línea de red del HUD y el panel de diagnóstico. */
  netInfo?(): string;
  stats?(): Record<string, string | number>;
  /** Eventos ocurridos desde la última llamada. */
  drainEvents(): RaceEvent[];
  dispose(): void;
}
