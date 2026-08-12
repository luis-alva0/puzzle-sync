'use client';

import { useEffect, useMemo, useRef } from 'react';
import { PIECE_SIZE } from '@/lib/puzzle/geometry';
import { boardSize } from '@/lib/puzzle/board-layout';
import { buildEdgeGrid, pieceEdges } from '@/lib/puzzle-generation/edges';
import { groupPaths, tabOverflow, type GroupPaths } from '@/lib/puzzle-generation/path';
import { seedFromUuid } from '@/lib/puzzle-generation/prng';
import type { Piece, PlayerSummary } from '@/types/board';

/**
 * Render del tablero en un único `<canvas>` (research R3).
 *
 * Canvas y no SVG porque el caso peor son 500 piezas: con SVG serían 500 nodos del DOM con
 * `transform` cambiando en cada frame durante un arrastre, y el coste de layout y repaint lo
 * hace inviable a 60 fps. Canvas repinta una escena completa por frame con coste predecible.
 *
 * El componente no tiene estado propio: recibe las piezas ya resueltas —confirmadas más pistas
 * provisionales— y las pinta. Toda la lógica de precedencia vive en `lib/realtime/boardSync.ts`.
 *
 * Las formas irregulares se calculan aquí a partir del UUID del rompecabezas (feature 002): el
 * servidor no genera ni almacena ninguna imagen por pieza. Cada pieza se recorta con su `Path2D`
 * y se pinta una región de imagen **mayor** que la celda, porque las lengüetas sobresalen.
 *
 * Las lengüetas son decoración: el encaje se sigue calculando sobre la cuadrícula regular en
 * `release_piece`. Dos piezas encajan por su posición de celda, no por si sus formas embonan.
 */

/**
 * Fondo del tablero: cartón claro, como en las referencias de jigsawexplorer.
 *
 * Neutro y de valor medio a propósito (FR-014). Un fondo muy oscuro o muy claro compite con las
 * piezas: las zonas de la foto con ese mismo valor se funden con el tablero y la silueta se pierde.
 */
const BOARD_BACKGROUND = '#a1836a';

interface BoardCanvasProps {
  pieces: Piece[];
  /** UUID del rompecabezas: es la semilla del generador de formas (research R3 de 002). */
  puzzleId: string;
  gridRows: number;
  gridCols: number;
  imageUrl: string;
  players: PlayerSummary[];
  /** `room_players.id` de quien mira, para distinguir sus capturas de las ajenas. */
  currentPlayerId: string | null;
  /** Dibuja la imagen completa en el área central como ayuda (FR-021). */
  showReference?: boolean;
  /** Se llama con las coordenadas en unidades de tablero. */
  onPointerDownBoard?: (x: number, y: number) => void;
  onPointerMoveBoard?: (x: number, y: number) => void;
  onPointerUpBoard?: (x: number, y: number) => void;
}

