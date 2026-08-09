import { ERROR_STATUS, type ApiErrorBody, type ErrorCode } from '@/types/api';

/**
 * Formato uniforme de error para toda la API (Principio V de la constitución).
 *
 * Un único lugar que construye errores es la única forma barata de que el formato no se
 * desvíe. Nunca se expone una traza interna ni un mensaje crudo de Supabase: el cliente
 * conmuta sobre `code`, y `message` solo se muestra.
 */

const DEFAULT_MESSAGES: Record<ErrorCode, string> = {
  UNAUTHENTICATED: 'No se pudo identificar la sesión. Recarga la página e inténtalo de nuevo.',
  INVALID_ALIAS: 'El alias debe tener entre 2 y 20 caracteres.',
  ROOM_NOT_FOUND: 'No encontramos esa sala. Revisa el enlace o crea una nueva.',
  ROOM_FULL: 'La sala está llena: ya tiene el máximo de jugadores conectados.',
  PUZZLE_NOT_FOUND: 'No encontramos ese rompecabezas.',
  INVALID_FILE_TYPE: 'La imagen debe ser un archivo JPG o PNG válido.',
  FILE_TOO_LARGE: 'La imagen no puede pesar más de 10 MB.',
  INVALID_PIECE_COUNT: 'Elige una de las cantidades de piezas disponibles.',
  FORBIDDEN: 'No tienes permiso para esta operación.',
  INVALID_CURSOR: 'La página solicitada ya no es válida. Vuelve a cargar el catálogo.',
  INTERNAL_ERROR: 'Algo falló de nuestro lado. Inténtalo de nuevo.',
};

/** Construye una respuesta de error con el formato y el código HTTP correctos. */
export function apiError(code: ErrorCode, message?: string): Response {
  const body: ApiErrorBody = {
    error: { code, message: message ?? DEFAULT_MESSAGES[code] },
  };
  return Response.json(body, { status: ERROR_STATUS[code] });
}

/**
 * Envuelve un route handler para que ningún fallo inesperado escape con formato distinto.
 *
 * Sin esto, una excepción no capturada devolvería el HTML de error de Next.js, que el cliente
 * no sabe interpretar y que puede filtrar detalles internos.
 */
export function withErrorHandling<TArgs extends unknown[]>(
  handler: (...args: TArgs) => Promise<Response>,
): (...args: TArgs) => Promise<Response> {
  return async (...args: TArgs): Promise<Response> => {
    try {
      return await handler(...args);
    } catch (cause) {
      // La traza va al log del servidor, nunca al cliente.
      console.error('[api] fallo no controlado:', cause);
      return apiError('INTERNAL_ERROR');
    }
  };
}
