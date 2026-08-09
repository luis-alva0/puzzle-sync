import { getSupabaseServiceClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/supabase/admin-session';
import { apiError, withErrorHandling } from '@/lib/api/errors';
import type { RetirePuzzleResponse } from '@/types/api';

/**
 * `POST /api/puzzles/[id]/retire` — retirada reactiva del catálogo (FR-028).
 *
 * Retirar **no** toca `visibility`, **no** borra la fila y **no** borra el objeto de Storage. Las
 * tres cosas son deliberadas:
 *   - cambiar `visibility` alteraría la decisión que el jugador tomó al crear, y 002 la declara
 *     inmutable;
 *   - borrar la fila rompería el enlace del creador, que FR-030 exige que siga funcionando;
 *   - y las salas en curso siguen referenciando el rompecabezas (FR-031).
 */

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const POST = withErrorHandling(
  async (request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> => {
    // Se comprueba aquí y no solo en el middleware: su `matcher` no cubre `/api`, y aunque lo
    // cubriera, una lista se puede quedar corta al añadir una ruta.
    const admin = await requireAdmin(request);
    if (!admin.ok) {
      return apiError(admin.reason === 'unauthenticated' ? 'UNAUTHENTICATED' : 'FORBIDDEN');
    }

    const { id } = await context.params;
    if (!UUID_PATTERN.test(id)) return apiError('PUZZLE_NOT_FOUND');

    const { data, error } = await getSupabaseServiceClient()
      .from('puzzles')
      .update({ catalog_status: 'retired' })
      .eq('id', id)
      .select('id')
      .maybeSingle();

    if (error) throw error;
    if (!data) return apiError('PUZZLE_NOT_FOUND');

    // Idempotente: retirar algo ya retirado devuelve 200 igualmente.
    const response: RetirePuzzleResponse = { puzzleId: data.id, catalogStatus: 'retired' };
    return Response.json(response);
  },
);
