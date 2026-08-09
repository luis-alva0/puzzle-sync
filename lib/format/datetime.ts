/**
 * Formateo de fechas en hora local de Perú.
 *
 * Perú no aplica horario de verano, así que el desfase es fijo en UTC-5 y NO debe existir
 * lógica de cambio estacional (Restricciones Técnicas y de Datos de la constitución).
 *
 * Las columnas de la base de datos son `timestamptz` —almacenan un instante absoluto—; lo que
 * se fija aquí es cómo se presenta ese instante.
 */

/** Offset fijo de Perú, en minutos. Negativo porque va por detrás de UTC. */
export const PERU_UTC_OFFSET_MINUTES = -5 * 60;

const PERU_OFFSET_SUFFIX = '-05:00';

/**
 * Serializa un instante como ISO 8601 con el offset de Perú: `2026-08-09T14:32:10.000-05:00`.
 *
 * Se desplaza el instante y se reetiqueta la `Z` que produce `toISOString`, en lugar de usar
 * `toLocaleString` con zona horaria: el resultado debe ser estable y parseable, no depender
 * del locale del proceso.
 */
export function toPeruIso(instant: Date | string): string {
  const date = typeof instant === 'string' ? new Date(instant) : instant;
  if (Number.isNaN(date.getTime())) throw new TypeError(`Fecha inválida: ${String(instant)}`);
  return new Date(date.getTime() + PERU_UTC_OFFSET_MINUTES * 60_000)
    .toISOString()
    .replace('Z', PERU_OFFSET_SUFFIX);
}

/** Igual que `toPeruIso`, pero tolera `null` — habitual en `completed_at`. */
export function toPeruIsoOrNull(instant: Date | string | null | undefined): string | null {
  if (instant === null || instant === undefined) return null;
  return toPeruIso(instant);
}

/** Formato corto para mostrar en pantalla: `09/08/2026 14:32`. */
export function formatPeruDisplay(instant: Date | string): string {
  const iso = toPeruIso(instant);
  const [datePart, timePart] = iso.split('T');
  const [year, month, day] = datePart!.split('-');
  const hhmm = timePart!.slice(0, 5);
  return `${day}/${month}/${year} ${hhmm}`;
}

/** Duración legible entre dos instantes: `1h 23m 45s`. Para el histórico de partidas. */
export function formatDuration(from: Date | string, to: Date | string): string {
  const start = typeof from === 'string' ? new Date(from) : from;
  const end = typeof to === 'string' ? new Date(to) : to;
  const totalSeconds = Math.max(0, Math.floor((end.getTime() - start.getTime()) / 1000));

  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}