export function BoardCanvas({
  pieces,
  puzzleId,
  gridRows,
  gridCols,
  imageUrl,
  players,
  currentPlayerId,
  showReference = false,
  onPointerDownBoard,
  onPointerMoveBoard,
  onPointerUpBoard,
}: BoardCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const piecesRef = useRef(pieces);
  const frameRef = useRef<number | null>(null);

  const aliasRef = useRef(new Map<string, string>());
  const currentPlayerRef = useRef(currentPlayerId);
  const showReferenceRef = useRef(showReference);

  // Las props se copian a refs para que el bucle de rAF lea siempre lo último sin tener que
  // reiniciarse en cada render. La copia va en un efecto, no en el cuerpo: mutar una ref
  // durante el render rompe las garantías de React con renderizado concurrente.
  useEffect(() => {
    piecesRef.current = pieces;
    aliasRef.current = new Map(players.map((player) => [player.id, player.alias]));
    currentPlayerRef.current = currentPlayerId;
    showReferenceRef.current = showReference;
  });

  useEffect(() => {
    const image = new Image();
    image.src = imageUrl;
    image.onload = () => {
      imageRef.current = image;
    };
  }, [imageUrl]);

  /*
   * Rejilla de bordes y **caché de siluetas**, calculadas una vez por rompecabezas.
   *
   * Antes se llamaba a `piecePath(...)` dentro del bucle de piezas, dentro del bucle de frames:
   * con 150 piezas a 60 fps eran 9 000 objetos `Path2D` por segundo, y con 500 piezas, 30 000,
   * cada uno retrazando sus curvas Bézier. Trabajo íntegramente repetido: la forma de una pieza
   * depende de su celda y de la semilla, y ninguna de las dos cambia durante la partida.
   *
   * Es lo que hace alcanzable SC-006 (50 fps con 150 piezas).
   */
  const edgeGrid = useMemo(
    () => buildEdgeGrid(seedFromUuid(puzzleId), gridRows, gridCols),
    [puzzleId, gridRows, gridCols],
  );

  /*
   * Caché de los tres trazados de cada grupo, en **coordenadas relativas a su origen**.
   *
   * Que sean relativas es lo que hace útil el caché: al arrastrar, la composición del grupo no
   * cambia —solo su posición— así que el trazado sirve tal cual y basta con trasladarlo al pintar.
   * En coordenadas absolutas habría que reconstruirlo en cada frame, o peor: el caché quedaría
   * desfasado y el grupo se vería congelado mientras lo mueves.
   */
  const groupCacheRef = useRef(new Map<string, { signature: string; paths: GroupPaths }>());
  useEffect(() => {
    groupCacheRef.current = new Map();
  }, [edgeGrid]);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext('2d');
    if (!context) return;

    // El tamaño del mundo sale de `boardSize()`, la MISMA función que usa el servidor para
    // repartir las piezas. Si cada lado calculase el suyo, las piezas quedarían colocadas donde
    // nadie las pinta: el estado sería correcto y aun así invisible.
    //
    // No hay origen que desplazar: las coordenadas del reparto empiezan en (0, 0). Lo que sí hay
    // es un desplazamiento de centrado, que depende de la ventana y por eso se recalcula en cada
    // frame y NUNCA toca las posiciones de las piezas.
    // Tercer argumento: la semilla de **formas**, la misma que alimenta la rejilla de bordes. El
    // empaquetado mide cada pieza por sus lengüetas, así que sin ella el canvas dibujaría un
    // tablero distinto del que el servidor empaquetó.
    const board = boardSize(gridRows, gridCols, seedFromUuid(puzzleId));
    const worldWidth = board.width;
    const worldHeight = board.height;

    const draw = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;

      if (canvas.width !== Math.round(rect.width * dpr)) {
        canvas.width = Math.round(rect.width * dpr);
        canvas.height = Math.round(rect.height * dpr);
      }

      const scale = Math.min(canvas.width / worldWidth, canvas.height / worldHeight);
      // Con proporción de tablero fija y ventanas de cualquier proporción siempre sobra margen en
      // un eje. Se reparte a los dos lados para que el tablero quede centrado.
      const offsetX = (canvas.width - worldWidth * scale) / 2;
      const offsetY = (canvas.height - worldHeight * scale) / 2;

      canvas.dataset.scale = String(scale);
      canvas.dataset.offsetX = String(offsetX);
      canvas.dataset.offsetY = String(offsetY);

      context.setTransform(1, 0, 0, 1, 0, 0);
      context.clearRect(0, 0, canvas.width, canvas.height);
      // Superficie neutra tipo cartón (FR-014). El gris oscuro anterior competía con las piezas:
      // sobre un fondo casi negro, las zonas oscuras de la foto se confundían con el tablero.
      context.fillStyle = BOARD_BACKGROUND;
      context.fillRect(0, 0, canvas.width, canvas.height);

      context.setTransform(scale, 0, 0, scale, offsetX, offsetY);

      // El área central no se dibuja (FR-026). La referencia no la marca y no hace falta: el hueco
      // ya se ve, lo dibujan las piezas que lo rodean.

      const image = imageRef.current;

      // Ayuda de imagen (FR-021), **antes de las piezas**: así las que ya están colocadas en el
      // centro se ven por encima de la referencia en lugar de quedar tapadas, que es lo que uno
      // quiere al comparar (research R7).
      if (showReferenceRef.current && image) {
        context.save();
        context.globalAlpha = 0.92;
        context.drawImage(image, board.holeX, board.holeY, board.holeWidth, board.holeHeight);
        context.restore();
      }

      const sourcePieceWidth = image ? image.naturalWidth / gridCols : 0;
      const sourcePieceHeight = image ? image.naturalHeight / gridRows : 0;

      // Holgura de la lengüeta: hay que pintar más allá de la celda o saldrían vacías.
      const overflow = tabOverflow(PIECE_SIZE);
      const sourceOverflowX = image ? (overflow / PIECE_SIZE) * sourcePieceWidth : 0;
      const sourceOverflowY = image ? (overflow / PIECE_SIZE) * sourcePieceHeight : 0;

      // Agrupar antes de pintar: un grupo se dibuja de una vez, con un solo recorte, y por eso no
      // quedan costuras entre sus piezas (research R2).
      const byGroup = new Map<string, Piece[]>();
      for (const piece of piecesRef.current) {
        const bucket = byGroup.get(piece.groupId);
        if (bucket) bucket.push(piece);
        else byGroup.set(piece.groupId, [piece]);
      }

      // Los grupos capturados van al final: un bloque que alguien arrastra por debajo de otras
      // piezas se ve mal, y con relieve y sombra se nota más.
      const groups = [...byGroup.values()].sort(
        (a, b) => Number(Boolean(a[0]!.capturedBy)) - Number(Boolean(b[0]!.capturedBy)),
      );

      for (const pieces of groups) {
        const first = pieces[0]!;
        const originX = Math.min(...pieces.map((p) => p.x));
        const originY = Math.min(...pieces.map((p) => p.y));
        const minRow = Math.min(...pieces.map((p) => p.gridRow));
        const minCol = Math.min(...pieces.map((p) => p.gridCol));
        const spanRows = Math.max(...pieces.map((p) => p.gridRow)) - minRow + 1;
        const spanCols = Math.max(...pieces.map((p) => p.gridCol)) - minCol + 1;

        // El caché se invalida por composición, no por posición.
        const signature = pieces
          .map((p) => `${p.gridRow},${p.gridCol}`)
          .sort()
          .join('|');
        let entry = groupCacheRef.current.get(first.groupId);
        if (!entry || entry.signature !== signature) {
          entry = {
            signature,
            paths: groupPaths(
              pieces.map((p) => ({
                gridRow: p.gridRow,
                gridCol: p.gridCol,
                x: p.x - originX,
                y: p.y - originY,
                edges: pieceEdges(edgeGrid, p.gridRow, p.gridCol),
              })),
              PIECE_SIZE,
            ),
          };
          groupCacheRef.current.set(first.groupId, entry);
        }
        const { filled, outline, seams } = entry.paths;

        context.save();
        context.translate(originX, originY);

        // Un solo recorte y un solo `drawImage` para el grupo entero.
        //
        // El **origen** de la imagen sale de la celda mínima del grupo en la cuadrícula, que es de
        // donde viene esa porción de foto. El **destino** sale de su posición en el tablero, ya
        // aplicada por el `translate`. Son cajas distintas en cuanto alguien mueve el grupo.
        context.save();
        context.clip(filled);
        if (image && sourcePieceWidth > 0) {
          context.drawImage(
            image,
            minCol * sourcePieceWidth - sourceOverflowX,
            minRow * sourcePieceHeight - sourceOverflowY,
            spanCols * sourcePieceWidth + sourceOverflowX * 2,
            spanRows * sourcePieceHeight + sourceOverflowY * 2,
            -overflow,
            -overflow,
            spanCols * PIECE_SIZE + overflow * 2,
            spanRows * PIECE_SIZE + overflow * 2,
          );
        } else {
          context.fillStyle = '#c9bfae';
          context.fillRect(
            -overflow,
            -overflow,
            spanCols * PIECE_SIZE + overflow * 2,
            spanRows * PIECE_SIZE + overflow * 2,
          );
        }
        context.restore();

        // Las juntas interiores, encima: pasan de ser un artefacto a ser una línea de corte.
        if (pieces.length > 1) {
          context.strokeStyle = 'rgba(0,0,0,0.26)';
          context.lineWidth = 1 / scale;
          context.stroke(seams);
        }

        /*
         * Relieve del borde (FR-014).
         *
         * Dos trazos del **contorno exterior** dentro del recorte: uno claro desplazado arriba a
         * la izquierda y otro oscuro abajo a la derecha. El recorte hace el trabajo: un trazo
         * grueso centrado en el contorno se queda en su mitad interior, que es justo el bisel, y
         * no invade ni al vecino ni al tablero. Por eso el relieve nunca puede tapar más que el
         * borde de la propia pieza (FR-017).
         *
         * Se usa `outline` y no el trazado compuesto: con el compuesto se biselarían también las
         * juntas interiores, y un bloque con todas sus costuras marcadas como bordes es lo
         * contrario de lo que pide FR-016.
         *
         * El grosor va en unidades de tablero, así que se escala con la pieza: con 500 piezas el
         * bisel baja de un píxel y se desvanece solo, que es lo correcto a ese tamaño.
         */
        const bevel = PIECE_SIZE * 0.045;
        context.save();
        context.clip(filled);
        context.lineWidth = bevel;
        context.strokeStyle = 'rgba(255,255,255,0.5)';
        context.translate(-bevel * 0.35, -bevel * 0.35);
        context.stroke(outline);
        context.strokeStyle = 'rgba(0,0,0,0.35)';
        context.translate(bevel * 0.7, bevel * 0.7);
        context.stroke(outline);
        context.restore();

        // Contorno y sombra corta del grupo, que lo despegan del tablero (FR-015, FR-016).
        context.save();
        context.shadowColor = 'rgba(0,0,0,0.3)';
        context.shadowBlur = 5 / scale;
        context.shadowOffsetY = 2 / scale;
        context.strokeStyle = 'rgba(0,0,0,0.5)';
        context.lineWidth = 1.2 / scale;
        context.stroke(outline);
        context.restore();

        /*
         * Ocupada (FR-017a a FR-017c).
         *
         * Un **halo por fuera** del contorno, no un contorno de color que sustituya al relieve: la
         * pieza que estás moviendo es justo la que no puede verse peor que las demás. Se dibuja
         * después de la sombra y con ella apagada, para que los dos no se mezclen en un borrón
         * alrededor del bloque.
         *
         * Rodea el contorno **del grupo**: un bloque de veinte piezas con veinte halos sería
         * ilegible.
         */
        if (first.capturedBy) {
          const isMine = first.capturedBy === currentPlayerRef.current;
          context.save();
          context.lineWidth = 5 / scale;
          context.strokeStyle = isMine ? 'rgba(74,222,128,0.85)' : 'rgba(251,191,36,0.85)';
          context.stroke(outline);
          context.restore();
        }
        context.restore();

        if (first.capturedBy && first.capturedBy !== currentPlayerRef.current) {
          const alias = aliasRef.current.get(first.capturedBy) ?? 'otro jugador';
          context.font = `${12 / scale}px system-ui, sans-serif`;
          context.textBaseline = 'bottom';
          const label = ` ${alias} `;
          const metrics = context.measureText(label);
          context.fillStyle = 'rgba(0,0,0,0.75)';
          context.fillRect(originX, originY - 18 / scale, metrics.width, 16 / scale);
          context.fillStyle = '#fbbf24';
          context.fillText(label, originX, originY - 4 / scale);
        }
      }

      frameRef.current = requestAnimationFrame(draw);
    };

    frameRef.current = requestAnimationFrame(draw);
    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    };
  }, [gridRows, gridCols, puzzleId, edgeGrid]);

  /** Traduce coordenadas de pantalla a unidades de tablero. */
  function toBoard(event: React.PointerEvent<HTMLCanvasElement>): { x: number; y: number } {
    const canvas = event.currentTarget;
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const scale = Number(canvas.dataset.scale ?? 1);
    const offsetX = Number(canvas.dataset.offsetX ?? 0);
    const offsetY = Number(canvas.dataset.offsetY ?? 0);

    const pixelX = (event.clientX - rect.left) * dpr;
    const pixelY = (event.clientY - rect.top) * dpr;

    // Invierte exactamente la transformación del dibujado. Los dos leen del mismo `dataset`, que
    // es lo que evita que se separen: si uno cambiase sin el otro, el tablero se vería bien y el
    // arrastre agarraría donde no hay pieza.
    return { x: (pixelX - offsetX) / scale, y: (pixelY - offsetY) / scale };
  }

  const connectedPieces = pieces.filter(
    (piece) => pieces.filter((other) => other.groupId === piece.groupId).length > 1,
  ).length;

  return (
    <>
      {/*
        Canvas no genera árbol de accesibilidad: un lector de pantalla no ve las piezas. Se
        compensa con un resumen textual del progreso, que es la información que de verdad
        importa fuera del arrastre con puntero (el spec declara el puntero como modo soportado).
      */}
      <p
        role="status"
        aria-live="polite"
        style={{
          position: 'absolute',
          width: 1,
          height: 1,
          overflow: 'hidden',
          clip: 'rect(0 0 0 0)',
          whiteSpace: 'nowrap',
        }}
      >
        {connectedPieces} de {pieces.length} piezas conectadas.
      </p>
      <canvas
        ref={canvasRef}
        role="application"
        aria-label={`Tablero de rompecabezas de ${gridRows * gridCols} piezas`}
        style={{
          // Ocupa todo el contenedor en vez de fijar su proporción a partir de la cuadrícula: el
          // tablero completo debe caber siempre en la ventana (FR-032), y de ajustarlo se encarga
          // la escala del dibujado, no el tamaño del elemento.
          width: '100%',
          height: '100%',
          display: 'block',
          touchAction: 'none',
          cursor: 'grab',
        }}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          const point = toBoard(event);
          onPointerDownBoard?.(point.x, point.y);
        }}
        onPointerMove={(event) => {
          const point = toBoard(event);
          onPointerMoveBoard?.(point.x, point.y);
        }}
        onPointerUp={(event) => {
          const point = toBoard(event);
          onPointerUpBoard?.(point.x, point.y);
        }}
      />
    </>
  );
}
