import { getSupabaseServiceClient, getAuthUserId } from '@/lib/supabase/server';
import { apiError, withErrorHandling } from '@/lib/api/errors';
import { signPuzzleImageUrl } from '@/lib/storage/upload';
import { toPeruIso } from '@/lib/format/datetime';
import { decodeCursor, encodeCursor } from '@/lib/catalog/cursor';
import {
  CATALOG_FILTER,
  EXCLUDED_SOURCE,
  cursorFrom,
  keysetFilter,
  orderColumns,
} from '@/lib/catalog/ordering';
import { CATALOG_PAGE_SIZE, isSortOrder, type CatalogItem } from '@/types/catalog';
import type { CatalogPageResponse } from '@/types/api';

/**
 * `GET /api/catalog` — listado paginado del catálogo.
 *
 * Consulta con **`service_role`**, porque firmar las miniaturas ya exige servidor: el bucket no
 * tiene política de lectura y sin firma ninguna imagen sería alcanzable.
 *
 * Consecuencia que hay que tener presente: **la RLS no se aplica**. El filtro de visibilidad va
 * escrito abajo, a mano, y es obligatorio. Olvidarlo publicaría los rompecabezas privados y los
 * retirados, que es exactamente lo que la política existe para impedir.
 */

interface PuzzleRow {
  id: string;
  image_url: string;
  storage_path: string | null;
  grid_rows: number;
  grid_cols: number;
  piece_count: number;
  play_count: number;
  created_at: string;
}

export const GET = withErrorHandling(async (request: Request): Promise<Response> => {
  const authUserId = await getAuthUserId(request);
  if (!authUserId) return apiError('UNAUTHENTICATED');

  const params = new URL(request.url).searchParams;

  // Un `sort` desconocido no es un error: es un parámetro de presentación, y volver a `recent`
  // es más útil que romper la página.
  const rawSort = params.get('sort');
  const sort = isSortOrder(rawSort) ? rawSort : 'recent';

  const rawCursor = params.get('cursor');
  const cursor = rawCursor ? decodeCursor(rawCursor, sort) : null;
  // Un cursor presente que no descodifica —o que es de otro ordenamiento— sí es un error: seguir
  // con él daría una página incoherente en silencio.
  if (rawCursor && !cursor) return apiError('INVALID_CURSOR');

  const [primary, secondary] = orderColumns(sort);

  let query = getSupabaseServiceClient()
    .from('puzzles')
    .select('id, image_url, storage_path, grid_rows, grid_cols, piece_count, play_count, created_at')
    .match(CATALOG_FILTER)
    .neq('source', EXCLUDED_SOURCE)
    .order(primary, { ascending: false })
    .order(secondary, { ascending: false })
    // Se pide uno de más para saber si hay página siguiente sin una consulta de conteo aparte.
    .limit(CATALOG_PAGE_SIZE + 1);

  if (cursor) query = query.or(keysetFilter(cursor));

  const { data, error } = await query.returns<PuzzleRow[]>();
  if (error) throw error;

  const rows = data ?? [];
  const hasMore = rows.length > CATALOG_PAGE_SIZE;
  const page = rows.slice(0, CATALOG_PAGE_SIZE);

  const items: CatalogItem[] = await Promise.all(
    page.map(async (row) => ({
      puzzleId: row.id,
      imageUrl: await signPuzzleImageUrl(row.storage_path, row.image_url),
      pieceCount: row.piece_count,
      gridRows: row.grid_rows,
      gridCols: row.grid_cols,
      playCount: row.play_count,
      createdAt: toPeruIso(row.created_at),
      // Ni `source` ni `visibility` salen de aquí: FR-003 prohíbe distinguir el origen, y no
      // mandar el dato es lo que lo hace imposible de pintar.
    })),
  );

  const lastRow = page.at(-1);
  const lastItem = items.at(-1);

  const response: CatalogPageResponse = {
    items,
    nextCursor:
      hasMore && lastItem && lastRow
        ? encodeCursor(cursorFrom(lastItem, sort, lastRow.created_at))
        : null,
    hasMore,
  };
  return Response.json(response);
});
