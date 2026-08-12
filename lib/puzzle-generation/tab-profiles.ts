/**
 * Catálogo de perfiles de lengüeta.
 *
 * Un perfil describe **medio recorrido**: cómo sale la lengüeta del borde, se estrecha en el
 * cuello, se ensancha en la cabeza y vuelve. Las coordenadas son normalizadas: `t` avanza a lo
 * largo del borde con el centro en 0, y `d` mide cuánto sobresale en perpendicular.
 *
 * **Lo que distingue una lengüeta de una joroba es el cuello.** La versión anterior trazaba una
 * ondulación suave del 34 % de ancho y 20 % de profundidad, sin estrechamiento, y por eso las
 * piezas leían como flores. Aquí la curva se cierra antes de abrirse, que es lo que hace
 * reconocible la silueta incluso con 500 piezas en pantalla.
 *
 * **La profundidad está acoplada al empaquetado de la banda.** Una lengüeta más profunda se
 * reconoce mejor y también ensancha la pieza, comiéndose el espacio que gana el empaquetado por
 * filas. El 22 % es el equilibrio: ver la tabla de research R6 antes de tocarlo.
 */

/** Profundidad de la lengüeta, en fracción del lado de la pieza (research R4). */
export const TAB_DEPTH = 0.22;

/**
 * Punto del perfil.
 *
 * `t` es la posición a lo largo del borde, con 0 en el centro de la lengüeta y ±0,5 en los
 * extremos del lado. `d` es cuánto sobresale, en fracción de `TAB_DEPTH`.
 */
export interface ProfilePoint {
  t: number;
  d: number;
}

/**
 * Un perfil: los puntos de control de la mitad del recorrido, del arranque a la cima.
 *
 * Se refleja para la otra mitad, así que la lengüeta es simétrica y basta con describir la
 * subida. Cada terna son los dos controles de una curva cúbica y su punto final.
 */
export interface TabProfile {
  /** Semiancho del cuello, la parte más estrecha. */
  neckHalfWidth: number;
  /** Semiancho de la cabeza, la parte más ancha. */
  headHalfWidth: number;
  /** Tramos de la subida: `[control1, control2, final]`, en orden. */
  rise: ReadonlyArray<readonly [ProfilePoint, ProfilePoint, ProfilePoint]>;
}

/**
 * Los cuatro perfiles.
 *
 * Cuatro es suficiente para que el tablero no se vea repetitivo y pocos para poder mirarlos uno a
 * uno y afinarlos a mano. Se diferencian en lo estrecho del cuello y lo redonda de la cabeza; con
 * los dos signos y el desplazamiento lateral, un borde tiene decenas de aspectos posibles.
 */
export const TAB_PROFILES: readonly TabProfile[] = [
  // 0 — el clásico: cuello marcado, cabeza redonda.
  {
    neckHalfWidth: 0.09,
    headHalfWidth: 0.17,
    rise: [
      [
        { t: -0.19, d: 0.0 },
        { t: -0.13, d: 0.02 },
        { t: -0.09, d: 0.12 },
      ],
      [
        { t: -0.05, d: 0.42 },
        { t: -0.17, d: 0.82 },
        { t: 0.0, d: 1.0 },
      ],
    ],
  },
  // 1 — cuello más estrecho y cabeza más grande: la más «de troquel».
  {
    neckHalfWidth: 0.075,
    headHalfWidth: 0.185,
    rise: [
      [
        { t: -0.2, d: 0.0 },
        { t: -0.12, d: 0.01 },
        { t: -0.075, d: 0.14 },
      ],
      [
        { t: -0.03, d: 0.46 },
        { t: -0.185, d: 0.86 },
        { t: 0.0, d: 1.0 },
      ],
    ],
  },
  // 2 — más achatada, cabeza ancha y baja.
  {
    neckHalfWidth: 0.1,
    headHalfWidth: 0.16,
    rise: [
      [
        { t: -0.18, d: 0.0 },
        { t: -0.13, d: 0.03 },
        { t: -0.1, d: 0.15 },
      ],
      [
        { t: -0.06, d: 0.4 },
        { t: -0.16, d: 0.78 },
        { t: 0.0, d: 1.0 },
      ],
    ],
  },
  // 3 — cuello largo, la que más se estrecha antes de abrir.
  {
    neckHalfWidth: 0.08,
    headHalfWidth: 0.175,
    rise: [
      [
        { t: -0.21, d: 0.0 },
        { t: -0.14, d: 0.02 },
        { t: -0.08, d: 0.1 },
      ],
      [
        { t: -0.04, d: 0.5 },
        { t: -0.175, d: 0.88 },
        { t: 0.0, d: 1.0 },
      ],
    ],
  },
];

/** Cuántos perfiles hay. Lo usa la elección por hash de `edges.ts`. */
export const PROFILE_COUNT = TAB_PROFILES.length;

/**
 * Profundidad máxima que alcanza cualquier perfil, en fracción del lado.
 *
 * De aquí sale `tabOverflow`, y por tanto el espacio que el dibujado reserva alrededor de la celda
 * y el que el empaquetado reserva alrededor de la pieza. **Derivarlo en lugar de escribirlo evita
 * que medir y dibujar discrepen** si algún día un perfil sobresale más.
 */
export const MAX_PROFILE_DEPTH = TAB_DEPTH * Math.max(...TAB_PROFILES.map(profileDepth));

function profileDepth(profile: TabProfile): number {
  return Math.max(...profile.rise.flatMap((segment) => segment.map((point) => point.d)));
}
