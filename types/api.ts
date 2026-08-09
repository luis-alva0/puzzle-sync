/**
 * Contratos de la API REST. Ver specs/001-sala-armado-colaborativo/contracts/rest-api.md
 *
 * Principio V de la constitución: todo error devuelve el mismo formato, con un código estable
 * legible por máquina y un mensaje para humanos. El cliente conmuta sobre `code`, nunca sobre
 * `message`.
 */

import type { BoardState, PuzzleSummary } from './board';

export const ERROR_CODES = [
  'UNAUTHENTICATED',
  'INVALID_ALIAS',
  'ROOM_NOT_FOUND',
  'ROOM_FULL',
  'PUZZLE_NOT_FOUND',
  'PIECE_LOCKED',
  'INTERNAL_ERROR',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

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
  PIECE_LOCKED: 409,
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
