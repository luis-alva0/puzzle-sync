import 'server-only';

import { getSupabaseServiceClient } from '@/lib/supabase/server';

/**
 * Acceso al bucket de imágenes de rompecabezas.
 *
 * El bucket es **privado y sin política de lectura** (research R5): nada se lee directamente de
 * él. La escritura pasa siempre por aquí, con `service_role`, porque el cliente no puede subir
 * sin que antes se valide el archivo — y validar algo que ya existe llega tarde.
 *
 * `import 'server-only'` no es decorativo: un import accidental desde el cliente rompe el build
 * en lugar de filtrar la llave de servicio (Principio II).
 */

export const PUZZLE_IMAGES_BUCKET = 'puzzle-images';

/** El UUID del rompecabezas es el nombre de carpeta: no hace falta índice ni puede colisionar. */
export function puzzleImagePath(puzzleId: string): string {
  return `${puzzleId}/cropped.jpg`;
}

export async function uploadPuzzleImage(
  puzzleId: string,
  bytes: Uint8Array,
  contentType: string,
): Promise<{ storagePath: string }> {
  const storagePath = puzzleImagePath(puzzleId);

  const { error } = await getSupabaseServiceClient()
    .storage.from(PUZZLE_IMAGES_BUCKET)
    .upload(storagePath, bytes, { contentType, upsert: false });

  if (error) throw error;
  return { storagePath };
}

/**
 * Borra el objeto de un rompecabezas.
 *
 * Se usa como **compensación** cuando la subida tuvo éxito y la inserción de la fila falló
 * (FR-033). Storage y Postgres no comparten transacción, así que no hay forma de que ese par sea
 * atómico; lo que sí se puede es no dejar el objeto huérfano.
 *
 * No lanza: se invoca desde un `catch`, y un fallo aquí no debe tapar el error original.
 */
export async function deletePuzzleImage(puzzleId: string): Promise<void> {
  const { error } = await getSupabaseServiceClient()
    .storage.from(PUZZLE_IMAGES_BUCKET)
    .remove([puzzleImagePath(puzzleId)]);

  if (error) {
    console.warn(`[storage] no se pudo borrar el objeto huérfano de ${puzzleId}:`, error.message);
  }
}

/** Caducidad de la URL firmada. Se emite de nuevo en cada lectura, así que no necesita durar. */
const SIGNED_URL_TTL_SECONDS = 60 * 60;

/**
 * URL utilizable de la imagen de un rompecabezas.
 *
 * Es el **único** camino por el que una imagen llega al navegador: el bucket no tiene política de
 * lectura, así que sin firmar no es alcanzable ni siendo el rompecabezas público.
 *
 * Lo permanente que promete FR-023 es el enlace `/puzzles/{uuid}`, no la dirección del objeto en
 * Storage. Esta URL caduca en una hora a propósito, y no debe guardarse ni cachearse en ninguna
 * parte: se pide de nuevo en cada lectura.
 *
 * Cuando `storagePath` es `null` la imagen no está en Storage —los rompecabezas de la semilla
 * usan `data:` URI— y se devuelve `imageUrl` tal cual.
 */
export async function signPuzzleImageUrl(
  storagePath: string | null,
  imageUrl: string,
): Promise<string> {
  if (!storagePath) return imageUrl;

  const { data, error } = await getSupabaseServiceClient()
    .storage.from(PUZZLE_IMAGES_BUCKET)
    .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS);

  if (error || !data?.signedUrl) {
    throw error ?? new Error(`No se pudo firmar la URL de ${storagePath}`);
  }
  return data.signedUrl;
}
