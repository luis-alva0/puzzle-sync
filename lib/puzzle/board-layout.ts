import { PIECE_SIZE, solvedSize } from '@/lib/puzzle/geometry';
import { tabOverflow } from '@/lib/puzzle-generation/path';
import { splitmix32 } from '@/lib/puzzle-generation/prng';

/**
 * Dónde empieza cada pieza y qué tamaño tiene el tablero que las contiene.
 *
 * Las piezas se reparten en una **banda alrededor del borde**, dejando libre un área central del
 * tamaño del rompecabezas armado. La banda es una rejilla de huecos y cada pieza ocupa uno: de ahí
 * sale la garantía que justifica esta funcionalidad —**dos piezas nunca se solapan**— sin ninguna
 * detección de colisiones y sin ningún bucle que pueda no terminar (research R1).
 *
 * Todo aquí es función pura. `boardSize` la llaman **el servidor y el navegador**: el primero para
 * repartir, el segundo para saber qué área dibujar. Si cada uno calculase el suyo, las piezas
 * acabarían colocadas donde nadie las pinta, que es el fallo que este módulo existe para evitar.
 *
 * Nada consulta `window` ni el DOM. El tamaño del tablero **no puede depender de la ventana** o
 * dos jugadores verían disposiciones distintas (FR-006, FR-030).
 */

/**
 * Separación entre huecos de la rejilla, en unidades de tablero.
 *
 * Una pieza no ocupa `PIECE_SIZE`: sus lengüetas sobresalen `tabOverflow` por cada lado, así que
 * su caja envolvente en el peor caso —lengüeta saliente en los dos lados opuestos— mide
 * `PIECE_SIZE + 2 × tabOverflow`. Espaciar los huecos `PIECE_SIZE` dejaría las lengüetas invadiendo
 * al vecino: piezas visualmente solapadas.
 *
 * Se deriva de `tabOverflow` en lugar de escribirse a mano para que siga siendo correcto si algún
 * día cambia la profundidad de la lengüeta (research R2).
 */
export const PIECE_BOUNDS = PIECE_SIZE + tabOverflow(PIECE_SIZE) * 2;

/** Holgura sobre la caja envolvente. Es el margen dentro del que se sacude cada pieza. */
const SLOT_SLACK = PIECE_SIZE * 0.12;

/** Paso de la rejilla de huecos. */
export const SLOT_PITCH = PIECE_BOUNDS + SLOT_SLACK;

/**
 * Proporción a la que tiende el tablero.
 *
 * No es la del rompecabezas: es lo que decide cuán grandes se ven las piezas. Con escala uniforme,
 * el factor lo fija el eje más apretado, así que un tablero cuadrado en una pantalla apaisada
 * desperdicia los laterales y encoge las piezas sin necesidad. 16:10 es un punto intermedio fijo
 * entre 16:9 y 4:3 — fijo porque tomarlo de la ventana real rompería FR-006 (research R3).
 */
const TARGET_ASPECT = 1.6;

export interface BoardSize {
  /** Tamaño total del tablero, en unidades de tablero. */
  width: number;
  height: number;
  /** Área central libre de piezas, donde se arma. */
  holeX: number;
  holeY: number;
  holeWidth: number;
  holeHeight: number;
  /** Huecos de la rejilla a lo ancho y a lo alto, incluidos los del área central. */
  slotCols: number;
  slotRows: number;
  /** Huecos de la rejilla que caen dentro del área central, y por tanto no se usan. */
  holeSlotCols: number;
  holeSlotRows: number;
}

function assertGrid(gridRows: number, gridCols: number): void {
  if (!Number.isInteger(gridRows) || !Number.isInteger(gridCols) || gridRows < 1 || gridCols < 1) {
    throw new RangeError('La cuadrícula necesita al menos una fila y una columna');
  }
}

