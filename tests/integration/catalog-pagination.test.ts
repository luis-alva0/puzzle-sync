import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { adminClient, hasSupabase, skipReason } from './helpers';
import { decodeCursor, encodeCursor } from '@/lib/catalog/cursor';
import { cursorFrom, keysetFilter, orderColumns } from '@/lib/catalog/ordering';
import { CATALOG_PAGE_SIZE, type CatalogItem, type SortOrder } from '@/types/catalog';

/**
 * Paginación del catálogo con **empates deliberados**.
 *
 * Es la prueba que justifica el desempate por `id` en los índices y en la consulta. Con
 * `play_count = 0` en casi todo el catálogo los empates son la norma, y sin desempate Postgres
 * puede devolver dos filas empatadas en orden distinto entre consultas: el scroll acabaría
 * repitiendo una tarjeta y saltándose otra.
 *
 * No se llama al endpoint por HTTP: eso exigiría levantar Next. Se reproduce su consulta con las
 * mismas funciones de `lib/catalog/`, que es lo que se quiere verificar.
 */

const SEEDED = 50;

interface Row {
  id: string;
  piece_count: number;
  grid_rows: number;
  grid_cols: number;
  play_count: number;
  created_at: string;
}

/** Una página del listado, con la misma consulta que arma el route handler. */
async function fetchPage(
  admin: SupabaseClient,
  sort: SortOrder,
  cursor: string | null,
): Promise<{ items: CatalogItem[]; rows: Row[]; nextCursor: string | null; hasMore: boolean }> {
  const [primary, secondary] = orderColumns(sort);

  let query = admin
    .from('puzzles')
    .select('id, piece_count, grid_rows, grid_cols, play_count, created_at')
    .match({ visibility: 'public', catalog_status: 'visible' })
    .neq('source', 'seed')
    .order(primary, { ascending: false })
    .order(secondary, { ascending: false })
    .limit(CATALOG_PAGE_SIZE + 1);

  if (cursor) {
    const decoded = decodeCursor(cursor, sort);
    if (!decoded) throw new Error('cursor inválido en la prueba');
    query = query.or(keysetFilter(decoded));
  }

  const { data, error } = await query.returns<Row[]>();
  if (error) throw error;

  const all = data ?? [];
  const hasMore = all.length > CATALOG_PAGE_SIZE;
  const rows = all.slice(0, CATALOG_PAGE_SIZE);

  const items: CatalogItem[] = rows.map((row) => ({
    puzzleId: row.id,
    imageUrl: '',
    pieceCount: row.piece_count,
    gridRows: row.grid_rows,
    gridCols: row.grid_cols,
    playCount: row.play_count,
    createdAt: row.created_at,
  }));

  const lastRow = rows.at(-1);
  const lastItem = items.at(-1);

  return {
    items,
    rows,
    nextCursor:
      hasMore && lastItem && lastRow ? encodeCursor(cursorFrom(lastItem, sort, lastRow.created_at)) : null,
    hasMore,
  };
}

/** Recorre todas las páginas y devuelve los identificadores en orden. */
async function walkAll(admin: SupabaseClient, sort: SortOrder): Promise<string[]> {
  const ids: string[] = [];
  let cursor: string | null = null;

  for (let guard = 0; guard < 20; guard++) {
    const page = await fetchPage(admin, sort, cursor);
    ids.push(...page.items.map((item) => item.puzzleId));
    if (!page.hasMore) break;
    cursor = page.nextCursor;
  }
  return ids;
}

describe.skipIf(!hasSupabase)('paginación del catálogo con empates', () => {
  let admin: SupabaseClient;
  const seededIds: string[] = [];

  beforeAll(async () => {
    admin = adminClient();

    // Todos con el MISMO play_count y el MISMO created_at: el caso que rompe la paginación
    // cuando no hay desempate.
    const sameInstant = new Date().toISOString();
    const rows = Array.from({ length: SEEDED }, () => ({
      image_url: 'data:image/svg+xml;utf8,<svg/>',
      grid_rows: 4,
      grid_cols: 5,
      visibility: 'public',
      source: 'user_photo',
      play_count: 0,
      created_at: sameInstant,
    }));

    const { data, error } = await admin.from('puzzles').insert(rows).select('id');
    if (error) throw error;
    seededIds.push(...data.map((row) => row.id));
  });

  afterAll(async () => {
    if (seededIds.length > 0) await admin.from('puzzles').delete().in('id', seededIds);
  });

  it('ordenando por más jugados devuelve cada rompecabezas exactamente una vez', async () => {
    const ids = await walkAll(admin, 'played');
    const mine = ids.filter((id) => seededIds.includes(id));

    expect(mine).toHaveLength(SEEDED);
    expect(new Set(mine).size).toBe(SEEDED); // sin duplicados
    for (const id of seededIds) expect(mine).toContain(id); // sin saltos
  });

  it('ordenando por más recientes tampoco duplica ni salta, con created_at idéntico', async () => {
    const ids = await walkAll(admin, 'recent');
    const mine = ids.filter((id) => seededIds.includes(id));

    expect(mine).toHaveLength(SEEDED);
    expect(new Set(mine).size).toBe(SEEDED);
  });

  it('el orden es estable entre dos recorridos completos (SC-008)', async () => {
    expect(await walkAll(admin, 'played')).toEqual(await walkAll(admin, 'played'));
  });

  it('la primera página trae exactamente 20 y anuncia que hay más', async () => {
    const page = await fetchPage(admin, 'recent', null);
    expect(page.items).toHaveLength(CATALOG_PAGE_SIZE);
    expect(page.hasMore).toBe(true);
    expect(page.nextCursor).toBeTruthy();
  });

  it('la semilla de 001 no aparece en el catálogo', async () => {
    const ids = await walkAll(admin, 'recent');
    const { data: seeds } = await admin.from('puzzles').select('id').eq('source', 'seed');
    for (const seed of seeds ?? []) expect(ids).not.toContain(seed.id);
  });
});

describe.skipIf(!hasSupabase)('retirada del catálogo', () => {
  let admin: SupabaseClient;
  let puzzleId: string;

  beforeAll(async () => {
    admin = adminClient();
    const { data, error } = await admin
      .from('puzzles')
      .insert({
        image_url: 'data:image/svg+xml;utf8,<svg/>',
        grid_rows: 4,
        grid_cols: 5,
        visibility: 'public',
        source: 'user_photo',
      })
      .select('id')
      .single();
    if (error) throw error;
    puzzleId = data.id;
  });

  afterAll(async () => {
    await admin.from('puzzles').delete().eq('id', puzzleId);
  });

  it('un rompecabezas retirado desaparece del listado pero su fila sigue ahí', async () => {
    expect(await walkAll(admin, 'recent')).toContain(puzzleId);

    await admin.from('puzzles').update({ catalog_status: 'retired' }).eq('id', puzzleId);

    expect(await walkAll(admin, 'recent')).not.toContain(puzzleId);

    // El enlace del creador sigue funcionando: la fila existe, `visibility` no cambió y el
    // objeto de Storage no se borró (FR-030).
    const { data: row } = await admin
      .from('puzzles')
      .select('id, visibility, catalog_status')
      .eq('id', puzzleId)
      .single();

    expect(row!.visibility).toBe('public');
    expect(row!.catalog_status).toBe('retired');
  });
});

if (!hasSupabase) {
  describe('paginación del catálogo', () => {
    it.skip(`omitido: ${skipReason}`, () => {});
  });
}
