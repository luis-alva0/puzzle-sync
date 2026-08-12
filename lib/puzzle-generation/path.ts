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
