import { describe, it, expect } from 'vitest';
import {
  MAX_PROFILE_DEPTH,
  PROFILE_COUNT,
  TAB_DEPTH,
  TAB_PROFILES,
  type TabProfile,
} from '@/lib/puzzle-generation/tab-profiles';

/**
 * El catálogo de perfiles de lengüeta.
 *
 * La prueba que importa es la del cuello: **es lo único que separa una lengüeta de la joroba
 * anterior**, y lo que hace reconocible la silueta a tamaño pequeño. Si un perfil pierde el
 * cuello, el tablero vuelve a parecer un campo de flores y ninguna otra prueba lo diría.
 */

describe('catálogo de perfiles', () => {
  it('tiene entre dos y seis perfiles (FR-010)', () => {
    expect(PROFILE_COUNT).toBeGreaterThanOrEqual(2);
    expect(PROFILE_COUNT).toBeLessThanOrEqual(6);
  });

  it('la profundidad es la del 22 % acordado con el empaquetado', () => {
    // Acoplada a la tabla de research R6: subirla encoge las piezas en pantalla.
    expect(TAB_DEPTH).toBeCloseTo(0.22, 5);
  });
});

describe.each(TAB_PROFILES.map((profile, index) => [index, profile] as const))(
  'perfil %i',
  (_index, profile: TabProfile) => {
    it('**el cuello es más estrecho que la cabeza** (FR-009)', () => {
      expect(profile.neckHalfWidth).toBeLessThan(profile.headHalfWidth);
    });

    it('el cuello se estrecha de forma apreciable, no de milímetro', () => {
      // Un cuello un 1 % más estrecho cumpliría la prueba anterior y seguiría leyéndose como
      // joroba. Se exige que sea al menos un 20 % más estrecho que la cabeza.
      expect(profile.neckHalfWidth).toBeLessThan(profile.headHalfWidth * 0.8);
    });

    it('arranca sobre la línea del borde', () => {
      const first = profile.rise[0]![0]!;
      expect(first.d).toBeCloseTo(0, 6);
    });

    it('termina en la cima, centrada en el borde', () => {
      const last = profile.rise.at(-1)![2]!;
      expect(last.t).toBeCloseTo(0, 6);
      expect(last.d).toBeCloseTo(1, 6);
    });

    it('la subida avanza hacia el centro sin retroceder', () => {
      const anchors = profile.rise.map((segment) => segment[2]!);
      for (let i = 1; i < anchors.length; i++) {
        expect(anchors[i]!.t).toBeGreaterThan(anchors[i - 1]!.t);
      }
    });

    it('cabe en el ancho del lado', () => {
      const widest = Math.max(...profile.rise.flatMap((s) => s.map((p) => Math.abs(p.t))));
      expect(widest).toBeLessThan(0.5);
    });

    it('no supera la profundidad que reserva tabOverflow', () => {
      // Si un perfil sobresaliera más, la lengüeta saldría recortada al dibujarse y el
      // empaquetado reservaría menos espacio del que ocupa.
      const depth = TAB_DEPTH * Math.max(...profile.rise.flatMap((s) => s.map((p) => p.d)));
      expect(depth).toBeLessThanOrEqual(MAX_PROFILE_DEPTH + 1e-9);
    });
  },
);

describe('MAX_PROFILE_DEPTH', () => {
  it('se deriva del catálogo, no está escrita a mano', () => {
    const manual = TAB_DEPTH * Math.max(...TAB_PROFILES.flatMap((p) => p.rise.flatMap((s) => s.map((q) => q.d))));
    expect(MAX_PROFILE_DEPTH).toBeCloseTo(manual, 10);
  });

  it('los perfiles llegan justo a la profundidad nominal', () => {
    expect(MAX_PROFILE_DEPTH).toBeCloseTo(TAB_DEPTH, 6);
  });
});

/**
 * Complementariedad: la lengüeta de una pieza y el hueco de su vecina.
 *
 * Es la misma comprobación con la que se descartó la geometría como causa de las costuras, ahora
 * aplicada a cada perfil del catálogo. Reproduce lo que hace `traceEdge`: el desplazamiento
 * perpendicular de un punto del perfil, leído desde los dos lados del borde compartido.
 *
 * Si esto falla, dos piezas vecinas dejarían un hueco o se montarían, y ninguna prueba de
 * dibujado lo vería porque el canvas no se prueba.
 */
describe('complementariedad de los perfiles', () => {
  const SIZE = 100;

  /** Desplazamiento perpendicular que aplica `traceEdge` a un punto, para un borde y un sentido. */
  function offsetOf(dx: number, dy: number, sign: 1 | -1, direction: 1 | -1, d: number) {
    const nx = -dy / SIZE;
    const ny = dx / SIZE;
    const depth = TAB_DEPTH * SIZE * sign * direction;
    return { x: nx * d * depth, y: ny * d * depth };
  }

  it.each(TAB_PROFILES.map((p, i) => [i, p] as const))(
    'el perfil %i produce lengüeta y hueco exactamente opuestos',
    (_i, profile) => {
      const depths = profile.rise.flatMap((segment) => segment.map((point) => point.d));

      for (const sign of [1, -1] as const) {
        for (const d of depths) {
          // Borde compartido horizontal: es el superior de la pieza de abajo (izq→der, dir −1) y
          // el inferior de la de arriba (der→izq, dir +1).
          const below = offsetOf(SIZE, 0, sign, -1, d);
          const above = offsetOf(-SIZE, 0, sign, 1, d);
          expect(below.y).toBeCloseTo(above.y, 10);

          // Y el vertical: derecho de una (arriba→abajo, dir +1), izquierdo de la otra al revés.
          const right = offsetOf(0, SIZE, sign, 1, d);
          const left = offsetOf(0, -SIZE, sign, -1, d);
          expect(right.x).toBeCloseTo(left.x, 10);
        }
      }
    },
  );

  it('un signo distinto invierte el sentido: donde una saca, la otra mete', () => {
    const d = 1;
    const saliente = offsetOf(SIZE, 0, 1, -1, d);
    const entrante = offsetOf(SIZE, 0, -1, -1, d);
    expect(Math.sign(saliente.y)).toBe(-Math.sign(entrante.y));
  });
});
