// Pista pseudo-3D: segmentos con curva y altura, construidos desde una definición de datos (TrackDef).
// La simulación solo usa curve, sprites con colisión, checkpoints y pads; el resto es para el render.
import { createRng } from './rng';
import { HAZARD_LENGTH } from './items';

export const SEGMENT_LENGTH = 200;
export const RUMBLE_LENGTH = 3;
export const ROAD_WIDTH = 1500; // medio ancho en unidades de mundo
export const LANES = 3;
export const PAD_LENGTH = 4; // segmentos que cubre un pad de turbo
export const PAD_HALF = 0.3; // medio ancho del pad en unidades de x

// [enter, hold, leave, curve, hill]; hill = null cierra la pista volviendo a la altura 0
export type RoadPiece = [number, number, number, number, number | null];

export interface TrackDef {
  id: string;
  name: string;
  laps: number;
  checkpoints: number; // incluye la línea de meta
  seed: number;
  roads: RoadPiece[];
  boostPads: { segment: number; x: number }[];
  /** Segmentos con una fila de 3 cajas de ítems. */
  itemBoxes: number[];
  /** Obstáculos pintados sobre la pista (aceite, arena, charco). */
  hazards: { segment: number; x: number; kind: number }[];
  /**
   * Mar a un costado (-1 izquierda, 1 derecha) a partir de `shore` (en x). En los puentes hay agua
   * a ambos lados desde `bridgeShore`. Pasar la orilla = caer al agua.
   */
  sea?: { side: number; shore: number; bridges: [number, number][]; bridgeShore: number };
  /** Objetos puntuales sin colisión (faros, etc.). */
  landmarks?: { segment: number; kind: string; offset: number }[];
  decor: DecorDef;
}

/**
 * Reglas de decoración (con semilla). Los objetos marcados como sólidos chocan con los karts,
 * así que cliente y servidor deben generar exactamente lo mismo.
 */
export interface DecorDef {
  /** Objeto principal disperso a los lados (árbol, cactus...) y el secundario (arbusto, planta seca...). */
  primary: string;
  secondary: string;
  primaryRatio: number;
  /** Objetos que reemplazan a los que caerían en el agua (rocas, botes); si no hay, se omiten. */
  sea?: string[];
  /** Tramos densos: bosque, paredes de cañón... (objeto `cluster` a ambos lados). */
  clusters: [number, number][];
  cluster: string;
  /** Objeto suelto cada ~11 segmentos (rocas, ruinas...). */
  scatter: string;
}

export interface ScreenPoint {
  world: { x: number; y: number; z: number };
  camera: { x: number; y: number; z: number };
  screen: { x: number; y: number; w: number; scale: number };
}

export interface RoadsideSprite {
  kind: string;
  offset: number; // posición lateral (-1..1 es la carretera)
  collides: boolean;
}

export interface Segment {
  index: number;
  p1: ScreenPoint;
  p2: ScreenPoint;
  curve: number;
  sprites: RoadsideSprite[];
  pad: number | null; // x central de un pad de turbo
  hazard: { kind: number; x: number; part: number } | null;
  water: number; // 1 = agua a la izquierda, 2 = a la derecha, 3 = ambos (puente)
  shore: number; // x donde empieza el agua
  itemRow: number | null; // índice de fila de cajas que empieza en este segmento
  checkpoint: number | null; // índice de checkpoint que empieza en este segmento
  dark: boolean;
  start: boolean;
  // estado de render
  clip: number;
  fog: number;
  looped: boolean;
}

const point = (z: number, y: number): ScreenPoint => ({
  world: { x: 0, y, z },
  camera: { x: 0, y: 0, z: 0 },
  screen: { x: 0, y: 0, w: 0, scale: 0 },
});

const easeIn = (a: number, b: number, p: number) => a + (b - a) * p * p;
const easeInOut = (a: number, b: number, p: number) => a + (b - a) * (-Math.cos(p * Math.PI) / 2 + 0.5);

export class Track {
  readonly segments: Segment[] = [];
  /** Posición s (en unidades de mundo) de cada checkpoint intermedio; la meta es s = 0. */
  readonly checkpoints: number[] = [];
  /** Posición s de cada fila de cajas de ítems. */
  readonly itemRows: number[] = [];

  constructor(readonly def: TrackDef) {}

  get length(): number {
    return this.segments.length * SEGMENT_LENGTH;
  }

  get laps(): number {
    return this.def.laps;
  }

  findSegment(z: number): Segment {
    const n = this.segments.length;
    return this.segments[((Math.floor(z / SEGMENT_LENGTH) % n) + n) % n];
  }

  lastY(): number {
    return this.segments.length === 0 ? 0 : this.segments[this.segments.length - 1].p2.world.y;
  }

  private addSegment(curve: number, y: number) {
    const n = this.segments.length;
    this.segments.push({
      index: n,
      p1: point(n * SEGMENT_LENGTH, this.lastY()),
      p2: point((n + 1) * SEGMENT_LENGTH, y),
      curve,
      sprites: [],
      pad: null,
      hazard: null,
      water: 0,
      shore: 0,
      itemRow: null,
      checkpoint: null,
      dark: Math.floor(n / RUMBLE_LENGTH) % 2 === 1,
      start: false,
      clip: 0,
      fog: 0,
      looped: false,
    });
  }

