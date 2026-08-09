import { describe, it, expect } from 'vitest';
import { buildEdgeGrid, pieceEdges } from '@/lib/puzzle-generation/edges';
import { seedFromUuid } from '@/lib/puzzle-generation/prng';

const UUID = '0f9c1a2b-3d4e-4f50-8a1b-2c3d4e5f6071';
const SEED = seedFromUuid(UUID);

describe('buildEdgeGrid — determinismo', () => {
  it('la misma semilla produce una rejilla idéntica', () => {
    expect(buildEdgeGrid(SEED, 5, 7)).toEqual(buildEdgeGrid(SEED, 5, 7));
  });

  it('semillas distintas producen rejillas distintas', () => {
    expect(buildEdgeGrid(SEED, 5, 7)).not.toEqual(buildEdgeGrid(SEED + 1, 5, 7));
  });

  it('tiene las dimensiones correctas', () => {
    const grid = buildEdgeGrid(SEED, 4, 6);
    expect(grid.horizontal).toHaveLength(5); // rows + 1
    expect(grid.horizontal[0]).toHaveLength(6); // cols
    expect(grid.vertical).toHaveLength(4); // rows
    expect(grid.vertical[0]).toHaveLength(7); // cols + 1
  });

  it('rechaza cuadrículas vacías', () => {
    expect(() => buildEdgeGrid(SEED, 0, 5)).toThrow(RangeError);
    expect(() => buildEdgeGrid(SEED, 5, 0)).toThrow(RangeError);
  });
});

describe('buildEdgeGrid — perímetro recto', () => {
  const grid = buildEdgeGrid(SEED, 4, 6);

  it('la primera y la última fila horizontal son rectas', () => {
    for (const edge of grid.horizontal[0]!) expect(edge.straight).toBe(true);
    for (const edge of grid.horizontal[4]!) expect(edge.straight).toBe(true);
  });

  it('la primera y la última columna vertical son rectas', () => {
    for (const line of grid.vertical) {
      expect(line[0]!.straight).toBe(true);
      expect(line[6]!.straight).toBe(true);
    }
  });

  it('todos los bordes interiores llevan lengüeta', () => {
    for (let row = 1; row < 4; row++) {
      for (let col = 0; col < 6; col++) {
        expect(grid.horizontal[row]![col]!.straight, `h(${row},${col})`).toBe(false);
      }
    }
    for (let row = 0; row < 4; row++) {
      for (let col = 1; col < 6; col++) {
        expect(grid.vertical[row]![col]!.straight, `v(${row},${col})`).toBe(false);
      }
    }
  });

  it('un borde recto no tiene signo ni tamaño', () => {
    const edge = grid.horizontal[0]![0]!;
    expect(edge).toEqual({ straight: true, sign: 0, offset: 0, size: 0 });
  });
});

describe('bordes compartidos — la propiedad que sostiene la feature', () => {
  const grid = buildEdgeGrid(SEED, 5, 5);

  it('el borde derecho de una pieza ES el izquierdo de su vecina, no una copia', () => {
    for (let row = 0; row < 5; row++) {
      for (let col = 0; col < 4; col++) {
        const left = pieceEdges(grid, row, col);
        const right = pieceEdges(grid, row, col + 1);
        // Identidad referencial, no igualdad estructural: es el mismo objeto. Así la
        // complementariedad no puede romperse por una asimetría de cálculo.
        expect(left.right, `(${row},${col})`).toBe(right.left);
      }
    }
  });

  it('el borde inferior de una pieza ES el superior de la de abajo', () => {
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 5; col++) {
        expect(pieceEdges(grid, row, col).bottom).toBe(pieceEdges(grid, row + 1, col).top);
      }
    }
  });

  it('cada borde interior existe una sola vez en toda la rejilla', () => {
    const seen = new Set<object>();
    let interior = 0;
    for (const line of [...grid.horizontal, ...grid.vertical]) {
      for (const edge of line) {
        if (edge.straight) continue;
        interior++;
        seen.add(edge);
      }
    }
    // Ningún objeto de borde interior se repite: cada uno se generó exactamente una vez.
    expect(seen.size).toBe(interior);
  });
});

describe('pieceEdges', () => {
  const grid = buildEdgeGrid(SEED, 3, 3);

  it('las piezas de las esquinas tienen dos lados rectos', () => {
    const topLeft = pieceEdges(grid, 0, 0);
    expect(topLeft.top.straight).toBe(true);
    expect(topLeft.left.straight).toBe(true);
    expect(topLeft.right.straight).toBe(false);
    expect(topLeft.bottom.straight).toBe(false);

    const bottomRight = pieceEdges(grid, 2, 2);
    expect(bottomRight.bottom.straight).toBe(true);
    expect(bottomRight.right.straight).toBe(true);
  });

  it('la pieza central no tiene ningún lado recto', () => {
    const center = pieceEdges(grid, 1, 1);
    expect([center.top, center.right, center.bottom, center.left].every((e) => !e.straight)).toBe(
      true,
    );
  });

  it('rechaza celdas fuera de la cuadrícula', () => {
    expect(() => pieceEdges(grid, -1, 0)).toThrow(RangeError);
    expect(() => pieceEdges(grid, 0, 3)).toThrow(RangeError);
  });
});

describe('instantánea del algoritmo', () => {
  it('la rejilla de un UUID conocido no puede cambiar', () => {
    // Si esto falla, el generador cambió y los rompecabezas ya creados se dibujarían distintos
    // a como se crearon. **Debe** fallar: es su razón de ser.
    const grid = buildEdgeGrid(seedFromUuid('11111111-1111-4111-8111-111111111111'), 2, 2);
    expect({
      h10: grid.horizontal[1]![0],
      h11: grid.horizontal[1]![1],
      v01: grid.vertical[0]![1],
      v11: grid.vertical[1]![1],
    }).toMatchSnapshot();
  });
});
