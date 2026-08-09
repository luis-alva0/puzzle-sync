'use client';

import { getAccessToken } from '@/lib/supabase/client';
import type {
  ApiErrorBody,
  CreateRoomRequest,
  CreateRoomResponse,
  ErrorCode,
  JoinRoomRequest,
  JoinRoomResponse,
  RoomStateResponse,
} from '@/types/api';

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
