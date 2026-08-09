import { describe, it, expect } from 'vitest';
import {
  findDivergence,
  hasConverged,
  reconcileAfterReconnect,
} from '@/lib/realtime/reconcile';
import {
  applyConfirmedPiece,
  applyProvisionalDrag,
  createBoardSync,
  renderPieces,
} from '@/lib/realtime/boardSync';
import type { Piece } from '@/types/board';

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

describe('reconcileAfterReconnect (FR-023)', () => {
  it('el estado del servidor reemplaza por completo al local', () => {
    const local = createBoardSync([piece('a', { x: 10 }), piece('b')]);
    const server = [piece('a', { x: 500 }), piece('c')];

    const result = reconcileAfterReconnect(local, server);

    expect([...result.confirmed.keys()].sort()).toEqual(['a', 'c']);
    expect(result.confirmed.get('a')!.x).toBe(500);
    // 'b' desapareció del servidor, así que desaparece del cliente.
    expect(result.confirmed.has('b')).toBe(false);
  });

  it('descarta los movimientos locales sin confirmar', () => {
    let local = createBoardSync([piece('a')]);
    local = applyProvisionalDrag(local, 'a', { x: 999, y: 999 });
    expect(renderPieces(local)[0]!.x).toBe(999);

    const result = reconcileAfterReconnect(local, [piece('a', { x: 42 })]);

    expect(result.provisional.size).toBe(0);
    expect(renderPieces(result)[0]!.x).toBe(42);
  });

  it('aplicar el mismo estado dos veces es idempotente (FR-025)', () => {
    const local = createBoardSync([piece('a', { x: 1 })]);
    const server = [piece('a', { x: 7 }), piece('b', { x: 9 })];

    const once = reconcileAfterReconnect(local, server);
    const twice = reconcileAfterReconnect(once, server);

    expect(renderPieces(twice)).toEqual(renderPieces(once));
  });

  it('tolera un estado local vacío: la primera carga es un caso más', () => {
    const result = reconcileAfterReconnect(createBoardSync(), [piece('a')]);
    expect(result.confirmed.size).toBe(1);
  });

  it('tolera que el servidor devuelva un tablero vacío', () => {
    const result = reconcileAfterReconnect(createBoardSync([piece('a')]), []);
    expect(result.confirmed.size).toBe(0);
  });
});

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

describe('findDivergence / hasConverged (SC-008)', () => {
  it('detecta convergencia total', () => {
    const pieces = [piece('a', { x: 3 }), piece('b', { x: 4 })];
    expect(hasConverged(createBoardSync(pieces), pieces)).toBe(true);
  });

  it('detecta diferencias de posición', () => {
    const local = createBoardSync([piece('a', { x: 3 })]);
    const divergence = findDivergence(local, [piece('a', { x: 99 })]);
    expect(divergence.changed).toEqual(['a']);
  });

  it('detecta diferencias de grupo y de captura', () => {
    const local = createBoardSync([piece('a', { groupId: 'g1' })]);
    expect(findDivergence(local, [piece('a', { groupId: 'g2' })]).changed).toEqual(['a']);

    const local2 = createBoardSync([piece('a', { capturedBy: null })]);
    expect(findDivergence(local2, [piece('a', { capturedBy: 'jugador' })]).changed).toEqual(['a']);
  });

  it('detecta piezas que faltan y piezas de más', () => {
    const local = createBoardSync([piece('a'), piece('sobra')]);
    const divergence = findDivergence(local, [piece('a'), piece('nueva')]);

    expect(divergence.missingLocally).toEqual(['nueva']);
    expect(divergence.staleLocally).toEqual(['sobra']);
  });

  it('ignora diferencias de coma flotante despreciables', () => {
    const local = createBoardSync([piece('a', { x: 10 })]);
    expect(hasConverged(local, [piece('a', { x: 10.001 })])).toBe(true);
  });

  it('tras reconciliar, siempre converge', () => {
    const local = createBoardSync([piece('a', { x: 1 })]);
    const server = [piece('a', { x: 88 }), piece('b')];
    expect(hasConverged(reconcileAfterReconnect(local, server), server)).toBe(true);
  });
});
