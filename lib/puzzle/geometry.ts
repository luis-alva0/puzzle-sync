/**
 * Geometría de la cuadrícula del rompecabezas. Funciones puras, sin acceso a Supabase.
 *
 * Todo se expresa en "unidades de tablero", no en píxeles: el canvas aplica su propia escala
 * al pintar. Así el estado autoritativo no depende del tamaño de ventana de ningún jugador.
 *
 * El reparto inicial de las piezas **no vive aquí**: está en `lib/puzzle/board-layout.ts`, que
 * también decide el tamaño del tablero. Este módulo solo describe la cuadrícula resuelta.
 */

/** Lado de una pieza en unidades de tablero. */
export const PIECE_SIZE = 100;

/**
 * Tolerancia de encaje, en unidades de tablero.
 *
 * DEBE coincidir con `snap_tolerance()` en la base de datos. Cliente y servidor tienen que estar
 * de acuerdo en qué se considera un encaje, o el jugador vería piezas que "casi" encajan y no lo
 * hacen.
 */
export const SNAP_TOLERANCE = PIECE_SIZE * 0.25;

/** Dimensiones del rompecabezas resuelto, en unidades de tablero. */
export function solvedSize(gridRows: number, gridCols: number): { width: number; height: number } {
  return { width: gridCols * PIECE_SIZE, height: gridRows * PIECE_SIZE };
}
