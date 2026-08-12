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

/**
 * El desplazamiento provisional, que es donde vivía el bug del arrastre de grupos.
 *
 * Las pruebas de arriba pasaban **con las dos semánticas**, la vieja y la nueva, porque todas
 * ponían la pieza agarrada en el origen del grupo. Ahí la posición absoluta y el desplazamiento
 * coinciden por casualidad, y el fallo pasó desapercibido. Estas la agarran por el medio.
 */
describe('arrastre de un grupo agarrado por cualquier pieza', () => {
  /** Tres piezas en fila, ya unidas, en (200,50), (300,50) y (400,50). */
  function trio() {
    return createBoardSync([
      piece('izq', { groupId: 'g', gridRow: 0, gridCol: 0, x: 200, y: 50 }),
      piece('med', { groupId: 'g', gridRow: 0, gridCol: 1, x: 300, y: 50 }),
      piece('der', { groupId: 'g', gridRow: 0, gridCol: 2, x: 400, y: 50 }),
    ]);
  }

  it('**agarrando la pieza del medio, las tres se desplazan lo mismo**', () => {
    // El jugador arrastra `med` de (300,50) a (330,90): un desplazamiento de (30,40).
    const state = applyProvisionalDrag(trio(), 'g', { x: 30, y: 40 });
    const at = new Map(renderPieces(state).map((p) => [p.id, p]));

    expect(at.get('izq')).toMatchObject({ x: 230, y: 90 });
    expect(at.get('med')).toMatchObject({ x: 330, y: 90 });
    expect(at.get('der')).toMatchObject({ x: 430, y: 90 });
  });

  it('la pieza agarrada acaba exactamente donde la dejó el puntero', () => {
    // Con la semántica vieja, el bloque se dibujaba desplazado (agarrada − ancla) = 100 px.
    const state = applyProvisionalDrag(trio(), 'g', { x: 30, y: 40 });
    const med = renderPieces(state).find((p) => p.id === 'med')!;

    expect(med.x).toBe(330);
    expect(med.x).not.toBe(430); // lo que salía interpretando el desplazamiento como posición
  });

  it('las distancias entre piezas del grupo no cambian al arrastrar', () => {
    const before = renderPieces(trio());
    const after = renderPieces(applyProvisionalDrag(trio(), 'g', { x: -75, y: 12 }));

    const gap = (list: typeof before, a: string, b: string) =>
      list.find((p) => p.id === b)!.x - list.find((p) => p.id === a)!.x;

    expect(gap(after, 'izq', 'med')).toBe(gap(before, 'izq', 'med'));
    expect(gap(after, 'med', 'der')).toBe(gap(before, 'med', 'der'));
  });

  it('un desplazamiento de cero deja el grupo donde estaba', () => {
    const state = applyProvisionalDrag(trio(), 'g', { x: 0, y: 0 });
    expect(renderPieces(state).find((p) => p.id === 'med')).toMatchObject({ x: 300, y: 50 });
  });

  it('el desplazamiento no toca las piezas de otros grupos', () => {
    let state = createBoardSync([
      piece('mio', { groupId: 'g', x: 100, y: 100 }),
      piece('ajena', { groupId: 'otro', x: 700, y: 700 }),
    ]);
    state = applyProvisionalDrag(state, 'g', { x: 50, y: 50 });

    const at = new Map(renderPieces(state).map((p) => [p.id, p]));
    expect(at.get('mio')).toMatchObject({ x: 150, y: 150 });
    expect(at.get('ajena')).toMatchObject({ x: 700, y: 700 });
  });

  it('al descartar el provisional el grupo vuelve a su posición confirmada', () => {
    let state = applyProvisionalDrag(trio(), 'g', { x: 30, y: 40 });
    state = clearProvisional(state, 'g');

    const at = new Map(renderPieces(state).map((p) => [p.id, p]));
    expect(at.get('med')).toMatchObject({ x: 300, y: 50 });
  });
});
