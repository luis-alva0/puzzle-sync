'use client';

import type { RealtimeChannel } from '@supabase/supabase-js';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { HEARTBEAT_INTERVAL_MS, type RoomPresenceState } from '@/types/realtime';

/**
 * Presencia del jugador: latido al servidor y lista de participantes en vivo.
 *
 * Dos mecanismos con papeles distintos, y conviene no confundirlos:
 *
 *   - El LATIDO escribe `room_players.last_seen_at`. Es la fuente de verdad del estado
 *     conectado/desconectado y del aforo. Si un cliente muere sin avisar, deja de latir y el
 *     servidor lo da por desconectado solo.
 *   - PRESENCE de Realtime solo alimenta la lista en pantalla. Puede mentir: un navegador que
 *     se cierra de golpe no siempre emite `leave`. Por eso no decide nada.
 */

export interface PresenceHandle {
  /** Alias de los jugadores presentes según Realtime, para pintar la lista al instante. */
  stop: () => void;
}

/**
 * Arranca el latido y la suscripción a Presence sobre un canal ya suscrito.
 *
 * El primer latido se envía de inmediato, sin esperar al primer intervalo: si no, un jugador
 * recién entrado figuraría como desconectado durante 10 segundos.
 */
export function startPresence(
  channel: RealtimeChannel,
  playerId: string,
  alias: string,
  onPresenceChange?: (present: RoomPresenceState[]) => void,
): PresenceHandle {
  const supabase = getSupabaseBrowserClient();
  let stopped = false;

  const beat = async () => {
    if (stopped) return;
    const { error } = await supabase.rpc('heartbeat', { p_player_id: playerId });
    if (error) {
      // Un latido perdido no es fatal: la ventana de 30 s tolera dos fallos seguidos.
      console.warn('[presence] latido fallido:', error.message);
    }
  };

  void beat();
  const timer = setInterval(() => void beat(), HEARTBEAT_INTERVAL_MS);

  if (onPresenceChange) {
    channel.on('presence', { event: 'sync' }, () => {
      const state = channel.presenceState<RoomPresenceState>();
      const present = Object.values(state)
        .flat()
        .map((entry) => ({ playerId: entry.playerId, alias: entry.alias }));
      onPresenceChange(present);
    });
  }

  const presenceState: RoomPresenceState = { playerId, alias };
  void channel.track(presenceState);

  return {
    stop: () => {
      if (stopped) return;
      stopped = true;
      clearInterval(timer);
      void channel.untrack();
    },
  };
}
