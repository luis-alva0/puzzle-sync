import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { adminClient, hasSupabase, skipReason } from './helpers';
import { chooseGrid } from '@/lib/puzzle-generation/grid';
import { validateImage } from '@/lib/upload/validate';

/**
 * Flujo de creación de un rompecabezas contra Supabase local.
 *
 * Lo que no se puede simular sin infraestructura: que la fila se inserte con los valores
 * correctos, que el objeto acabe en Storage, que la URL firmada funcione, y que un fallo de
 * inserción no deje el objeto huérfano.
 *
 * La validación del archivo y la elección de cuadrícula ya están cubiertas unitariamente; aquí
 * solo se usan para montar entradas realistas.
 */

const BUCKET = 'puzzle-images';

/** PNG mínimo válido con las dimensiones pedidas. */
function pngOf(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(24);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  bytes.set([0x00, 0x00, 0x00, 0x0d], 8);
  bytes.set([0x49, 0x48, 0x44, 0x52], 12);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return bytes;
}

interface CreatedPuzzle {
  id: string;
  storagePath: string;
}

/**
 * Reproduce lo que hace el route handler, con las mismas funciones.
 *
 * No se llama al endpoint por HTTP porque eso exigiría levantar Next: lo que se quiere verificar
 * aquí es el efecto sobre Postgres y Storage, no el enrutado.
 */
async function createPuzzle(
  admin: SupabaseClient,
  {
    width = 1200,
    height = 900,
    nominalPieceCount = 100,
    visibility = 'private',
    failInsert = false,
  }: {
    width?: number;
    height?: number;
    nominalPieceCount?: number;
    visibility?: 'private' | 'public';
    failInsert?: boolean;
  } = {},
): Promise<{ created: CreatedPuzzle | null; insertFailed: boolean }> {
  const bytes = pngOf(width, height);
  const validation = validateImage(bytes);
  if (!validation.ok) throw new Error(`imagen de prueba inválida: ${validation.reason}`);

  const grid = chooseGrid(nominalPieceCount, validation.width, validation.height);
  const puzzleId = crypto.randomUUID();
  const storagePath = `${puzzleId}/cropped.jpg`;

  const { error: uploadError } = await admin.storage
    .from(BUCKET)
    .upload(storagePath, bytes, { contentType: 'image/png', upsert: false });
  if (uploadError) throw uploadError;

  const { error: insertError } = await admin.from('puzzles').insert({
    id: puzzleId,
    image_url: storagePath,
    storage_path: storagePath,
    grid_rows: grid.rows,
    grid_cols: grid.cols,
    // Un valor fuera de las cinco opciones fuerza el fallo del CHECK, que es la forma más
    // realista de provocar un error de inserción tras una subida correcta.
    nominal_piece_count: failInsert ? 7 : nominalPieceCount,
    visibility,
    source: 'user_photo',
  });

  if (insertError) {
    // Compensación: la misma que hace el route handler (FR-033).
    await admin.storage.from(BUCKET).remove([storagePath]);
    return { created: null, insertFailed: true };
  }

  return { created: { id: puzzleId, storagePath }, insertFailed: false };
}

