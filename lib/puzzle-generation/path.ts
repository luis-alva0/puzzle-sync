import { MAX_PROFILE_DEPTH } from '@/lib/puzzle-generation/tab-profiles';
import type { Edge, PieceEdges } from '@/types/puzzle';

/**
 * Contorno de una pieza, trazado a partir de sus cuatro bordes.
 *
 * Las lengüetas **sobresalen** de la celda: quien dibuje con este trazado debe recortar con él y
 * pintar una región de imagen mayor que `size × size`, o las lengüetas saldrán vacías.
 *
 * Es la única parte de `lib/puzzle-generation` que depende del navegador (`Path2D`), y por eso
 * es la única sin prueba unitaria: lo que hay que verificar —que dos piezas vecinas encajen— se
 * verifica sobre la rejilla de bordes, que es datos puros.
 */

/**
 * Traza un borde desde `(x0, y0)` hasta `(x1, y1)`.
 *
 * `direction` marca hacia dónde sobresale la lengüeta en perpendicular al borde; combinado con
 * `edge.sign`, es lo que hace que el mismo borde leído desde los dos lados produzca una lengüeta
 * y su hueco complementario.
 */
function traceEdge(
  path: Path2D,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  edge: Edge,
  direction: 1 | -1,
  size: number,
): void {
  if (edge.straight) {
    path.lineTo(x1, y1);
    return;
  }

  // Vector del borde y su perpendicular.
  const dx = x1 - x0;
  const dy = y1 - y0;
  const nx = -dy / size;
  const ny = dx / size;

  const bulge = MAX_PROFILE_DEPTH * size * edge.sign * direction;
  const center = 0.5 + edge.offset;
  const half = 0.2; // provisional: la Fase 5 lo sustituye por el perfil

  // Punto sobre el borde a la fracción `t`, desplazado `out` en perpendicular.
  const at = (t: number, out: number) => ({
    x: x0 + dx * t + nx * out,
    y: y0 + dy * t + ny * out,
  });

  const start = at(center - half, 0);
  const peak = at(center, bulge);
  const end = at(center + half, 0);

  path.lineTo(start.x, start.y);

  // Dos curvas cúbicas: la subida hasta la cima de la lengüeta y la bajada.
  const c1 = at(center - half * 0.6, bulge * 1.15);
  const c2 = at(center - half * 0.2, bulge);
  path.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, peak.x, peak.y);

  const c3 = at(center + half * 0.2, bulge);
  const c4 = at(center + half * 0.6, bulge * 1.15);
  path.bezierCurveTo(c3.x, c3.y, c4.x, c4.y, end.x, end.y);

  path.lineTo(x1, y1);
}

/**
 * Contorno cerrado de una pieza de `size × size`, con origen en `(0, 0)`.
 *
 * Se recorre en sentido horario. Los bordes derecho e inferior se trazan en el sentido "natural"
 * y los otros dos al revés, que es justamente lo que convierte la lengüeta de una pieza en el
 * hueco de su vecina.
 */
export function piecePath(edges: PieceEdges, size: number): Path2D {
  const path = new Path2D();
  path.moveTo(0, 0);

  traceEdge(path, 0, 0, size, 0, edges.top, -1, size); // arriba →
  traceEdge(path, size, 0, size, size, edges.right, 1, size); // derecha ↓
  traceEdge(path, size, size, 0, size, edges.bottom, 1, size); // abajo ←
  traceEdge(path, 0, size, 0, 0, edges.left, -1, size); // izquierda ↑

  path.closePath();
  return path;
}

/** Un lado de una pieza, para elegir qué trazar. */
type Side = 'top' | 'right' | 'bottom' | 'left';

/** Pieza tal como la ve el trazado de grupos: su celda y dónde está en el tablero. */
export interface GroupMember {
  gridRow: number;
  gridCol: number;
  /** Posición en el tablero, ya relativa al origen del grupo. */
  x: number;
  y: number;
  edges: PieceEdges;
}

