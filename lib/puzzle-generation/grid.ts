import type { GridDimensions } from '@/types/puzzle';

/**
 * Elección de la cuadrícula a partir de la cantidad objetivo y la forma del recorte
 * (research R4).
 *
 * La cantidad elegida por el jugador es un **objetivo**, no un número exacto: una cuadrícula
 * rectangular no puede dar 50 piezas con una relación de aspecto arbitraria sin deformarlas, y
 * piezas muy alargadas se ven mal y encajan peor.
 *
 * Función pura y determinista. Es **crítico** que servidor y cliente obtengan lo mismo: el
 * servidor la guarda y el cliente muestra la cantidad real antes de confirmar (FR-019).
 */

/** Ninguna dimensión baja de aquí: una cuadrícula de 1×N sería un rompecabezas inservible. */
const MIN_SIDE = 2;

/**
 * Cuánto pesa la distorsión de la pieza frente a la desviación del total.
 *
 * Con un peso alto, el algoritmo prefiere piezas cuadradas aunque el total se aleje del
 * objetivo. Es lo que impide que 500 piezas sobre una foto panorámica acaben en 1×500.
 */
const ASPECT_PENALTY_WEIGHT = 3;

export function chooseGrid(
  targetPieces: number,
  cropWidth: number,
  cropHeight: number,
): GridDimensions {
  if (!(cropWidth > 0) || !(cropHeight > 0)) {
    throw new RangeError('Las dimensiones del recorte deben ser positivas');
  }

  let best: GridDimensions = { rows: MIN_SIDE, cols: MIN_SIDE };
  let bestScore = Number.POSITIVE_INFINITY;

  // El recorrido va sobre `rows`; `cols` se deriva. El límite superior es generoso: con 500
  // piezas y un recorte muy alto, `rows` puede pasar de 30.
  const maxSide = Math.max(MIN_SIDE, Math.ceil(Math.sqrt(targetPieces) * 4));

  for (let rows = MIN_SIDE; rows <= maxSide; rows++) {
    // Las dos columnas que rodean la proporción ideal para esta cantidad de filas.
    const idealCols = targetPieces / rows;
    for (const cols of [Math.floor(idealCols), Math.ceil(idealCols)]) {
      if (cols < MIN_SIDE) continue;

      const total = rows * cols;
      // Desviación relativa respecto del objetivo.
      const countError = Math.abs(total - targetPieces) / targetPieces;

      // Cuánto se aleja la pieza de ser cuadrada, medido en escala logarítmica para que
      // 2:1 y 1:2 penalicen igual.
      const pieceAspect = cropWidth / cols / (cropHeight / rows);
      const aspectError = Math.abs(Math.log(pieceAspect));

      const score = countError + ASPECT_PENALTY_WEIGHT * aspectError;

      // El desempate por menos filas hace el resultado determinista ante puntuaciones iguales.
      if (score < bestScore - 1e-12) {
        bestScore = score;
        best = { rows, cols };
      }
    }
  }

  return best;
}

/** Cantidad real de piezas de una cuadrícula. Puede diferir de la nominal. */
export function actualPieceCount(grid: GridDimensions): number {
  return grid.rows * grid.cols;
}