/**
 * Tamaño del tablero y del área central para una cuadrícula dada.
 *
 * El área central ocupa un número entero de huecos, de modo que la banda encaje con ella sin
 * medias casillas. Crece desde ahí hasta que la banda tenga huecos para todas las piezas.
 */
export function boardSize(gridRows: number, gridCols: number): BoardSize {
  assertGrid(gridRows, gridCols);

  const solved = solvedSize(gridRows, gridCols);
  const pieceCount = gridRows * gridCols;

  // El área central se redondea hacia arriba a huecos completos, así que nunca es menor que el
  // rompecabezas armado (FR-003).
  const holeSlotCols = Math.ceil(solved.width / SLOT_PITCH);
  const holeSlotRows = Math.ceil(solved.height / SLOT_PITCH);
  const holeSlots = holeSlotCols * holeSlotRows;

  // Crecer desde la proporción objetivo hasta que la banda dé abasto. El bucle termina siempre:
  // cada vuelta añade una fila, y los huecos crecen más deprisa que el área central, que es fija.
  let slotRows = Math.max(holeSlotRows + 2, Math.ceil(Math.sqrt((holeSlots + pieceCount) / TARGET_ASPECT)));
  let slotCols = Math.max(holeSlotCols + 2, Math.ceil(slotRows * TARGET_ASPECT));

  while (slotCols * slotRows - holeSlots < pieceCount) {
    slotRows += 1;
    slotCols = Math.max(holeSlotCols + 2, Math.ceil(slotRows * TARGET_ASPECT));
  }

  // La banda debe tener el mismo grosor a ambos lados, o el área central queda a caballo entre
  // dos huecos: el rectángulo centrado no coincidiría con los huecos excluidos y quedarían medios
  // huecos dentro del área. Ajustar la paridad centra y alinea de una vez, a costa de una fila o
  // una columna más.
  if ((slotCols - holeSlotCols) % 2 !== 0) slotCols += 1;
  if ((slotRows - holeSlotRows) % 2 !== 0) slotRows += 1;

  const width = slotCols * SLOT_PITCH;
  const height = slotRows * SLOT_PITCH;

  // Los huecos del área central se reservaron redondeando hacia arriba, así que el área nunca
  // queda por debajo del rompecabezas armado (FR-003).
  const holeWidth = holeSlotCols * SLOT_PITCH;
  const holeHeight = holeSlotRows * SLOT_PITCH;

  return {
    width,
    height,
    holeX: (width - holeWidth) / 2,
    holeY: (height - holeHeight) / 2,
    holeWidth,
    holeHeight,
    slotCols,
    slotRows,
    holeSlotCols,
    holeSlotRows,
  };
}

export interface Slot {
  x: number;
  y: number;
}

/**
 * Huecos disponibles de la banda, en orden de lectura.
 *
 * Se recorre la rejilla completa y se descartan los que caen dentro del área central. El orden es
 * determinista; el desorden lo introduce la permutación de `layoutPieces`, no este recorrido.
 */
export function bandSlots(board: BoardSize): Slot[] {
  // Exacto sin redondear: `boardSize` fuerza que la banda tenga el mismo grosor a ambos lados.
  const firstHoleCol = (board.slotCols - board.holeSlotCols) / 2;
  const firstHoleRow = (board.slotRows - board.holeSlotRows) / 2;
  const lastHoleCol = firstHoleCol + board.holeSlotCols - 1;
  const lastHoleRow = firstHoleRow + board.holeSlotRows - 1;

  const slots: Slot[] = [];
  for (let row = 0; row < board.slotRows; row++) {
    const insideRows = row >= firstHoleRow && row <= lastHoleRow;
    for (let col = 0; col < board.slotCols; col++) {
      if (insideRows && col >= firstHoleCol && col <= lastHoleCol) continue;
      slots.push({ x: col * SLOT_PITCH, y: row * SLOT_PITCH });
    }
  }
  return slots;
}

export interface ScatteredPiece {
  gridRow: number;
  gridCol: number;
  x: number;
  y: number;
}

