'use client';

import { useCallback, useEffect, useState } from 'react';
import { BoardMenu } from '@/components/BoardMenu';
import { ConnectionStatus } from '@/components/ConnectionStatus';
import { ElapsedTime } from '@/components/ElapsedTime';
import { ReferenceImage } from '@/components/ReferenceImage';
import type { PlayerSummary } from '@/types/board';
import type { ConnectionStatus as Status } from '@/types/realtime';

/**
 * Barra superior del tablero (FR-015 a FR-027).
 *
 * Vive **fuera del canvas**, como elemento del DOM (research R9). Dibujarla dentro obligaría a
 * reservarle una franja del mundo lógico, atando el tamaño del tablero a la altura de la barra, y
 * habría que reconstruir a mano el foco y las etiquetas que un botón real ya trae.
 *
 * Reúne elementos que antes andaban sueltos por la pantalla —el estado de conexión, la lista de
 * jugadores— sin duplicarlos (FR-029).
 */

interface BoardToolbarProps {
  code: string;
  status: Status;
  players: PlayerSummary[];
  maxPlayers: number;
  currentPlayerId: string | null;
  startedAt: string | null;
  completedAt: string | null;
  clockOffsetMs: number;
  referenceVisible: boolean;
  onReferenceVisibleChange: (visible: boolean) => void;
  /** URL de la imagen del rompecabezas, para la ayuda de referencia. */
  imageUrl: string;
  /** Contenedor que pasa a pantalla completa. Suele ser la página entera del tablero. */
  fullscreenTarget: React.RefObject<HTMLElement | null>;
}

export function BoardToolbar({
  code,
  status,
  players,
  maxPlayers,
  currentPlayerId,
  startedAt,
  completedAt,
  clockOffsetMs,
  referenceVisible,
  onReferenceVisibleChange,
  imageUrl,
  fullscreenTarget,
}: BoardToolbarProps) {
  const [isFullscreen, setIsFullscreen] = useState(false);

  /*
   * El estado de pantalla completa se **lee del navegador**, no se guarda al pulsar.
   *
   * Si se guardase, bastaría con que el usuario saliera con Escape —o con que el navegador
   * denegase la petición— para que el botón dijera lo contrario de lo que pasa. Escuchando
   * `fullscreenchange` el botón nunca puede mentir, porque el estado nunca fue nuestro.
   */
  useEffect(() => {
    const sync = () => setIsFullscreen(document.fullscreenElement !== null);
    sync();
    document.addEventListener('fullscreenchange', sync);
    return () => document.removeEventListener('fullscreenchange', sync);
  }, []);

  const toggleFullscreen = useCallback(async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await fullscreenTarget.current?.requestFullscreen();
      }
    } catch {
      // Algunos navegadores rechazan la petición si no viene de un gesto directo. No hay nada que
      // corregir: `fullscreenchange` no se disparará y el botón sigue reflejando la realidad.
    }
  }, [fullscreenTarget]);

  return (
    <header
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.75rem',
        padding: '0.4rem 0.75rem',
        background: 'var(--surface, rgba(0,0,0,0.25))',
        borderRadius: 'var(--radius)',
        flexShrink: 0,
      }}
    >
      <BoardMenu
        code={code}
        players={players}
        maxPlayers={maxPlayers}
        currentPlayerId={currentPlayerId}
      />

      <div style={{ margin: '0 auto' }}>
        <ReferenceImage
          visible={referenceVisible}
          onVisibleChange={onReferenceVisibleChange}
          imageUrl={imageUrl}
        />
      </div>

      {startedAt && (
        <ElapsedTime startedAt={startedAt} completedAt={completedAt} clockOffsetMs={clockOffsetMs} />
      )}

      <ConnectionStatus status={status} />

      <button
        type="button"
        onClick={() => void toggleFullscreen()}
        aria-pressed={isFullscreen}
        aria-label={isFullscreen ? 'Salir de pantalla completa' : 'Ver a pantalla completa'}
        title={isFullscreen ? 'Salir de pantalla completa' : 'Pantalla completa'}
        style={{ padding: '0.35rem 0.6rem', lineHeight: 1 }}
      >
        <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true" focusable="false">
          <path
            d={isFullscreen ? 'M8 3v5H3M12 17v-5h5M8 8L3 3M12 12l5 5' : 'M3 8V3h5M17 12v5h-5M3 3l5 5M17 17l-5-5'}
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            fill="none"
          />
        </svg>
      </button>
    </header>
  );
}
