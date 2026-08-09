'use client';

import { formatDuration, formatPeruDisplay } from '@/lib/format/datetime';

/**
 * Aviso de rompecabezas completado (FR-027).
 *
 * Lo reciben a la vez todos los jugadores conectados en ese momento, porque se dispara desde
 * el cambio de `rooms.status` en Postgres Changes y no desde quien colocó la última pieza.
 *
 * Las marcas de tiempo se muestran en hora de Perú con offset fijo (FR-030).
 */

interface CompletionBannerProps {
  startedAt: string;
  completedAt: string;
  pieceCount: number;
  playerCount: number;
}

export function CompletionBanner({
  startedAt,
  completedAt,
  pieceCount,
  playerCount,
}: CompletionBannerProps) {
  return (
    <section
      role="status"
      aria-live="polite"
      className="card"
      style={{
        borderColor: 'var(--success)',
        background: 'color-mix(in srgb, var(--success) 12%, var(--surface))',
        marginBottom: '1.25rem',
      }}
    >
      <h2 style={{ margin: '0 0 0.4rem', fontSize: '1.05rem' }}>¡Rompecabezas completado!</h2>
      <p className="muted" style={{ margin: 0 }}>
        {pieceCount} piezas entre {playerCount} {playerCount === 1 ? 'jugador' : 'jugadores'}, en{' '}
        <strong>{formatDuration(startedAt, completedAt)}</strong>.
      </p>
      <p className="muted" style={{ margin: '0.35rem 0 0', fontSize: '0.85rem' }}>
        Empezó el {formatPeruDisplay(startedAt)} y terminó el {formatPeruDisplay(completedAt)}.
        Queda guardado en el histórico.
      </p>
    </section>
  );
}
