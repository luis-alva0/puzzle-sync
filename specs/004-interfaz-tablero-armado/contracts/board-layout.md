# Contrato: reparto de piezas en el tablero

**Feature**: 004-interfaz-tablero-armado | **Módulo**: `lib/puzzle/board-layout.ts`

Este es el único contrato de la funcionalidad. No hay endpoints nuevos: lo que se acuerda aquí es
una **interfaz de módulo**, y la razón de escribirla es que tiene dos consumidores que deben estar
de acuerdo o el tablero se rompe.

| Consumidor | Qué usa | Qué pasa si discrepan |
|---|---|---|
| `app/api/rooms/route.ts` (servidor) | `layoutPieces()` para calcular las posiciones iniciales | — |
| `components/BoardCanvas.tsx` (navegador) | `boardSize()` para saber qué área dibujar | **Piezas fuera de la vista**: colocadas donde nadie las pinta |

Hoy esa discrepancia existe: el reparto usa un margen de `PIECE_SIZE × 2` y el canvas dibuja un
mundo de `solvedSize + PIECE_SIZE × 4`. Coinciden por casualidad, no por contrato.

---

## `boardSize(gridRows, gridCols) → BoardSize`

Tamaño del tablero y del área central de armado, en unidades de tablero.

**Entradas**

| Parámetro | Tipo | Restricción |
|---|---|---|
| `gridRows` | entero | ≥ 1 |
| `gridCols` | entero | ≥ 1 |

**Salida**: `{ width, height, holeX, holeY, holeWidth, holeHeight }`

**Garantías**

1. **Determinista y sin estado**: mismas entradas, misma salida, siempre y en cualquier máquina.
2. **Independiente de la ventana**: no consulta `window`, ni el DOM, ni la hora. Es lo que permite
   que el servidor la ejecute y que dos jugadores obtengan lo mismo (FR-006, FR-030).
3. `holeWidth ≥ gridCols × PIECE_SIZE` y `holeHeight ≥ gridRows × PIECE_SIZE` (FR-003).
4. El hueco está centrado: `holeX = (width − holeWidth) / 2`, y análogo en el eje vertical.
5. Hay huecos de banda suficientes para `gridRows × gridCols` piezas (FR-007).

**Errores**: `RangeError` si alguna dimensión es menor que 1, siguiendo la convención que ya usa
`buildEdgeGrid`.

---

## `layoutPieces(gridRows, gridCols, seed) → ScatteredPiece[]`

Posiciones iniciales de todas las piezas, repartidas por la banda perimetral.

**Entradas**

| Parámetro | Tipo | Restricción |
|---|---|---|
| `gridRows` | entero | ≥ 1 |
| `gridCols` | entero | ≥ 1 |
| `seed` | entero | cualquier entero de 32 bits |

**Salida**: array de `{ gridRow, gridCol, x, y }` con exactamente `gridRows × gridCols` elementos.

**Garantías**

1. **Ninguna pieza se solapa con otra** (FR-002). Se comprueba sobre la caja envolvente que
   incluye las lengüetas, no sobre la celda de 100 × 100.
2. **Ninguna pieza cae dentro del área central** de armado (FR-001).
3. **Ninguna pieza empieza resuelta**: la distancia a su posición correcta supera la tolerancia de
   encaje en al menos un eje. *Regla heredada del reparto actual, que hay que conservar.*
4. **Cobertura exacta**: cada par `(gridRow, gridCol)` de la cuadrícula aparece una vez y solo una.
5. **Determinista**: misma semilla, mismo resultado, en el servidor y en las pruebas.
6. **Desordenada** (FR-008): dos piezas contiguas en la cuadrícula no acaban en huecos contiguos.
   Se comprueba de forma estadística, no absoluta: en un reparto de 100 piezas, menos del 5 % de
   los pares vecinos en la imagen quedan también vecinos en la banda.
7. Todas las posiciones caen dentro de `boardSize(gridRows, gridCols)`.

**Errores**: `RangeError` si alguna dimensión es menor que 1.

---

## Relación con `scatterPieces`

`scatterPieces` es la función actual y **la sustituye `layoutPieces`**. Se elimina en lugar de
mantener las dos: dejar el reparto viejo como opción sería una alternativa que nadie elige, y el
Principio I del proyecto desaconseja mantener piezas de más.

Los tres llamadores actuales —[app/api/rooms/route.ts](../../../app/api/rooms/route.ts),
[tests/integration/helpers.ts](../../../tests/integration/helpers.ts) y
[tests/integration/play-count.test.ts](../../../tests/integration/play-count.test.ts)— pasan a la
nueva función. La firma es intencionadamente la misma para que la sustitución sea directa.

---

## Cómo se prueba

Pruebas unitarias en `tests/unit/board-layout.test.ts`, sin infraestructura. La lógica es pura y
vive en TypeScript, así que **aquí es donde se prueba**: nada de esto se duplica en SQL, el
servidor solo transporta el resultado.

El aserto que justifica la funcionalidad entera:

```
para cada cantidad en (20, 50, 100, 200, 500):
  piezas = layoutPieces(filas, columnas, semilla)
  para cada par (a, b) de piezas distintas:
    afirmar que sus cajas envolventes NO se cortan
```

Es cuadrático, pero con 500 piezas son 124 750 comparaciones: milisegundos. No merece un índice
espacial.

Se prueban además, con una prueba por garantía: la cobertura exacta, que ninguna pieza caiga en el
hueco central, que ninguna empiece resuelta, el determinismo con la misma semilla, y el desorden.

**Lo que no se prueba con unitarias** es que lo dibujado coincida con lo calculado. Eso es visual y
está en [quickstart.md](../quickstart.md); la protección estructural es que ambos lados llamen a
`boardSize()`.
