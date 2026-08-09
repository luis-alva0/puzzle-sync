'use client';

import { disambiguateAliases } from '@/lib/rooms/alias';
import type { PlayerSummary } from '@/types/board';

/**
 * Lista de participantes de la sala (FR-007).
 *
 * Todos los jugadores son iguales: no hay distintivo de creador ni de anfitrión, porque no
 * existen roles especiales (FR-004).
 *
 * Un jugador desconectado sigue en la lista pero NO cuenta para el aforo: su plaza queda
 * libre en cuanto deja de latir (FR-005 + research R2). Eso se dice explícitamente en pantalla
 * para que nadie crea que la sala está llena cuando no lo está.
 */

interface PlayerListProps {
  players: PlayerSummary[];
  maxPlayers: number;
  /** `room_players.id` de quien mira, para marcarse a sí mismo. */
  currentPlayerId?: string | null;
}

export function PlayerList({ players, maxPlayers, currentPlayerId }: PlayerListProps) {
  const labelled = disambiguateAliases(players);
  const connectedCount = players.filter((player) => player.connected).length;
  const freeSlots = Math.max(0, maxPlayers - connectedCount);

  return (
    <section className="card" aria-labelledby="players-heading">
      <h2 id="players-heading" style={{ margin: '0 0 0.75rem', fontSize: '1rem' }}>
        Jugadores{' '}
        <span className="muted" style={{ fontWeight: 400 }}>
          ({connectedCount}/{maxPlayers} conectados)
        </span>
      </h2>

      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '0.5rem' }}>
        {labelled.map((player) => (
          <li key={player.id} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <span
              aria-hidden="true"
              style={{
                width: 9,
                height: 9,
                borderRadius: '50%',
                flexShrink: 0,
                background: player.connected ? 'var(--success)' : 'var(--text-muted)',
              }}
            />
            <span>{player.displayAlias}</span>
            {player.id === currentPlayerId && <span className="muted">(tú)</span>}
            <span className="muted" style={{ marginLeft: 'auto', fontSize: '0.85rem' }}>
              {player.connected ? 'conectado' : 'desconectado'}
            </span>
          </li>
        ))}
      </ul>

      {players.length === 0 && <p className="muted">Todavía no hay nadie más.</p>}

      {freeSlots > 0 && (
        <p className="muted" style={{ marginBottom: 0, fontSize: '0.85rem' }}>
          {freeSlots === 1 ? 'Queda 1 plaza libre.' : `Quedan ${freeSlots} plazas libres.`}
        </p>
      )}
    </section>
  );
}
