'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { BoardCanvas } from '@/components/BoardCanvas';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { PIECE_SIZE } from '@/lib/puzzle/geometry';
import {
  applyConfirmedPiece,
  applyProvisionalDrag,
  clearProvisional,
  createBoardSync,
  renderPieces,
  type BoardSyncState,
} from '@/lib/realtime/boardSync';
import type { RoomChannelHandle } from '@/lib/realtime/channel';
import type { Piece, PlayerSummary } from '@/types/board';

/**
 * Ciclo capturar → arrastrar → soltar.
 *
 * Reparto de responsabilidades:
 *   - `capture_piece` decide si el jugador puede tomar la pieza. Autoritativo.
 *   - El broadcast pinta el movimiento en las demás pantallas. Sin autoridad.
 *   - `move_piece` persiste la posición con throttle bajo, y refresca el arrendamiento.
 *   - `release_piece` fija la posición final y libera el bloqueo.
 *
 * El arrastre local se pinta de inmediato sin esperar al servidor: si la captura acabara
 * siendo denegada, el siguiente evento confirmado devuelve la pieza a su sitio.
 */

/** Persistencia de la posición durante el arrastre: ~2 por segundo (contrato de `move_piece`). */
const MOVE_PERSIST_INTERVAL_MS = 500;

/**
 * Superficie que el tablero expone a la página para recibir eventos del canal.
 * Invertir la dependencia así evita que el canal conozca al tablero, o al revés.
 */
export interface BoardApi {
  /** Hecho confirmado por la base de datos. Tiene precedencia. */
  applyConfirmed: (piece: Piece) => void;
  /** Reemplazo completo tras `GET /state`. */
  replacePieces: (pieces: Piece[]) => void;
  /** Pista visual de otro jugador arrastrando. Sin autoridad. */
  applyDragHint: (groupId: string, x: number, y: number) => void;
  /** Otro jugador soltó: se deja de interpolar. */
  clearDragHint: (groupId: string) => void;
}

interface BoardProps {
  initialPieces: Piece[];
  players: PlayerSummary[];
  gridRows: number;
  gridCols: number;
  imageUrl: string;
  playerId: string;
  channel: RoomChannelHandle | null;
  onReady?: (api: BoardApi) => void;
}

interface DragState {
  pieceId: string;
  groupId: string;
  /** Desplazamiento entre el puntero y la esquina de la pieza, para que no salte al tomarla. */
  offsetX: number;
  offsetY: number;
  lastPersistAt: number;
}

