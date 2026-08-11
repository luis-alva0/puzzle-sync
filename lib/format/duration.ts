/**
 * Formateo del tiempo transcurrido de una partida.
 *
 * Se separa de `lib/format/datetime.ts` porque son cosas distintas: aquella convierte instantes a
 * hora de Perú, esta expresa una duración. Mezclarlas confundiría una marca de tiempo con un
 * intervalo, que es un error fácil de cometer y difícil de ver.
 */

/**
 * Duración en milisegundos como `m:ss`, o `h:mm:ss` a partir de una hora.
 *
 * Los negativos se muestran como `0:00`. No es un capricho defensivo: el tiempo transcurrido se
 * calcula corrigiendo el reloj local con el desfase del servidor, y en el instante en que se crea
 * una sala la estimación puede quedar unos milisegundos por debajo de cero. Mostrar `-0:00` sería
 * un fallo visible en el caso más común de todos, el de estrenar sala.
 */
export function formatDuration(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));

  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const paddedSeconds = String(seconds).padStart(2, '0');

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${paddedSeconds}`;
  }
  return `${minutes}:${paddedSeconds}`;
}
