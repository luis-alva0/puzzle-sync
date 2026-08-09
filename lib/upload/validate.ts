import type { ImageFormat } from '@/types/puzzle';

/**
 * Validación del archivo subido, del lado del servidor (FR-004 a FR-008).
 *
 * El navegador valida también, pero eso es una cortesía: cualquiera puede hacer `POST` directo al
 * endpoint. La frontera de confianza está aquí.
 *
 * Función pura sobre bytes, sin acceso a red ni a Supabase: es lógica crítica y el Principio VI
 * exige poder probarla sin infraestructura. Por eso vive fuera del route handler — dentro,
 * probarla exigiría montar una petición HTTP.
 *
 * Las dimensiones se leen parseando la cabecera a mano (research R6). `sharp` está en el árbol
 * como transitiva de Next, pero usarla obligaría a declararla como dependencia directa y traería
 * bindings nativos justo a este módulo, que es el que se quiere poder ejecutar en Node pelado.
 */

export const MAX_FILE_BYTES = 10 * 1024 * 1024;

export type ValidationFailure =
  | { readonly ok: false; readonly reason: 'too_large' }
  | { readonly ok: false; readonly reason: 'unsupported_type' }
  | { readonly ok: false; readonly reason: 'unreadable' };

export type ValidationResult =
  | { readonly ok: true; readonly format: ImageFormat; readonly width: number; readonly height: number }
  | ValidationFailure;

/** Números mágicos. No se mira ni la extensión ni el `Content-Type`: los controla el emisor. */
function detectFormat(bytes: Uint8Array): ImageFormat | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'jpeg';
  }
  const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length >= 8 && PNG_SIGNATURE.every((byte, index) => bytes[index] === byte)) {
    return 'png';
  }
  return null;
}

function readUint32BE(bytes: Uint8Array, offset: number): number {
  return (
    ((bytes[offset]! << 24) | (bytes[offset + 1]! << 16) | (bytes[offset + 2]! << 8) | bytes[offset + 3]!) >>>
    0
  );
}

/**
 * Dimensiones de un PNG: dos enteros de 32 bits al principio del chunk `IHDR`, que por
 * especificación es siempre el primero y está en un desplazamiento fijo.
 */
function readPngSize(bytes: Uint8Array): { width: number; height: number } | null {
  // 8 firma + 4 longitud + 4 tipo = 16, y ahí empiezan ancho y alto.
  if (bytes.length < 24) return null;
  if (String.fromCharCode(bytes[12]!, bytes[13]!, bytes[14]!, bytes[15]!) !== 'IHDR') return null;

  const width = readUint32BE(bytes, 16);
  const height = readUint32BE(bytes, 20);
  return width > 0 && height > 0 ? { width, height } : null;
}

/**
 * Dimensiones de un JPEG: hay que recorrer los segmentos hasta dar con un marcador `SOF`, que es
 * el único que las lleva. No están en una posición fija porque antes puede haber EXIF, perfiles
 * de color y comentarios de longitud arbitraria.
 *
 * Que el recorrido se salga del archivo significa que está truncado, que es justo lo que FR-008
 * pide detectar: la detección sale gratis de la lectura.
 */
function readJpegSize(bytes: Uint8Array): { width: number; height: number } | null {
  let offset = 2; // se salta el SOI (FFD8)

  while (offset + 3 < bytes.length) {
    if (bytes[offset] !== 0xff) return null; // no estamos en un marcador: archivo corrupto

    const marker = bytes[offset + 1]!;

    // Relleno: puede haber varios FF seguidos antes del marcador real.
    if (marker === 0xff) {
      offset += 1;
      continue;
    }
    // Marcadores sin carga útil.
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd9)) {
      offset += 2;
      continue;
    }

    const length = (bytes[offset + 2]! << 8) | bytes[offset + 3]!;
    if (length < 2) return null;

    // SOF0–SOF15, excluyendo DHT (C4), JPG (C8) y DAC (CC), que no son marcos de inicio.
    const isStartOfFrame =
      marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;

    if (isStartOfFrame) {
      // Dentro del SOF: 1 byte de precisión, luego alto y ancho de 16 bits.
      if (offset + 9 >= bytes.length) return null; // truncado justo en la cabecera
      const height = (bytes[offset + 5]! << 8) | bytes[offset + 6]!;
      const width = (bytes[offset + 7]! << 8) | bytes[offset + 8]!;
      return width > 0 && height > 0 ? { width, height } : null;
    }

    offset += 2 + length;
  }

  return null; // se acabó el archivo sin encontrar el SOF
}

/**
 * Valida tamaño, tipo real y legibilidad, y devuelve las dimensiones.
 *
 * El orden importa: primero el tamaño, que es una comparación; luego el tipo, que son unos pocos
 * bytes; y solo al final el recorrido de la cabecera, que es lo más caro.
 */
export function validateImage(bytes: Uint8Array): ValidationResult {
  if (bytes.byteLength > MAX_FILE_BYTES) {
    return { ok: false, reason: 'too_large' };
  }

  const format = detectFormat(bytes);
  if (!format) {
    return { ok: false, reason: 'unsupported_type' };
  }

  const size = format === 'png' ? readPngSize(bytes) : readJpegSize(bytes);
  if (!size) {
    // Números mágicos correctos pero cabecera ilegible: truncado o corrupto (FR-008).
    return { ok: false, reason: 'unreadable' };
  }

  return { ok: true, format, width: size.width, height: size.height };
}
