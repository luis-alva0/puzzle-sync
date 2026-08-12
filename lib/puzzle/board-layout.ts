import { PIECE_SIZE, solvedSize } from '@/lib/puzzle/geometry';
import { buildEdgeGrid, pieceEdges } from '@/lib/puzzle-generation/edges';
import { tabOverflow } from '@/lib/puzzle-generation/path';
import { splitmix32 } from '@/lib/puzzle-generation/prng';
import type { PieceEdges } from '@/types/puzzle';

/**
 * Dónde empieza cada pieza y qué tamaño tiene el tablero que las contiene.
 *
 * Las piezas se reparten en una **banda alrededor del borde**, dejando libre un área central del
 * tamaño del rompecabezas armado. Dentro de la banda se colocan **en filas, una tras otra**,
 * ocupando cada una solo el espacio que de verdad necesita.
 *
 * **De ahí sale la garantía que justifica todo esto: dos piezas nunca se solapan.** No hay
 * detección de colisiones ni bucle que pueda no terminar; dentro de una fila las piezas van
 * consecutivas, y cada fila empieza donde acabó la anterior.
 *
 * Sustituye a la rejilla de huecos uniforme de la feature 004. Aquella también garantizaba el no
 * solape, pero al precio de que el paso lo fijara siempre **la pieza más ancha posible**: 160
 * unidades, cuando la media ocupa 126. Un paso único no puede aprovechar que la mayoría de las
 * piezas son más estrechas.
 *
 * `boardSize` la llaman **el servidor y el navegador**. Si cada uno calculase el suyo, las piezas
 * acabarían colocadas donde nadie las pinta. Nada aquí consulta `window` ni el DOM.
 */

/** Cuánto sobresale una lengüeta, en unidades de tablero. */
const OVERFLOW = tabOverflow(PIECE_SIZE);

/** Separación entre piezas contiguas, para que se vean sueltas y no pegadas. */
const GUTTER = PIECE_SIZE * 0.08;

/**
 * Proporción a la que tiende el tablero.
 *
 * No es la del rompecabezas: es lo que decide cuán grandes se ven las piezas. Con escala uniforme
 * el factor lo fija el eje más apretado, así que un tablero cuadrado en una pantalla apaisada
 * desperdicia los laterales. 16:10 es un punto fijo entre 16:9 y 4:3 — fijo, porque tomarlo de la
 * ventana haría que dos jugadores vieran disposiciones distintas.
 *
 * De aquí sale que **la banda salga más gruesa a los lados que arriba y abajo**, que es lo que se
 * ve en las referencias de jigsawexplorer y que al principio parece un descuido suyo.
 */
const TARGET_ASPECT = 1.6;

export interface BoardSize {
  width: number;
  height: number;
  holeX: number;
  holeY: number;
  holeWidth: number;
  holeHeight: number;
}

export interface PieceExtent {
  /** Ancho real: solo suman las lengüetas que **salen** hacia los lados. */
  width: number;
  height: number;
  /** Dónde queda la esquina de la celda dentro de la caja envolvente. */
  insetX: number;
  insetY: number;
}

export interface ScatteredPiece {
  gridRow: number;
  gridCol: number;
  x: number;
  y: number;
}

function assertGrid(gridRows: number, gridCols: number): void {
  if (!Number.isInteger(gridRows) || !Number.isInteger(gridCols) || gridRows < 1 || gridCols < 1) {
    throw new RangeError('La cuadrícula necesita al menos una fila y una columna');
  }
}

/**
 * Cuánto ocupa de verdad una pieza.
 *
 * Una lengüeta **saliente** añade su holgura por ese lado; un hueco **entrante** no ocupa nada,
 * porque se mete hacia dentro. Los lados rectos del perímetro tampoco.
 *
 * Es el dato que la rejilla uniforme no tenía, y por eso reservaba siempre el peor caso. **Si esta
 * función subestima, las piezas se tocarán**; si sobrestima, se desperdicia espacio y las piezas
 * salen más pequeñas de lo necesario. Lo primero lo caza la prueba de no solape; lo segundo, la de
 * aprovechamiento.
 */
export function pieceExtent(edges: PieceEdges): PieceExtent {
  // `sign` combinado con el sentido de trazado decide hacia dónde sobresale. La convención es la
  // de `piecePath`: arriba e izquierda se recorren al revés, y por eso llevan dirección −1.
  const out = (sign: number, direction: 1 | -1) => (sign * direction < 0 ? OVERFLOW : 0);

  const left = out(edges.left.sign, -1);
  const right = out(edges.right.sign, 1);
  const top = out(edges.top.sign, -1);
  const bottom = out(edges.bottom.sign, 1);

  return {
    width: PIECE_SIZE + left + right,
    height: PIECE_SIZE + top + bottom,
    insetX: left,
    insetY: top,
  };
}

