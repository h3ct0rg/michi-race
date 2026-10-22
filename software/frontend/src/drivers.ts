// Pilotos (gatos) disponibles. Cada uno tiene sus frames en /assets/<id>/ con los mismos nombres
// (8 direcciones, 3 traseras y perfil). El color del kart se aplica igual a todos (cambio de tono).
export const DRIVERS = ['michi', 'ragdoll'] as const;
export type DriverId = (typeof DRIVERS)[number];
export const DEFAULT_DRIVER: DriverId = 'michi';

export const isDriver = (v: unknown): v is DriverId => DRIVERS.includes(v as DriverId);
export const driverBase = (id: DriverId) => `/assets/${id}`;
/** Pilotos con pelaje café/crema: el color del kart no debe teñirlos. */
export const keepsWarmFur = (id: DriverId) => id === 'ragdoll';
