import { describe, it, expect } from 'vitest';
import {
  PIECE_BOUNDS,
  SLOT_PITCH,
  bandSlots,
  boardSize,
  layoutPieces,
  type ScatteredPiece,
} from '@/lib/puzzle/board-layout';
import { PIECE_SIZE, SNAP_TOLERANCE, solvedSize } from '@/lib/puzzle/geometry';

/**
 * El reparto de piezas por la banda perimetral.
 *
 * La prueba que justifica la funcionalidad entera es «ninguna pareja se solapa»: sin ella, esto
 * es el reparto aleatorio de antes con más pasos. Todo lo demás la acompaña.
 *
 * Se prueba aquí y no contra la base de datos porque la lógica vive aquí: el servidor solo
 * transporta el resultado (Principio VI, «se prueba donde la lógica vive»).
 */

/** Las cinco cantidades admitidas, con la cuadrícula que elige `chooseGrid` para una foto 4:3. */
const COUNTS: Array<[label: number, rows: number, cols: number]> = [
  [20, 4, 5],
  [50, 5, 10],
  [100, 10, 10],
  [104, 8, 13],
  [150, 10, 15],
  [200, 10, 20],
  [500, 20, 25],
];

/** Caja envolvente de una pieza, lengüetas incluidas. No es la celda de 100 × 100. */
function bounds(piece: ScatteredPiece) {
  const overflow = (PIECE_BOUNDS - PIECE_SIZE) / 2;
  return {
    left: piece.x - overflow,
    top: piece.y - overflow,
    right: piece.x - overflow + PIECE_BOUNDS,
    bottom: piece.y - overflow + PIECE_BOUNDS,
  };
}

function overlaps(a: ScatteredPiece, b: ScatteredPiece): boolean {
  const ba = bounds(a);
  const bb = bounds(b);
  // Tocarse por el borde no es solaparse: se comparan con desigualdad estricta.
  return ba.left < bb.right && bb.left < ba.right && ba.top < bb.bottom && bb.top < ba.bottom;
}

describe('boardSize', () => {
  it('rechaza cuadrículas vacías', () => {
    expect(() => boardSize(0, 5)).toThrow(RangeError);
    expect(() => boardSize(5, 0)).toThrow(RangeError);
    expect(() => boardSize(-1, 5)).toThrow(RangeError);
  });

  it('no consulta la ventana: el mismo resultado siempre', () => {
    expect(boardSize(10, 10)).toEqual(boardSize(10, 10));
  });

  it.each(COUNTS)('con %i piezas el área central cabe el rompecabezas armado', (_n, rows, cols) => {
    const board = boardSize(rows, cols);
    const solved = solvedSize(rows, cols);

    expect(board.holeWidth).toBeGreaterThanOrEqual(solved.width);
    expect(board.holeHeight).toBeGreaterThanOrEqual(solved.height);
  });

  it.each(COUNTS)('con %i piezas el área central está centrada', (_n, rows, cols) => {
    const board = boardSize(rows, cols);

    expect(board.holeX).toBeCloseTo((board.width - board.holeWidth) / 2, 6);
    expect(board.holeY).toBeCloseTo((board.height - board.holeHeight) / 2, 6);
  });

  it.each(COUNTS)('con %i piezas la banda tiene huecos de sobra', (n, rows, cols) => {
    const board = boardSize(rows, cols);
    const bandCount = board.slotCols * board.slotRows - board.holeSlotCols * board.holeSlotRows;

    expect(bandCount).toBeGreaterThanOrEqual(n === 104 ? 104 : rows * cols);
  });

  it('el tablero tiende a apaisado, que es lo que mantiene las piezas grandes', () => {
    for (const [, rows, cols] of COUNTS) {
      const board = boardSize(rows, cols);
      expect(board.width / board.height).toBeGreaterThan(1);
    }
  });
});