/** Los tres trazados de un grupo. Ver research R3. */
export interface GroupPaths {
  /** Contorno completo, para recortar y rellenar la imagen. */
  filled: Path2D;
  /** Solo los lados sin vecino dentro del grupo: relieve, sombra y halo. */
  outline: Path2D;
  /** Solo los lados con vecino: las líneas de corte. */
  seams: Path2D;
}

/** Traza un lado suelto como subtrazado abierto, sin cerrar la figura. */
function traceSide(path: Path2D, member: GroupMember, side: Side, size: number): void {
  const { x, y } = member;
  const e = member.edges;

  if (side === 'top') {
    path.moveTo(x, y);
    traceEdge(path, x, y, x + size, y, e.top, -1, size);
  } else if (side === 'right') {
    path.moveTo(x + size, y);
    traceEdge(path, x + size, y, x + size, y + size, e.right, 1, size);
  } else if (side === 'bottom') {
    path.moveTo(x + size, y + size);
    traceEdge(path, x + size, y + size, x, y + size, e.bottom, 1, size);
  } else {
    path.moveTo(x, y + size);
    traceEdge(path, x, y + size, x, y, e.left, -1, size);
  }
}

/**
 * Los tres trazados de un grupo, construidos en un solo recorrido.
 *
 * **Por qué tres y no uno.** El trazado compuesto sirve para recortar: con la regla de relleno
 * `nonzero`, los contornos de piezas vecinas que se tocan cuentan como una sola figura y no queda
 * agujero entre ellas. Pero **no sirve para el relieve**: `stroke()` recorrería también las juntas
 * interiores y las biselaría como si fueran bordes, que es lo contrario de lo que se quiere.
 *
 * Saber si un lado es exterior es preguntarle al propio grupo si la celda vecina está dentro. Cada
 * junta la traza solo la pieza de la izquierda o la de arriba, para no dibujarla dos veces.
 *
 * **Las coordenadas son relativas al origen del grupo.** Es lo que permite cachear estos trazados
 * mientras el grupo se arrastra: la composición no cambia, así que el trazado tampoco, y solo hay
 * que trasladarlo al pintar.
 */
export function groupPaths(members: GroupMember[], size: number): GroupPaths {
  const filled = new Path2D();
  const outline = new Path2D();
  const seams = new Path2D();

  const present = new Set(members.map((m) => `${m.gridRow},${m.gridCol}`));
  const has = (row: number, col: number) => present.has(`${row},${col}`);

  for (const member of members) {
    const { gridRow: r, gridCol: c } = member;

    // Contorno completo: se compone trasladando el trazado de la pieza.
    filled.addPath(piecePath(member.edges, size), new DOMMatrix().translate(member.x, member.y));

    // Arriba e izquierda: si hay vecino, la junta la dibuja ESTA pieza.
    traceSide(has(r - 1, c) ? seams : outline, member, 'top', size);
    traceSide(has(r, c - 1) ? seams : outline, member, 'left', size);

    // Abajo y derecha: si hay vecino, ya la dibujó él; aquí solo interesa cuando NO lo hay.
    if (!has(r + 1, c)) traceSide(outline, member, 'bottom', size);
    if (!has(r, c + 1)) traceSide(outline, member, 'right', size);
  }

  return { filled, outline, seams };
}

/**
 * Cuánto sobresale una lengüeta, con margen.
 *
 * Se deriva de la profundidad máxima del catálogo de perfiles en lugar de escribirse a mano: es
 * el número que usan **el dibujado** para saber cuánta imagen pintar alrededor de la celda y **el
 * empaquetado** para saber cuánto ocupa una pieza. Si los dos no salieran de la misma fuente,
 * podrían discrepar y las piezas se tocarían.
 */
export function tabOverflow(size: number): number {
  return MAX_PROFILE_DEPTH * size * 1.2;
}
