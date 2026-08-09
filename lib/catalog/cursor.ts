import { isSortOrder, type CatalogCursor, type SortOrder } from '@/types/catalog';

/**
 * Cursor de paginación por keyset.
 *
 * Opaco pero **no secreto**: se codifica en base64 para que el cliente no dependa de su forma,
 * no porque contenga nada sensible. No autoriza nada, y manipularlo solo permite pedir una
 * posición distinta de una lista que ya es pública.
 *
 * Lleva el `sort` dentro para poder rechazar un cursor de otro ordenamiento: si el jugador
 * cambia de orden a media lista, el cursor viejo describe una posición en una secuencia que ya
 * no existe, y usarlo daría resultados incoherentes en silencio.
 *
 * Lógica pura, sin acceso a base de datos: el Principio VI la quiere probada sin infraestructura.
 */

export function encodeCursor(cursor: CatalogCursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}

/**
 * Descodifica un cursor y comprueba que corresponde al ordenamiento pedido.
 *
 * Devuelve `null` ante cualquier problema —base64 inválido, JSON roto, campos ausentes, tipo
 * equivocado o `sort` distinto— en lugar de lanzar. El llamador lo traduce a `INVALID_CURSOR`,
 * y lo importante es que nunca produzca una consulta silenciosamente incorrecta.
 */
export function decodeCursor(raw: string, expectedSort: SortOrder): CatalogCursor | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
  } catch {
    return null;
  }

  if (typeof parsed !== 'object' || parsed === null) return null;
  const candidate = parsed as Partial<CatalogCursor>;

  if (!isSortOrder(candidate.sort)) return null;
  // Un cursor de otro ordenamiento no describe una posición válida en esta secuencia.
  if (candidate.sort !== expectedSort) return null;

  if (typeof candidate.id !== 'string' || candidate.id.length === 0) return null;

  // `recent` pagina por una fecha ISO; `played`, por un entero.
  if (candidate.sort === 'recent') {
    if (typeof candidate.key !== 'string' || Number.isNaN(Date.parse(candidate.key))) return null;
  } else if (typeof candidate.key !== 'number' || !Number.isFinite(candidate.key)) {
    return null;
  }

  return { sort: candidate.sort, key: candidate.key, id: candidate.id };
}
