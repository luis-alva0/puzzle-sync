import { describe, it, expect } from 'vitest';
import {
  generateRoomCode,
  isValidRoomCode,
  normalizeRoomCode,
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
} from '@/lib/rooms/code';

const AMBIGUOUS = ['0', 'O', '1', 'I', 'L'];

describe('alfabeto del código de sala', () => {
  it('tiene 31 símbolos', () => {
    expect(ROOM_CODE_ALPHABET.length).toBe(31);
  });

  it('excluye los caracteres ambiguos al dictarlo de palabra', () => {
    for (const char of AMBIGUOUS) {
      expect(ROOM_CODE_ALPHABET).not.toContain(char);
    }
  });

  it('no repite ningún símbolo', () => {
    expect(new Set(ROOM_CODE_ALPHABET).size).toBe(ROOM_CODE_ALPHABET.length);
  });
});

describe('generateRoomCode', () => {
  it('genera exactamente 6 caracteres', () => {
    expect(generateRoomCode()).toHaveLength(ROOM_CODE_LENGTH);
  });

  it('solo usa símbolos del alfabeto, nunca ambiguos', () => {
    for (let i = 0; i < 2_000; i++) {
      const code = generateRoomCode();
      for (const char of code) {
        expect(ROOM_CODE_ALPHABET).toContain(char);
      }
      for (const bad of AMBIGUOUS) {
        expect(code).not.toContain(bad);
      }
    }
  });

  it('produce códigos únicos: menos de 0.1 % de colisiones en 10 000 generaciones', () => {
    const total = 10_000;
    const codes = new Set<string>();
    for (let i = 0; i < total; i++) codes.add(generateRoomCode());

    const collisions = total - codes.size;
    // Con 31^6 ≈ 8.87e8 combinaciones, la paradoja del cumpleaños predice ~0.06 colisiones
    // esperadas en 10 000 extracciones. Un umbral de 10 detecta un generador roto sin volver
    // el test inestable.
    expect(collisions).toBeLessThan(10);
  });

  it('no está sesgado hacia el inicio del alfabeto', () => {
    // Un `byte % 31` ingenuo haría los primeros símbolos ~14 % más frecuentes. Se comprueba
    // que ningún símbolo se desvía groseramente de la frecuencia uniforme esperada.
    const counts = new Map<string, number>();
    const samples = 20_000;
    for (let i = 0; i < samples; i++) {
      for (const char of generateRoomCode()) {
        counts.set(char, (counts.get(char) ?? 0) + 1);
      }
    }

    const expected = (samples * ROOM_CODE_LENGTH) / ROOM_CODE_ALPHABET.length;
    for (const char of ROOM_CODE_ALPHABET) {
      const observed = counts.get(char) ?? 0;
      expect(observed).toBeGreaterThan(expected * 0.85);
      expect(observed).toBeLessThan(expected * 1.15);
    }
  });

  it('acepta una fuente de aleatoriedad inyectada', () => {
    // Todos los bytes a 0 → siempre el primer símbolo del alfabeto.
    const allZeros = (size: number) => new Uint8Array(size);
    expect(generateRoomCode(allZeros)).toBe(ROOM_CODE_ALPHABET[0]!.repeat(ROOM_CODE_LENGTH));
  });

  it('sigue generando cuando la fuente devuelve bytes descartados por sesgo', () => {
    // 255 >= limit (248), así que todos se descartan; a la segunda tanda ya sirven.
    let call = 0;
    const source = (size: number) =>
      new Uint8Array(size).fill(call++ === 0 ? 255 : 0);
    expect(generateRoomCode(source)).toHaveLength(ROOM_CODE_LENGTH);
  });
});

describe('isValidRoomCode', () => {
  it('acepta un código bien formado', () => {
    expect(isValidRoomCode('K7PQ3M')).toBe(true);
  });

  it('rechaza longitudes incorrectas', () => {
    expect(isValidRoomCode('K7PQ3')).toBe(false);
    expect(isValidRoomCode('K7PQ3MM')).toBe(false);
  });

  it('rechaza caracteres ambiguos y minúsculas', () => {
    expect(isValidRoomCode('K0PQ3M')).toBe(false);
    expect(isValidRoomCode('KIPQ3M')).toBe(false);
    expect(isValidRoomCode('k7pq3m')).toBe(false);
  });

  it('rechaza lo que no es una cadena', () => {
    expect(isValidRoomCode(null)).toBe(false);
    expect(isValidRoomCode(123456)).toBe(false);
  });

  it('acepta todo lo que genera generateRoomCode', () => {
    for (let i = 0; i < 500; i++) {
      expect(isValidRoomCode(generateRoomCode())).toBe(true);
    }
  });
});

describe('normalizeRoomCode', () => {
  it('pasa a mayúsculas y quita espacios', () => {
    expect(normalizeRoomCode('  k7p q3m ')).toBe('K7PQ3M');
  });

  it('no sustituye caracteres parecidos: un 0 escrito a mano sigue siendo inválido', () => {
    expect(isValidRoomCode(normalizeRoomCode('k0pq3m'))).toBe(false);
  });
});
