import { describe, it, expect } from 'vitest';
import { boardSize, layoutPieces, pieceExtent, type ScatteredPiece } from '@/lib/puzzle/board-layout';
import { buildEdgeGrid, pieceEdges } from '@/lib/puzzle-generation/edges';
import { tabOverflow } from '@/lib/puzzle-generation/path';
import { PIECE_SIZE, SNAP_TOLERANCE, solvedSize } from '@/lib/puzzle/geometry';

/**
 * El empaquetado de la banda.
 *
 * La prueba que justifica la funcionalidad sigue siendo «ninguna pareja se solapa», ahora sobre las
 * cajas envolventes **reales** de cada pieza y no sobre el peor caso. Y hay una segunda que la
 * feature 004 no necesitaba: **que el empaquetado aproveche**. Sin ella, un `pieceExtent` que
 * sobrestimara pasaría en verde dejando las piezas tan pequeñas como antes.
 */

const OVERFLOW = tabOverflow(PIECE_SIZE);
const SHAPE_SEED = 0x51ec_1a5b;

const COUNTS: Array<[label: number, rows: number, cols: number]> = [
  [20, 4, 5],
  [50, 5, 10],
  [100, 10, 10],
  [104, 8, 13],
  [150, 10, 15],
  [200, 10, 20],
  [500, 20, 25],
];

/** Caja envolvente real de una pieza colocada, según por dónde le salen las lengüetas. */
function boxOf(piece: ScatteredPiece, rows: number, cols: number, seed: number) {
  const extent = pieceExtent(
    pieceEdges(buildEdgeGrid(seed, rows, cols), piece.gridRow, piece.gridCol),
  );
  const left = piece.x - extent.insetX;
  const top = piece.y - extent.insetY;
  return { left, top, right: left + extent.width, bottom: top + extent.height };
}

describe('pieceExtent', () => {
  it('una pieza sin lengüetas salientes ocupa exactamente la celda', () => {
    const flat = { straight: true, sign: 0 as const, offset: 0, profile: 0 };
    const extent = pieceExtent({ top: flat, right: flat, bottom: flat, left: flat });

    expect(extent.width).toBe(PIECE_SIZE);
    expect(extent.height).toBe(PIECE_SIZE);
    expect(extent.insetX).toBe(0);
  });

  it.each(COUNTS)('con %i piezas cada eje mide 100, 100+o o 100+2o', (_n, rows, cols) => {
    const grid = buildEdgeGrid(SHAPE_SEED, rows, cols);
    const allowed = [PIECE_SIZE, PIECE_SIZE + OVERFLOW, PIECE_SIZE + OVERFLOW * 2];

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const extent = pieceExtent(pieceEdges(grid, row, col));
        expect(allowed.some((v) => Math.abs(v - extent.width) < 1e-9)).toBe(true);
        expect(allowed.some((v) => Math.abs(v - extent.height) < 1e-9)).toBe(true);
      }
    }
  });

  it('una pieza de esquina nunca supera PIECE_SIZE más una holgura por eje', () => {
    const grid = buildEdgeGrid(SHAPE_SEED, 10, 10);
    for (const [row, col] of [
      [0, 0],
      [0, 9],
      [9, 0],
      [9, 9],
    ] as const) {
      const extent = pieceExtent(pieceEdges(grid, row, col));
      expect(extent.width).toBeLessThanOrEqual(PIECE_SIZE + OVERFLOW + 1e-9);
      expect(extent.height).toBeLessThanOrEqual(PIECE_SIZE + OVERFLOW + 1e-9);
    }
  });
});

