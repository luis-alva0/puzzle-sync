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
  CatalogPageResponse,
  PuzzleDetailResponse,
  RetirePuzzleResponse,
  RoomStateResponse,
} from '@/types/api';
import type { SortOrder } from '@/types/catalog';
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

  // Con `FormData` NO se fija `Content-Type`: el navegador tiene que poner el suyo con el
  // `boundary`, y fijarlo a mano rompe el parseo en el servidor.
  const isFormData = init.body instanceof FormData;

  const response = await fetch(path, {
    ...init,
    headers: {
      ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
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
export function createPuzzle(input: {
  image: File;
  nominalPieceCount: PieceCountOption;
  isPublic: boolean;
}): Promise<CreatePuzzleResponse> {
  const form = new FormData();
  form.append('image', input.image);
  form.append('nominalPieceCount', String(input.nominalPieceCount));
  form.append('isPublic', String(input.isPublic));

  // `multipart/form-data` y no JSON con base64: base64 infla el cuerpo un 33 % y obligaría a
  // materializar los 10 MB antes de poder mirarlos.
  return request<CreatePuzzleResponse>('/api/puzzles', { method: 'POST', body: form });
}

export function fetchCatalog(sort: SortOrder, cursor?: string): Promise<CatalogPageResponse> {
  const params = new URLSearchParams({ sort });
  if (cursor) params.set('cursor', cursor);
  return request<CatalogPageResponse>(`/api/catalog?${params}`, { method: 'GET' });
}

export function retirePuzzle(id: string): Promise<RetirePuzzleResponse> {
  return request<RetirePuzzleResponse>(`/api/puzzles/${encodeURIComponent(id)}/retire`, {
    method: 'POST',
  });
}

export function fetchPuzzle(id: string): Promise<PuzzleDetailResponse> {
  return request<PuzzleDetailResponse>(`/api/puzzles/${encodeURIComponent(id)}`, { method: 'GET' });
}