export function Board({
  initialPieces,
  players,
  gridRows,
  gridCols,
  imageUrl,
  playerId,
  channel,
  onReady,
}: BoardProps) {
  const [sync, setSync] = useState<BoardSyncState>(() => createBoardSync(initialPieces));
  const [denied, setDenied] = useState<string | null>(null);
  const dragRef = useRef<DragState | null>(null);

  // Copia del estado para que `hitTest` lea siempre lo último sin recrear el callback en cada
  // render. Se sincroniza en un efecto, no durante el render.
  const syncRef = useRef(sync);
  useEffect(() => {
    syncRef.current = sync;
  }, [sync]);

  useEffect(() => {
    onReady?.({
      applyConfirmed: (piece) => setSync((current) => applyConfirmedPiece(current, piece)),
      replacePieces: (next) => setSync(createBoardSync(next)),
      applyDragHint: (groupId, x, y) =>
        setSync((current) => applyProvisionalDrag(current, groupId, { x, y })),
      clearDragHint: (groupId) => setSync((current) => clearProvisional(current, groupId)),
    });
  }, [onReady]);

  const pieces = renderPieces(sync);

  /** Pieza bajo el puntero, la de encima si hay solapamiento. */
  const hitTest = useCallback((x: number, y: number): Piece | null => {
    const candidates = renderPieces(syncRef.current).filter(
      (piece) =>
        x >= piece.x && x <= piece.x + PIECE_SIZE && y >= piece.y && y <= piece.y + PIECE_SIZE,
    );
    return candidates.at(-1) ?? null;
  }, []);

  const handlePointerDown = useCallback(
    async (x: number, y: number) => {
      const piece = hitTest(x, y);
      if (!piece) return;

      // Una pieza ocupada por otro no responde (FR-010). La propia sí, para poder re-arrastrar.
      if (piece.capturedBy && piece.capturedBy !== playerId) {
        const holder = players.find((player) => player.id === piece.capturedBy);
        setDenied(`${holder?.alias ?? 'Otro jugador'} tiene esa pieza.`);
        setTimeout(() => setDenied(null), 1_800);
        return;
      }

      dragRef.current = {
        pieceId: piece.id,
        groupId: piece.groupId,
        offsetX: x - piece.x,
        offsetY: y - piece.y,
        lastPersistAt: 0,
      };

      const supabase = getSupabaseBrowserClient();
      const { data, error } = await supabase
        .rpc('capture_piece', { p_piece_id: piece.id, p_player_id: playerId })
        .single<{ success: boolean; held_by_alias: string | null }>();

      if (error || !data?.success) {
        dragRef.current = null;
        setDenied(
          data?.held_by_alias
            ? `${data.held_by_alias} tiene esa pieza.`
            : 'No se pudo tomar la pieza.',
        );
        setTimeout(() => setDenied(null), 1_800);
      }
    },
    [hitTest, playerId, players],
  );

  const handlePointerMove = useCallback(
    (x: number, y: number) => {
      const drag = dragRef.current;
      if (!drag) return;

      const targetX = x - drag.offsetX;
      const targetY = y - drag.offsetY;

      // Pintado local inmediato: el arrastre no puede depender de la latencia de red.
      setSync((current) => applyProvisionalDrag(current, drag.groupId, { x: targetX, y: targetY }));

      channel?.broadcastDrag({ groupId: drag.groupId, x: targetX, y: targetY, playerId });

      const now = Date.now();
      if (now - drag.lastPersistAt >= MOVE_PERSIST_INTERVAL_MS) {
        drag.lastPersistAt = now;
        const supabase = getSupabaseBrowserClient();
        void supabase.rpc('move_piece', {
          p_piece_id: drag.pieceId,
          p_player_id: playerId,
          p_x: targetX,
          p_y: targetY,
        });
      }
    },
    [channel, playerId],
  );

  const handlePointerUp = useCallback(
    async (x: number, y: number) => {
      const drag = dragRef.current;
      if (!drag) return;
      dragRef.current = null;

      const targetX = x - drag.offsetX;
      const targetY = y - drag.offsetY;

      channel?.broadcastDrop({ groupId: drag.groupId, playerId });

      const supabase = getSupabaseBrowserClient();
      const { error } = await supabase.rpc('release_piece', {
        p_piece_id: drag.pieceId,
        p_player_id: playerId,
        p_x: targetX,
        p_y: targetY,
      });

      if (error) {
        console.warn('[board] no se pudo soltar la pieza:', error.message);
      }

      // La pista provisional se descarta: a partir de aquí manda lo que confirme el servidor.
      setSync((current) => clearProvisional(current, drag.groupId));
    },
    [channel, playerId],
  );

  return (
    <div>
      <BoardCanvas
        pieces={pieces}
        gridRows={gridRows}
        gridCols={gridCols}
        imageUrl={imageUrl}
        players={players}
        currentPlayerId={playerId}
        onPointerDownBoard={(x, y) => void handlePointerDown(x, y)}
        onPointerMoveBoard={handlePointerMove}
        onPointerUpBoard={(x, y) => void handlePointerUp(x, y)}
      />
      <p
        className="muted"
        role="status"
        aria-live="polite"
        style={{ minHeight: '1.4em', marginBottom: 0, fontSize: '0.9rem' }}
      >
        {denied ?? ''}
      </p>
    </div>
  );
}
