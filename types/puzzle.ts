/**
 * Tipos de la creación de rompecabezas y de la generación determinista de formas.
 * Ver specs/002-crear-rompecabezas-desde-foto/contracts/piece-generation.md
 */

/** Las cinco cantidades que puede elegir el jugador (FR-017). No hay valores libres. */
export const PIECE_COUNT_OPTIONS = [20, 50, 100, 200, 500] as const;

export type PieceCountOption = (typeof PIECE_COUNT_OPTIONS)[number];

export function isPieceCountOption(value: unknown): value is PieceCountOption {
  return PIECE_COUNT_OPTIONS.includes(value as PieceCountOption);
}

export type PuzzleVisibility = 'private' | 'public';
export type PuzzleSource = 'seed' | 'user_photo' | 'curated';

/** Formatos admitidos, determinados por los números mágicos y no por la extensión. */
export type ImageFormat = 'jpeg' | 'png';

export interface GridDimensions {
  rows: number;
  cols: number;
}

/**
 * Un borde entre dos celdas de la cuadrícula.
 *
 * Los bordes interiores se generan **una sola vez** y los leen las dos piezas que los comparten:
 * la complementariedad es estructural, no una coincidencia entre dos cálculos.
 */
export interface Edge {
  /** Borde del perímetro: recto, sin lengüeta. */
  straight: boolean;
  /** Hacia qué lado sobresale la lengüeta. `0` si el borde es recto. */
  sign: -1 | 0 | 1;
  /** Desplazamiento del centro de la lengüeta, en fracción del lado de la pieza. */
  offset: number;
  /** Tamaño de la lengüeta, en fracción del lado de la pieza. */
  size: number;
}

export interface EdgeGrid {
  /** `(rows + 1) × cols`. `horizontal[r][c]` es el borde superior de la celda (r, c). */
  horizontal: Edge[][];
  /** `rows × (cols + 1)`. `vertical[r][c]` es el borde izquierdo de la celda (r, c). */
  vertical: Edge[][];
  rows: number;
  cols: number;
}

/** Los cuatro bordes de una pieza, orientados desde su punto de vista. */
export interface PieceEdges {
  top: Edge;
  right: Edge;
  bottom: Edge;
  left: Edge;
}
