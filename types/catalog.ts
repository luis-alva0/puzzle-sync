/**
 * Tipos del catálogo. Ver specs/003-catalogo-rompecabezas/contracts/rest-api.md
 */

export type SortOrder = 'recent' | 'played';

export const SORT_ORDERS: readonly SortOrder[] = ['recent', 'played'];

/** Cuántos rompecabezas devuelve cada carga. */
export const CATALOG_PAGE_SIZE = 20;

export function isSortOrder(value: unknown): value is SortOrder {
  return value === 'recent' || value === 'played';
}

/**
 * Una entrada del catálogo.
 *
 * **No lleva `source` ni `visibility` a propósito.** FR-003 prohíbe distinguir si un
 * rompecabezas es curado o publicado por un jugador, y la forma robusta de garantizarlo es no
 * mandar el dato: una interfaz no puede pintar lo que no recibe.
 */
export interface CatalogItem {
  puzzleId: string;
  /** URL firmada, emitida en cada lectura. No cachear. */
  imageUrl: string;
  pieceCount: number;
  gridRows: number;
  gridCols: number;
  playCount: number;
  /** ISO 8601 con offset -05:00. */
  createdAt: string;
}

/**
 * Cursor de paginación por keyset.
 *
 * Lleva el `sort` dentro para poder rechazar un cursor de un ordenamiento distinto: si el
 * jugador cambia de orden a media lista, el cursor viejo no describe una posición válida.
 *
 * Opaco pero **no secreto**: se codifica en base64 para que el cliente no dependa de su forma,
 * no porque contenga nada sensible. No autoriza nada.
 */
export interface CatalogCursor {
  sort: SortOrder;
  /** `created_at` en ISO para `recent`; `play_count` para `played`. */
  key: string | number;
  /** Desempate. Sin él, dos filas empatadas pueden salir en orden distinto entre consultas. */
  id: string;
}

export interface CatalogPage {
  items: CatalogItem[];
  nextCursor: string | null;
  hasMore: boolean;
}

export type CatalogStatus = 'visible' | 'retired';
