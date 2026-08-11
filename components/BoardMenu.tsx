'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { PlayerList } from '@/components/PlayerList';
import type { PlayerSummary } from '@/types/board';

/**
 * Menú desplegable del tablero (FR-025, FR-026, FR-027).
 *
 * **Su contenido es provisional.** El usuario pidió proponer opciones razonables para refinarlas
 * después, así que estas cuatro son un punto de partida, no un compromiso: el código de sala con
 * su copia, quiénes están conectados, salir, y la ayuda.
 *
 * La lista de jugadores vive aquí en lugar de en una barra lateral propia (FR-029): ocupaba ancho
 * permanente para un dato que se consulta de vez en cuando, y ese ancho ahora es tablero.
 */

interface BoardMenuProps {
  code: string;
  players: PlayerSummary[];
  maxPlayers: number;
  currentPlayerId: string | null;
}

export function BoardMenu({ code, players, maxPlayers, currentPlayerId }: BoardMenuProps) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Cerrar al pulsar fuera o con Escape (FR-027). Escape además devuelve el foco al botón, que es
  // lo que espera quien navega con teclado.
  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  async function copyInviteLink() {
    await navigator.clipboard.writeText(`${window.location.origin}/rooms/${code}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2_000);
  }

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Menú de la sala"
        style={{ padding: '0.35rem 0.6rem', lineHeight: 1 }}
      >
        {/* Tres barras, dibujadas en SVG para no depender de una fuente de iconos. */}
        <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true" focusable="false">
          <g stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="3" y1="5" x2="17" y2="5" />
            <line x1="3" y1="10" x2="17" y2="10" />
            <line x1="3" y1="15" x2="17" y2="15" />
          </g>
        </svg>
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Opciones de la sala"
          className="card"
          style={{
            position: 'absolute',
            top: 'calc(100% + 0.5rem)',
            left: 0,
            zIndex: 20,
            width: 280,
            padding: '0.9rem',
            display: 'grid',
            gap: '0.9rem',
          }}
        >
          <div>
            <p className="muted" style={{ margin: '0 0 0.3rem', fontSize: '0.8rem' }}>
              Código de sala
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <code style={{ letterSpacing: '0.14em' }} aria-label={code.split('').join(' ')}>
                {code}
              </code>
              <button
                type="button"
                role="menuitem"
                onClick={() => void copyInviteLink()}
                style={{ marginLeft: 'auto', fontSize: '0.85rem' }}
              >
                {copied ? 'Copiado' : 'Copiar enlace'}
              </button>
            </div>
          </div>

          <PlayerList players={players} maxPlayers={maxPlayers} currentPlayerId={currentPlayerId} />

          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
            <Link href="/" role="menuitem" onClick={() => setOpen(false)}>
              Salir de la sala
            </Link>
            <span className="muted" style={{ marginLeft: 'auto', fontSize: '0.8rem' }}>
              Arrastra las piezas al centro
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
