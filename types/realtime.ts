/**
 * Contratos del canal de Realtime.
 * Ver specs/001-sala-armado-colaborativo/contracts/realtime-channel.md
 *
 * Separación clave (research R4): el broadcast es una PISTA VISUAL sin autoridad; los cambios
 * confirmados llegan por Postgres Changes. Un broadcast perdido, duplicado o desordenado no
 * puede corromper el tablero, porque el siguiente hecho confirmado lo sobrescribe.
 */

/** Nombre del canal de una sala. Debe coincidir con la política RLS sobre realtime.messages. */
export function roomChannelName(roomCode: string): string {
  return `room:${roomCode}`;
}

export const REALTIME_EVENTS = {
  pieceDrag: 'piece_drag',
  pieceDrop: 'piece_drop',
} as const;

/** Milisegundos entre emisiones durante el arrastre (~20/s). */
export const DRAG_BROADCAST_INTERVAL_MS = 50;

/** Milisegundos entre latidos. Contra una ventana de 30 s, tolera dos latidos perdidos. */
export const HEARTBEAT_INTERVAL_MS = 10_000;

/** Posición provisional de un grupo mientras alguien lo arrastra. Sin autoridad. */
export interface PieceDragPayload {
  groupId: string;
  /**
   * **Desplazamiento** respecto de la posición confirmada de cada pieza del grupo, no una
   * posición absoluta.
   *
   * La versión anterior mandaba `x, y` sin decir de qué pieza eran: el emisor entendía la pieza
   * agarrada y el receptor el ancla del grupo, así que agarrar cualquier pieza que no fuera la de
   * arriba a la izquierda descolocaba el bloque. Un desplazamiento no admite dos lecturas.
   */
  dx: number;
  dy: number;
  /** Quien emite. El receptor ignora sus propios eventos. */
  playerId: string;
}

/** Aviso de que el arrastre terminó, para dejar de interpolar sin esperar a Postgres. */
export interface PieceDropPayload {
  groupId: string;
  playerId: string;
}

/** Estado que cada cliente publica en Presence. Solo alimenta la lista de participantes. */
export interface RoomPresenceState {
  playerId: string;
  alias: string;
}

/** Estado de la conexión, tal como lo ve el jugador (FR-024). */
export type ConnectionStatus = 'connected' | 'reconnecting' | 'disconnected';
