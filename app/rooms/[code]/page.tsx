'use client';

import { use, useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { AliasForm } from '@/components/AliasForm';
import { Board, type BoardApi } from '@/components/Board';
import { BoardToolbar } from '@/components/BoardToolbar';
import { CompletionBanner } from '@/components/CompletionBanner';
import { ApiError, fetchRoomState, joinRoom } from '@/lib/api/client';
import { subscribeToRoom, type RoomChannelHandle } from '@/lib/realtime/channel';
import { startPresence, type PresenceHandle } from '@/lib/realtime/presence';
import { normalizeRoomCode } from '@/lib/rooms/code';
import type { BoardState } from '@/types/board';
import type { ConnectionStatus as ConnectionStatusValue } from '@/types/realtime';

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
  const [rehydrating, setRehydrating] = useState(!aliasFromUrl);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [board, setBoard] = useState<BoardState | null>(null);
  const [status, setStatus] = useState<ConnectionStatusValue>('reconnecting');
  const [error, setError] = useState<{ code: string; message: string } | null>(null);
  const [joining, setJoining] = useState(false);

  // Estado local de la barra: nada de esto se comparte ni se persiste (FR-024).
  const [referenceVisible, setReferenceVisible] = useState(false);
  const shellRef = useRef<HTMLElement | null>(null);

  /*
   * Desfase entre el reloj de este navegador y el del servidor (research R6).
   *
   * `GET /state` ya devuelve `serverTime`, así que el cronómetro común no necesita ningún endpoint
   * ni campo nuevo. Con este desfase, dos jugadores con relojes distintos convergen al mismo valor
   * porque ambos se corrigen contra la misma referencia.
   */
  const [clockOffsetMs, setClockOffsetMs] = useState(0);

  const presenceRef = useRef<PresenceHandle | null>(null);
  const [channel, setChannel] = useState<RoomChannelHandle | null>(null);

  // El tablero expone cómo aplicar los eventos; la página los recibe del canal y se los pasa.
  // Así el canal no conoce al tablero ni el tablero al canal.
  const boardApiRef = useRef<BoardApi | null>(null);
  const handleBoardReady = useCallback((api: BoardApi) => {
    boardApiRef.current = api;
  }, []);

  const reloadBoard = useCallback(async () => {
    try {
      const receivedAt = Date.now();
      const state = await fetchRoomState(code);
      setBoard(state);
      setClockOffsetMs(new Date(state.serverTime).getTime() - receivedAt);
      // Reemplazo completo: durante una caída se perdieron eventos irreproducibles (FR-023).
      boardApiRef.current?.replacePieces(state.pieces);
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

        const handle = await subscribeToRoom(code, joined.roomId, {
          onStatusChange: setStatus,
          // Al reconectar se recarga el estado entero: durante la caída se perdieron eventos
          // y no hay forma de reproducirlos.
          onResubscribed: () => void reloadBoard(),
          // Pista visual sin autoridad; se ignoran los propios eventos.
          onPieceDrag: (payload) => {
            if (payload.playerId === joined.playerId) return;
            boardApiRef.current?.applyDragHint(payload.groupId, payload.x, payload.y);
          },
          onPieceDrop: (payload) => {
            if (payload.playerId === joined.playerId) return;
            boardApiRef.current?.clearDragHint(payload.groupId);
          },
          // Hecho confirmado: tiene precedencia sobre cualquier pista provisional.
          onPieceConfirmed: (piece) => boardApiRef.current?.applyConfirmed(piece),
          // El completado llega por el cambio de estado de la sala, no de quien colocó la
          // última pieza: así lo reciben todos los conectados a la vez (FR-027).
          onRoomChanged: (room) => {
            if (room.status === 'completed') void reloadBoard();
          },
        });
        setChannel(handle);
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

  /**
   * Rehidratación del alias al volver a la sala (FR-022).
   *
   * La sesión anónima la persiste el SDK de Supabase en `localStorage`, así que el jugador
   * sigue siendo el mismo `auth.uid()` tras recargar o reconectar. El alias se guarda por sala
   * para no tener que volver a pedirlo: si ya se estuvo en esta sala, se entra directamente.
   */
  const aliasStorageKey = `puzzlesync:alias:${code}`;

  /* eslint-disable react-hooks/set-state-in-effect --
     `localStorage` solo existe tras montar en el navegador. Leerlo en el inicializador de
     useState provocaría un desajuste de hidratación entre el render del servidor y el del
     cliente, que es un fallo peor que la regla que se salta aquí. El efecto corre una sola
     vez y su única salida es fijar el alias recuperado. */
  useEffect(() => {
    if (!rehydrating) return;
    const stored = localStorage.getItem(aliasStorageKey);
    if (stored) setAlias(stored);
    setRehydrating(false);
  }, [rehydrating, aliasStorageKey]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Con alias —de la URL o recuperado— se entra sin preguntar nada.
  const autoJoined = useRef(false);
  useEffect(() => {
    if (autoJoined.current || rehydrating || !alias) return;
    autoJoined.current = true;
    localStorage.setItem(aliasStorageKey, alias);
    void enterRoom(alias);
  }, [alias, rehydrating, enterRoom, aliasStorageKey]);

  useEffect(() => {
    if (!channel) return;
    return () => {
      presenceRef.current?.stop();
      void channel.teardown();
    };
  }, [channel]);

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

  // --- Recuperando la sesión guardada: evita el parpadeo del formulario ---
  if (rehydrating) {
    return (
      <main style={{ maxWidth: 520, margin: '0 auto', padding: '4rem 1.25rem' }}>
        <p className="muted">Cargando…</p>
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
    // El tablero ocupa la ventana: la barra arriba y el canvas recibe la altura que sobra, que
    // es lo que hace cierto que el tablero completo quepa siempre (FR-032). La barra va FUERA del
    // canvas para no tapar piezas (FR-015).
    <main
      ref={shellRef}
      style={{
        height: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        padding: '0.6rem',
        gap: '0.6rem',
        background: 'var(--bg)',
      }}
    >
      <BoardToolbar
        code={code}
        status={status}
        players={board?.players ?? []}
        maxPlayers={board?.room.maxPlayers ?? 4}
        currentPlayerId={playerId}
        startedAt={board?.room.startedAt ?? null}
        completedAt={board?.room.completedAt ?? null}
        clockOffsetMs={clockOffsetMs}
        referenceVisible={referenceVisible}
        onReferenceVisibleChange={setReferenceVisible}
        imageUrl={board?.puzzle.imageUrl ?? ''}
        fullscreenTarget={shellRef}
      />

      <p
        className="card narrow-only"
        role="status"
        style={{ margin: 0, padding: '0.6rem 0.8rem', fontSize: '0.85rem' }}
      >
        Esta pantalla es estrecha para armar un rompecabezas. La experiencia está pensada para
        escritorio o tableta, pero puedes seguir.
      </p>

      {error && (
        <p className="card error" role="alert" style={{ margin: 0 }}>
          {error.message}
        </p>
      )}

      {board?.room.status === 'completed' && board.room.completedAt && (
        <CompletionBanner
          startedAt={board.room.startedAt}
          completedAt={board.room.completedAt}
          pieceCount={board.pieces.length}
          playerCount={board.players.length}
        />
      )}

      {board ? (
        <Board
          initialPieces={board.pieces}
          puzzleId={board.puzzle.id}
          players={board.players}
          gridRows={board.puzzle.gridRows}
          gridCols={board.puzzle.gridCols}
          imageUrl={board.puzzle.imageUrl}
          playerId={playerId}
          channel={channel}
          onReady={handleBoardReady}
          showReference={referenceVisible}
        />
      ) : (
        <p className="muted" role="status" aria-live="polite" style={{ margin: 0 }}>
          Cargando tablero…
        </p>
      )}
    </main>
  );
}
