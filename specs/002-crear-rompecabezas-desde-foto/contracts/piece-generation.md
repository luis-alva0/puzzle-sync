# Contract: Generación determinista de formas de pieza

**Feature**: 002-crear-rompecabezas-desde-foto | Módulo: `lib/puzzle-generation/`

Contrato **cliente-cliente**, no cliente-servidor: el servidor no participa. Todos los jugadores
de una sala deben calcular exactamente las mismas formas a partir del mismo UUID, o verían
tableros distintos.

---

## `prng.ts`

### `splitmix32(state: number): { value: number; next: number }`

Generador entero de 32 bits. Aritmética con `Math.imul`, `>>>` y `^` únicamente.

**Garantías**:

- Determinista: la misma entrada produce siempre la misma salida, en cualquier motor de
  JavaScript y en cualquier plataforma.
- No depende de coma flotante, del orden de iteración, del reloj ni de `Math.random`.
- `Math.random` está **prohibido** en todo este módulo. Es la única regla que, si se rompe, hace
  que dos jugadores vean rompecabezas distintos sin ningún error visible.

### `seedFromUuid(uuid: string): number`

Mezcla los 16 bytes del UUID en un entero de 32 bits.

**Garantías**: dos UUID distintos producen semillas distintas con probabilidad abrumadora; el
mismo UUID produce siempre la misma semilla.

---

## `edges.ts`

### `buildEdgeGrid(seed: number, rows: number, cols: number): EdgeGrid`

Genera la rejilla de bordes de la que cada pieza lee sus cuatro lados.

```ts
interface Edge {
  /** true si el borde es del perímetro: recto, sin lengüeta. */
  straight: boolean;
  /** +1 lengüeta hacia un lado, -1 hacia el otro. 0 si es recto. */
  sign: -1 | 0 | 1;
  /** Parámetros de forma de la lengüeta, en fracción del lado de la pieza. */
  offset: number;
  size: number;
}

interface EdgeGrid {
  /** (rows + 1) × cols */
  horizontal: Edge[][];
  /** rows × (cols + 1) */
  vertical: Edge[][];
}
```

**Garantías, y son el corazón de la feature**:

1. **Determinismo**: misma `seed`, `rows` y `cols` ⇒ rejilla idéntica, campo a campo.
2. **Perímetro recto**: toda la primera y última fila de `horizontal`, y la primera y última
   columna de `vertical`, tienen `straight: true`.
3. **Complementariedad estructural**: un borde interior se genera **una sola vez** y lo leen las
   dos piezas que lo comparten. No es una propiedad que haya que verificar entre dos cálculos
   independientes: hay un único cálculo.

La razón de que exista la rejilla y no una función "forma de la pieza (r,c)" es exactamente la
garantía 3. Con formas por pieza, la complementariedad sería una coincidencia a mantener, y
cualquier asimetría dejaría un hueco o un solape visible entre vecinas.

### `pieceEdges(grid: EdgeGrid, row: number, col: number): PieceEdges`

Los cuatro bordes de una pieza, orientados desde su punto de vista.

```ts
interface PieceEdges {
  top: Edge;
  right: Edge;
  bottom: Edge;
  left: Edge;
}
```

El borde derecho de `(r, c)` y el izquierdo de `(r, c+1)` son **el mismo objeto** de la rejilla,
leído desde lados opuestos. Al construir el trazado, uno lo recorre en un sentido y el otro en el
contrario.

---

## `path.ts`

### `piecePath(edges: PieceEdges, size: number): Path2D`

Construye el contorno cerrado de una pieza, con las lengüetas trazadas como curvas de Bézier.

**Garantías**:

- El trazado se cierra siempre.
- Las lengüetas **sobresalen** de la celda de `size × size`. El dibujado debe recortar con este
  path y pintar una región de imagen mayor que la celda (research R8).
- Determinista: los mismos bordes producen el mismo trazado.

---

## `grid.ts`

### `chooseGrid(targetPieces: number, cropWidth: number, cropHeight: number): { rows, cols }`

Elige la cuadrícula (research R4).

**Garantías**:

- El resultado nunca es degenerado: ni `rows` ni `cols` valen menos de 2.
- Las piezas quedan lo más cuadradas que permita la relación de aspecto del recorte.
- `rows * cols` se acerca a `targetPieces`, sin obligación de igualarlo.
- Determinista: mismas entradas, misma cuadrícula. Es **crítico** que servidor y cliente coincidan:
  el servidor la calcula y la guarda, el cliente la usa para pintar.

---

## Invariante que atraviesa todo el módulo

> Dado el mismo `puzzle.id`, dos navegadores cualesquiera —distinto sistema operativo, distinto
> motor, distinta versión— deben producir trazados idénticos píxel a píxel.

De ahí salen las prohibiciones: nada de `Math.random`, nada de `Date`, nada de iterar sobre las
claves de un objeto, y ninguna decisión que dependa del resultado de una operación en coma
flotante.
