import { describe, it, expect } from 'vitest';
import {
  primaryColumn,
  orderColumns,
  keysetFilter,
  cursorFrom,
  CATALOG_FILTER,
  EXCLUDED_SOURCE,
} from '@/lib/catalog/ordering';
import type { CatalogCursor, CatalogItem } from '@/types/catalog';

const ITEM: CatalogItem = {
  puzzleId: '0f9c1a2b-3d4e-4f50-8a1b-2c3d4e5f6071',
  imageUrl: 'https://…',
  pieceCount: 100,
  gridRows: 10,
  gridCols: 10,
  playCount: 0,
  createdAt: '2026-08-09T09:32:10.000-05:00',
};

describe('columnas de ordenación', () => {
  it('recientes ordena por fecha de creación', () => {
    expect(primaryColumn('recent')).toBe('created_at');
  });

  it('más jugados ordena por contador de partidas', () => {
    expect(primaryColumn('played')).toBe('play_count');
  });

  it('el desempate por id está SIEMPRE, en los dos ordenamientos', () => {
    // Es la garantía que impide duplicados y saltos entre páginas sucesivas. Si esta prueba
    // falla, la paginación se rompe de forma intermitente y muy difícil de reproducir.
    expect(orderColumns('recent')).toEqual(['created_at', 'id']);
    expect(orderColumns('played')).toEqual(['play_count', 'id']);
  });

  it('el id es siempre la segunda clave, nunca la primera', () => {
    for (const sort of ['recent', 'played'] as const) {
      const [first, second] = orderColumns(sort);
      expect(first).not.toBe('id');
      expect(second).toBe('id');
    }
  });
});

describe('filtro base del catálogo', () => {
  it('solo públicos y visibles', () => {
    expect(CATALOG_FILTER).toEqual({ visibility: 'public', catalog_status: 'visible' });
  });

  it('la semilla queda excluida', () => {
    expect(EXCLUDED_SOURCE).toBe('seed');
  });
});

describe('condición de keyset', () => {
  it('compara la tupla completa para recientes', () => {
    const cursor: CatalogCursor = {
      sort: 'recent',
      key: '2026-08-09T14:32:10.000Z',
      id: ITEM.puzzleId,
    };
    const filter = keysetFilter(cursor);

    // `clave < k OR (clave = k AND id < i)`, que es `(clave, id) < (k, i)`.
    expect(filter).toContain('created_at.lt.2026-08-09T14:32:10.000Z');
    expect(filter).toContain('and(created_at.eq.2026-08-09T14:32:10.000Z,id.lt.' + ITEM.puzzleId);
  });

  it('compara la tupla completa para más jugados', () => {
    const cursor: CatalogCursor = { sort: 'played', key: 37, id: ITEM.puzzleId };
    const filter = keysetFilter(cursor);

    expect(filter).toContain('play_count.lt.37');
    expect(filter).toContain(`and(play_count.eq.37,id.lt.${ITEM.puzzleId})`);
  });

  it('la rama de empate nunca falta: es la que evita duplicados', () => {
    // Sin el `AND clave = k`, dos filas empatadas se saltarían o se repetirían según el orden
    // arbitrario que devolviera Postgres.
    for (const cursor of [
      { sort: 'recent', key: '2026-01-01T00:00:00.000Z', id: 'a' },
      { sort: 'played', key: 0, id: 'b' },
    ] as CatalogCursor[]) {
      expect(keysetFilter(cursor)).toMatch(/and\(.+\.eq\..+,id\.lt\..+\)/);
    }
  });

  it('funciona con un contador de cero, el caso más frecuente', () => {
    const filter = keysetFilter({ sort: 'played', key: 0, id: ITEM.puzzleId });
    expect(filter).toContain('play_count.lt.0');
    expect(filter).toContain('play_count.eq.0');
  });
});

describe('cursorFrom', () => {
  const RAW_CREATED_AT = '2026-08-09T14:32:10.000Z';

  it('para recientes usa la marca CRUDA, no la formateada a hora de Perú', () => {
    // El cursor compara contra la columna de la base de datos. Usar la presentación con offset
    // -05:00 desplazaría la comparación cinco horas y saltaría filas.
    const cursor = cursorFrom(ITEM, 'recent', RAW_CREATED_AT);
    expect(cursor.key).toBe(RAW_CREATED_AT);
    expect(cursor.key).not.toBe(ITEM.createdAt);
  });

  it('para más jugados usa el contador', () => {
    expect(cursorFrom({ ...ITEM, playCount: 37 }, 'played', RAW_CREATED_AT).key).toBe(37);
  });

  it('lleva el id de la fila y el ordenamiento', () => {
    const cursor = cursorFrom(ITEM, 'played', RAW_CREATED_AT);
    expect(cursor.id).toBe(ITEM.puzzleId);
    expect(cursor.sort).toBe('played');
  });
});
