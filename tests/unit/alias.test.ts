import { describe, it, expect } from 'vitest';
import {
  validateAlias,
  normalizeAlias,
  disambiguateAliases,
  ALIAS_MIN_LENGTH,
  ALIAS_MAX_LENGTH,
} from '@/lib/rooms/alias';

describe('validateAlias (FR-002)', () => {
  it('acepta un alias normal', () => {
    const result = validateAlias('Luis');
    expect(result).toEqual({ ok: true, alias: 'Luis' });
  });

  it('acepta exactamente el mínimo de 2 caracteres', () => {
    expect(validateAlias('Ax')).toEqual({ ok: true, alias: 'Ax' });
  });

  it('acepta exactamente el máximo de 20 caracteres', () => {
    const alias = 'A'.repeat(ALIAS_MAX_LENGTH);
    expect(validateAlias(alias)).toEqual({ ok: true, alias });
  });

  it('rechaza el vacío', () => {
    expect(validateAlias('')).toEqual({ ok: false, reason: 'too_short' });
  });

  it('rechaza solo espacios', () => {
    expect(validateAlias('     ')).toEqual({ ok: false, reason: 'too_short' });
  });

  it('rechaza 1 carácter', () => {
    expect(validateAlias('A')).toEqual({ ok: false, reason: 'too_short' });
  });

  it('rechaza 21 caracteres', () => {
    expect(validateAlias('A'.repeat(ALIAS_MAX_LENGTH + 1))).toEqual({
      ok: false,
      reason: 'too_long',
    });
  });

  it('mide la longitud DESPUÉS de recortar espacios', () => {
    // 1 carácter útil rodeado de espacios: demasiado corto pese a tener 7 de `.length`.
    expect(validateAlias('   A   ')).toEqual({ ok: false, reason: 'too_short' });
    // 20 caracteres útiles con espacios alrededor: válido, y se guarda recortado.
    const padded = `  ${'B'.repeat(ALIAS_MAX_LENGTH)}  `;
    expect(validateAlias(padded)).toEqual({ ok: true, alias: 'B'.repeat(ALIAS_MAX_LENGTH) });
  });

  it('cuenta caracteres visibles, no unidades UTF-16', () => {
    // '👍👍' tiene .length === 4 pero son 2 caracteres para una persona.
    expect(validateAlias('👍👍')).toEqual({ ok: true, alias: '👍👍' });
  });

  it('rechaza lo que no es una cadena', () => {
    expect(validateAlias(null)).toEqual({ ok: false, reason: 'not_a_string' });
    expect(validateAlias(42)).toEqual({ ok: false, reason: 'not_a_string' });
    expect(validateAlias(undefined)).toEqual({ ok: false, reason: 'not_a_string' });
  });

  it('el mínimo y el máximo son los del spec', () => {
    expect(ALIAS_MIN_LENGTH).toBe(2);
    expect(ALIAS_MAX_LENGTH).toBe(20);
  });
});

describe('normalizeAlias', () => {
  it('recorta espacios en ambos extremos', () => {
    expect(normalizeAlias('  Luis  ')).toBe('Luis');
  });

  it('conserva los espacios interiores', () => {
    expect(normalizeAlias('  Luis Alva  ')).toBe('Luis Alva');
  });
});

describe('disambiguateAliases', () => {
  it('deja los alias únicos intactos', () => {
    const result = disambiguateAliases([{ alias: 'Luis' }, { alias: 'Ana' }]);
    expect(result.map((p) => p.displayAlias)).toEqual(['Luis', 'Ana']);
  });

  it('numera los repetidos en orden de aparición', () => {
    const result = disambiguateAliases([{ alias: 'Ana' }, { alias: 'Luis' }, { alias: 'Ana' }]);
    expect(result.map((p) => p.displayAlias)).toEqual(['Ana (1)', 'Luis', 'Ana (2)']);
  });

  it('no modifica el alias almacenado', () => {
    const result = disambiguateAliases([{ alias: 'Ana' }, { alias: 'Ana' }]);
    expect(result.every((p) => p.alias === 'Ana')).toBe(true);
  });

  it('tolera la lista vacía', () => {
    expect(disambiguateAliases([])).toEqual([]);
  });
});
