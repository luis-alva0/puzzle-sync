/**
 * Contratos de la API REST. Ver specs/001-sala-armado-colaborativo/contracts/rest-api.md
 *
 * Principio V de la constitución: todo error devuelve el mismo formato, con un código estable
 * legible por máquina y un mensaje para humanos. El cliente conmuta sobre `code`, nunca sobre
 * `message`.
 */

import type { BoardState, PuzzleSummary } from './board';
import type { PieceCountOption, PuzzleVisibility } from './puzzle';

export type ErrorCode =
  | 'UNAUTHENTICATED'
  | 'INVALID_ALIAS'
  | 'ROOM_NOT_FOUND'
  | 'ROOM_FULL'
  | 'PUZZLE_NOT_FOUND'
  | 'INVALID_FILE_TYPE'
  | 'FILE_TOO_LARGE'
  | 'INVALID_PIECE_COUNT'
  | 'INTERNAL_ERROR';

export interface ApiErrorBody {
  error: {
    code: ErrorCode;
    message: string;
  };
}

/** Código HTTP asociado a cada código de error. Fuente única de verdad. */
export const ERROR_STATUS: Record<ErrorCode, number> = {
  UNAUTHENTICATED: 401,
  INVALID_ALIAS: 400,
  ROOM_NOT_FOUND: 404,
  ROOM_FULL: 409,
  PUZZLE_NOT_FOUND: 404,
  INVALID_FILE_TYPE: 400,
  FILE_TOO_LARGE: 413,
  INVALID_PIECE_COUNT: 400,
  INTERNAL_ERROR: 500,
};

// --- POST /api/rooms ---------------------------------------------------------

export interface CreateRoomRequest {
  puzzleId: string;
  alias: string;
}

export interface CreateRoomResponse {
  roomCode: string;
  /** `room_players.id` del creador. */
  playerId: string;
  puzzle: PuzzleSummary;
}

// --- POST /api/rooms/[code]/join ---------------------------------------------

export interface JoinRoomRequest {
  alias: string;
}

export interface JoinRoomResponse {
  playerId: string;
  roomId: string;
  puzzle: PuzzleSummary;
  /**
   * `true` si el jugador ya tenía plaza en la sala y esto fue una reconexión.
   * En ese caso el aforo no se aplica (FR-022).
   */
  reconnected: boolean;
}

// --- GET /api/rooms/[code]/state ---------------------------------------------

export type RoomStateResponse = BoardState;

// --- POST /api/puzzles -------------------------------------------------------

export interface CreatePuzzleResponse {
  puzzleId: string;
  /** Ruta relativa del enlace permanente. El dominio no forma parte del contrato. */
  url: string;
  gridRows: number;
  gridCols: number;
  /** Cantidad **real**, derivada de la cuadrícula. Puede diferir de la nominal (research R4). */
  pieceCount: number;
  nominalPieceCount: PieceCountOption;
  visibility: PuzzleVisibility;
}

// --- GET /api/puzzles/[id] ---------------------------------------------------

export interface PuzzleDetailResponse {
  puzzleId: string;
  /**
   * URL **firmada**, con 1 hora de caducidad, emitida en cada lectura. El bucket no tiene
   * política de lectura. No guardar ni cachear: lo permanente es `/puzzles/{id}`.
   */
  imageUrl: string;
  gridRows: number;
  gridCols: number;
  pieceCount: number;
  visibility: PuzzleVisibility;
  /** ISO 8601 con offset -05:00. */
  createdAt: string;
}
