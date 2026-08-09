import { describe, it, expect } from 'vitest';
import { chooseGrid, actualPieceCount } from '@/lib/puzzle-generation/grid';
import { PIECE_COUNT_OPTIONS } from '@/types/puzzle';

/**
 * La cuadrícula la calcula el servidor y la muestra el cliente antes de confirmar (FR-019).
 * Si las dos no coinciden, el jugador ve un número y se guarda otro, así que el determinismo
 * de esta función no es un detalle.
 */

describe('chooseGrid (research R4)', () => {
  it('nunca devuelve una cuadrícula degenerada', () => {
    const shapes: [number, number][] = [
      [1000, 1000],
      [4000, 3000],
      [3000, 4000],
      [5000, 1000], // panorámica extrema
      [1000, 5000], // muy vertical
      [1920, 1080],
    ];

    for (const target of PIECE_COUNT_OPTIONS) {
      for (const [width, height] of shapes) {
        const grid = chooseGrid(target, width, height);
        expect(grid.rows, `${target} en ${width}x${height}`).toBeGreaterThanOrEqual(2);
        expect(grid.cols, `${target} en ${width}x${height}`).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it('se acerca al objetivo dentro de un margen razonable', () => {
    for (const target of PIECE_COUNT_OPTIONS) {
      const grid = chooseGrid(target, 4000, 3000);
      const actual = actualPieceCount(grid);
      const deviation = Math.abs(actual - target) / target;
      expect(deviation, `${target} -> ${actual}`).toBeLessThan(0.25);
    }
  });

  it('mantiene las piezas razonablemente cuadradas', () => {
    for (const target of PIECE_COUNT_OPTIONS) {
      for (const [width, height] of [
        [4000, 3000],
        [3000, 4000],
        [1920, 1080],
      ] as [number, number][]) {
        const grid = chooseGrid(target, width, height);
        const pieceAspect = width / grid.cols / (height / grid.rows);
        // Ninguna pieza debe pasar de 2:1 en ninguna dirección.
        expect(pieceAspect, `${target} en ${width}x${height}`).toBeGreaterThan(0.5);
        expect(pieceAspect).toBeLessThan(2);
      }
    }
  });

  it('en un recorte cuadrado produce una cuadrícula cuadrada o casi', () => {
    const grid = chooseGrid(100, 1000, 1000);
    expect(Math.abs(grid.rows - grid.cols)).toBeLessThanOrEqual(1);
  });

  it('orienta la cuadrícula según la forma del recorte', () => {
    const landscape = chooseGrid(100, 4000, 2000);
    const portrait = chooseGrid(100, 2000, 4000);

    // Un recorte apaisado necesita más columnas que filas, y al revés.
    expect(landscape.cols).toBeGreaterThan(landscape.rows);
    expect(portrait.rows).toBeGreaterThan(portrait.cols);
    // Y son simétricos entre sí.
    expect(landscape.cols).toBe(portrait.rows);
    expect(landscape.rows).toBe(portrait.cols);
  });

  it('no deforma las piezas para clavar el objetivo: 500 sobre una panorámica no da 1xN', () => {
    const grid = chooseGrid(500, 8000, 1000);
    expect(grid.rows).toBeGreaterThanOrEqual(2);
    const pieceAspect = 8000 / grid.cols / (1000 / grid.rows);
    expect(pieceAspect).toBeLessThan(2);
  });

  it('es determinista: mismas entradas, misma cuadrícula', () => {
    for (let i = 0; i < 50; i++) {
      expect(chooseGrid(200, 3456, 2304)).toEqual(chooseGrid(200, 3456, 2304));
    }
  });

  it('rechaza dimensiones no positivas', () => {
    expect(() => chooseGrid(100, 0, 500)).toThrow(RangeError);
    expect(() => chooseGrid(100, 500, -1)).toThrow(RangeError);
    expect(() => chooseGrid(100, Number.NaN, 500)).toThrow(RangeError);
  });
});
