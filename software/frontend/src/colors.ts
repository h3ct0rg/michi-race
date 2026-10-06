// Colores de kart: el mismo michi con el tono de los píxeles saturados desplazado (el pelaje queda blanco).
// El servidor solo guarda el índice (0..7).
const BASE_HUE = 188; // tono del cian original del kart

export const KART_COLORS = [
  { name: 'Hielo', shift: 0 },
  { name: 'Chicle', shift: 140 },
  { name: 'Lima', shift: -120 },
  { name: 'Oro', shift: 200 },
  { name: 'Menta', shift: -60 },
  { name: 'Fuego', shift: 170 },
  { name: 'Uva', shift: 100 },
  { name: 'Índigo', shift: 60 },
] as const;

export const swatch = (index: number) => `hsl(${(BASE_HUE + KART_COLORS[index].shift + 360) % 360}deg 90% 55%)`;