describe.skipIf(!hasSupabase)('creación de rompecabezas desde foto', () => {
  let admin: SupabaseClient;
  const createdIds: string[] = [];

  beforeAll(() => {
    admin = adminClient();
  });

  afterEach(async () => {
    for (const id of createdIds.splice(0)) {
      await admin.storage.from(BUCKET).remove([`${id}/cropped.jpg`]);
      await admin.from('puzzles').delete().eq('id', id);
    }
  });

  it('inserta la fila con los valores correctos y sube el objeto', async () => {
    const { created } = await createPuzzle(admin, { nominalPieceCount: 100 });
    expect(created).not.toBeNull();
    createdIds.push(created!.id);

    const { data: row } = await admin
      .from('puzzles')
      .select('nominal_piece_count, piece_count, grid_rows, grid_cols, visibility, source, storage_path')
      .eq('id', created!.id)
      .single();

    expect(row!.nominal_piece_count).toBe(100);
    expect(row!.piece_count).toBe(row!.grid_rows * row!.grid_cols);
    expect(row!.visibility).toBe('private');
    expect(row!.source).toBe('user_photo');
    expect(row!.storage_path).toBe(created!.storagePath);

    const { data: listed } = await admin.storage.from(BUCKET).list(created!.id);
    expect(listed?.map((o) => o.name)).toContain('cropped.jpg');
  });

  it('la URL firmada sirve la imagen, y la ruta cruda no', async () => {
    const { created } = await createPuzzle(admin);
    createdIds.push(created!.id);

    const { data: signed } = await admin.storage
      .from(BUCKET)
      .createSignedUrl(created!.storagePath, 3600);
    expect(signed?.signedUrl).toBeTruthy();

    const signedResponse = await fetch(signed!.signedUrl);
    expect(signedResponse.status).toBe(200);

    // Sin firma no hay acceso: el bucket no tiene política de lectura (research R5).
    const { data: publicUrl } = admin.storage.from(BUCKET).getPublicUrl(created!.storagePath);
    const rawResponse = await fetch(publicUrl.publicUrl);
    expect(rawResponse.ok).toBe(false);
  });

  it('la visibilidad por defecto es privada y solo es pública si se pide (FR-029)', async () => {
    const priv = await createPuzzle(admin, { visibility: 'private' });
    const pub = await createPuzzle(admin, { visibility: 'public' });
    createdIds.push(priv.created!.id, pub.created!.id);

    const { data: rows } = await admin
      .from('puzzles')
      .select('id, visibility')
      .in('id', [priv.created!.id, pub.created!.id]);

    const byId = new Map(rows!.map((r) => [r.id, r.visibility]));
    expect(byId.get(priv.created!.id)).toBe('private');
    expect(byId.get(pub.created!.id)).toBe('public');
  });

  it('un fallo de inserción no deja el objeto huérfano (FR-033)', async () => {
    const { created, insertFailed } = await createPuzzle(admin, { failInsert: true });

    expect(insertFailed).toBe(true);
    expect(created).toBeNull();

    // Ningún objeto suelto: el borrado compensatorio se ejecutó.
    const { data: listed } = await admin.storage.from(BUCKET).list('', { limit: 1000 });
    const orphans = (listed ?? []).filter((entry) => entry.name.includes('cropped'));
    expect(orphans).toHaveLength(0);
  });

  it('el CHECK rechaza una cantidad nominal fuera de las cinco opciones', async () => {
    const { error } = await admin.from('puzzles').insert({
      id: crypto.randomUUID(),
      image_url: 'x',
      grid_rows: 3,
      grid_cols: 3,
      nominal_piece_count: 7,
      source: 'user_photo',
    });
    expect(error).not.toBeNull();
  });

  it('la semilla conserva nominal_piece_count NULL y visibilidad pública', async () => {
    // Es lo que hace aplicable la migración: el rompecabezas de 4 piezas no es una de las cinco
    // opciones, y copiar piece_count habría abortado contra el CHECK.
    const { data: seeds } = await admin
      .from('puzzles')
      .select('id, nominal_piece_count, visibility, source, piece_count')
      .eq('source', 'seed');

    expect(seeds!.length).toBeGreaterThan(0);
    for (const seed of seeds!) {
      expect(seed.nominal_piece_count, `semilla ${seed.id}`).toBeNull();
      expect(seed.visibility).toBe('public');
    }
    expect(seeds!.some((s) => s.piece_count === 4)).toBe(true);
  });
});

if (!hasSupabase) {
  describe('creación de rompecabezas', () => {
    it.skip(`omitido: ${skipReason}`, () => {});
  });
}
