'use client';

import { useEffect, useState } from 'react';
import { formatDuration } from '@/lib/format/duration';

/**
 * Tiempo transcurrido de la partida (FR-017, FR-018, FR-019).
 *
 * Es el mismo para todos los jugadores porque **se deriva, no se acumula**: cuenta desde
 * `startedAt`, un dato del servidor, corrigiendo el reloj local con el desfase medido contra
 * `serverTime`. Dos jugadores que entran con veinte minutos de diferencia ven el mismo valor, y
 * uno con la hora del sistema mal puesta también.
 *
 * Derivarlo en lugar de acumularlo tiene un efecto agradable: perder la conexión no lo desajusta.
 * Al volver, el valor ya es el correcto sin necesidad de recuperar nada.
 */

interface ElapsedTimeProps {
  /** `rooms.started_at`, en ISO. */
  startedAt: string;
  /** `rooms.completed_at`, o `null` si la partida sigue. Al llegar, el cronómetro se detiene. */
  completedAt: string | null;
  /** `serverTime − Date.now()` en el momento de la respuesta de estado. */
  clockOffsetMs: number;
}

export function ElapsedTime({ startedAt, completedAt, clockOffsetMs }: ElapsedTimeProps) {
  const start = new Date(startedAt).getTime();
  const end = completedAt ? new Date(completedAt).getTime() : null;

  const [now, setNow] = useState(() => Date.now() + clockOffsetMs);

  useEffect(() => {
    if (end !== null) return;

    const id = setInterval(() => setNow(Date.now() + clockOffsetMs), 1_000);
    return () => clearInterval(id);
  }, [end, clockOffsetMs]);

  // Congelado al completarse (FR-019): el valor final es el que quedará en el histórico.
  const elapsed = (end ?? now) - start;
  const text = formatDuration(elapsed);

  return (
    <span
      role="timer"
      aria-label={`Tiempo de partida: ${text}`}
      title={end ? 'Partida completada' : 'Tiempo desde que empezó la partida'}
      style={{
        fontVariantNumeric: 'tabular-nums',
        fontSize: '1rem',
        letterSpacing: '0.02em',
        opacity: end ? 0.7 : 1,
      }}
    >
      {text}
    </span>
  );
}
