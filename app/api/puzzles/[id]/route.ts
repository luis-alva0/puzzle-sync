import { getSupabaseServiceClient, getAuthUserId } from '@/lib/supabase/server';
import { apiError, withErrorHandling } from '@/lib/api/errors';
import { signPuzzleImageUrl } from '@/lib/storage/upload';
import { toPeruIso } from '@/lib/format/datetime';
import type { PuzzleDetailResponse } from '@/types/api';
import type { PuzzleVisibility } from '@/types/puzzle';

/**
 * `GET /api/puzzles/[id]` — leer un rompecabezas por su enlace.
 *
 * Existe porque la migración de esta feature restringe la lectura de `puzzles` a
 * `visibility = 'public'`: a partir de ahí, un rompecabezas privado no es legible con la llave
 * anónima y su enlace no funcionaría. Aquí se sirve con `service_role`.
 *
 * Conocer el UUID es la credencial, igual que conocer el código de una sala permite entrar en
 * ella. No hay nada más que comprobar.
 */

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const GET = withErrorHandling(
  async (request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> => {
    const authUserId = await getAuthUserId(request);
    if (!authUserId) return apiError('UNAUTHENTICATED');

    const { id } = await context.params;
    // Un identificador mal formado se trata igual que uno inexistente: no se filtra la diferencia.
    if (!UUID_PATTERN.test(id)) return apiError('PUZZLE_NOT_FOUND');

    const { data: puzzle, error } = await getSupabaseServiceClient()
      .from('puzzles')
      .select('id, image_url, storage_path, grid_rows, grid_cols, piece_count, visibility, created_at')
      .eq('id', id)
      .maybeSingle();

    if (error) throw error;
    if (!puzzle) return apiError('PUZZLE_NOT_FOUND');

    const response: PuzzleDetailResponse = {
      puzzleId: puzzle.id,
      // Firmada en cada lectura: el bucket no tiene política, así que sin esto la imagen no es
      // alcanzable ni siendo el rompecabezas público.
      imageUrl: await signPuzzleImageUrl(puzzle.storage_path, puzzle.image_url),
      gridRows: puzzle.grid_rows,
      gridCols: puzzle.grid_cols,
      pieceCount: puzzle.piece_count,
      visibility: puzzle.visibility as PuzzleVisibility,
      createdAt: toPeruIso(puzzle.created_at),
    };
    return Response.json(response);
  },
);
