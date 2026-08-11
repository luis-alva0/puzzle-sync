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
 * Tolerancia de encaje, como fracción del lado de la pieza.
 *
 * Este valor DEBE coincidir con el de la función `release_piece` en la base de datos. Cliente
 * y servidor tienen que estar de acuerdo en qué se considera un encaje, o el jugador vería
 * piezas que "casi" encajan y no lo hacen.
 */
export const SNAP_TOLERANCE_FRACTION = 0.25;

/** Tolerancia de encaje en unidades de tablero. */
export const SNAP_TOLERANCE = PIECE_SIZE * SNAP_TOLERANCE_FRACTION;

export interface Point {
  x: number;
  y: number;
}

/**
 * Posición de la pieza (fila, columna) dentro del rompecabezas resuelto.
 *
 * Es un desplazamiento **relativo al origen del rompecabezas**, no un punto fijo del tablero: el
 * rompecabezas se puede armar en cualquier sitio, porque `release_piece` compara la separación
 * entre dos vecinas y no la distancia de cada pieza a una posición absoluta.
 */
export function correctPosition(gridRow: number, gridCol: number): Point {
  return { x: gridCol * PIECE_SIZE, y: gridRow * PIECE_SIZE };
}

/** Dimensiones del rompecabezas resuelto, en unidades de tablero. */
export function solvedSize(gridRows: number, gridCols: number): { width: number; height: number } {
  return { width: gridCols * PIECE_SIZE, height: gridRows * PIECE_SIZE };
}
