import { describe, it, expect } from 'vitest';
import { splitmix32, nextFloat, seedFromUuid, hashCoords } from '@/lib/puzzle-generation/prng';

/**
 * Si este módulo deja de ser determinista, dos jugadores de la misma sala ven rompecabezas
 * distintos y **no hay ningún error que lo delate**: el tablero simplemente no encaja entre
 * ellos. Por eso las pruebas insisten tanto en la reproducibilidad.
 */

describe('splitmix32', () => {
  it('es determinista', () => {
    for (const state of [0, 1, -1, 42, 2 ** 31, -(2 ** 31)]) {
      expect(splitmix32(state)).toEqual(splitmix32(state));
    }
  });

  it('devuelve un entero sin signo de 32 bits', () => {
    let state = 12345;
    for (let i = 0; i < 1_000; i++) {
      const step = splitmix32(state);
      expect(Number.isInteger(step.value)).toBe(true);
      expect(step.value).toBeGreaterThanOrEqual(0);
      expect(step.value).toBeLessThanOrEqual(0xffff_ffff);
      state = step.next;
    }
  });

  it('estados distintos dan valores distintos', () => {
    const values = new Set<number>();
    let state = 7;
    for (let i = 0; i < 5_000; i++) {
      const step = splitmix32(state);
      values.add(step.value);
      state = step.next;
    }
    // Con 5000 extracciones sobre 2^32, las colisiones deben ser anecdóticas.
    expect(values.size).toBeGreaterThan(4_990);
  });

  it('la secuencia completa es reproducible desde la misma semilla', () => {
    const run = (seed: number) => {
      const out: number[] = [];
      let state = seed;
      for (let i = 0; i < 100; i++) {
        const step = splitmix32(state);
        out.push(step.value);
        state = step.next;
      }
      return out;
    };
    expect(run(99)).toEqual(run(99));
    expect(run(99)).not.toEqual(run(100));
  });
});

describe('nextFloat', () => {
  it('siempre cae en [0, 1)', () => {
    let state = 5;
    for (let i = 0; i < 2_000; i++) {
      const step = nextFloat(state);
      expect(step.value).toBeGreaterThanOrEqual(0);
      expect(step.value).toBeLessThan(1);
      state = step.next;
    }
  });
});

describe('seedFromUuid', () => {
  const UUID = '0f9c1a2b-3d4e-4f50-8a1b-2c3d4e5f6071';

  it('es determinista', () => {
    expect(seedFromUuid(UUID)).toBe(seedFromUuid(UUID));
  });

  it('UUID distintos dan semillas distintas', () => {
    const seeds = new Set<number>();
    for (let i = 0; i < 2_000; i++) {
      seeds.add(seedFromUuid(`0f9c1a2b-3d4e-4f50-8a1b-${String(i).padStart(12, '0')}`));
    }
    expect(seeds.size).toBeGreaterThan(1_990);
  });

  it('ignora los guiones: la misma secuencia de hex da la misma semilla', () => {
    expect(seedFromUuid(UUID)).toBe(seedFromUuid(UUID.replace(/-/g, '')));
  });

  it('es sensible a cambios de un solo carácter', () => {
    const other = UUID.slice(0, -1) + '2';
    expect(seedFromUuid(UUID)).not.toBe(seedFromUuid(other));
  });

  it('devuelve un entero sin signo de 32 bits', () => {
    const seed = seedFromUuid(UUID);
    expect(Number.isInteger(seed)).toBe(true);
    expect(seed).toBeGreaterThanOrEqual(0);
    expect(seed).toBeLessThanOrEqual(0xffff_ffff);
  });

  it('instantánea: la semilla de un UUID conocido no puede cambiar', () => {
    // Si esto falla, el algoritmo cambió y los rompecabezas ya creados se dibujarían distintos
    // a como se crearon. Debe fallar.
    expect(seedFromUuid('11111111-1111-4111-8111-111111111111')).toMatchInlineSnapshot(`1825862690`);
  });
});

describe('hashCoords', () => {
  it('es determinista y no depende del orden de llamada', () => {
    const seed = 1234;
    const direct = hashCoords(seed, 3, 5, 0);
    // Se intercalan otras llamadas: no debe haber estado compartido.
    hashCoords(seed, 9, 9, 1);
    hashCoords(seed + 1, 3, 5, 0);
    expect(hashCoords(seed, 3, 5, 0)).toBe(direct);
  });

  it('distingue fila, columna y eje', () => {
    const seed = 4242;
    const values = new Set([
      hashCoords(seed, 1, 2, 0),
      hashCoords(seed, 2, 1, 0),
      hashCoords(seed, 1, 2, 1),
      hashCoords(seed, 2, 1, 1),
    ]);
    expect(values.size).toBe(4);
  });

  it('reparte los signos de forma razonablemente equilibrada', () => {
    // El signo de la lengüeta sale del bit 0. Un sesgo fuerte daría rompecabezas feos.
    let ones = 0;
    const total = 10_000;
    for (let i = 0; i < total; i++) ones += hashCoords(99, i % 100, Math.floor(i / 100), 0) & 1;
    expect(ones / total).toBeGreaterThan(0.45);
    expect(ones / total).toBeLessThan(0.55);
  });
});
