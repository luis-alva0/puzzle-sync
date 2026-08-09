/**
 * Tipos del tablero, compartidos entre frontend y route handlers.
 *
 * Las posiciones se expresan en "unidades de tablero", no en píxeles de pantalla: el canvas
 * aplica su propia escala al pintar. Así el estado autoritativo del servidor no depende del
 * tamaño de la ventana de ningún jugador.
 */

export type RoomStatus = 'in_progress' | 'completed';

export interface Piece {
  id: string;
  /** Fila correcta en la cuadrícula, 0-indexada. */
  gridRow: number;
  /** Columna correcta en la cuadrícula, 0-indexada. */
  gridCol: number;
  /** Posición actual en el tablero, absoluta. */
  x: number;
  y: number;
  /** Grupo de piezas conectadas. Una pieza suelta tiene `groupId === id`. */
  groupId: string;
  /**
   * `room_players.id` de quien la tiene capturada, o `null` si está libre.
   * El servidor ya devuelve `null` cuando el arrendamiento venció, así que el cliente no
   * necesita conocer la regla de los 30 segundos.
   */
  capturedBy: string | null;
}

/** Conjunto de piezas conectadas que se mueve y se captura como una unidad. */
export interface PieceGroup {
  groupId: string;
  pieceIds: string[];
}

export interface PlayerSummary {
  /** `room_players.id`. */
  id: string;
  alias: string;
  /** Derivado de `last_seen_at`, nunca una columna almacenada. */
  connected: boolean;
}

export interface PuzzleSummary {
  id: string;
  imageUrl: string;
  gridRows: number;
  gridCols: number;
}

export interface RoomSummary {
  code: string;
  status: RoomStatus;
  /** ISO 8601 con offset -05:00 (hora de Perú). */
  startedAt: string;
  completedAt: string | null;
  maxPlayers: number;
}

/** Respuesta completa de `GET /api/rooms/[code]/state`. Reemplaza el estado local por entero. */
export interface BoardState {
  room: RoomSummary;
  puzzle: PuzzleSummary;
  players: PlayerSummary[];
  pieces: Piece[];
  /** Hora del servidor, para que el cliente detecte desfase sin confiar en su propio reloj. */
  serverTime: string;
}
