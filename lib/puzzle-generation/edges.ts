import { hashCoords } from '@/lib/puzzle-generation/prng';
import type { Edge, EdgeGrid, PieceEdges } from '@/types/puzzle';

/**
 * Rejilla de bordes de un rompecabezas.
 *
 * **Por qué una rejilla de bordes y no una forma por pieza.** Dos piezas vecinas comparten un
 * borde. Si cada una calculase el suyo, tendrían que salir exactamente complementarias, y
 * cualquier asimetría dejaría un hueco o un solape visible entre ellas. Aquí cada borde interior
 * se genera **una sola vez** y lo leen las dos piezas desde lados opuestos: la complementariedad
 * es estructural, no una propiedad que haya que mantener.
 *
 * Todo sale de `seed`, que a su vez sale del UUID del rompecabezas. Mismo UUID ⇒ mismas formas
 * en cualquier navegador (contracts/piece-generation.md).
 */

const STRAIGHT: Edge = { straight: true, sign: 0, offset: 0, size: 0 };

/** Ejes, como número, para que `hashCoords` distinga un borde horizontal de uno vertical. */
const AXIS_HORIZONTAL = 0;
const AXIS_VERTICAL = 1;

/**
 * Construye un borde interior a partir de su posición.
 *
 * Los parámetros se derivan del hash por aritmética entera: nada de `Math.random`, y ninguna
 * decisión depende del resultado de una operación en coma flotante.
 */
function interiorEdge(seed: number, row: number, col: number, axis: number): Edge {
  const hash = hashCoords(seed, row, col, axis);

  return {
    straight: false,
    // Bit menos significativo: hacia qué lado sobresale la lengüeta.
    sign: (hash & 1) === 0 ? 1 : -1,
    // Desplazamiento del centro de la lengüeta: ±6 % del lado, en 16 pasos discretos.
    offset: (((hash >>> 1) & 0x0f) - 7.5) / 125,
    // Tamaño de la lengüeta: entre el 17 % y el 24 % del lado, en 8 pasos.
    size: 0.17 + (((hash >>> 5) & 0x07) * 0.01),
  };
}

export function buildEdgeGrid(seed: number, rows: number, cols: number): EdgeGrid {
  if (rows < 1 || cols < 1) {
    throw new RangeError('La cuadrícula necesita al menos una fila y una columna');
  }

  // horizontal[r][c] = borde superior de la celda (r, c). La fila 0 y la fila `rows` son el
  // perímetro y van rectas.
  const horizontal: Edge[][] = [];
  for (let row = 0; row <= rows; row++) {
    const line: Edge[] = [];
    for (let col = 0; col < cols; col++) {
      line.push(row === 0 || row === rows ? STRAIGHT : interiorEdge(seed, row, col, AXIS_HORIZONTAL));
    }
    horizontal.push(line);
  }

  // vertical[r][c] = borde izquierdo de la celda (r, c). La columna 0 y la columna `cols` son
  // el perímetro.
  const vertical: Edge[][] = [];
  for (let row = 0; row < rows; row++) {
    const line: Edge[] = [];
    for (let col = 0; col <= cols; col++) {
      line.push(col === 0 || col === cols ? STRAIGHT : interiorEdge(seed, row, col, AXIS_VERTICAL));
    }
    vertical.push(line);
  }

  return { horizontal, vertical, rows, cols };
}

/**
 * Los cuatro bordes de una pieza.
 *
 * El borde derecho de `(r, c)` y el izquierdo de `(r, c+1)` son **el mismo objeto** de la
 * rejilla, leído desde lados opuestos. Al trazar, uno lo recorre en un sentido y el otro en el
 * contrario, y por eso encajan exactamente.
 */
export function pieceEdges(grid: EdgeGrid, row: number, col: number): PieceEdges {
  if (row < 0 || row >= grid.rows || col < 0 || col >= grid.cols) {
    throw new RangeError(`La celda (${row}, ${col}) está fuera de la cuadrícula`);
  }

  return {
    top: grid.horizontal[row]![col]!,
    bottom: grid.horizontal[row + 1]![col]!,
    left: grid.vertical[row]![col]!,
    right: grid.vertical[row]![col + 1]!,
  };
}
