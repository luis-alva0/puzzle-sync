'use client';

import { use, useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { AliasForm } from '@/components/AliasForm';
import { PlayerList } from '@/components/PlayerList';
import { ApiError, fetchRoomState, joinRoom } from '@/lib/api/client';
import { subscribeToRoom, type RoomChannelHandle } from '@/lib/realtime/channel';
import { startPresence, type PresenceHandle } from '@/lib/realtime/presence';
import { normalizeRoomCode } from '@/lib/rooms/code';
import type { BoardState } from '@/types/board';
import type { ConnectionStatus } from '@/types/realtime';

/**
 * Pantalla de la sala.
 *
 * Flujo: unirse (o reconectar) → cargar el estado completo → suscribirse al canal → latir.
 *
 * El estado del tablero se REEMPLAZA por entero desde `GET /state`, nunca se parchea a partir
 * de eventos sueltos. Es lo que hace que reconectar sea correcto por construcción (FR-023).
 */

interface RoomPageProps {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ alias?: string }>;
}

export default function RoomPage({ params, searchParams }: RoomPageProps) {
  const { code: rawCode } = use(params);
  const { alias: aliasFromUrl } = use(searchParams);
  const code = normalizeRoomCode(rawCode);

  const [alias, setAlias] = useState<string | null>(aliasFromUrl ?? null);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [board, setBoard] = useState<BoardState | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>('reconnecting');
  const [error, setError] = useState<{ code: string; message: string } | null>(null);
  const [joining, setJoining] = useState(false);
  const [copied, setCopied] = useState(false);

  const channelRef = useRef<RoomChannelHandle | null>(null);
  const presenceRef = useRef<PresenceHandle | null>(null);

  const reloadBoard = useCallback(async () => {
    try {
      setBoard(await fetchRoomState(code));
    } catch (cause) {
      if (cause instanceof ApiError) setError({ code: cause.code, message: cause.message });
    }
  }, [code]);

  const enterRoom = useCallback(
    async (chosenAlias: string) => {
      setJoining(true);
      setError(null);
      try {
        const joined = await joinRoom(code, { alias: chosenAlias });
        setPlayerId(joined.playerId);
        setAlias(chosenAlias);

        await reloadBoard();

        const handle = await subscribeToRoom(code, {
          onStatusChange: setStatus,
          // Al reconectar se recarga el estado entero: durante la caída se perdieron eventos
          // y no hay forma de reproducirlos.
          onResubscribed: () => void reloadBoard(),
        });
        channelRef.current = handle;
        presenceRef.current = startPresence(handle.channel, joined.playerId, chosenAlias);
      } catch (cause) {
        if (cause instanceof ApiError) {
          setError({ code: cause.code, message: cause.message });
        } else {
          setError({ code: 'INTERNAL_ERROR', message: 'No se pudo entrar a la sala.' });
        }
        setAlias(null);
      } finally {
        setJoining(false);
      }
    },
    [code, reloadBoard],
  );

  // Si el alias llegó por la URL (el creador viene de la pantalla de inicio), entra solo.
  const autoJoined = useRef(false);
  useEffect(() => {
    if (autoJoined.current || !alias) return;
    autoJoined.current = true;
    void enterRoom(alias);
  }, [alias, enterRoom]);

  useEffect(() => {
    return () => {
      presenceRef.current?.stop();
      void channelRef.current?.teardown();
    };
  }, []);

  async function copyInviteLink() {
    await navigator.clipboard.writeText(window.location.origin + `/rooms/${code}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2_000);
  }

  // --- Errores terminales: la sala no existe o está llena (FR-006, FR-008) ---
  if (error && (error.code === 'ROOM_NOT_FOUND' || error.code === 'ROOM_FULL')) {
    return (
      <main style={{ maxWidth: 520, margin: '0 auto', padding: '4rem 1.25rem' }}>
        <section className="card">
          <h1 style={{ marginTop: 0, fontSize: '1.2rem' }}>
            {error.code === 'ROOM_FULL' ? 'Sala llena' : 'Sala no encontrada'}
          </h1>
          <p className="muted">{error.message}</p>
          <Link href="/">Volver al inicio</Link>
        </section>
      </main>
    );
  }

  // --- Todavía sin alias: pedirlo antes de entrar ---
  if (!alias || !playerId) {
    return (
      <main style={{ maxWidth: 520, margin: '0 auto', padding: '4rem 1.25rem' }}>
        <section className="card">
          <h1 style={{ marginTop: 0, fontSize: '1.2rem' }}>Entrar a la sala {code}</h1>
          <p className="muted">Elige cómo te verán los demás. No hace falta crear cuenta.</p>
          <AliasForm
            submitLabel="Entrar"
            busy={joining}
            error={error?.message ?? null}
            onSubmit={(chosen) => void enterRoom(chosen)}
          />
        </section>
      </main>
    );
  }

  return (
    <main style={{ maxWidth: 1100, margin: '0 auto', padding: '2rem 1.25rem' }}>
      <header
        style={{
          display: 'flex',
          alignItems: 'baseline',
          gap: '1rem',
          flexWrap: 'wrap',
          marginBottom: '1.5rem',
        }}
      >
        <h1 style={{ margin: 0, fontSize: '1.3rem' }}>
          Sala <code style={{ letterSpacing: '0.14em' }}>{code}</code>
        </h1>
        <button type="button" onClick={() => void copyInviteLink()}>
          {copied ? 'Enlace copiado' : 'Copiar enlace de invitación'}
        </button>
        <span className="muted" style={{ marginLeft: 'auto' }} aria-live="polite">
          {status === 'connected' && 'Conectado'}
          {status === 'reconnecting' && 'Reconectando…'}
          {status === 'disconnected' && 'Desconectado'}
        </span>
      </header>

      <div style={{ display: 'grid', gap: '1.25rem', gridTemplateColumns: 'minmax(0,1fr) 280px' }}>
        <section className="card">
          {board ? (
            <>
              <p className="muted" style={{ marginTop: 0 }}>
                Rompecabezas de {board.puzzle.gridRows * board.puzzle.gridCols} piezas.
              </p>
              {/* El tablero se monta en US2. Hasta entonces la sala ya es demostrable:
                  dos personas entran, se ven y comparten el enlace. */}
              <p className="muted" style={{ marginBottom: 0 }}>
                {board.pieces.length} piezas listas en el tablero.
              </p>
            </>
          ) : (
            <p className="muted" style={{ margin: 0 }}>
              Cargando tablero…
            </p>
          )}
        </section>

        <aside>
          <PlayerList
            players={board?.players ?? []}
            maxPlayers={board?.room.maxPlayers ?? 4}
            currentPlayerId={playerId}
          />
        </aside>
      </div>
    </main>
  );
}