describe('bandSlots', () => {
  it.each(COUNTS)('con %i piezas ningún hueco invade el área central', (_n, rows, cols) => {
    const board = boardSize(rows, cols);

    for (const slot of bandSlots(board)) {
      const insideX = slot.x + SLOT_PITCH > board.holeX && slot.x < board.holeX + board.holeWidth;
      const insideY = slot.y + SLOT_PITCH > board.holeY && slot.y < board.holeY + board.holeHeight;
      expect(insideX && insideY).toBe(false);
    }
  });

  it.each(COUNTS)('con %i piezas dos huecos nunca coinciden', (_n, rows, cols) => {
    const slots = bandSlots(boardSize(rows, cols));
    const keys = new Set(slots.map((slot) => `${slot.x},${slot.y}`));

    expect(keys.size).toBe(slots.length);
  });

  it.each(COUNTS)('con %i piezas hay huecos suficientes', (_n, rows, cols) => {
    expect(bandSlots(boardSize(rows, cols)).length).toBeGreaterThanOrEqual(rows * cols);
  });
});

describe('layoutPieces', () => {
  it('rechaza cuadrículas vacías', () => {
    expect(() => layoutPieces(0, 5)).toThrow(RangeError);
  });

  // ─── La prueba que justifica la funcionalidad (FR-002) ───
  it.each(COUNTS)('con %i piezas NINGUNA PAREJA SE SOLAPA', (_n, rows, cols) => {
    const pieces = layoutPieces(rows, cols, 12345);

    const collisions: string[] = [];
    for (let i = 0; i < pieces.length; i++) {
      for (let j = i + 1; j < pieces.length; j++) {
        if (overlaps(pieces[i]!, pieces[j]!)) {
          collisions.push(`(${pieces[i]!.gridRow},${pieces[i]!.gridCol})×(${pieces[j]!.gridRow},${pieces[j]!.gridCol})`);
        }
      }
    }

    expect(collisions).toEqual([]);
  });

  it.each(COUNTS)('con %i piezas cada celda aparece una sola vez', (_n, rows, cols) => {
    const pieces = layoutPieces(rows, cols, 7);
    const keys = new Set(pieces.map((p) => `${p.gridRow},${p.gridCol}`));

    expect(pieces).toHaveLength(rows * cols);
    expect(keys.size).toBe(rows * cols);
  });

  it.each(COUNTS)('con %i piezas ninguna cae en el área central (FR-001)', (_n, rows, cols) => {
    const board = boardSize(rows, cols);
    const pieces = layoutPieces(rows, cols, 99);

    for (const piece of pieces) {
      const box = bounds(piece);
      const insideX = box.right > board.holeX && box.left < board.holeX + board.holeWidth;
      const insideY = box.bottom > board.holeY && box.top < board.holeY + board.holeHeight;
      expect(insideX && insideY).toBe(false);
    }
  });

  it.each(COUNTS)('con %i piezas todas caen dentro del tablero', (_n, rows, cols) => {
    const board = boardSize(rows, cols);

    for (const piece of layoutPieces(rows, cols, 3)) {
      const box = bounds(piece);
      expect(box.left).toBeGreaterThanOrEqual(-0.001);
      expect(box.top).toBeGreaterThanOrEqual(-0.001);
      expect(box.right).toBeLessThanOrEqual(board.width + 0.001);
      expect(box.bottom).toBeLessThanOrEqual(board.height + 0.001);
    }
  });

  /**
   * Ninguna pareja arranca encajada.
   *
   * `release_piece` une dos vecinas de cuadrícula cuando su separación cae dentro de la tolerancia
   * respecto de `PIECE_SIZE`. Es un encaje **relativo**, no contra una posición absoluta, así que
   * lo que hay que comprobar es la separación entre vecinas, no la distancia de cada pieza a un
   * punto fijo del tablero.
   */
  it.each(COUNTS)('con %i piezas ninguna pareja vecina arranca encajada', (_n, rows, cols) => {
    const pieces = layoutPieces(rows, cols, 555);
    const at = new Map(pieces.map((p) => [`${p.gridRow},${p.gridCol}`, p]));

    for (const piece of pieces) {
      for (const [dr, dc] of [
        [0, 1],
        [1, 0],
      ] as const) {
        const neighbour = at.get(`${piece.gridRow + dr},${piece.gridCol + dc}`);
        if (!neighbour) continue;

        const wouldSnap =
          Math.abs(piece.x + dc * PIECE_SIZE - neighbour.x) <= SNAP_TOLERANCE &&
          Math.abs(piece.y + dr * PIECE_SIZE - neighbour.y) <= SNAP_TOLERANCE;

        expect(wouldSnap).toBe(false);
      }
    }
  });

  it('la misma semilla da el mismo reparto', () => {
    expect(layoutPieces(10, 10, 42)).toEqual(layoutPieces(10, 10, 42));
  });

  it('semillas distintas dan repartos distintos', () => {
    expect(layoutPieces(10, 10, 1)).not.toEqual(layoutPieces(10, 10, 2));
  });

  /**
   * FR-008: el rompecabezas no puede aparecer medio ordenado alrededor del borde.
   *
   * El umbral es del 15 %, y el número está medido, no elegido a ojo: con permutación uniforme la
   * adyacencia da **5,4 % de media y hasta 9,1 %** sobre 40 semillas en una cuadrícula de 10 × 10.
   * Un umbral del 5 % fallaría la mitad de las veces por puro azar —no detectaría un fallo, sería
   * una moneda al aire—. El 15 % deja margen sobre el azar y queda muy por debajo del más del
   * 50 % que produce no barajar, como comprueba el control negativo de abajo.
   */
  it('la adyacencia entre vecinas no supera lo que daría el azar', () => {
    const rows = 10;
    const cols = 10;
    const pieces = layoutPieces(rows, cols, 2024);
    const at = new Map(pieces.map((p) => [`${p.gridRow},${p.gridCol}`, p]));

    let pairs = 0;
    let adjacent = 0;

    for (const piece of pieces) {
      for (const [dr, dc] of [
        [0, 1],
        [1, 0],
      ] as const) {
        const neighbour = at.get(`${piece.gridRow + dr},${piece.gridCol + dc}`);
        if (!neighbour) continue;
        pairs++;

        // Vecinas en la banda: en huecos contiguos, en cualquier dirección.
        const gapX = Math.abs(piece.x - neighbour.x);
        const gapY = Math.abs(piece.y - neighbour.y);
        if (gapX <= SLOT_PITCH * 1.1 && gapY <= SLOT_PITCH * 1.1) adjacent++;
      }
    }

    expect(adjacent / pairs).toBeLessThan(0.15);
  });

  it('sin barajar la adyacencia se dispara: el umbral anterior mide algo', () => {
    // Control negativo: si las piezas se asignasen a los huecos en orden, casi todas las parejas
    // vecinas caerían contiguas. Sin esto, el umbral podría estar midiendo nada.
    const board = boardSize(10, 10);
    const slots = bandSlots(board);
    const naive = Array.from({ length: 100 }, (_, i) => ({
      gridRow: Math.floor(i / 10),
      gridCol: i % 10,
      x: slots[i]!.x,
      y: slots[i]!.y,
    }));
    const at = new Map(naive.map((p) => [`${p.gridRow},${p.gridCol}`, p]));

    let pairs = 0;
    let adjacent = 0;
    for (const piece of naive) {
      const neighbour = at.get(`${piece.gridRow},${piece.gridCol + 1}`);
      if (!neighbour) continue;
      pairs++;
      if (
        Math.abs(piece.x - neighbour.x) <= SLOT_PITCH * 1.1 &&
        Math.abs(piece.y - neighbour.y) <= SLOT_PITCH * 1.1
      ) {
        adjacent++;
      }
    }

    expect(adjacent / pairs).toBeGreaterThan(0.5);
  });
});
