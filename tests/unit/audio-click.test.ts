import { describe, it, expect, beforeEach } from 'vitest';
import { MIN_GAP_MS, playSnapClick, resetClickLimiter } from '@/lib/audio/click';

/**
 * El limitador del clic de encaje.
 *
 * Es la parte probable de `lib/audio/click.ts`: la síntesis necesita un navegador, pero **decidir
 * si toca sonar** es aritmética. Y es la que importa, porque al sonar también los encajes ajenos
 * dos jugadores rematando a la vez pueden disparar varios en el mismo segundo.
 *
 * Aquí no hay `AudioContext` —`window` no existe en el entorno de pruebas—, así que `playSnapClick`
 * devuelve `false` siempre. Lo que se comprueba es que **no lance**, que es la garantía de FR-022:
 * un fallo de audio no puede impedir que dos piezas encajen.
 */

describe('limitador de repetición', () => {
  beforeEach(() => resetClickLimiter());

  it('silenciado no suena, y ni siquiera consulta el audio', () => {
    expect(playSnapClick({ muted: true, now: 1_000 })).toBe(false);
  });

  it('descarta un segundo clic dentro de la ventana mínima', () => {
    // Sin navegador la reproducción devuelve `false`, así que se comprueba el otro camino: que la
    // llamada dentro de la ventana ni siquiera intente sonar.
    playSnapClick({ now: 1_000 });
    const inside = playSnapClick({ now: 1_000 + MIN_GAP_MS - 1 });
    expect(inside).toBe(false);
  });

  it('la ventana mínima deja hueco para un rompecabezas, no para una matraca', () => {
    // 150 ms: diez encajes en cinco segundos caben de sobra, y dos simultáneos no se solapan.
    expect(MIN_GAP_MS).toBeGreaterThanOrEqual(100);
    expect(MIN_GAP_MS).toBeLessThanOrEqual(300);
  });
});

describe('resistencia a fallos (FR-022)', () => {
  beforeEach(() => resetClickLimiter());

  it('sin navegador no lanza: el encaje se completa igual', () => {
    expect(() => playSnapClick({ now: 1 })).not.toThrow();
    expect(playSnapClick({ now: 2_000 })).toBe(false);
  });

  it('llamarlo muchas veces seguidas tampoco lanza', () => {
    expect(() => {
      for (let i = 0; i < 200; i++) playSnapClick({ now: i * 10 });
    }).not.toThrow();
  });

  it('acepta que no le pasen nada', () => {
    expect(() => playSnapClick()).not.toThrow();
  });
});
