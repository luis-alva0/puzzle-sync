/**
 * Constructores de imágenes mínimas válidas, compartidos por las pruebas unitarias y las de
 * integración.
 *
 * Vive fuera de `tests/unit` y `tests/integration` para que Vitest no lo recoja como suite.
 */

/** PNG mínimo válido: firma + chunk `IHDR` con las dimensiones pedidas. */
export function pngOf(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(24);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  bytes.set([0x00, 0x00, 0x00, 0x0d], 8); // longitud del IHDR
  bytes.set([0x49, 0x48, 0x44, 0x52], 12); // 'IHDR'

  const view = new DataView(bytes.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return bytes;
}

/**
 * JPEG mínimo: SOI, un segmento de relleno de longitud arbitraria —para forzar el recorrido— y
 * un SOF0 con las dimensiones.
 */
export function jpegOf(width: number, height: number, { padding = 40 } = {}): Uint8Array {
  const parts: number[] = [0xff, 0xd8]; // SOI

  // APP0 de relleno: el SOF nunca está en posición fija, y hay que recorrer hasta él.
  parts.push(0xff, 0xe0, ((padding + 2) >> 8) & 0xff, (padding + 2) & 0xff);
  for (let i = 0; i < padding; i++) parts.push(0x00);

  // SOF0: longitud 17, precisión 8, alto, ancho, 3 componentes.
  parts.push(0xff, 0xc0, 0x00, 0x11, 0x08);
  parts.push((height >> 8) & 0xff, height & 0xff);
  parts.push((width >> 8) & 0xff, width & 0xff);
  parts.push(0x03);
  for (let i = 0; i < 9; i++) parts.push(0x00);

  return new Uint8Array(parts);
}
