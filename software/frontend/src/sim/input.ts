// Lo único que el cliente enviará al servidor (mensaje INPUT).
export interface Input {
  steer: number; // -1 (izquierda) .. 1 (derecha), analógico
  throttle: boolean;
  brake: boolean;
  drift: boolean;
  /** Usar el ítem (se dispara en el flanco: al presionar). */
  useItem: boolean;
}

export const NO_INPUT: Input = { steer: 0, throttle: false, brake: false, drift: false, useItem: false };
