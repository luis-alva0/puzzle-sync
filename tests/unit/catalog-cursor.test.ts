import { describe, it, expect } from 'vitest';
import { encodeCursor, decodeCursor } from '@/lib/catalog/cursor';
import type { CatalogCursor } from '@/types/catalog';

const RECENT: CatalogCursor = {
  sort: 'recent',
  key: '2026-08-09T14:32:10.000Z',
  id: '0f9c1a2b-3d4e-4f50-8a1b-2c3d4e5f6071',
};
const PLAYED: CatalogCursor = { sort: 'played', key: 37, id: RECENT.id };

describe('ida y vuelta', () => {
  it('conserva un cursor de recientes', () => {
    expect(decodeCursor(encodeCursor(RECENT), 'recent')).toEqual(RECENT);
  });

  it('conserva un cursor de más jugados', () => {
    expect(decodeCursor(encodeCursor(PLAYED), 'played')).toEqual(PLAYED);
  });

  it('conserva un contador de cero, que es el caso más común', () => {
    const zero: CatalogCursor = { ...PLAYED, key: 0 };
    expect(decodeCursor(encodeCursor(zero), 'played')).toEqual(zero);
  });

  it('produce una cadena segura para una URL', () => {
    const encoded = encodeCursor(RECENT);
    expect(encoded).toBe(encodeURIComponent(encoded));
  });
});

describe('rechazo de cursores inválidos', () => {
  it('rechaza base64 corrupto', () => {
    expect(decodeCursor('no-es-base64-válido-%%%', 'recent')).toBeNull();
  });

  it('rechaza base64 que no contiene JSON', () => {
    expect(decodeCursor(Buffer.from('hola').toString('base64url'), 'recent')).toBeNull();
  });

  it('rechaza JSON que no es un objeto', () => {
    for (const value of ['null', '42', '"texto"', '[]']) {
      expect(decodeCursor(Buffer.from(value).toString('base64url'), 'recent')).toBeNull();
    }
  });

  it('rechaza la cadena vacía', () => {
    expect(decodeCursor('', 'recent')).toBeNull();
  });

  it('rechaza un cursor sin id', () => {
    const broken = Buffer.from(JSON.stringify({ sort: 'recent', key: RECENT.key })).toString(
      'base64url',
    );
    expect(decodeCursor(broken, 'recent')).toBeNull();
  });

  it('rechaza un id vacío', () => {
    expect(decodeCursor(encodeCursor({ ...RECENT, id: '' }), 'recent')).toBeNull();
  });

  it('rechaza un sort desconocido', () => {
    const broken = Buffer.from(JSON.stringify({ ...RECENT, sort: 'aleatorio' })).toString(
      'base64url',
    );
    expect(decodeCursor(broken, 'recent')).toBeNull();
  });
});

describe('coherencia con el ordenamiento pedido', () => {
  it('rechaza un cursor de recientes cuando se pide más jugados', () => {
    // Cambiar de orden a media lista invalida el cursor: describe una posición en una secuencia
    // que ya no existe, y aceptarlo daría resultados incoherentes sin ningún error visible.
    expect(decodeCursor(encodeCursor(RECENT), 'played')).toBeNull();
  });

  it('rechaza un cursor de más jugados cuando se piden recientes', () => {
    expect(decodeCursor(encodeCursor(PLAYED), 'recent')).toBeNull();
  });
});

describe('coherencia de tipo entre clave y ordenamiento', () => {
  it('rechaza recientes con una clave numérica', () => {
    const broken = Buffer.from(JSON.stringify({ sort: 'recent', key: 42, id: RECENT.id })).toString(
      'base64url',
    );
    expect(decodeCursor(broken, 'recent')).toBeNull();
  });

  it('rechaza recientes con una fecha no parseable', () => {
    const broken = Buffer.from(
      JSON.stringify({ sort: 'recent', key: 'no es fecha', id: RECENT.id }),
    ).toString('base64url');
    expect(decodeCursor(broken, 'recent')).toBeNull();
  });

  it('rechaza más jugados con una clave de texto', () => {
    const broken = Buffer.from(
      JSON.stringify({ sort: 'played', key: '37', id: RECENT.id }),
    ).toString('base64url');
    expect(decodeCursor(broken, 'played')).toBeNull();
  });

  it('rechaza más jugados con una clave no finita', () => {
    const broken = Buffer.from(
      JSON.stringify({ sort: 'played', key: null, id: RECENT.id }),
    ).toString('base64url');
    expect(decodeCursor(broken, 'played')).toBeNull();
  });
});
