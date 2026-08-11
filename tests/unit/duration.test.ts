import { describe, it, expect } from 'vitest';
import { formatDuration } from '@/lib/format/duration';

describe('formatDuration', () => {
  it('empieza en 0:00', () => {
    expect(formatDuration(0)).toBe('0:00');
    expect(formatDuration(999)).toBe('0:00');
  });

  it('rellena los segundos a dos cifras', () => {
    expect(formatDuration(5_000)).toBe('0:05');
    expect(formatDuration(59_000)).toBe('0:59');
  });

  it('pasa de minuto en el segundo 60, no antes', () => {
    expect(formatDuration(59_999)).toBe('0:59');
    expect(formatDuration(60_000)).toBe('1:00');
  });

  it('no rellena los minutos cuando no hay horas', () => {
    expect(formatDuration(9 * 60_000 + 7_000)).toBe('9:07');
    expect(formatDuration(59 * 60_000 + 59_000)).toBe('59:59');
  });

  it('pasa a horas justo al llegar a una', () => {
    expect(formatDuration(59 * 60_000 + 59_999)).toBe('59:59');
    expect(formatDuration(3_600_000)).toBe('1:00:00');
  });

  it('con horas rellena los minutos a dos cifras', () => {
    expect(formatDuration(3_600_000 + 5 * 60_000 + 3_000)).toBe('1:05:03');
    expect(formatDuration(12 * 3_600_000 + 34 * 60_000 + 56_000)).toBe('12:34:56');
  });

  /**
   * Un negativo no es un caso imposible: el tiempo se deriva del reloj local corregido con el
   * desfase del servidor, y al estrenar una sala la estimación puede quedar unos milisegundos
   * por debajo de cero. `-0:00` sería un fallo visible en el caso más común.
   */
  it('un valor negativo se muestra como 0:00, no como -0:00', () => {
    expect(formatDuration(-1)).toBe('0:00');
    expect(formatDuration(-90_000)).toBe('0:00');
  });

  it('trunca, no redondea: 1,9 s siguen siendo 1 s', () => {
    expect(formatDuration(1_900)).toBe('0:01');
  });
});
