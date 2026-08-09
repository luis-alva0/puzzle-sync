'use client';

import type { ConnectionStatus as Status } from '@/types/realtime';

/**
 * Indicador del estado de conexión (FR-024).
 *
 * La constitución exige que el estado sea VISIBLE, no que se infiera de que las piezas dejan
 * de moverse. Una caída de red sin aviso se confunde con que el otro jugador se ha quedado
 * quieto, y el jugador no sabe si esperar o recargar.
 *
 * `aria-live="polite"` para que un lector de pantalla anuncie el cambio sin interrumpir.
 */

const LABELS: Record<Status, { text: string; color: string; hint: string }> = {
  connected: {
    text: 'Conectado',
    color: 'var(--success)',
    hint: 'Los movimientos se comparten en tiempo real.',
  },
  reconnecting: {
    text: 'Reconectando…',
    color: 'var(--warning)',
    hint: 'Se está restableciendo la conexión sola. No hace falta recargar.',
  },
  disconnected: {
    text: 'Desconectado',
    color: 'var(--danger)',
    hint: 'Sin conexión. El progreso está a salvo en el servidor.',
  },
};

interface ConnectionStatusProps {
  status: Status;
  /** Muestra la explicación además de la etiqueta. */
  verbose?: boolean;
}

export function ConnectionStatus({ status, verbose = false }: ConnectionStatusProps) {
  const label = LABELS[status];

  return (
    <span
      role="status"
      aria-live="polite"
      title={label.hint}
      style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.9rem' }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 9,
          height: 9,
          borderRadius: '50%',
          background: label.color,
          flexShrink: 0,
          // El parpadeo distingue "reconectando" de un estado estable, sin depender del color.
          animation: status === 'reconnecting' ? 'pulse 1.2s ease-in-out infinite' : undefined,
        }}
      />
      <span style={{ color: status === 'connected' ? 'var(--text-muted)' : label.color }}>
        {label.text}
      </span>
      {verbose && (
        <span className="muted" style={{ fontSize: '0.82rem' }}>
          {label.hint}
        </span>
      )}
    </span>
  );
}