describe('boardSize', () => {
  it('rechaza cuadrículas vacías', () => {
    expect(() => boardSize(0, 5, SHAPE_SEED)).toThrow(RangeError);
    expect(() => boardSize(5, 0, SHAPE_SEED)).toThrow(RangeError);
  });

  it('no consulta la ventana: el mismo resultado siempre', () => {
    expect(boardSize(10, 10, SHAPE_SEED)).toEqual(boardSize(10, 10, SHAPE_SEED));
  });

  /**
   * El tablero **no puede depender de la semilla de reparto**.
   *
   * El canvas llama a `boardSize` sin conocerla: solo tiene el UUID del rompecabezas. Si el
   * tamaño cambiara con el reparto, el navegador dibujaría un tablero distinto del que el
   * servidor empaquetó y habría piezas fuera de la vista, con el estado correcto y aun así
   * invisible. Es el fallo que este módulo existe para evitar.
   */
  it.each(COUNTS)('con %i piezas el tablero es el mismo con cualquier reparto', (_n, rows, cols) => {
    const board = boardSize(rows, cols, SHAPE_SEED);

    for (const scatterSeed of [1, 42, 999, 123456]) {
      for (const piece of layoutPieces(rows, cols, SHAPE_SEED, scatterSeed)) {
        const box = boxOf(piece, rows, cols, SHAPE_SEED);
        expect(box.right).toBeLessThanOrEqual(board.width + 1e-6);
        expect(box.bottom).toBeLessThanOrEqual(board.height + 1e-6);
      }
    }
  });

  it.each(COUNTS)('con %i piezas el área central cabe el rompecabezas armado', (_n, rows, cols) => {
    const board = boardSize(rows, cols, SHAPE_SEED);
    const solved = solvedSize(rows, cols);

    expect(board.holeWidth).toBeGreaterThanOrEqual(solved.width);
    expect(board.holeHeight).toBeGreaterThanOrEqual(solved.height);
  });

  it.each(COUNTS)('con %i piezas el área central está dentro del tablero', (_n, rows, cols) => {
    const board = boardSize(rows, cols, SHAPE_SEED);

    expect(board.holeX).toBeGreaterThanOrEqual(0);
    expect(board.holeY).toBeGreaterThanOrEqual(0);
    expect(board.holeX + board.holeWidth).toBeLessThanOrEqual(board.width + 1e-6);
    expect(board.holeY + board.holeHeight).toBeLessThanOrEqual(board.height + 1e-6);
  });
});

