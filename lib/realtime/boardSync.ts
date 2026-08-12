import type { Piece } from '@/types/board';

/**
 * Precedencia entre la pista visual y el hecho confirmado (research R4, FR-021, FR-025).
 *
 * Dos fuentes alimentan el tablero:
 *
 *   - CONFIRMADA — `GET /state` y Postgres Changes. Es la verdad.
 *   - PROVISIONAL — broadcast `piece_drag` de otro jugador. Es una pista visual para que el
 *     movimiento se vea fluido sin escribir en la base de datos 20 veces por segundo.
 *
 * La regla es una sola línea: **un hecho confirmado descarta la pista provisional de ese
 * grupo**. Eso es lo que hace que un broadcast perdido, duplicado o desordenado sea inofensivo,
 * y por qué no hace falta lógica de deduplicación en ninguna parte.
 *
 * Lógica pura, sin dependencias de Supabase ni del DOM: es la pieza de sincronización que el
 * Principio VI exige poder probar sin infraestructura.
 */

export interface ProvisionalOffset {
  x: number;
  y: number;
}

export interface BoardSyncState {
  /** Estado confirmado, indexado por id de pieza. */
  confirmed: Map<string, Piece>;
  /** Desplazamiento provisional por grupo, aplicado solo al pintar. */
  provisional: Map<string, ProvisionalOffset>;
}

/**
 * Estado inicial, y también el reemplazo completo tras `GET /state`.
 *
 * Reemplazar en vez de fusionar es deliberado: durante una desconexión se perdieron eventos y
 * no hay forma de reproducirlos, así que parchear un diff partiría de una base que puede estar
 * mal (FR-023). Es idempotente por construcción.
 */
export function createBoardSync(pieces: readonly Piece[] = []): BoardSyncState {
  return {
    confirmed: new Map(pieces.map((piece) => [piece.id, piece])),
    provisional: new Map(),
  };
}

/** Aplica un cambio confirmado de una pieza y descarta la pista provisional de su grupo. */
export function applyConfirmedPiece(state: BoardSyncState, piece: Piece): BoardSyncState {
  const confirmed = new Map(state.confirmed);
  confirmed.set(piece.id, piece);

  const provisional = new Map(state.provisional);
  provisional.delete(piece.groupId);

  // El grupo puede haber cambiado con una fusión: la pista del grupo anterior también sobra.
  const previous = state.confirmed.get(piece.id);
  if (previous && previous.groupId !== piece.groupId) {
    provisional.delete(previous.groupId);
  }

  return { confirmed, provisional };
}

/**
 * Registra la posición provisional de un grupo que otro jugador está arrastrando.
 *
 * Se ignora si el grupo no existe en el estado confirmado: un broadcast sobre algo que no
 * conocemos es basura o llega de una sala que ya no es la nuestra.
 */
export function applyProvisionalDrag(
  state: BoardSyncState,
  groupId: string,
  offset: ProvisionalOffset,
): BoardSyncState {
  const groupExists = [...state.confirmed.values()].some((piece) => piece.groupId === groupId);
  if (!groupExists) return state;

  const provisional = new Map(state.provisional);
  provisional.set(groupId, offset);
  return { confirmed: state.confirmed, provisional };
}

/** Descarta la pista provisional de un grupo: llega `piece_drop` o se confirmó el movimiento. */
export function clearProvisional(state: BoardSyncState, groupId: string): BoardSyncState {
  if (!state.provisional.has(groupId)) return state;
  const provisional = new Map(state.provisional);
  provisional.delete(groupId);
  return { confirmed: state.confirmed, provisional };
}

/**
 * Piezas tal como deben pintarse: lo confirmado, más el desplazamiento provisional de su grupo.
 *
 * **No hay ancla que buscar.** El provisional es un desplazamiento, así que se suma tal cual a
 * cada pieza del grupo y todas se mueven lo mismo conservando su posición relativa. La versión
 * anterior guardaba una posición absoluta y tenía que adivinar de qué pieza era: elegía el ancla
 * —la de menor fila y columna— mientras el emisor mandaba la pieza agarrada, y de ahí salía el
 * salto al arrastrar un bloque por cualquier otra pieza.
 */
export function renderPieces(state: BoardSyncState): Piece[] {
  const pieces = [...state.confirmed.values()];
  if (state.provisional.size === 0) return pieces;

  return pieces.map((piece) => {
    const offset = state.provisional.get(piece.groupId);
    if (!offset) return piece;
    return { ...piece, x: piece.x + offset.x, y: piece.y + offset.y };
  });
}
