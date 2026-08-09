import { SNAP_TOLERANCE, areAdjacent, correctOffset } from '@/lib/puzzle/geometry';
import type { Piece } from '@/types/board';

/**
 * Detección de encaje entre piezas adyacentes (FR-016).
 *
 * Función pura sin acceso a Supabase: es una de las dos piezas de lógica crítica que el
 * Principio VI obliga a cubrir con pruebas.
 *
 * Regla: dos piezas encajan si son vecinas ORTOGONALES en la cuadrícula y la diferencia entre
 * su posición real y su posición relativa correcta cabe dentro de la tolerancia. Las diagonales
 * no encajan: en un rompecabezas de cuadrícula, una pieza solo se conecta por sus cuatro lados.
 */

export interface SnapTarget {
  /** Grupo con el que encaja el grupo que se suelta. */
  targetGroupId: string;
  /** Pieza del grupo que se mueve implicada en el encaje. */
  movingPieceId: string;
  /** Pieza estática con la que encaja. */
  anchorPieceId: string;
  /** Desplazamiento a aplicar al grupo que se mueve para alinearlo exactamente. */
  dx: number;
  dy: number;
  /** Distancia al encaje perfecto. Sirve para elegir el mejor cuando hay varios candidatos. */
  distance: number;
}

/**
 * Busca el mejor encaje para el grupo al que pertenece `pieceId`.
 *
 * Devuelve `null` si no hay ninguno, en cuyo caso la pieza se queda donde la soltaron
 * (**FR-019**).
 *
 * Cuando hay varios candidatos —habitual al colocar una pieza en un hueco rodeado— gana el
 * más cercano al encaje perfecto. Elegir el primero encontrado haría que el resultado
 * dependiera del orden de las piezas, y dos clientes podrían alinear distinto.
 */
export function findSnapTarget(
  pieceId: string,
  pieces: readonly Piece[],
  tolerance: number = SNAP_TOLERANCE,
): SnapTarget | null {
  const moving = pieces.find((piece) => piece.id === pieceId);
  if (!moving) return null;

  const movingGroup = pieces.filter((piece) => piece.groupId === moving.groupId);
  const others = pieces.filter((piece) => piece.groupId !== moving.groupId);

  let best: SnapTarget | null = null;

  for (const candidate of movingGroup) {
    for (const anchor of others) {
      if (!areAdjacent(candidate.gridRow, candidate.gridCol, anchor.gridRow, anchor.gridCol)) {
        continue;
      }

      // Dónde debería estar la pieza que se mueve para encajar con esta vecina.
      const offset = correctOffset(
        anchor.gridRow,
        anchor.gridCol,
        candidate.gridRow,
        candidate.gridCol,
      );
      const targetX = anchor.x + offset.x;
      const targetY = anchor.y + offset.y;

      const dx = targetX - candidate.x;
      const dy = targetY - candidate.y;

      if (Math.abs(dx) > tolerance || Math.abs(dy) > tolerance) continue;

      const distance = Math.hypot(dx, dy);
      if (!best || distance < best.distance) {
        best = {
          targetGroupId: anchor.groupId,
          movingPieceId: candidate.id,
          anchorPieceId: anchor.id,
          // El desplazamiento corrige la posición del grupo entero, no solo de esta pieza.
          dx,
          dy,
          distance,
        };
      }
    }
  }

  return best;
}

/**
 * Todos los encajes disponibles tras aplicar uno, para la fusión en cascada.
 *
 * Al conectar dos grupos, el resultado puede quedar tocando a un tercero. Se repite hasta que
 * no queda ninguno, con un tope de iteraciones para que un estado inconsistente no cuelgue el
 * bucle.
 */
export function findSnapChain(
  pieceId: string,
  pieces: readonly Piece[],
  tolerance: number = SNAP_TOLERANCE,
  maxIterations = 64,
): SnapTarget[] {
  const chain: SnapTarget[] = [];
  let current = [...pieces];

  for (let iteration = 0; iteration < maxIterations; iteration++) {
    const snap = findSnapTarget(pieceId, current, tolerance);
    if (!snap) break;

    chain.push(snap);

    const moving = current.find((piece) => piece.id === pieceId);
    if (!moving) break;
    const movingGroupId = moving.groupId;

    current = current.map((piece) =>
      piece.groupId === movingGroupId
        ? { ...piece, x: piece.x + snap.dx, y: piece.y + snap.dy, groupId: snap.targetGroupId }
        : piece,
    );
  }

  return chain;
}
