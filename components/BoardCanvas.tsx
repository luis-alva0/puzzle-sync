'use client';

import { useEffect, useMemo, useRef } from 'react';
import { PIECE_SIZE } from '@/lib/puzzle/geometry';
import { boardSize } from '@/lib/puzzle/board-layout';
import { buildEdgeGrid, pieceEdges } from '@/lib/puzzle-generation/edges';
import { piecePath, tabOverflow } from '@/lib/puzzle-generation/path';
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
  const piecePaths = useMemo(() => {
    const grid = buildEdgeGrid(seedFromUuid(puzzleId), gridRows, gridCols);
    const paths: Path2D[] = [];
    for (let row = 0; row < gridRows; row++) {
      for (let col = 0; col < gridCols; col++) {
        paths.push(piecePath(pieceEdges(grid, row, col), PIECE_SIZE));
      }
    }
    return paths;
  }, [puzzleId, gridRows, gridCols]);
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
    const board = boardSize(gridRows, gridCols);
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

      // T020: el rectángulo del área central, que es el hueco real que deja la banda. Antes se
      // dibujaba la silueta del rompecabezas resuelto en el origen, que ya no es donde está.
      context.strokeStyle = 'rgba(0,0,0,0.10)';
      context.lineWidth = 2 / scale;
      context.strokeRect(board.holeX, board.holeY, board.holeWidth, board.holeHeight);

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

      // Tamaño de cada grupo, para distinguir visualmente los bloques ya conectados (FR-017).
      const groupSizes = new Map<string, number>();
      for (const piece of piecesRef.current) {
        groupSizes.set(piece.groupId, (groupSizes.get(piece.groupId) ?? 0) + 1);
      }

      // Holgura de la lengüeta: hay que pintar más allá de la celda o saldrían vacías.
      const overflow = tabOverflow(PIECE_SIZE);
      const sourceOverflowX = image ? (overflow / PIECE_SIZE) * sourcePieceWidth : 0;
      const sourceOverflowY = image ? (overflow / PIECE_SIZE) * sourcePieceHeight : 0;

      for (const piece of piecesRef.current) {
        const path = piecePaths[piece.gridRow * gridCols + piece.gridCol]!;

        context.save();
        context.translate(piece.x, piece.y);
        context.clip(path);

        if (image && sourcePieceWidth > 0) {
          // Región de origen ampliada por la holgura, y destino ampliado igual: el recorte por
          // path se queda con la forma de la pieza y descarta el resto.
          context.drawImage(
            image,
            piece.gridCol * sourcePieceWidth - sourceOverflowX,
            piece.gridRow * sourcePieceHeight - sourceOverflowY,
            sourcePieceWidth + sourceOverflowX * 2,
            sourcePieceHeight + sourceOverflowY * 2,
            -overflow,
            -overflow,
            PIECE_SIZE + overflow * 2,
            PIECE_SIZE + overflow * 2,
          );
        } else {
          context.fillStyle = '#c9bfae';
          context.fillRect(-overflow, -overflow, PIECE_SIZE + overflow * 2, PIECE_SIZE + overflow * 2);
        }
        context.restore();

        // Contorno con el path, no con strokeRect: la pieza ya no es un rectángulo.
        //
        // Sobre el cartón claro hace falta más contraste que sobre el fondo oscuro de antes: un
        // contorno oscuro fino y una sombra corta, que es lo que despega la pieza del tablero y
        // deja leer su silueta (FR-013). Las piezas ya unidas llevan el contorno más tenue para
        // que un grupo se lea como un bloque y no como piezas sueltas pegadas.
        const inGroup = groupSizes.get(piece.groupId) ?? 1;
        context.save();
        context.translate(piece.x, piece.y);

        if (inGroup === 1) {
          context.shadowColor = 'rgba(0,0,0,0.35)';
          context.shadowBlur = 6 / scale;
          context.shadowOffsetY = 2 / scale;
        }
        context.strokeStyle = inGroup > 1 ? 'rgba(0,0,0,0.30)' : 'rgba(0,0,0,0.65)';
        context.lineWidth = (inGroup > 1 ? 1 : 1.5) / scale;
        context.stroke(path);
        context.shadowColor = 'transparent';
        context.shadowBlur = 0;
        context.shadowOffsetY = 0;

        // Estado ocupado (FR-012 de 001): contorno y alias de quien la tiene.
        if (piece.capturedBy) {
          const isMine = piece.capturedBy === currentPlayerRef.current;
          context.strokeStyle = isMine ? '#4ade80' : '#fbbf24';
          context.lineWidth = 3 / scale;
          context.stroke(path);
        }
        context.restore();

        if (piece.capturedBy && piece.capturedBy !== currentPlayerRef.current) {
          const alias = aliasRef.current.get(piece.capturedBy) ?? 'otro jugador';
          context.font = `${12 / scale}px system-ui, sans-serif`;
          context.textBaseline = 'bottom';
          const label = ` ${alias} `;
          const metrics = context.measureText(label);
          context.fillStyle = 'rgba(0,0,0,0.75)';
          context.fillRect(piece.x, piece.y - 18 / scale, metrics.width, 16 / scale);
          context.fillStyle = '#fbbf24';
          context.fillText(label, piece.x, piece.y - 4 / scale);
        }
      }

      frameRef.current = requestAnimationFrame(draw);
    };

    frameRef.current = requestAnimationFrame(draw);
    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    };
  }, [gridRows, gridCols, piecePaths]);

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
