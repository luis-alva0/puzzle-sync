import { getSupabaseServiceClient, getAuthUserId } from '@/lib/supabase/server';
import { apiError, apiSuccess, withErrorHandling } from '@/lib/api/errors';
import { isValidRoomCode, normalizeRoomCode } from '@/lib/rooms/code';
import { toPeruIso, toPeruIsoOrNull } from '@/lib/format/datetime';
import type { RoomStateResponse } from '@/types/api';
import type { Piece, PlayerSummary, RoomStatus } from '@/types/board';

/**
 * Debe coincidir con `public.lock_lease()` en la base de datos. Se replica aquí porque el
 * cálculo de `connected` y de `capturedBy` se hace al serializar, no en SQL.
 */
const LEASE_MS = 30_000;

interface PlayerRow {
  id: string;
  alias: string;
  last_seen_at: string;
}

interface PieceRow {
  id: string;
  grid_row: number;
  grid_col: number;
  x: number;
  y: number;
  group_id: string;
  captured_by: string | null;
  captured_at: string | null;
}

export const GET = withErrorHandling(
  async (request: Request, context: { params: Promise<{ code: string }> }): Promise<Response> => {
    const authUserId = await getAuthUserId(request);
    if (!authUserId) return apiError('UNAUTHENTICATED');

    const { code: rawCode } = await context.params;
    const code = normalizeRoomCode(rawCode);
    if (!isValidRoomCode(code)) return apiError('ROOM_NOT_FOUND');

    const supabase = getSupabaseServiceClient();

    const { data: room, error: roomError } = await supabase
      .from('rooms')
      .select('id, code, status, started_at, completed_at, max_players, puzzles(*)')
      .eq('code', code)
      .maybeSingle();

    if (roomError) throw roomError;
    if (!room) return apiError('ROOM_NOT_FOUND');

    // Solo los miembros de la sala ven su estado. El route handler usa service_role, que
    // evita RLS, así que la comprobación de pertenencia hay que hacerla explícitamente.
    const { data: membership, error: membershipError } = await supabase
      .from('room_players')
      .select('id')
      .eq('room_id', room.id)
      .eq('auth_user_id', authUserId)
      .maybeSingle();

    if (membershipError) throw membershipError;
    if (!membership) return apiError('ROOM_NOT_FOUND');

    const [{ data: playerRows, error: playersError }, { data: pieceRows, error: piecesError }] =
      await Promise.all([
        supabase
          .from('room_players')
          .select('id, alias, last_seen_at')
          .eq('room_id', room.id)
          .order('joined_at', { ascending: true })
          .returns<PlayerRow[]>(),
        supabase
          .from('pieces')
          .select('id, grid_row, grid_col, x, y, group_id, captured_by, captured_at')
          .eq('room_id', room.id)
          .order('grid_row', { ascending: true })
          .order('grid_col', { ascending: true })
          .returns<PieceRow[]>(),
      ]);

    if (playersError) throw playersError;
    if (piecesError) throw piecesError;

    const now = Date.now();
    const isLeaseAlive = (at: string | null): boolean =>
      at !== null && now - new Date(at).getTime() < LEASE_MS;

    const players: PlayerSummary[] = (playerRows ?? []).map((row) => ({
      id: row.id,
      alias: row.alias,
      // Derivado, nunca almacenado: no hay columna booleana que mantener sincronizada.
      connected: isLeaseAlive(row.last_seen_at),
    }));

    const pieces: Piece[] = (pieceRows ?? []).map((row) => ({
      id: row.id,
      gridRow: row.grid_row,
      gridCol: row.grid_col,
      x: row.x,
      y: row.y,
      groupId: row.group_id,
      // Un arrendamiento vencido se reporta como pieza libre. Así el cliente no necesita
      // conocer la regla de los 30 segundos para pintar el estado correcto.
      capturedBy: isLeaseAlive(row.captured_at) ? row.captured_by : null,
    }));

    const puzzle = room.puzzles as unknown as {
      id: string;
      image_url: string;
      grid_rows: number;
      grid_cols: number;
    };

    const response: RoomStateResponse = {
      room: {
        code: room.code,
        status: room.status as RoomStatus,
        startedAt: toPeruIso(room.started_at),
        completedAt: toPeruIsoOrNull(room.completed_at),
        maxPlayers: room.max_players,
      },
      puzzle: {
        id: puzzle.id,
        imageUrl: puzzle.image_url,
        gridRows: puzzle.grid_rows,
        gridCols: puzzle.grid_cols,
      },
      players,
      pieces,
      serverTime: toPeruIso(new Date()),
    };

    return apiSuccess(response);
  },
);
