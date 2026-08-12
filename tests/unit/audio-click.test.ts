import { describe, it, expect } from 'vitest';
import { MIN_GAP_MS, playSnapClick, shouldPlay } from '@/lib/audio/click';

/**
 * El limitador del clic de encaje.
 *
 * Es lo único probable de `lib/audio/click.ts`: la síntesis necesita un navegador. Y es lo que
 * importa, porque al sonar también los encajes ajenos dos jugadores rematando a la vez pueden
 * disparar varios en el mismo segundo.
 */
describe('shouldPlay', () => {
  it('deja pasar el primero y corta los de dentro de la ventana', () => {
    expect(shouldPlay(1_000, 0)).toBe(true);
    expect(shouldPlay(1_000, 1_000)).toBe(false);
    expect(shouldPlay(1_000 + MIN_GAP_MS - 1, 1_000)).toBe(false);
    expect(shouldPlay(1_000 + MIN_GAP_MS, 1_000)).toBe(true);
  });

  it('sin navegador no lanza: el encaje se completa igual (FR-022)', () => {
    expect(() => playSnapClick({ now: 1 })).not.toThrow();
  });
});
