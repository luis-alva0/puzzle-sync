'use client';

import type { RealtimeChannel } from '@supabase/supabase-js';
import { getSupabaseBrowserClient, ensureAnonymousSession } from '@/lib/supabase/client';
import {
  DRAG_BROADCAST_INTERVAL_MS,
  REALTIME_EVENTS,
  roomChannelName,
  type ConnectionStatus,
  type PieceDragPayload,
  type PieceDropPayload,
} from '@/types/realtime';
import type { Piece } from '@/types/board';

/**
 * Ciclo de vida del canal de Realtime de una sala.
 *
 * En esta capa solo vive la conexión: suscribirse, informar del estado y desmontar limpio.
 * El broadcast del arrastre y la recepción de Postgres Changes se añaden en US2 sobre este
 * mismo canal.
 *
 * El canal es PRIVADO (`private: true`). Eso es lo que hace que Supabase evalúe la política
 * RLS sobre `realtime.messages` y restrinja la suscripción a los miembros de la sala. Sin
 * esto, cualquiera con la llave anónima podría escuchar la sala de otros.
 */

export interface RoomChannelHandlers {
  /** Cambios en el estado de la conexión, para pintarlos en la interfaz (FR-024). */
  onStatusChange?: (status: ConnectionStatus) => void;
  /**
   * Se dispara cuando la suscripción se restablece tras haberse caído.
   * Es la señal para recargar el estado completo del tablero (FR-023).
   */
  onResubscribed?: () => void;
  /** Pista visual: otro jugador está arrastrando un grupo. SIN autoridad. */
  onPieceDrag?: (payload: PieceDragPayload) => void;
  /** Otro jugador soltó un grupo. SIN autoridad; solo evita seguir interpolando. */
  onPieceDrop?: (payload: PieceDropPayload) => void;
  /** Hecho confirmado: una pieza cambió en la base de datos. Tiene PRECEDENCIA. */
  onPieceConfirmed?: (piece: Piece) => void;
  /** La sala cambió de estado; se usa para detectar el completado (FR-027). */
  onRoomChanged?: (room: { status: string; completedAt: string | null }) => void;
}

/** Fila de `pieces` tal como llega en un evento de Postgres Changes. */
interface PieceChangeRow {
  id: string;
  grid_row: number;
  grid_col: number;
  x: number;
  y: number;
  group_id: string;
  captured_by: string | null;
  captured_at: string | null;
}

/** Debe coincidir con `public.lock_lease()`. */
const LEASE_MS = 30_000;

function toPiece(row: PieceChangeRow): Piece {
  const leaseAlive =
    row.captured_at !== null && Date.now() - new Date(row.captured_at).getTime() < LEASE_MS;
  return {
    id: row.id,
    gridRow: row.grid_row,
    gridCol: row.grid_col,
    x: row.x,
    y: row.y,
    groupId: row.group_id,
    capturedBy: leaseAlive ? row.captured_by : null,
  };
}

export interface RoomChannelHandle {
  channel: RealtimeChannel;
  /**
   * Emite la posición provisional del grupo que se arrastra, con throttle.
   * Las llamadas de más se descartan en silencio: es una pista, no un dato que deba llegar.
   */
  broadcastDrag: (payload: PieceDragPayload) => void;
  /** Avisa de que el arrastre terminó. Se envía siempre, sin throttle. */
  broadcastDrop: (payload: PieceDropPayload) => void;
  /** Cierra el canal y deja de emitir cambios de estado. Idempotente. */
  teardown: () => Promise<void>;
}

/**
 * Se suscribe al canal de una sala.
 *
 * Antes de suscribirse propaga el JWT de la sesión anónima a Realtime con `setAuth`: sin ese
 * token, `auth.uid()` es null en la política y la suscripción a un canal privado se rechaza.
 */
export async function subscribeToRoom(
  roomCode: string,
  roomId: string | null,
  handlers: RoomChannelHandlers = {},
): Promise<RoomChannelHandle> {
  const supabase = getSupabaseBrowserClient();
  const session = await ensureAnonymousSession();

  await supabase.realtime.setAuth(session.access_token);

  const channel = supabase.channel(roomChannelName(roomCode), {
    config: { private: true },
  });

  // --- Pistas visuales: broadcast. Sin autoridad. ---
  channel.on('broadcast', { event: REALTIME_EVENTS.pieceDrag }, ({ payload }) => {
    handlers.onPieceDrag?.(payload as PieceDragPayload);
  });
  channel.on('broadcast', { event: REALTIME_EVENTS.pieceDrop }, ({ payload }) => {
    handlers.onPieceDrop?.(payload as PieceDropPayload);
  });

  // --- Hechos confirmados: Postgres Changes. Tienen precedencia sobre lo anterior. ---
  if (roomId) {
    channel.on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'pieces', filter: `room_id=eq.${roomId}` },
      (payload) => {
        handlers.onPieceConfirmed?.(toPiece(payload.new as PieceChangeRow));
      },
    );
    channel.on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` },
      (payload) => {
        const row = payload.new as { status: string; completed_at: string | null };
        handlers.onRoomChanged?.({ status: row.status, completedAt: row.completed_at });
      },
    );
  }

  let torndown = false;
  // La primera suscripción no es una reconexión; solo lo son las siguientes.
  let hasSubscribedOnce = false;

  const emit = (status: ConnectionStatus) => {
    if (!torndown) handlers.onStatusChange?.(status);
  };

  await new Promise<void>((resolve) => {
    channel.subscribe((status) => {
      switch (status) {
        case 'SUBSCRIBED':
          emit('connected');
          if (hasSubscribedOnce) {
            handlers.onResubscribed?.();
          } else {
            hasSubscribedOnce = true;
            resolve();
          }
          break;
        case 'CHANNEL_ERROR':
        case 'TIMED_OUT':
          // El SDK reintenta solo; para el jugador esto es "reconectando", no un fallo final.
          emit('reconnecting');
          if (!hasSubscribedOnce) resolve();
          break;
        case 'CLOSED':
          emit(torndown ? 'disconnected' : 'reconnecting');
          break;
      }
    });
  });

  // Throttle del arrastre: ~20 emisiones por segundo. Suficiente para que el movimiento se vea
  // continuo, y muy por debajo del umbral de 1 s de SC-001, sin inundar el canal.
  let lastDragAt = 0;

  return {
    channel,
    broadcastDrag: (payload) => {
      if (torndown) return;
      const now = Date.now();
      if (now - lastDragAt < DRAG_BROADCAST_INTERVAL_MS) return;
      lastDragAt = now;
      void channel.send({ type: 'broadcast', event: REALTIME_EVENTS.pieceDrag, payload });
    },
    broadcastDrop: (payload) => {
      if (torndown) return;
      lastDragAt = 0;
      void channel.send({ type: 'broadcast', event: REALTIME_EVENTS.pieceDrop, payload });
    },
    teardown: async () => {
      if (torndown) return;
      torndown = true;
      await supabase.removeChannel(channel);
    },
  };
}
