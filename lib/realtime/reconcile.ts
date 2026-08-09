import { createBoardSync, type BoardSyncState } from '@/lib/realtime/boardSync';
import type { Piece } from '@/types/board';

/**
 * Reconciliación del tablero al reconectar (FR-023, SC-004).
 *
 * La estrategia es **reemplazo total**, no fusión de diferencias. Durante una desconexión se
 * perdieron eventos de Postgres Changes y no hay forma de reproducirlos: cualquier intento de
 * parchear un diff partiría de una base que puede estar mal, y el error sería silencioso.
 *
 * Reemplazar es además idempotente por construcción: aplicar dos veces la misma respuesta de
 * `GET /state` produce exactamente el mismo estado (**FR-025**).
 *
 * Lógica pura, sin Supabase ni DOM: es la pieza de sincronización que el Principio VI exige
 * poder probar sin infraestructura.
 */

export interface Divergence {
  /** Piezas que el servidor tiene y el cliente no. */
  missingLocally: string[];
  /** Piezas que el cliente tiene y el servidor ya no. */
  staleLocally: string[];
  /** Piezas cuya posición, grupo o captura difieren. */
  changed: string[];
}

/** Tolerancia al comparar posiciones: son `real` en Postgres, no dobles exactos. */
const POSITION_EPSILON = 0.01;

/**
 * Estado tras reconectar: lo que diga el servidor, y nada más.
 *
 * Todo lo provisional se descarta —era una suposición sobre un estado que ya no rige— y
 * cualquier arrastre local sin confirmar se pierde a propósito: si el servidor no lo registró,
 * no ocurrió.
 */
export function reconcileAfterReconnect(
  _local: BoardSyncState,
  serverPieces: readonly Piece[],
): BoardSyncState {
  return createBoardSync(serverPieces);
}

/** ¿Son la misma pieza en el mismo sitio y el mismo estado? */
function samePiece(a: Piece, b: Piece): boolean {
  return (
    Math.abs(a.x - b.x) < POSITION_EPSILON &&
    Math.abs(a.y - b.y) < POSITION_EPSILON &&
    a.groupId === b.groupId &&
    a.capturedBy === b.capturedBy
  );
}

/**
 * Compara el estado local con el del servidor.
 *
 * No se usa para decidir nada —el reemplazo es incondicional— sino para diagnóstico: si esto
 * devuelve diferencias grandes de forma habitual, algo va mal en la propagación de eventos.
 */
export function findDivergence(
  local: BoardSyncState,
  serverPieces: readonly Piece[],
): Divergence {
  const serverById = new Map(serverPieces.map((piece) => [piece.id, piece]));

  const missingLocally: string[] = [];
  const changed: string[] = [];

  for (const [id, serverPiece] of serverById) {
    const localPiece = local.confirmed.get(id);
    if (!localPiece) {
      missingLocally.push(id);
    } else if (!samePiece(localPiece, serverPiece)) {
      changed.push(id);
    }
  }

  const staleLocally = [...local.confirmed.keys()].filter((id) => !serverById.has(id));

  return { missingLocally, staleLocally, changed };
}

/** ¿Coinciden por completo el estado local y el del servidor? Convergencia de SC-008. */
export function hasConverged(local: BoardSyncState, serverPieces: readonly Piece[]): boolean {
  const divergence = findDivergence(local, serverPieces);
  return (
    divergence.missingLocally.length === 0 &&
    divergence.staleLocally.length === 0 &&
    divergence.changed.length === 0
  );
}
