import { getSupabaseServiceClient, getAuthUserId } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/supabase/admin-session';
import { apiError, withErrorHandling } from '@/lib/api/errors';
import { validateImage, MAX_FILE_BYTES } from '@/lib/upload/validate';
import { chooseGrid } from '@/lib/puzzle-generation/grid';
import { deletePuzzleImage, uploadPuzzleImage } from '@/lib/storage/upload';
import { isPieceCountOption, type PuzzleVisibility } from '@/types/puzzle';
import type { CreatePuzzleResponse } from '@/types/api';

/**
 * `POST /api/puzzles` — crear un rompecabezas a partir de una foto ya recortada.
 *
 * El servidor no confía en el navegador para nada: el tipo se determina por los números mágicos,
 * el tamaño por el cuerpo realmente recibido, y la cuadrícula la calcula aquí. Si la cuadrícula
 * llegara del cliente, se podría pedir una de 1×5000.
 */

export const POST = withErrorHandling(async (request: Request): Promise<Response> => {
  const authUserId = await getAuthUserId(request);
  if (!authUserId) return apiError('UNAUTHENTICATED');

  // Rechazo temprano y barato. `Content-Length` lo controla quien envía, así que no decide nada:
  // quien mienta aquí solo se retrasa, porque la comprobación real viene después.
  const declaredLength = Number(request.headers.get('content-length') ?? 0);
  if (declaredLength > MAX_FILE_BYTES * 1.1) return apiError('FILE_TOO_LARGE');

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return apiError('INVALID_FILE_TYPE', 'No se pudo leer el archivo enviado.');
  }

  const file = form.get('image');
  if (!(file instanceof File)) {
    return apiError('INVALID_FILE_TYPE', 'Falta la imagen en la petición.');
  }

  // Comprobación autoritativa del tamaño, sobre el archivo ya recibido.
  if (file.size > MAX_FILE_BYTES) return apiError('FILE_TOO_LARGE');

  const nominalPieceCount = Number(form.get('nominalPieceCount'));
  if (!isPieceCountOption(nominalPieceCount)) return apiError('INVALID_PIECE_COUNT');

  // La condición de administrador se deriva de la SESIÓN, nunca de un campo del cuerpo. Si
  // viniera del `FormData`, cualquier jugador podría enviarlo y marcar su rompecabezas como
  // curado (research R2 de 003). Todo campo del cliente que pretenda esto se ignora.
  const admin = await requireAdmin(request);

  // Ausente ⇒ privado. La privacidad no depende de que el cliente recuerde pedirla (FR-029).
  const visibility: PuzzleVisibility = admin.ok
    ? 'public'
    : form.get('isPublic') === 'true'
      ? 'public'
      : 'private';
  const source = admin.ok ? 'curated' : 'user_photo';

  const bytes = new Uint8Array(await file.arrayBuffer());
  const validation = validateImage(bytes);
  if (!validation.ok) {
    if (validation.reason === 'too_large') return apiError('FILE_TOO_LARGE');
    return apiError('INVALID_FILE_TYPE');
  }

  const grid = chooseGrid(nominalPieceCount, validation.width, validation.height);

  // El UUID se genera por adelantado para poder usarlo como carpeta en Storage antes de que
  // exista la fila.
  const puzzleId = crypto.randomUUID();
  const contentType = validation.format === 'png' ? 'image/png' : 'image/jpeg';

  const { storagePath } = await uploadPuzzleImage(puzzleId, bytes, contentType);

  // Revalidación de la sesión de administrador justo antes de insertar (FR-026 de 003): una
  // subida de 10 MB puede empezar con sesión válida y terminar sin ella.
  if (admin.ok) {
    const stillAdmin = await requireAdmin(request);
    if (!stillAdmin.ok) {
      await deletePuzzleImage(puzzleId);
      return apiError('FORBIDDEN', 'La sesión de administrador expiró durante la subida.');
    }
  }

  const { error: insertError } = await getSupabaseServiceClient().from('puzzles').insert({
    id: puzzleId,
    image_url: storagePath,
    storage_path: storagePath,
    grid_rows: grid.rows,
    grid_cols: grid.cols,
    nominal_piece_count: nominalPieceCount,
    visibility,
    source,
  });

  if (insertError) {
    // Compensación: Storage y Postgres no comparten transacción, así que lo único que se puede
    // garantizar es no dejar el objeto huérfano (FR-033).
    await deletePuzzleImage(puzzleId);
    throw insertError;
  }

  const response: CreatePuzzleResponse = {
    puzzleId,
    url: `/puzzles/${puzzleId}`,
    gridRows: grid.rows,
    gridCols: grid.cols,
    pieceCount: grid.rows * grid.cols,
    nominalPieceCount,
    visibility,
  };
  return Response.json(response, { status: 201 });
});
