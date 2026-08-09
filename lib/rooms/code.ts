/**
 * Generación y validación del código de sala.
 *
 * Seis caracteres alfanuméricos en mayúsculas, excluyendo los ambiguos al dictarlos de
 * palabra: `0`/`O`, `1`/`I`/`L`. Quedan 31 símbolos, y 31^6 ≈ 8.87 × 10⁸ combinaciones.
 *
 * El código NO es una credencial: la protección de la sala la da RLS, no lo difícil que sea
 * adivinar el código (Principio II).
 */

export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const ROOM_CODE_LENGTH = 6;

const ROOM_CODE_PATTERN = new RegExp(`^[${ROOM_CODE_ALPHABET}]{${ROOM_CODE_LENGTH}}$`);

/** Fuente de aleatoriedad. Inyectable para que los tests sean deterministas. */
export type RandomBytes = (size: number) => Uint8Array;

const defaultRandomBytes: RandomBytes = (size) => {
  const bytes = new Uint8Array(size);
  crypto.getRandomValues(bytes);
  return bytes;
};

/**
 * Genera un código de sala.
 *
 * Rechaza los bytes que caen en la cola incompleta del rango en lugar de aplicar un módulo
 * directo: con 31 símbolos y 256 valores posibles, `byte % 31` haría los primeros símbolos
 * del alfabeto más probables que los últimos. No es un problema de seguridad aquí, pero un
 * generador sesgado colisiona antes.
 */
export function generateRoomCode(randomBytes: RandomBytes = defaultRandomBytes): string {
  const alphabetSize = ROOM_CODE_ALPHABET.length;
  const limit = Math.floor(256 / alphabetSize) * alphabetSize;

  let code = '';
  while (code.length < ROOM_CODE_LENGTH) {
    const bytes = randomBytes(ROOM_CODE_LENGTH);
    for (const byte of bytes) {
      if (byte >= limit) continue;
      code += ROOM_CODE_ALPHABET[byte % alphabetSize];
      if (code.length === ROOM_CODE_LENGTH) break;
    }
  }
  return code;
}

/** ¿Tiene este código la forma correcta? No dice nada sobre si la sala existe. */
export function isValidRoomCode(code: unknown): code is string {
  return typeof code === 'string' && ROOM_CODE_PATTERN.test(code);
}

/**
 * Normaliza lo que el jugador escribe a mano: mayúsculas y sin espacios.
 *
 * No sustituye caracteres parecidos (`0` → `O`) a propósito: como el alfabeto ya los excluye,
 * un `0` escrito a mano significa que el jugador se equivocó de código, y conviene que el
 * error salga a la luz en vez de mandarlo a una sala distinta.
 */
export function normalizeRoomCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, '');
}
