/**
 * Geometría de la cuadrícula del rompecabezas. Funciones puras, sin acceso a Supabase.
 *
 * Todo se expresa en "unidades de tablero", no en píxeles: el canvas aplica su propia escala
 * al pintar. Así el estado autoritativo no depende del tamaño de ventana de ningún jugador.
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

/** Margen alrededor del área resuelta donde se dispersan las piezas al crear la sala. */
export const SCATTER_MARGIN = PIECE_SIZE * 2;

export interface Point {
  x: number;
  y: number;
}

/** Posición correcta —la del rompecabezas resuelto— de la pieza en (fila, columna). */
export function correctPosition(gridRow: number, gridCol: number): Point {
  return { x: gridCol * PIECE_SIZE, y: gridRow * PIECE_SIZE };
}

/** Dimensiones del rompecabezas resuelto, en unidades de tablero. */
export function solvedSize(gridRows: number, gridCols: number): { width: number; height: number } {
  return { width: gridCols * PIECE_SIZE, height: gridRows * PIECE_SIZE };
}

/**
 * Generador congruencial lineal, determinista a partir de una semilla.
 *
 * Se usa para dispersar las piezas al crear la sala. Determinista para que la dispersión sea
 * reproducible en los tests; no tiene ninguna pretensión criptográfica.
 */
function createSeededRandom(seed: number): () => number {
  let state = seed >>> 0 || 1;
  return () => {
    // Constantes de Numerical Recipes.
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

export interface ScatteredPiece {
  gridRow: number;
  gridCol: number;
  x: number;
  y: number;
}

/**
 * Posiciones iniciales de todas las piezas, dispersas alrededor del área resuelta.
 *
 * Se garantiza que ninguna pieza empieza en su posición correcta ni encajada con su vecina:
 * un rompecabezas que arranca parcialmente resuelto sería un fallo visible.
 */
export function scatterPieces(gridRows: number, gridCols: number, seed = 1): ScatteredPiece[] {
  const random = createSeededRandom(seed);
  const { width, height } = solvedSize(gridRows, gridCols);
  const spreadX = width + SCATTER_MARGIN * 2;
  const spreadY = height + SCATTER_MARGIN * 2;

  const pieces: ScatteredPiece[] = [];
  for (let gridRow = 0; gridRow < gridRows; gridRow++) {
    for (let gridCol = 0; gridCol < gridCols; gridCol++) {
      const correct = correctPosition(gridRow, gridCol);
      let x = 0;
      let y = 0;
      // Reintentar mientras la posición aleatoria caiga dentro de la tolerancia de encaje
      // respecto de la posición correcta. Con un área de dispersión mucho mayor que la
      // tolerancia, esto converge de inmediato.
      for (let attempt = 0; attempt < 20; attempt++) {
        x = random() * spreadX - SCATTER_MARGIN;
        y = random() * spreadY - SCATTER_MARGIN;
        if (Math.abs(x - correct.x) > SNAP_TOLERANCE || Math.abs(y - correct.y) > SNAP_TOLERANCE) {
          break;
        }
      }
      pieces.push({ gridRow, gridCol, x, y });
    }
  }
  return pieces;
}
