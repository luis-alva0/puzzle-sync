# Contrato: empaquetado de la banda

**Feature**: 005-pulido-visual-tablero | **Módulo**: `lib/puzzle/board-layout.ts`

Sustituye a la rejilla de huecos uniforme de la feature 004. Los consumidores son los mismos y por
la misma razón: si el servidor y el navegador no calculan el mismo tablero, las piezas acaban
colocadas donde nadie las pinta.

| Consumidor | Qué usa |
|---|---|
| `app/api/rooms/route.ts` (servidor) | `layoutPieces()` para las posiciones iniciales |
| `components/BoardCanvas.tsx` (navegador) | `boardSize()` para saber qué área dibujar |

**Novedad respecto de la feature 004**: las dos funciones necesitan ahora la **rejilla de bordes**,
porque el espacio que ocupa una pieza depende de por qué lados le sale lengüeta. Eso acopla
`lib/puzzle/` con `lib/puzzle-generation/`, que hasta ahora no se hablaban. El acoplamiento es
deliberado y es el precio de FR-027.

---

## `boardSize(gridRows, gridCols, shapeSeed) → BoardSize`

Tamaño del tablero y del área central.

| Parámetro | Tipo | Restricción |
|---|---|---|
| `gridRows` | entero | ≥ 1 |
| `gridCols` | entero | ≥ 1 |
| `shapeSeed` | entero | semilla de las formas, derivada del UUID del rompecabezas |

**Salida**: `{ width, height, holeX, holeY, holeWidth, holeHeight }`

**Garantías**

1. **Determinista y sin estado.** Mismas entradas, misma salida, en cualquier máquina.
2. **Independiente de la ventana.** No consulta `window`, ni el DOM, ni la hora.
3. `holeWidth ≥ gridCols × PIECE_SIZE` y `holeHeight ≥ gridRows × PIECE_SIZE` (FR-003 de 004).
4. El área central está centrada en el tablero.
5. El tablero es lo bastante grande para acomodar todas las piezas fuera del área central.

**Nota sobre `shapeSeed`**: es un parámetro nuevo y **no es el mismo** que la semilla de reparto.
La de formas sale del UUID del rompecabezas y es la misma en todas las salas que lo usen; la de
reparto es distinta en cada sala. Confundirlas haría que todas las salas del mismo rompecabezas
repartieran igual.

---

## `layoutPieces(gridRows, gridCols, shapeSeed, scatterSeed) → ScatteredPiece[]`

Posiciones iniciales, empaquetadas en filas dentro de la banda.

| Parámetro | Tipo | Restricción |
|---|---|---|
| `gridRows`, `gridCols` | entero | ≥ 1 |
| `shapeSeed` | entero | decide la anchura y la altura reales de cada pieza |
| `scatterSeed` | entero | decide el desorden |

**Salida**: array de `{ gridRow, gridCol, x, y }`, con `gridRows × gridCols` elementos.

**Garantías**

1. **Ninguna pieza se solapa con otra** (FR-030). Sobre la caja envolvente **real** de cada pieza,
   no sobre el peor caso.
2. **Por construcción**, sin comparar piezas entre sí y sin ningún bucle de reintento (FR-027a).
   Dentro de una fila las piezas van consecutivas; las filas empiezan donde acabó la anterior.
3. **Ninguna pieza cae en el área central.**
4. **Ninguna pareja vecina arranca encajada.** Como en la feature 004, se comprueba sobre la
   separación **entre vecinas**, porque `release_piece` encaja de forma relativa.
5. **Cobertura exacta**: cada celda aparece una vez y solo una.
6. **Determinista** con las mismas semillas (FR-027b).
7. **Desordenada** (FR-008 de 004): la adyacencia entre vecinas de la imagen no supera lo que daría
   el azar. Umbral medido, como en la feature 004.
8. Todas las posiciones caen dentro de `boardSize(...)` con las mismas semillas.

**Errores**: `RangeError` si alguna dimensión es menor que 1.

---

## `pieceExtent(edges) → PieceExtent`

Cuánto ocupa de verdad una pieza, según sus cuatro bordes.

**Garantías**

1. `width` vale `PIECE_SIZE` más `tabOverflow` por cada lado vertical con lengüeta **saliente**.
   Los huecos entrantes no ocupan espacio: se meten hacia dentro.
2. `height`, lo mismo en horizontal.
3. Los desplazamientos sitúan la celda de modo que la caja envolvente arranque en el origen.
4. Una pieza de esquina del rompecabezas, con dos lados rectos, nunca mide más de
   `PIECE_SIZE + tabOverflow` en cada eje.

Es la función que hace posible todo lo demás, y también la que hay que mirar primero si aparece un
solape: si sobrestima, se desperdicia espacio; **si subestima, las piezas se tocan**.

---

## Relación con la feature 004

`bandSlots()`, `SLOT_PITCH` y los contadores de rejilla de `BoardSize` **desaparecen**. No se
conservan como alternativa: el Principio I desaconseja mantener dos formas de hacer lo mismo, y la
rejilla ya no gana en nada.

La firma de `layoutPieces` cambia —dos semillas en vez de una— así que hay que tocar sus tres
llamadores, los mismos de la vez anterior.

---

## Cómo se prueba

Unitarias en `tests/unit/board-layout.test.ts`, sin infraestructura. La lógica es pura y vive en
TypeScript.

Se conserva **el aserto que justificaba la feature 004**, ahora sobre cajas reales:

```
para cada cantidad en (20, 50, 100, 200, 500):
  piezas = layoutPieces(filas, columnas, semillaFormas, semillaReparto)
  para cada par (a, b) de piezas distintas:
    afirmar que sus cajas envolventes REALES no se cortan
```

Y una prueba que la feature 004 no necesitaba: **que el empaquetado aprovecha de verdad**. El área
del tablero con el empaquetado nuevo debe ser sensiblemente menor que la que daría el peor caso
uniforme, o el trabajo no ha servido de nada y SC-006 no se cumple.