describe('layoutPieces', () => {
  it('rechaza cuadrículas vacías', () => {
    expect(() => layoutPieces(0, 5, SHAPE_SEED)).toThrow(RangeError);
  });

  // ─── La prueba que justifica la funcionalidad (FR-030) ───
  it.each(COUNTS)('con %i piezas NINGUNA PAREJA SE SOLAPA', (_n, rows, cols) => {
    const boxes = layoutPieces(rows, cols, SHAPE_SEED, 12345).map((p) =>
      boxOf(p, rows, cols, SHAPE_SEED),
    );

    const collisions: string[] = [];
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i]!;
        const b = boxes[j]!;
        if (
          a.left < b.right - 1e-9 &&
          b.left < a.right - 1e-9 &&
          a.top < b.bottom - 1e-9 &&
          b.top < a.bottom - 1e-9
        ) {
          collisions.push(`${i}×${j}`);
        }
      }
    }

    expect(collisions).toEqual([]);
  });

  // ─── La que la feature 004 no necesitaba ───
  it.each(COUNTS)('con %i piezas el empaquetado no desperdicia', (_n, rows, cols) => {
    const board = boardSize(rows, cols, SHAPE_SEED);
    const grid = buildEdgeGrid(SHAPE_SEED, rows, cols);

    // Mínimo teórico: el área central, que es obligatoria, más lo que ocupan las piezas con su
    // separación. Un empaquetado perfecto daría exactamente esto; lo que sobre es desperdicio.
    let piecesArea = 0;
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const extent = pieceExtent(pieceEdges(grid, row, col));
        piecesArea += (extent.width + PIECE_SIZE * 0.08) * (extent.height + PIECE_SIZE * 0.08);
      }
    }
    const floor = board.holeWidth * board.holeHeight + piecesArea;

    // El umbral mide **la eficiencia del empaquetado**, no SC-006: si `pieceExtent` sobrestimara,
    // o las filas dejaran huecos, esto se dispararía. Cuánto crecen las piezas en pantalla se mide
    // en el navegador, que es donde importa.
    expect(board.width * board.height).toBeLessThan(floor * 1.4);
  });

  it.each(COUNTS)('con %i piezas cada celda aparece una sola vez', (_n, rows, cols) => {
    const pieces = layoutPieces(rows, cols, SHAPE_SEED, 7);
    const keys = new Set(pieces.map((p) => `${p.gridRow},${p.gridCol}`));

    expect(pieces).toHaveLength(rows * cols);
    expect(keys.size).toBe(rows * cols);
  });

  it.each(COUNTS)('con %i piezas ninguna cae en el área central', (_n, rows, cols) => {
    const board = boardSize(rows, cols, SHAPE_SEED);

    for (const piece of layoutPieces(rows, cols, SHAPE_SEED, 1)) {
      const box = boxOf(piece, rows, cols, SHAPE_SEED);
      const insideX =
        box.right > board.holeX + 1e-6 && box.left < board.holeX + board.holeWidth - 1e-6;
      const insideY =
        box.bottom > board.holeY + 1e-6 && box.top < board.holeY + board.holeHeight - 1e-6;
      expect(insideX && insideY).toBe(false);
    }
  });

  it.each(COUNTS)('con %i piezas todas caen dentro del tablero', (_n, rows, cols) => {
    const board = boardSize(rows, cols, SHAPE_SEED);

    for (const piece of layoutPieces(rows, cols, SHAPE_SEED, 3)) {
      const box = boxOf(piece, rows, cols, SHAPE_SEED);
      expect(box.left).toBeGreaterThanOrEqual(-1e-6);
      expect(box.top).toBeGreaterThanOrEqual(-1e-6);
      expect(box.right).toBeLessThanOrEqual(board.width + 1e-6);
      expect(box.bottom).toBeLessThanOrEqual(board.height + 1e-6);
    }
  });

  it.each(COUNTS)('con %i piezas ninguna pareja vecina arranca encajada', (_n, rows, cols) => {
    const pieces = layoutPieces(rows, cols, SHAPE_SEED, 555);
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

  it('las mismas semillas dan el mismo reparto (FR-027b, FR-029)', () => {
    expect(layoutPieces(10, 10, SHAPE_SEED, 42)).toEqual(layoutPieces(10, 10, SHAPE_SEED, 42));
  });

  it('semillas de reparto distintas dan repartos distintos', () => {
    expect(layoutPieces(10, 10, SHAPE_SEED, 1)).not.toEqual(layoutPieces(10, 10, SHAPE_SEED, 2));
  });

  it('la semilla de formas también cambia el reparto: las piezas miden otra cosa', () => {
    expect(layoutPieces(10, 10, SHAPE_SEED, 1)).not.toEqual(
      layoutPieces(10, 10, SHAPE_SEED + 1, 1),
    );
  });

  it('la adyacencia entre vecinas no supera lo que daría el azar', () => {
    const pieces = layoutPieces(10, 10, SHAPE_SEED, 2024);
    const at = new Map(pieces.map((p) => [`${p.gridRow},${p.gridCol}`, p]));

    let pairs = 0;
    let adjacent = 0;
    const near = PIECE_SIZE + OVERFLOW * 2 + PIECE_SIZE * 0.2;

    for (const piece of pieces) {
      for (const [dr, dc] of [
        [0, 1],
        [1, 0],
      ] as const) {
        const neighbour = at.get(`${piece.gridRow + dr},${piece.gridCol + dc}`);
        if (!neighbour) continue;
        pairs++;
        if (Math.abs(piece.x - neighbour.x) <= near && Math.abs(piece.y - neighbour.y) <= near) {
          adjacent++;
        }
      }
    }

    expect(adjacent / pairs).toBeLessThan(0.15);
  });
});
