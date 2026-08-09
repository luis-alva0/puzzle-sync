'use client';

import type { RealtimeChannel } from '@supabase/supabase-js';
import { getSupabaseBrowserClient, ensureAnonymousSession } from '@/lib/supabase/client';
import { roomChannelName, type ConnectionStatus } from '@/types/realtime';

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
}

export interface RoomChannelHandle {
  channel: RealtimeChannel;
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
  handlers: RoomChannelHandlers = {},
): Promise<RoomChannelHandle> {
  const supabase = getSupabaseBrowserClient();
  const session = await ensureAnonymousSession();

  await supabase.realtime.setAuth(session.access_token);

  const channel = supabase.channel(roomChannelName(roomCode), {
    config: { private: true },
  });

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

  return {
    channel,
    teardown: async () => {
      if (torndown) return;
      torndown = true;
      await supabase.removeChannel(channel);
    },
  };
}
