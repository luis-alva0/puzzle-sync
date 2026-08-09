import { describe, it, expect } from 'vitest';
import {
  groupAnchor,
  groupIds,
  isSingleGroup,
  mergeGroups,
  piecesInGroup,
  translateGroup,
} from '@/lib/puzzle/groups';
import { correctPosition } from '@/lib/puzzle/geometry';
import type { Piece } from '@/types/board';

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

describe('mergeGroups (FR-018)', () => {
  it('absorbe el grupo perdedor dentro del ganador', () => {
    const pieces = [piece(0, 0, { groupId: 'a' }), piece(0, 1, { groupId: 'b' })];
    const merged = mergeGroups(pieces, 'a', 'b');

    expect(merged.every((p) => p.groupId === 'a')).toBe(true);
  });

  it('desplaza solo las piezas absorbidas', () => {
    const pieces = [piece(0, 0, { groupId: 'a' }), piece(0, 1, { groupId: 'b' })];
    const merged = mergeGroups(pieces, 'a', 'b', 10, -5);

    const winner = merged.find((p) => p.id === 'p-0-0')!;
    const loser = merged.find((p) => p.id === 'p-0-1')!;

    expect(winner.x).toBe(pieces[0]!.x);
    expect(winner.y).toBe(pieces[0]!.y);
    expect(loser.x).toBe(pieces[1]!.x + 10);
    expect(loser.y).toBe(pieces[1]!.y - 5);
  });

  it('conserva las posiciones relativas dentro del grupo absorbido', () => {
    const pieces = [
      piece(0, 0, { groupId: 'a' }),
      piece(1, 0, { groupId: 'b' }),
      piece(1, 1, { groupId: 'b' }),
    ];
    const before = pieces[2]!.x - pieces[1]!.x;

    const merged = mergeGroups(pieces, 'a', 'b', 7, 3);
    const after =
      merged.find((p) => p.id === 'p-1-1')!.x - merged.find((p) => p.id === 'p-1-0')!.x;

    expect(after).toBe(before);
  });

  it('fusionar un grupo consigo mismo es idempotente', () => {
    const pieces = [piece(0, 0, { groupId: 'a' }), piece(0, 1, { groupId: 'a' })];
    expect(mergeGroups(pieces, 'a', 'a', 99, 99)).toEqual(pieces);
  });

  it('no muta el arreglo original', () => {
    const pieces = [piece(0, 0, { groupId: 'a' }), piece(0, 1, { groupId: 'b' })];
    const snapshot = JSON.parse(JSON.stringify(pieces));
    mergeGroups(pieces, 'a', 'b', 10, 10);
    expect(pieces).toEqual(snapshot);
  });

  it('encadena fusiones hasta dejar un solo grupo', () => {
    let pieces = [
      piece(0, 0, { groupId: 'a' }),
      piece(0, 1, { groupId: 'b' }),
      piece(1, 0, { groupId: 'c' }),
    ];
    pieces = mergeGroups(pieces, 'a', 'b');
    pieces = mergeGroups(pieces, 'a', 'c');

    expect(groupIds(pieces)).toEqual(['a']);
    expect(isSingleGroup(pieces)).toBe(true);
  });
});

describe('translateGroup', () => {
  it('desplaza solo al grupo indicado', () => {
    const pieces = [piece(0, 0, { groupId: 'a' }), piece(0, 1, { groupId: 'b' })];
    const moved = translateGroup(pieces, 'a', 5, 5);

    expect(moved[0]!.x).toBe(pieces[0]!.x + 5);
    expect(moved[1]!.x).toBe(pieces[1]!.x);
  });
});

describe('isSingleGroup (condición de completado, FR-027)', () => {
  it('es cierto cuando todas comparten grupo', () => {
    expect(isSingleGroup([piece(0, 0, { groupId: 'g' }), piece(0, 1, { groupId: 'g' })])).toBe(true);
  });

  it('es falso si queda más de un grupo', () => {
    expect(isSingleGroup([piece(0, 0, { groupId: 'a' }), piece(0, 1, { groupId: 'b' })])).toBe(
      false,
    );
  });

  it('un tablero vacío NO cuenta como completado', () => {
    expect(isSingleGroup([])).toBe(false);
  });
});

describe('groupAnchor', () => {
  it('elige la pieza de menor fila y columna', () => {
    const pieces = [
      piece(1, 1, { groupId: 'g' }),
      piece(0, 1, { groupId: 'g' }),
      piece(1, 0, { groupId: 'g' }),
    ];
    expect(groupAnchor(pieces, 'g')!.id).toBe('p-0-1');
  });

  it('es determinista con independencia del orden', () => {
    const pieces = [piece(1, 0, { groupId: 'g' }), piece(0, 0, { groupId: 'g' })];
    expect(groupAnchor(pieces, 'g')!.id).toBe(groupAnchor([...pieces].reverse(), 'g')!.id);
  });

  it('devuelve null para un grupo inexistente', () => {
    expect(groupAnchor([piece(0, 0, { groupId: 'g' })], 'otro')).toBeNull();
  });
});

describe('piecesInGroup', () => {
  it('filtra por grupo', () => {
    const pieces = [piece(0, 0, { groupId: 'a' }), piece(0, 1, { groupId: 'b' })];
    expect(piecesInGroup(pieces, 'a')).toHaveLength(1);
  });
});