/**
 * Permutación determinista de `0..count-1`.
 *
 * Fisher-Yates alimentado por `splitmix32`, el mismo generador que ya usa la generación de formas.
 * Determinista porque el resultado viaja al servidor como estado compartido y las pruebas
 * necesitan reproducirlo (research R4).
 */
function shuffledIndices(count: number, seed: number): number[] {
  const order = Array.from({ length: count }, (_, index) => index);
  let state = seed >>> 0;

  for (let i = count - 1; i > 0; i--) {
    state = splitmix32(state);
    const j = state % (i + 1);
    [order[i], order[j]] = [order[j]!, order[i]!];
  }
  return order;
}

/**
 * Posiciones iniciales de todas las piezas.
 *
 * Cada pieza cae en un hueco distinto de la banda, con una sacudida menor que la holgura del
 * hueco: la irregularidad evita que la banda parezca una tabla, y al ser menor que la holgura
 * **no puede provocar solapes**.
 *
 * Las piezas se barajan antes de asignarlas para que dos vecinas en la imagen no acaben vecinas en
 * la banda (FR-008). Sin barajar, el rompecabezas aparecería medio ordenado alrededor del borde.
 *
 * **Ninguna pareja arranca encajada, y sale gratis.** `release_piece` encaja de forma *relativa*:
 * dos vecinas de cuadrícula se unen cuando su separación se acerca a `PIECE_SIZE` (100) dentro de
 * la tolerancia (25), es decir cuando cae en `[75, 125]`. Las separaciones que produce esta
 * rejilla son múltiplos de `SLOT_PITCH` (160) más una sacudida de ±12 como mucho: `[-12, 12]`,
 * `[148, 172]`, `[308, 332]`… Ninguna toca `[75, 125]`, así que el encaje es imposible en la
 * disposición inicial por construcción, sin necesidad de comprobar ni corregir nada.
 */
export function layoutPieces(gridRows: number, gridCols: number, seed = 1): ScatteredPiece[] {
  const board = boardSize(gridRows, gridCols); // valida la cuadrícula

  const slots = bandSlots(board);
  const pieceCount = gridRows * gridCols;

  if (slots.length < pieceCount) {
    // Inalcanzable: `boardSize` crece hasta que la banda da abasto. Se comprueba porque si esa
    // invariante se rompiera, el síntoma sería piezas apiladas en el mismo hueco.
    throw new RangeError(`La banda tiene ${slots.length} huecos para ${pieceCount} piezas`);
  }

  const order = shuffledIndices(slots.length, seed);

  // `x` e `y` son la esquina de la **celda**, pero la caja envolvente empieza `overflow` antes,
  // porque las lengüetas sobresalen. Sin este desplazamiento las piezas de la primera fila y la
  // primera columna asoman fuera del tablero.
  const overflow = (PIECE_BOUNDS - PIECE_SIZE) / 2;

  const pieces: ScatteredPiece[] = [];

  for (let gridRow = 0; gridRow < gridRows; gridRow++) {
    for (let gridCol = 0; gridCol < gridCols; gridCol++) {
      const index = gridRow * gridCols + gridCol;
      const slot = slots[order[index]!]!;

      // Dos valores independientes por pieza, derivados de la posición en el reparto.
      const noiseX = splitmix32(seed + index * 2 + 1) / 0x1_0000_0000;
      const noiseY = splitmix32(seed + index * 2 + 2) / 0x1_0000_0000;

      // La caja envolvente queda dentro del hueco: `slot.x + [0, slack]`. La sacudida se mueve por
      // esa holgura y por eso nunca puede invadir el hueco vecino.
      const x = slot.x + overflow + noiseX * SLOT_SLACK;
      const y = slot.y + overflow + noiseY * SLOT_SLACK;

      pieces.push({ gridRow, gridCol, x, y });
    }
  }

  return pieces;
}