interface Placement {
  gridRow: number;
  gridCol: number;
  extent: PieceExtent;
}

/** Permutación determinista, con Fisher-Yates alimentado por `splitmix32`. */
function shuffled<T>(items: readonly T[], seed: number): T[] {
  const order = [...items];
  let state = seed >>> 0;
  for (let i = order.length - 1; i > 0; i--) {
    state = splitmix32(state);
    const j = state % (i + 1);
    [order[i], order[j]] = [order[j]!, order[i]!];
  }
  return order;
}

/**
 * Coloca las piezas en un anillo de grosor uniforme alrededor del hueco.
 *
 * Las cuatro regiones —arriba, abajo, izquierda y derecha— se rellenan con filas de izquierda a
 * derecha. Un anillo de grosor uniforme desperdicia mucho menos que dar a cada región el alto que
 * le apetezca: la primera versión de esto dejaba que la franja superior se llevara casi todas las
 * piezas, y el tablero salía más grande que con la rejilla que venía a sustituir.
 *
 * Devuelve `null` si no caben, para que quien llama engorde el anillo y reintente.
 */
function layIntoBand(
  pieces: readonly Placement[],
  holeWidth: number,
  holeHeight: number,
  sideThickness: number,
  capThickness: number,
) {
  const boardWidth = holeWidth + sideThickness * 2;
  const boardHeight = holeHeight + capThickness * 2;
  const placed = new Map<string, { x: number; y: number }>();
  let index = 0;

  /** Rellena un rectángulo con filas. Se detiene al agotar las piezas o el alto. */
  const fillRegion = (originX: number, originY: number, width: number, height: number) => {
    let y = originY;
    while (index < pieces.length) {
      const row: Placement[] = [];
      let rowWidth = 0;
      let rowHeight = 0;
      let i = index;

      while (i < pieces.length) {
        const next = pieces[i]!;
        const advance = next.extent.width + GUTTER;
        if (row.length > 0 && rowWidth + advance > width) break;
        row.push(next);
        rowWidth += advance;
        rowHeight = Math.max(rowHeight, next.extent.height);
        i++;
      }

      if (row.length === 0) break;
      if (rowWidth - GUTTER > width) break; // ni una pieza cabe de ancho
      if (y + rowHeight > originY + height) break;

      let x = originX;
      for (const piece of row) {
        placed.set(`${piece.gridRow},${piece.gridCol}`, {
          x: x + piece.extent.insetX,
          y: y + piece.extent.insetY,
        });
        x += piece.extent.width + GUTTER;
      }
      index = i;
      y += rowHeight + GUTTER;
    }
  };

  // Anillo: franja de arriba, columnas laterales a la altura del hueco, franja de abajo.
  fillRegion(0, 0, boardWidth, capThickness);
  fillRegion(0, capThickness, sideThickness, holeHeight);
  fillRegion(sideThickness + holeWidth, capThickness, sideThickness, holeHeight);
  fillRegion(0, capThickness + holeHeight, boardWidth, capThickness);

  if (index < pieces.length) return null;

  return {
    width: boardWidth,
    height: boardHeight,
    holeX: sideThickness,
    holeY: capThickness,
    placed,
  };
}

/**
 * Reparte y mide. Lo usan `boardSize` y `layoutPieces`, para que las dos vean el mismo tablero.
 *
 * **Las filas se agrupan por altura.** No es un adorno: si una fila mezcla alturas, su alto es el
 * de la pieza más alta, y se pierde en vertical lo que se gana en horizontal. Barajar antes y
 * ordenar después conserva el desorden dentro de cada altura, así que dos piezas vecinas en la
 * imagen siguen sin acabar vecinas en la banda.
 */
