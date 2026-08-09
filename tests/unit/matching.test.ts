import { describe, it, expect } from 'vitest';
import { findSnapTarget, findSnapChain } from '@/lib/puzzle/matching';
import { PIECE_SIZE, SNAP_TOLERANCE, correctPosition } from '@/lib/puzzle/geometry';
import type { Piece } from '@/types/board';

/** Pieza en su posición correcta, en su propio grupo, salvo que se indique lo contrario. */
function piece(gridRow: number, gridCol: number, overrides: Partial<Piece> = {}): Piece {
  const id = overrides.id ?? `p-${gridRow}-${gridCol}`;
  const correct = correctPosition(gridRow, gridCol);
  return {
    id,
    gridRow,
    gridCol,
    x: correct.x,
    y: correct.y,
    groupId: id,
    capturedBy: null,
    ...overrides,
  };
}

describe('findSnapTarget (FR-016)', () => {
  it('encaja con la vecina de la derecha cuando está en posición exacta', () => {
    const pieces = [piece(0, 0), piece(0, 1)];
    const snap = findSnapTarget('p-0-1', pieces);

    expect(snap).not.toBeNull();
    expect(snap!.targetGroupId).toBe('p-0-0');
    expect(snap!.dx).toBeCloseTo(0);
    expect(snap!.dy).toBeCloseTo(0);
  });

  it('encaja dentro de la tolerancia y devuelve la corrección exacta', () => {
    const offset = SNAP_TOLERANCE - 1;
    const pieces = [
      piece(0, 0),
      piece(0, 1, { x: correctPosition(0, 1).x + offset, y: correctPosition(0, 1).y - offset }),
    ];

    const snap = findSnapTarget('p-0-1', pieces);
    expect(snap).not.toBeNull();
    // El desplazamiento devuelto cancela exactamente la desviación.
    expect(snap!.dx).toBeCloseTo(-offset);
    expect(snap!.dy).toBeCloseTo(offset);
  });

  it('NO encaja fuera de la tolerancia', () => {
    const offset = SNAP_TOLERANCE + 1;
    const pieces = [piece(0, 0), piece(0, 1, { x: correctPosition(0, 1).x + offset })];

    expect(findSnapTarget('p-0-1', pieces)).toBeNull();
  });

  it('NO encaja con piezas no adyacentes en la cuadrícula', () => {
    // (0,0) y (0,2) no son vecinas: aunque estén pegadas físicamente, no deben conectarse.
    const pieces = [piece(0, 0), piece(0, 2, { x: PIECE_SIZE, y: 0 })];

    expect(findSnapTarget('p-0-2', pieces)).toBeNull();
  });

  it('NO encaja en diagonal', () => {
    const pieces = [piece(0, 0), piece(1, 1)];
    expect(findSnapTarget('p-1-1', pieces)).toBeNull();
  });

  it('una pieza sin vecino encajable se queda donde la soltaron (FR-019)', () => {
    const lonely = piece(0, 1, { x: 999, y: 999 });
    const pieces = [piece(0, 0), lonely];

    const snap = findSnapTarget('p-0-1', pieces);
    expect(snap).toBeNull();
    // Nada modificó su posición: la función es pura y no devuelve corrección alguna.
    expect(lonely.x).toBe(999);
    expect(lonely.y).toBe(999);
  });

  it('NO encaja con piezas del propio grupo', () => {
    const pieces = [
      piece(0, 0, { groupId: 'g1' }),
      piece(0, 1, { groupId: 'g1' }),
    ];
    expect(findSnapTarget('p-0-1', pieces)).toBeNull();
  });

  it('elige el candidato más cercano cuando hay varios', () => {
    // (1,1) rodeada por (0,1) arriba y (1,0) a la izquierda; la de arriba está más cerca.
    const pieces = [
      piece(0, 1),
      piece(1, 0, { x: correctPosition(1, 0).x - (SNAP_TOLERANCE - 2) }),
      piece(1, 1, { y: correctPosition(1, 1).y + 1 }),
    ];

    const snap = findSnapTarget('p-1-1', pieces);
    expect(snap).not.toBeNull();
    expect(snap!.anchorPieceId).toBe('p-0-1');
  });

  it('el resultado no depende del orden de las piezas', () => {
    const base = [piece(0, 0), piece(1, 0), piece(0, 1, { y: correctPosition(0, 1).y + 2 })];
    const reversed = [...base].reverse();

    const a = findSnapTarget('p-0-1', base);
    const b = findSnapTarget('p-0-1', reversed);
    expect(a?.anchorPieceId).toBe(b?.anchorPieceId);
    expect(a?.dx).toBeCloseTo(b?.dx ?? NaN);
  });

  it('devuelve null si la pieza no existe', () => {
    expect(findSnapTarget('inexistente', [piece(0, 0)])).toBeNull();
  });

  it('un grupo de dos encaja por cualquiera de sus miembros', () => {
    // Grupo {(0,0),(0,1)} colocado junto a (0,2).
    const pieces = [
      piece(0, 0, { groupId: 'g' }),
      piece(0, 1, { groupId: 'g' }),
      piece(0, 2),
    ];
    const snap = findSnapTarget('p-0-0', pieces);
    expect(snap).not.toBeNull();
    expect(snap!.anchorPieceId).toBe('p-0-2');
    expect(snap!.movingPieceId).toBe('p-0-1');
  });
});

describe('findSnapChain (FR-018, fusión en cascada)', () => {
  it('encadena varios encajes en una sola operación', () => {
    // (1,1) cae en el hueco entre (0,1) y (1,0): debe encajar con ambos.
    const pieces = [piece(0, 1), piece(1, 0), piece(1, 1, { x: correctPosition(1, 1).x + 2 })];

    const chain = findSnapChain('p-1-1', pieces);
    expect(chain.length).toBeGreaterThanOrEqual(2);
  });

  it('devuelve una cadena vacía si no hay ningún encaje', () => {
    const pieces = [piece(0, 0), piece(0, 1, { x: 5_000 })];
    expect(findSnapChain('p-0-1', pieces)).toEqual([]);
  });

  it('termina: no se cuelga con un tablero completo', () => {
    const pieces = [piece(0, 0), piece(0, 1), piece(1, 0), piece(1, 1)];
    const chain = findSnapChain('p-1-1', pieces, SNAP_TOLERANCE, 16);
    expect(chain.length).toBeLessThanOrEqual(16);
  });
});
