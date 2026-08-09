/**
 * Generador pseudoaleatorio determinista.
 *
 * **`Math.random`, `Date` y la iteración sobre claves de objeto están prohibidos en todo
 * `lib/puzzle-generation`.** Si se cuelan, dos jugadores de la misma sala ven rompecabezas con
 * formas distintas y no hay ningún error visible que lo delate: el tablero simplemente no encaja
 * entre ellos.
 *
 * `splitmix32` es aritmética entera de 32 bits con `Math.imul`, `>>>` y `^`. Da el mismo
 * resultado en cualquier motor de JavaScript y en cualquier plataforma, y no depende de coma
 * flotante ni de orden de iteración.
 */

/**
 * Mezcla un entero de 32 bits en otro. Pura: el mismo estado da siempre el mismo resultado, y
 * el orden de las llamadas no puede alterarlo.
 *
 * Devuelve un número y no un par `{ valor, siguiente }`: aquí nadie usa el generador como flujo.
 * Los dos consumidores —`seedFromUuid` y `hashCoords`— piden un valor a partir de una entrada
 * concreta, y encadenar, cuando hace falta, es volver a llamar con el resultado.
 */
export function splitmix32(state: number): number {
  let z = (state + 0x9e37_79b9) | 0;
  z = Math.imul(z ^ (z >>> 16), 0x21f0_aaad);
  z = Math.imul(z ^ (z >>> 15), 0x735a_2d97);
  z = z ^ (z >>> 15);
  return z >>> 0;
}

/**
 * Mezcla los 16 bytes de un UUID en un entero de 32 bits.
 *
 * Se ignoran los guiones y se procesa carácter a carácter en orden, sin pasar por `parseInt`
 * sobre trozos: menos formas de que dos implementaciones difieran.
 */
export function seedFromUuid(uuid: string): number {
  let hash = 0x811c_9dc5; // offset basis de FNV-1a, como punto de partida

  for (let i = 0; i < uuid.length; i++) {
    const code = uuid.charCodeAt(i);
    if (code === 0x2d) continue; // '-'
    hash = Math.imul(hash ^ code, 0x0100_0193);
  }

  // Una pasada de splitmix para dispersar: FNV-1a deja los bits altos poco mezclados.
  return splitmix32(hash >>> 0);
}

/**
 * Valor determinista para una coordenada concreta, sin depender del orden de recorrido.
 *
 * Es lo que permite generar el borde (fila, columna, orientación) de forma independiente: no
 * hace falta recorrer la rejilla en un orden concreto para obtener siempre lo mismo.
 */
export function hashCoords(seed: number, row: number, col: number, axis: number): number {
  let hash = seed;
  hash = Math.imul(hash ^ (row + 0x9e37), 0x85eb_ca6b);
  hash = Math.imul(hash ^ (col + 0x85eb), 0xc2b2_ae35);
  hash = Math.imul(hash ^ (axis + 0xc2b2), 0x27d4_eb2f);
  return splitmix32(hash >>> 0);
}
