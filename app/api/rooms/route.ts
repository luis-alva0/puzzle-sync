import { getSupabaseServiceClient, getAuthUserId } from '@/lib/supabase/server';
import { apiError, withErrorHandling } from '@/lib/api/errors';
import { validateAlias } from '@/lib/rooms/alias';
import { generateRoomCode } from '@/lib/rooms/code';
import { layoutPieces } from '@/lib/puzzle/board-layout';
import type { CreateRoomRequest, CreateRoomResponse } from '@/types/api';

/** Intentos de generar un código antes de rendirse. Ver comentario en `insertRoom`. */
const CODE_COLLISION_RETRIES = 5;

/** Código de error de PostgreSQL para violación de restricción única. */
const UNIQUE_VIOLATION = '23505';

export const POST = withErrorHandling(async (request: Request): Promise<Response> => {
  const authUserId = await getAuthUserId(request);
  if (!authUserId) return apiError('UNAUTHENTICATED');

  let body: CreateRoomRequest;
  try {
    body = (await request.json()) as CreateRoomRequest;
  } catch {
    return apiError('INVALID_ALIAS', 'El cuerpo de la petición no es JSON válido.');
  }

  const alias = validateAlias(body?.alias);
  if (!alias.ok) return apiError('INVALID_ALIAS');

  if (typeof body?.puzzleId !== 'string' || body.puzzleId.length === 0) {
    return apiError('PUZZLE_NOT_FOUND');
  }

  const supabase = getSupabaseServiceClient();

  const { data: puzzle, error: puzzleError } = await supabase
    .from('puzzles')
    .select('id, grid_rows, grid_cols')
    .eq('id', body.puzzleId)
    .maybeSingle();

  if (puzzleError) throw puzzleError;
  if (!puzzle) return apiError('PUZZLE_NOT_FOUND');

  // La dispersión se calcula aquí, en TypeScript testeable, y viaja a la función atómica.
  const pieces = layoutPieces(puzzle.grid_rows, puzzle.grid_cols, Date.now() % 2_147_483_647);

  // La unicidad del código la garantiza la restricción UNIQUE de la base de datos, no el
  // generador. Reintentar ante colisión es más simple y más correcto que consultar antes:
  // una comprobación previa tendría una carrera entre el SELECT y el INSERT.
  for (let attempt = 0; attempt < CODE_COLLISION_RETRIES; attempt++) {
    const roomCode = generateRoomCode();

    const { data, error } = await supabase
      .rpc('create_room', {
        p_puzzle_id: puzzle.id,
        p_auth_user_id: authUserId,
        p_alias: alias.alias,
        p_code: roomCode,
        p_pieces: pieces,
      })
      .single<{ room_id: string; player_id: string }>();

    if (error) {
      if (error.code === UNIQUE_VIOLATION) continue;
      throw error;
    }

    const response: CreateRoomResponse = { roomCode, playerId: data.player_id };
    return Response.json(response, { status: 201 });
  }

  // Con 31^6 combinaciones, agotar 5 intentos significa que algo va muy mal, no mala suerte.
  return apiError('INTERNAL_ERROR', 'No se pudo generar un código de sala libre.');
});
