import type { Piece } from '@/types/board';

/**
 * Grupos de piezas conectadas (FR-017, FR-018).
 *
 * Representación: una columna `group_id` (research R6). Una pieza suelta es un grupo de un
 * solo elemento con `groupId === id`. Fusionar es reasignar el `groupId` del grupo perdedor.
 *
 * Funciones puras: son la contraparte en TypeScript de lo que hace `release_piece` en SQL, y
 * lo que permite probar la lógica de fusión sin infraestructura.
 */

/** Piezas que pertenecen a un grupo. */
export function piecesInGroup(pieces: readonly Piece[], groupId: string): Piece[] {
  return pieces.filter((piece) => piece.groupId === groupId);
}

/** Identificadores de todos los grupos presentes. */
export function groupIds(pieces: readonly Piece[]): string[] {
  return [...new Set(pieces.map((piece) => piece.groupId))];
}

/**
 * Fusiona `loserGroupId` dentro de `winnerGroupId`, desplazando las piezas absorbidas.
 *
 * El desplazamiento se aplica a las piezas del grupo perdedor para alinearlas exactamente; las
 * del ganador no se mueven. Así el grupo que ya estaba colocado se queda donde está y es el
 * recién soltado el que se ajusta, que es lo que el jugador espera ver.
 *
 * Fusionar un grupo consigo mismo es un no-op: la operación es idempotente.
 */
export function mergeGroups(
  pieces: readonly Piece[],
  winnerGroupId: string,
  loserGroupId: string,
  dx = 0,
  dy = 0,
): Piece[] {
  if (winnerGroupId === loserGroupId) return [...pieces];

  return pieces.map((piece) =>
    piece.groupId === loserGroupId
      ? { ...piece, groupId: winnerGroupId, x: piece.x + dx, y: piece.y + dy }
      : piece,
  );
}

/** Desplaza todas las piezas de un grupo, conservando sus posiciones relativas. */
export function translateGroup(
  pieces: readonly Piece[],
  groupId: string,
  dx: number,
  dy: number,
): Piece[] {
  return pieces.map((piece) =>
    piece.groupId === groupId ? { ...piece, x: piece.x + dx, y: piece.y + dy } : piece,
  );
}

/**
 * ¿Están todas las piezas en un único grupo?
 *
 * Es la condición de rompecabezas completado (**FR-027**). Un tablero vacío no cuenta como
 * completado.
 */
export function isSingleGroup(pieces: readonly Piece[]): boolean {
  if (pieces.length === 0) return false;
  const first = pieces[0]!.groupId;
  return pieces.every((piece) => piece.groupId === first);
}

/**
 * Pieza ancla de un grupo: la de menor fila y, a igualdad, menor columna.
 *
 * Se usa para calcular desplazamientos relativos de forma determinista. Elegir la ancla por
 * orden de llegada haría que dos clientes calcularan desplazamientos distintos.
 */
export function groupAnchor(pieces: readonly Piece[], groupId: string): Piece | null {
  const members = piecesInGroup(pieces, groupId);
  if (members.length === 0) return null;

  return members.reduce((best, piece) => {
    if (piece.gridRow < best.gridRow) return piece;
    if (piece.gridRow === best.gridRow && piece.gridCol < best.gridCol) return piece;
    return best;
  }, members[0]!);
}
