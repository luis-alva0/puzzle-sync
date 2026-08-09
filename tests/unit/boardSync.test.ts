import { describe, it, expect } from 'vitest';
import {
  applyConfirmedPiece,
  applyProvisionalDrag,
  clearProvisional,
  createBoardSync,
  renderPieces,
} from '@/lib/realtime/boardSync';
import type { Piece } from '@/types/board';

/**
 * Precedencia entre el hecho confirmado y la pista provisional (FR-021, FR-023, FR-025).
 *
 * Es la lógica de sincronización que el Principio VI exige cubrir sin infraestructura, y la
 * única parte del tablero que se puede probar así: el emparejamiento vive en Postgres y su
 * cobertura está en tests/integration/merge-race.test.ts.
 */

function piece(id: string, overrides: Partial<Piece> = {}): Piece {
  return {
    id,
    gridRow: 0,
    gridCol: 0,
    x: 0,
    y: 0,
    groupId: id,
    capturedBy: null,
    ...overrides,
  };
}

describe('precedencia del hecho confirmado sobre la pista provisional (FR-021)', () => {
  it('un evento confirmado descarta la pista de ese grupo', () => {
    let state = createBoardSync([piece('a', { groupId: 'g' })]);
    state = applyProvisionalDrag(state, 'g', { x: 300, y: 300 });
    expect(renderPieces(state)[0]!.x).toBe(300);

    state = applyConfirmedPiece(state, piece('a', { groupId: 'g', x: 50, y: 50 }));

    expect(state.provisional.size).toBe(0);
    expect(renderPieces(state)[0]!.x).toBe(50);
  });

  it('una pista sobre un grupo desconocido se ignora', () => {
    const state = createBoardSync([piece('a', { groupId: 'g' })]);
    const after = applyProvisionalDrag(state, 'grupo-fantasma', { x: 1, y: 1 });
    expect(after.provisional.size).toBe(0);
  });

  it('la pista mueve el grupo entero conservando posiciones relativas', () => {
    let state = createBoardSync([
      piece('a', { groupId: 'g', gridRow: 0, gridCol: 0, x: 0, y: 0 }),
      piece('b', { groupId: 'g', gridRow: 0, gridCol: 1, x: 100, y: 0 }),
    ]);
    state = applyProvisionalDrag(state, 'g', { x: 500, y: 200 });

    const rendered = renderPieces(state);
    const a = rendered.find((p) => p.id === 'a')!;
    const b = rendered.find((p) => p.id === 'b')!;

    expect(a.x).toBe(500);
    expect(a.y).toBe(200);
    // La separación entre ambas no cambia.
    expect(b.x - a.x).toBe(100);
  });

  it('una fusión de grupo limpia también la pista del grupo anterior', () => {
    let state = createBoardSync([piece('a', { groupId: 'viejo' })]);
    state = applyProvisionalDrag(state, 'viejo', { x: 10, y: 10 });

    state = applyConfirmedPiece(state, piece('a', { groupId: 'nuevo' }));

    expect(state.provisional.has('viejo')).toBe(false);
  });
});

describe('reemplazo completo del estado (FR-023)', () => {
  it('el estado del servidor sustituye al local, incluidas las piezas que ya no existen', () => {
    const local = createBoardSync([piece('a', { x: 10 }), piece('b')]);
    const result = createBoardSync([piece('a', { x: 500 }), piece('c')]);

    expect([...local.confirmed.keys()].sort()).toEqual(['a', 'b']);
    expect([...result.confirmed.keys()].sort()).toEqual(['a', 'c']);
    expect(result.confirmed.get('a')!.x).toBe(500);
  });

  it('descarta los movimientos locales sin confirmar', () => {
    let local = createBoardSync([piece('a')]);
    local = applyProvisionalDrag(local, 'a', { x: 999, y: 999 });
    expect(renderPieces(local)[0]!.x).toBe(999);

    const result = createBoardSync([piece('a', { x: 42 })]);
    expect(result.provisional.size).toBe(0);
    expect(renderPieces(result)[0]!.x).toBe(42);
  });

  it('aplicar el mismo estado dos veces es idempotente (FR-025)', () => {
    const server = [piece('a', { x: 7 }), piece('b', { x: 9 })];
    expect(renderPieces(createBoardSync(server))).toEqual(renderPieces(createBoardSync(server)));
  });

  it('tolera el tablero vacío en ambos sentidos', () => {
    expect(createBoardSync([]).confirmed.size).toBe(0);
    expect(createBoardSync([piece('a')]).confirmed.size).toBe(1);
  });
});

describe('clearProvisional', () => {
  it('descarta la pista de un grupo al recibir piece_drop', () => {
    let state = createBoardSync([piece('a', { groupId: 'g' })]);
    state = applyProvisionalDrag(state, 'g', { x: 80, y: 80 });
    state = clearProvisional(state, 'g');
    expect(renderPieces(state)[0]!.x).toBe(0);
  });

  it('limpiar un grupo sin pista no cambia nada', () => {
    const state = createBoardSync([piece('a', { groupId: 'g' })]);
    expect(clearProvisional(state, 'g')).toBe(state);
  });
});