function pack(gridRows: number, gridCols: number, shapeSeed: number, scatterSeed: number) {
  const grid = buildEdgeGrid(shapeSeed, gridRows, gridCols);

  const pieces: Placement[] = [];
  for (let row = 0; row < gridRows; row++) {
    for (let col = 0; col < gridCols; col++) {
      pieces.push({ gridRow: row, gridCol: col, extent: pieceExtent(pieceEdges(grid, row, col)) });
    }
  }

  /*
   * El orden de empaquetado **no puede depender de la semilla de reparto**.
   *
   * Si dependiera, `boardSize` —que el canvas llama sin conocer esa semilla— calcularía un
   * tablero distinto del que empaquetó el servidor, y las piezas quedarían colocadas fuera de lo
   * que se dibuja. Lo cazó la prueba de «todas caen dentro del tablero».
   *
   * Se separa en dos: la **geometría** sale de ordenar por tamaño, que solo depende de las formas;
   * y el **desorden** se consigue permutando identidades **entre piezas de idéntico tamaño**, que
   * son intercambiables y por tanto no mueven ni un píxel del tablero.
   */
  const ordered = [...pieces].sort(
    (a, b) => a.extent.height - b.extent.height || a.extent.width - b.extent.width,
  );

  for (let start = 0; start < ordered.length; ) {
    let end = start + 1;
    while (
      end < ordered.length &&
      ordered[end]!.extent.width === ordered[start]!.extent.width &&
      ordered[end]!.extent.height === ordered[start]!.extent.height
    ) {
      end++;
    }
    // Permutar dentro del tramo: mismas cajas, distintas piezas dentro de ellas.
    const mixed = shuffled(ordered.slice(start, end), scatterSeed + start);
    for (let i = start; i < end; i++) ordered[i] = mixed[i - start]!;
    start = end;
  }

  const solved = solvedSize(gridRows, gridCols);
  const holeWidth = solved.width + OVERFLOW * 2;
  const holeHeight = solved.height + OVERFLOW * 2;

  // Ancho lateral de partida, tanteado desde el área que ocupan las piezas, y ampliado hasta que
  // quepan. Termina siempre: cada vuelta agranda la banda y la cantidad de piezas es fija.
  // Grosor del anillo, resuelto para que el tablero tienda a 16:10 y crecido hasta que quepan
  // todas. Termina siempre: cada vuelta pide más área y la cantidad de piezas es fija.
  const holeArea = holeWidth * holeHeight;
  const pieceArea = ordered.reduce(
    (sum, p) => sum + (p.extent.width + GUTTER) * (p.extent.height + GUTTER),
    0,
  );
  const minSide = Math.max(...ordered.map((p) => p.extent.width)) + GUTTER;
  const minCap = Math.max(...ordered.map((p) => p.extent.height)) + GUTTER;

  let needed = pieceArea;
  for (let attempt = 0; attempt < 400; attempt++) {
    // Del área total y la proporción salen las dos dimensiones, y de ahí los dos grosores.
    const height = Math.sqrt((holeArea + needed) / TARGET_ASPECT);
    const width = height * TARGET_ASPECT;
    const sideThickness = Math.max(minSide, (width - holeWidth) / 2);
    const capThickness = Math.max(minCap, (height - holeHeight) / 2);

    const laid = layIntoBand(ordered, holeWidth, holeHeight, sideThickness, capThickness);
    if (laid) return { ...laid, holeWidth, holeHeight };
    needed *= 1.05;
  }
  throw new RangeError('No se pudo empaquetar la banda');
}

/** Tamaño del tablero y del área central. Ver [contracts/band-packing.md]. */
export function boardSize(gridRows: number, gridCols: number, shapeSeed: number): BoardSize {
  assertGrid(gridRows, gridCols);
  const packed = pack(gridRows, gridCols, shapeSeed, 1);
  return {
    width: packed.width,
    height: packed.height,
    holeX: packed.holeX,
    holeY: packed.holeY,
    holeWidth: packed.holeWidth,
    holeHeight: packed.holeHeight,
  };
}

/**
 * Posiciones iniciales de todas las piezas.
 *
 * **Ninguna pareja arranca encajada, y sale gratis.** `release_piece` une dos vecinas cuando su
 * separación se acerca a `PIECE_SIZE` (100) dentro de la tolerancia (25), es decir cuando cae en
 * `[75, 125]` en **los dos ejes a la vez**. En una fila las piezas van separadas al menos
 * `PIECE_SIZE + GUTTER` en horizontal y comparten la vertical, así que para encajar tendrían que
 * estar además desplazadas justo una celda en vertical, cosa que la fila impide.
 */
export function layoutPieces(
  gridRows: number,
  gridCols: number,
  shapeSeed: number,
  scatterSeed = 1,
): ScatteredPiece[] {
  assertGrid(gridRows, gridCols);
  const { placed } = pack(gridRows, gridCols, shapeSeed, scatterSeed);

  const pieces: ScatteredPiece[] = [];
  for (let gridRow = 0; gridRow < gridRows; gridRow++) {
    for (let gridCol = 0; gridCol < gridCols; gridCol++) {
      const at = placed.get(`${gridRow},${gridCol}`);
      if (!at) throw new RangeError(`La pieza (${gridRow}, ${gridCol}) no se colocó`);
      pieces.push({ gridRow, gridCol, x: at.x, y: at.y });
    }
  }
  return pieces;
}
