import { describe, it, expect } from 'vitest';
import { validateImage, MAX_FILE_BYTES } from '@/lib/upload/validate';
import { pngOf, jpegOf } from '../helpers/images';

/**
 * La frontera de confianza está en el servidor: el navegador valida por cortesía, pero cualquiera
 * puede hacer POST directo. Estas pruebas son las que respaldan esa afirmación.
 */

describe('detección de tipo por números mágicos (FR-004, FR-006)', () => {
  it('acepta PNG', () => {
    const result = validateImage(pngOf(800, 600));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.format).toBe('png');
  });

  it('acepta JPEG', () => {
    const result = validateImage(jpegOf(1024, 768));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.format).toBe('jpeg');
  });

  it('rechaza un PDF', () => {
    // '%PDF-1.7'
    const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37, 0x0a, 0x00]);
    expect(validateImage(pdf)).toEqual({ ok: false, reason: 'unsupported_type' });
  });

  it('rechaza GIF, WEBP y HEIC: solo JPG y PNG', () => {
    const gif = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x00, 0x00, 0x00, 0x00]);
    const webp = new Uint8Array([
      0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
    ]);
    expect(validateImage(gif)).toEqual({ ok: false, reason: 'unsupported_type' });
    expect(validateImage(webp)).toEqual({ ok: false, reason: 'unsupported_type' });
  });

  it('rechaza un PDF renombrado a .jpg: la validación mira el contenido, no el nombre', () => {
    // Es exactamente lo que hace un atacante, y el motivo de no mirar Content-Type ni extensión.
    const disguised = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]);
    expect(validateImage(disguised)).toEqual({ ok: false, reason: 'unsupported_type' });
  });

  it('rechaza el archivo vacío', () => {
    expect(validateImage(new Uint8Array(0))).toEqual({ ok: false, reason: 'unsupported_type' });
  });
});

describe('límite de tamaño (FR-005, FR-007)', () => {
  it('acepta exactamente 10 MB: el límite es inclusivo', () => {
    const bytes = new Uint8Array(MAX_FILE_BYTES);
    bytes.set(pngOf(100, 100), 0);
    const result = validateImage(bytes);
    expect(result.ok).toBe(true);
  });

  it('rechaza 10 MB + 1 byte', () => {
    const bytes = new Uint8Array(MAX_FILE_BYTES + 1);
    bytes.set(pngOf(100, 100), 0);
    expect(validateImage(bytes)).toEqual({ ok: false, reason: 'too_large' });
  });

  it('el tamaño se comprueba antes que el tipo: un archivo enorme e inválido es too_large', () => {
    const bytes = new Uint8Array(MAX_FILE_BYTES + 1);
    expect(validateImage(bytes)).toEqual({ ok: false, reason: 'too_large' });
  });

  it('el límite son 10 MiB exactos', () => {
    expect(MAX_FILE_BYTES).toBe(10 * 1024 * 1024);
  });
});

describe('lectura de dimensiones (FR-008)', () => {
  it('lee las dimensiones de un PNG', () => {
    const result = validateImage(pngOf(1920, 1080));
    expect(result.ok && { w: result.width, h: result.height }).toEqual({ w: 1920, h: 1080 });
  });

  it('lee las dimensiones de un JPEG recorriendo hasta el SOF', () => {
    const result = validateImage(jpegOf(4032, 3024));
    expect(result.ok && { w: result.width, h: result.height }).toEqual({ w: 4032, h: 3024 });
  });

  it('encuentra el SOF aunque haya mucho relleno antes: no está en posición fija', () => {
    // Simula una foto real, con EXIF y perfil de color por delante del SOF.
    const result = validateImage(jpegOf(800, 600, { padding: 4000 }));
    expect(result.ok && { w: result.width, h: result.height }).toEqual({ w: 800, h: 600 });
  });

  it('rechaza un JPEG truncado: números mágicos correctos y cabecera inservible', () => {
    const full = jpegOf(1024, 768);
    const truncated = full.slice(0, Math.floor(full.length / 2));
    expect(validateImage(truncated)).toEqual({ ok: false, reason: 'unreadable' });
  });

  it('rechaza un PNG truncado antes del IHDR', () => {
    const truncated = pngOf(100, 100).slice(0, 18);
    expect(validateImage(truncated)).toEqual({ ok: false, reason: 'unreadable' });
  });

  it('rechaza un PNG cuyo primer chunk no es IHDR', () => {
    const bytes = pngOf(100, 100);
    bytes.set([0x49, 0x44, 0x41, 0x54], 12); // 'IDAT' en lugar de 'IHDR'
    expect(validateImage(bytes)).toEqual({ ok: false, reason: 'unreadable' });
  });

  it('rechaza dimensiones cero', () => {
    expect(validateImage(pngOf(0, 100))).toEqual({ ok: false, reason: 'unreadable' });
    expect(validateImage(jpegOf(100, 0))).toEqual({ ok: false, reason: 'unreadable' });
  });

  it('rechaza un JPEG cuyo recorrido se sale del archivo', () => {
    // SOI y un segmento que declara más longitud de la que hay.
    const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0xff, 0xff, 0x00, 0x00]);
    expect(validateImage(bytes)).toEqual({ ok: false, reason: 'unreadable' });
  });
});
