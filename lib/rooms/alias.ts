/**
 * Validación del alias del jugador (FR-002).
 *
 * El alias es identidad por sesión únicamente: no se reserva, no se verifica contra nada y no
 * otorga permisos. Lo único que se comprueba es que sirva para distinguir a una persona de
 * otra dentro de la sala.
 *
 * Función pura, sin acceso a Supabase: es lógica crítica y el Principio VI exige poder
 * probarla sin infraestructura.
 */

export const ALIAS_MIN_LENGTH = 2;
export const ALIAS_MAX_LENGTH = 20;

export type AliasValidation =
  | { readonly ok: true; readonly alias: string }
  | { readonly ok: false; readonly reason: 'too_short' | 'too_long' | 'not_a_string' };

/** Recorta espacios al inicio y al final. La longitud se mide sobre el resultado. */
export function normalizeAlias(raw: string): string {
  return raw.trim();
}

/**
 * Valida un alias y devuelve su forma normalizada.
 *
 * Se mide con `Array.from` en lugar de `.length` para contar caracteres visibles y no unidades
 * UTF-16: un alias de dos emojis tiene `.length === 4`, y rechazarlo por "demasiado largo"
 * sería un error visible para el jugador.
 */
export function validateAlias(raw: unknown): AliasValidation {
  if (typeof raw !== 'string') {
    return { ok: false, reason: 'not_a_string' };
  }

  const alias = normalizeAlias(raw);
  const length = Array.from(alias).length;

  if (length < ALIAS_MIN_LENGTH) return { ok: false, reason: 'too_short' };
  if (length > ALIAS_MAX_LENGTH) return { ok: false, reason: 'too_long' };

  return { ok: true, alias };
}

/** Atajo booleano, para la validación en el formulario. */
export function isValidAlias(raw: unknown): boolean {
  return validateAlias(raw).ok;
}

/**
 * Desambigua alias repetidos dentro de una sala añadiendo un sufijo numérico.
 *
 * Los duplicados se permiten a propósito (el alias no es una identidad reservada), pero dos
 * jugadores idénticos en pantalla serían inservibles. Solo cambia lo que se pinta; el dato
 * almacenado no se toca.
 */
export function disambiguateAliases<T extends { alias: string }>(
  players: readonly T[],
): (T & { displayAlias: string })[] {
  const counts = new Map<string, number>();
  for (const player of players) {
    counts.set(player.alias, (counts.get(player.alias) ?? 0) + 1);
  }

  const seen = new Map<string, number>();
  return players.map((player) => {
    const total = counts.get(player.alias) ?? 0;
    if (total <= 1) {
      return { ...player, displayAlias: player.alias };
    }
    const index = (seen.get(player.alias) ?? 0) + 1;
    seen.set(player.alias, index);
    return { ...player, displayAlias: `${player.alias} (${index})` };
  });
}
