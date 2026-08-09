import type { CatalogCursor, CatalogItem, SortOrder } from '@/types/catalog';

/**
 * Ordenamiento y paginación por keyset del catálogo.
 *
 * **Siempre con `id` como segunda clave.** No es un detalle: con `play_count = 0` en casi todo el
 * catálogo, los empates son la norma, y sin desempate Postgres puede devolver dos filas empatadas
 * en orden distinto entre dos consultas. Con paginación por posición eso produce una fila
 * repetida en una página y otra ausente en la siguiente.
 *
 * **Keyset y no `OFFSET`**: con `OFFSET`, insertar un rompecabezas mientras alguien navega
 * desplaza toda la lista y el jugador ve una fila repetida. El keyset apunta a una fila concreta,
 * y además no se degrada al alejarse del principio.
 *
 * Lógica pura: no toca la base de datos, solo describe cómo consultarla.
 */

/** Columna principal de cada ordenamiento. La secundaria es siempre `id`. */
export function primaryColumn(sort: SortOrder): 'created_at' | 'play_count' {
  return sort === 'recent' ? 'created_at' : 'play_count';
}

/**
 * Filtro base del catálogo, y es obligatorio.
 *
 * El listado consulta con `service_role`, así que **la política RLS no se aplica**. Este filtro
 * es lo único que impide que salgan privados y retirados; olvidarlo los publicaría.
 *
 * `source <> 'seed'` excluye las tres filas de la semilla: son `public` desde la migración de
 * 002, pero son andamiaje con `data:` URI, no contenido del catálogo.
 */
export const CATALOG_FILTER = {
  visibility: 'public',
  catalog_status: 'visible',
} as const;

export const EXCLUDED_SOURCE = 'seed';

/**
 * Condición de keyset en la sintaxis de filtro de PostgREST.
 *
 * Expresa `(clave, id) < (cursor.key, cursor.id)` como `clave < k OR (clave = k AND id < i)`,
 * que es lo mismo y sí se puede escribir con `.or()`.
 */
export function keysetFilter(cursor: CatalogCursor): string {
  const column = primaryColumn(cursor.sort);
  const key = cursor.sort === 'recent' ? cursor.key : String(cursor.key);
  return `${column}.lt.${key},and(${column}.eq.${key},id.lt.${cursor.id})`;
}

/** Columnas de ordenación, en orden, siempre descendentes. */
export function orderColumns(sort: SortOrder): readonly ['created_at' | 'play_count', 'id'] {
  return [primaryColumn(sort), 'id'];
}

/** Cursor que apunta a una fila, para continuar la paginación a partir de ella. */
export function cursorFrom(item: CatalogItem, sort: SortOrder, rawCreatedAt: string): CatalogCursor {
  return {
    sort,
    // Para `recent` se usa la marca cruda de la base de datos, no la formateada a hora de Perú:
    // el cursor tiene que comparar contra la columna, no contra su presentación.
    key: sort === 'recent' ? rawCreatedAt : item.playCount,
    id: item.puzzleId,
  };
}