  addRoad(enter: number, hold: number, leave: number, curve: number, hill: number) {
    const startY = this.lastY();
    const endY = startY + hill * SEGMENT_LENGTH;
    const total = enter + hold + leave;
    for (let n = 0; n < enter; n++) this.addSegment(easeIn(0, curve, n / enter), easeInOut(startY, endY, n / total));
    for (let n = 0; n < hold; n++) this.addSegment(curve, easeInOut(startY, endY, (enter + n) / total));
    for (let n = 0; n < leave; n++) this.addSegment(easeInOut(curve, 0, n / leave), easeInOut(startY, endY, (enter + hold + n) / total));
  }

  addSprite(index: number, kind: string, offset: number, collides = true) {
    if (index >= 0 && index < this.segments.length) this.segments[index].sprites.push({ kind, offset, collides });
  }
}

export function buildTrack(def: TrackDef): Track {
  const t = new Track(def);
  for (const [enter, hold, leave, curve, hill] of def.roads) {
    t.addRoad(enter, hold, leave, curve, hill ?? -t.lastY() / SEGMENT_LENGTH);
  }
  const n = t.segments.length;

  for (let i = 0; i < 3; i++) t.segments[i].start = true;
  t.addSprite(8, 'banner', 0, false);

  for (let k = 1; k < def.checkpoints; k++) {
    const seg = Math.round((k * n) / def.checkpoints);
    t.segments[seg].checkpoint = k;
    t.checkpoints.push(seg * SEGMENT_LENGTH);
  }

  for (const pad of def.boostPads) {
    for (let i = 0; i < PAD_LENGTH; i++) t.segments[(pad.segment + i) % n].pad = pad.x;
  }
  def.itemBoxes.forEach((seg, row) => {
    t.segments[seg % n].itemRow = row;
    t.itemRows.push((seg % n) * SEGMENT_LENGTH);
  });
  for (const h of def.hazards) {
    for (let i = 0; i < HAZARD_LENGTH; i++) t.segments[(h.segment + i) % n].hazard = { kind: h.kind, x: h.x, part: i };
  }

  // mar y puentes
  if (def.sea) {
    for (const seg of t.segments) {
      seg.water = def.sea.side < 0 ? 1 : 2;
      seg.shore = def.sea.shore;
    }
    for (const [from, to] of def.sea.bridges) {
      for (let i = from; i <= to && i < n; i++) {
        t.segments[i].water = 3;
        t.segments[i].shore = def.sea.bridgeShore;
      }
    }
  }

  // Decoración con semilla: siempre igual en cliente y servidor (los objetos sólidos afectan la física).
  const rnd = createRng(def.seed);
  const d = def.decor;
  /** Coloca un objeto; si caería en el agua lo cambia por uno marino (o lo omite). */
  const place = (i: number, kind: string, offset: number, allowSea: boolean) => {
    const seg = t.segments[i];
    if (!seg) return;
    const sideBit = offset < 0 ? 1 : 2;
    if ((seg.water & sideBit) !== 0 && Math.abs(offset) > seg.shore - 0.2) {
      if (!allowSea || !d.sea || d.sea.length === 0) return;
      t.addSprite(i, d.sea[i % d.sea.length], Math.sign(offset) * (seg.shore + 0.6 + Math.abs(offset) * 0.5), false);
      return;
    }
    t.addSprite(i, kind, offset);
  };
  for (let i = 20; i < n - 10; i += 3 + Math.floor(rnd() * 4)) {
    const side = rnd() < 0.5 ? -1 : 1;
    const kind = rnd() < d.primaryRatio ? d.primary : d.secondary;
    place(i, kind, side * (1.5 + rnd() * 3), true);
  }
  for (const [from, to] of d.clusters) {
    for (let i = from; i < to; i += 2) {
      place(i, d.cluster, -(1.4 + rnd() * 1.5), true);
      place(i, d.cluster, 1.4 + rnd() * 1.5, true);
    }
  }
  // carteles en el lado exterior antes de cada curva, apuntando hacia donde gira
  for (let i = 0; i < n - 90; i++) {
    const ahead = t.segments[i + 80].curve;
    const entering = t.segments[i + 29].curve === 0 && t.segments[i + 30].curve !== 0;
    if (entering && Math.abs(ahead) > 1.5) {
      const dir = ahead > 0 ? 'right' : 'left';
      for (let k = 0; k < 3; k++) place(i + 10 + k * 8, `sign-${dir}`, ahead > 0 ? -1.25 : 1.25, false);
    }
  }
  for (let i = 30; i < n; i += 11) {
    if (rnd() < 0.5) {
      const sign = rnd() < 0.5 ? -1 : 1;
      place(i, d.scatter, sign * (1.3 + rnd() * 2), true);
    }
  }
  for (const lm of def.landmarks ?? []) t.addSprite(lm.segment % n, lm.kind, lm.offset, false);
  return t;
}
