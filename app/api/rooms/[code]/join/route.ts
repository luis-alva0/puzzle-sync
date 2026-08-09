import { getSupabaseServiceClient, getAuthUserId } from '@/lib/supabase/server';
import { apiError, withErrorHandling } from '@/lib/api/errors';
import { validateAlias } from '@/lib/rooms/alias';
import { isValidRoomCode, normalizeRoomCode } from '@/lib/rooms/code';
import type { JoinRoomRequest, JoinRoomResponse } from '@/types/api';

interface JoinRoomResult {
  found: boolean;
  full_room: boolean;
  reconnected: boolean;
  room_id: string | null;
  player_id: string | null;
  puzzle_id: string | null;
}

export const POST = withErrorHandling(
  async (request: Request, context: { params: Promise<{ code: string }> }): Promise<Response> => {
    const authUserId = await getAuthUserId(request);
    if (!authUserId) return apiError('UNAUTHENTICATED');

    const { code: rawCode } = await context.params;
    const code = normalizeRoomCode(rawCode);
    if (!isValidRoomCode(code)) return apiError('ROOM_NOT_FOUND');

    let body: JoinRoomRequest;
    try {
      body = (await request.json()) as JoinRoomRequest;
    } catch {
      return apiError('INVALID_ALIAS', 'El cuerpo de la petición no es JSON válido.');
    }

    const alias = validateAlias(body?.alias);
    if (!alias.ok) return apiError('INVALID_ALIAS');

    const supabase = getSupabaseServiceClient();

    // El aforo y la detección de reconexión se resuelven dentro de la función, en una sola
    // transacción. Comprobarlos aquí tendría una carrera: dos jugadores podrían ver la sala
    // con 3 conectados y entrar ambos, dejándola en 5.
    const { data, error } = await supabase
      .rpc('join_room', {
        p_code: code,
        p_auth_user_id: authUserId,
        p_alias: alias.alias,
      })
      .single<JoinRoomResult>();

    if (error) throw error;

    if (!data.found) return apiError('ROOM_NOT_FOUND');
    if (data.full_room) return apiError('ROOM_FULL');
    if (!data.player_id || !data.room_id || !data.puzzle_id)
      throw new Error('join_room incompleto');

    const response: JoinRoomResponse = {
      playerId: data.player_id,
      roomId: data.room_id,
      reconnected: data.reconnected,
    };
    return Response.json(response);
  },
);
