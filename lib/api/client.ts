'use client';

import { getAccessToken } from '@/lib/supabase/client';
import type {
  ApiErrorBody,
  CreatePuzzleResponse,
  CreateRoomRequest,
  CreateRoomResponse,
  ErrorCode,
  JoinRoomRequest,
  JoinRoomResponse,
  PuzzleDetailResponse,
  RoomStateResponse,
} from '@/types/api';
import type { PieceCountOption } from '@/types/puzzle';

/**
 * Cliente de la API para el navegador.
 *
 * Adjunta el JWT de la sesión anónima y traduce el formato uniforme de error a una excepción
 * tipada. La interfaz conmuta sobre `code`, nunca sobre `message` (Principio V): el texto es
 * para mostrar, el código es el contrato.
 */

export class ApiError extends Error {
  readonly code: ErrorCode;

  constructor(code: ErrorCode, message: string) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await getAccessToken();

  const response = await fetch(path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...init.headers,
    },
  });

  if (!response.ok) {
    let body: ApiErrorBody | null = null;
    try {
      body = (await response.json()) as ApiErrorBody;
    } catch {
      // Una respuesta de error sin JSON válido no debería ocurrir —`withErrorHandling` cubre
      // todas las rutas— pero si ocurre, no dejamos al cliente sin código con el que decidir.
    }
    throw new ApiError(
      body?.error?.code ?? 'INTERNAL_ERROR',
      body?.error?.message ?? 'Algo falló. Inténtalo de nuevo.',
    );
  }

  return (await response.json()) as T;
}

export function createRoom(body: CreateRoomRequest): Promise<CreateRoomResponse> {
  return request<CreateRoomResponse>('/api/rooms', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function joinRoom(code: string, body: JoinRoomRequest): Promise<JoinRoomResponse> {
  return request<JoinRoomResponse>(`/api/rooms/${encodeURIComponent(code)}/join`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function fetchRoomState(code: string): Promise<RoomStateResponse> {
  return request<RoomStateResponse>(`/api/rooms/${encodeURIComponent(code)}/state`, {
    method: 'GET',
  });
}

/**
 * Crea un rompecabezas desde una foto.
 *
 * Va como `multipart/form-data` y no como JSON con base64: base64 infla el cuerpo un 33 % y
 * obligaría a materializar los 10 MB antes de poder mirarlos. `Content-Type` se omite a
 * propósito para que el navegador ponga el `boundary`.
 */
export async function createPuzzle(input: {
  image: File;
  nominalPieceCount: PieceCountOption;
  isPublic: boolean;
}): Promise<CreatePuzzleResponse> {
  const token = await getAccessToken();

  const form = new FormData();
  form.append('image', input.image);
  form.append('nominalPieceCount', String(input.nominalPieceCount));
  form.append('isPublic', String(input.isPublic));

  const response = await fetch('/api/puzzles', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });

  if (!response.ok) {
    let body: ApiErrorBody | null = null;
    try {
      body = (await response.json()) as ApiErrorBody;
    } catch {
      // Sin JSON válido no dejamos al cliente sin código con el que decidir.
    }
    throw new ApiError(
      body?.error?.code ?? 'INTERNAL_ERROR',
      body?.error?.message ?? 'No se pudo crear el rompecabezas.',
    );
  }

  return (await response.json()) as CreatePuzzleResponse;
}

export function fetchPuzzle(id: string): Promise<PuzzleDetailResponse> {
  return request<PuzzleDetailResponse>(`/api/puzzles/${encodeURIComponent(id)}`, { method: 'GET' });
}
