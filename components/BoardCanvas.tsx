'use client';

import { useEffect, useRef } from 'react';
import { PIECE_SIZE, solvedSize } from '@/lib/puzzle/geometry';
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
 */

interface BoardCanvasProps {
  pieces: Piece[];
  gridRows: number;
  gridCols: number;
  imageUrl: string;
  players: PlayerSummary[];
  /** `room_players.id` de quien mira, para distinguir sus capturas de las ajenas. */
  currentPlayerId: string | null;
  /** Se llama con las coordenadas en unidades de tablero. */
  onPointerDownBoard?: (x: number, y: number) => void;
  onPointerMoveBoard?: (x: number, y: number) => void;
  onPointerUpBoard?: (x: number, y: number) => void;
}

export function BoardCanvas({
  pieces,
  gridRows,
  gridCols,
  imageUrl,
  players,
  currentPlayerId,
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

  // Las props se copian a refs para que el bucle de rAF lea siempre lo último sin tener que
  // reiniciarse en cada render. La copia va en un efecto, no en el cuerpo: mutar una ref
  // durante el render rompe las garantías de React con renderizado concurrente.
  useEffect(() => {
    piecesRef.current = pieces;
    aliasRef.current = new Map(players.map((player) => [player.id, player.alias]));
    currentPlayerRef.current = currentPlayerId;
  });

  useEffect(() => {
    const image = new Image();
    image.src = imageUrl;
    image.onload = () => {
      imageRef.current = image;
    };
  }, [imageUrl]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext('2d');
    if (!context) return;

    const { width: solvedWidth, height: solvedHeight } = solvedSize(gridRows, gridCols);
    // Margen alrededor del área resuelta, donde caen las piezas dispersas.
    const worldWidth = solvedWidth + PIECE_SIZE * 4;
    const worldHeight = solvedHeight + PIECE_SIZE * 4;
    const originX = PIECE_SIZE * 2;
    const originY = PIECE_SIZE * 2;

    const draw = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;

      if (canvas.width !== Math.round(rect.width * dpr)) {
        canvas.width = Math.round(rect.width * dpr);
        canvas.height = Math.round(rect.height * dpr);
      }

      const scale = Math.min(canvas.width / worldWidth, canvas.height / worldHeight);
      canvas.dataset.scale = String(scale);
      canvas.dataset.originX = String(originX);
      canvas.dataset.originY = String(originY);

      context.setTransform(1, 0, 0, 1, 0, 0);
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.fillStyle = '#0d0f15';
      context.fillRect(0, 0, canvas.width, canvas.height);

      context.setTransform(scale, 0, 0, scale, 0, 0);
      context.translate(originX, originY);

      // Silueta del rompecabezas resuelto, como referencia de dónde va todo.
      context.strokeStyle = 'rgba(255,255,255,0.12)';
      context.lineWidth = 2 / scale;
      context.strokeRect(0, 0, solvedWidth, solvedHeight);

      const image = imageRef.current;
      const sourcePieceWidth = image ? image.naturalWidth / gridCols : 0;
      const sourcePieceHeight = image ? image.naturalHeight / gridRows : 0;

      // Tamaño de cada grupo, para distinguir visualmente los bloques ya conectados (FR-017).
      const groupSizes = new Map<string, number>();
      for (const piece of piecesRef.current) {
        groupSizes.set(piece.groupId, (groupSizes.get(piece.groupId) ?? 0) + 1);
      }

      for (const piece of piecesRef.current) {
        if (image && sourcePieceWidth > 0) {
          context.drawImage(
            image,
            piece.gridCol * sourcePieceWidth,
            piece.gridRow * sourcePieceHeight,
            sourcePieceWidth,
            sourcePieceHeight,
            piece.x,
            piece.y,
            PIECE_SIZE,
            PIECE_SIZE,
          );
        } else {
          // Sin imagen cargada todavía, se pinta un relleno para que el tablero no parezca roto.
          context.fillStyle = '#232735';
          context.fillRect(piece.x, piece.y, PIECE_SIZE, PIECE_SIZE);
        }

        // Borde de la pieza. Las que ya están conectadas con alguien llevan un borde más
        // tenue: así el jugador ve de un vistazo qué bloques se mueven como una unidad.
        const inGroup = groupSizes.get(piece.groupId) ?? 1;
        context.strokeStyle = inGroup > 1 ? 'rgba(0,0,0,0.18)' : 'rgba(0,0,0,0.55)';
        context.lineWidth = 1 / scale;
        context.strokeRect(piece.x, piece.y, PIECE_SIZE, PIECE_SIZE);

        // Estado ocupado (FR-012): contorno y alias de quien la tiene. Se distingue si es
        // propia o ajena, porque solo la ajena bloquea al jugador que mira.
        if (piece.capturedBy) {
          const isMine = piece.capturedBy === currentPlayerRef.current;
          context.strokeStyle = isMine ? '#4ade80' : '#fbbf24';
          context.lineWidth = 3 / scale;
          context.strokeRect(piece.x, piece.y, PIECE_SIZE, PIECE_SIZE);

          if (!isMine) {
            const alias = aliasRef.current.get(piece.capturedBy) ?? 'otro jugador';
            context.font = `${12 / scale}px system-ui, sans-serif`;
            context.textBaseline = 'bottom';
            const label = ` ${alias} `;
            const metrics = context.measureText(label);
            context.fillStyle = 'rgba(0,0,0,0.7)';
            context.fillRect(piece.x, piece.y - 18 / scale, metrics.width, 16 / scale);
            context.fillStyle = '#fbbf24';
            context.fillText(label, piece.x, piece.y - 4 / scale);
          }
        }
      }

      frameRef.current = requestAnimationFrame(draw);
    };

    frameRef.current = requestAnimationFrame(draw);
    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    };
  }, [gridRows, gridCols]);

  /** Traduce coordenadas de pantalla a unidades de tablero. */
  function toBoard(event: React.PointerEvent<HTMLCanvasElement>): { x: number; y: number } {
    const canvas = event.currentTarget;
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const scale = Number(canvas.dataset.scale ?? 1);
    const originX = Number(canvas.dataset.originX ?? 0);
    const originY = Number(canvas.dataset.originY ?? 0);

    const pixelX = (event.clientX - rect.left) * dpr;
    const pixelY = (event.clientY - rect.top) * dpr;

    return { x: pixelX / scale - originX, y: pixelY / scale - originY };
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
          width: '100%',
          aspectRatio: `${gridCols + 4} / ${gridRows + 4}`,
          display: 'block',
          borderRadius: 'var(--radius)',
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
