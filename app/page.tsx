'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { AliasForm } from '@/components/AliasForm';
import { ApiError, createRoom } from '@/lib/api/client';
import { isValidRoomCode, normalizeRoomCode, ROOM_CODE_LENGTH } from '@/lib/rooms/code';

/**
 * Pantalla de inicio: elegir un rompecabezas y crear sala, o entrar con un código.
 *
 * Sin registro ni login en ninguna rama (Principio III). La sesión anónima se establece en
 * segundo plano la primera vez que se llama a la API.
 */

// Rompecabezas de la semilla. Cuando exista el catálogo (feature 003) esto se sustituye por
// una consulta; mientras tanto, es lo que hace la feature 001 demostrable por sí sola.
const SEED_PUZZLES = [
  { id: '11111111-1111-4111-8111-111111111111', label: '4 piezas', hint: 'para probar rápido' },
  { id: '22222222-2222-4222-8222-222222222222', label: '20 piezas', hint: 'partida corta' },
  { id: '33333333-3333-4333-8333-333333333333', label: '100 piezas', hint: 'partida larga' },
] as const;

function HomeContent() {
  const router = useRouter();

  // Un rompecabezas creado desde foto llega por aquí, desde `/puzzles/[id]`. La portada acepta
  // cualquier UUID, no solo los de la semilla: sin esto, un rompecabezas propio no llegaría
  // nunca a una sala.
  const incomingPuzzleId = useSearchParams().get('puzzleId');

  const [selectedPuzzle, setSelectedPuzzle] = useState<string>(
    incomingPuzzleId ?? SEED_PUZZLES[0].id,
  );
  const [busy, setBusy] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [joinCode, setJoinCode] = useState('');
  const [joinError, setJoinError] = useState<string | null>(null);

  async function handleCreate(alias: string) {
    setBusy(true);
    setCreateError(null);
    try {
      const room = await createRoom({ puzzleId: selectedPuzzle, alias });
      // El alias viaja en la URL para que la sala no lo vuelva a pedir al creador.
      router.push(`/rooms/${room.roomCode}?alias=${encodeURIComponent(alias)}`);
    } catch (cause) {
      // Se conmuta sobre el código, nunca sobre el texto del mensaje.
      const code = cause instanceof ApiError ? cause.code : 'INTERNAL_ERROR';
      setCreateError(
        code === 'PUZZLE_NOT_FOUND'
          ? 'Ese rompecabezas no existe. ¿Ejecutaste `npm run seed`?'
          : cause instanceof ApiError
            ? cause.message
            : 'No se pudo crear la sala.',
      );
      setBusy(false);
    }
  }

  function handleJoin() {
    const code = normalizeRoomCode(joinCode);
    if (!isValidRoomCode(code)) {
      setJoinError(`El código son ${ROOM_CODE_LENGTH} caracteres, sin ceros ni la letra O.`);
      return;
    }
    setJoinError(null);
    router.push(`/rooms/${code}`);
  }

  return (
    <main style={{ maxWidth: 720, margin: '0 auto', padding: '3rem 1.25rem' }}>
      <header style={{ marginBottom: '2rem' }}>
        <h1 style={{ margin: 0 }}>PuzzleSync</h1>
        <p className="muted" style={{ marginTop: '0.4rem' }}>
          Arma un rompecabezas con otra persona, en tiempo real. Sin cuenta.
        </p>
      </header>

      <section className="card" style={{ marginBottom: '1.5rem' }}>
        <h2 style={{ marginTop: 0, fontSize: '1.05rem' }}>Crear una sala</h2>

        {incomingPuzzleId && (
          <p className="muted" style={{ marginTop: 0 }}>
            Vas a crear una sala con tu rompecabezas.{' '}
            <Link href={`/puzzles/${incomingPuzzleId}`}>Ver el rompecabezas</Link>
          </p>
        )}

        <fieldset
          style={{ border: 0, padding: 0, margin: '0 0 1rem' }}
          hidden={Boolean(incomingPuzzleId)}
        >
          <legend className="muted" style={{ padding: 0, marginBottom: '0.6rem' }}>
            Elige un rompecabezas
          </legend>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            {SEED_PUZZLES.map((puzzle) => (
              <button
                key={puzzle.id}
                type="button"
                onClick={() => setSelectedPuzzle(puzzle.id)}
                aria-pressed={selectedPuzzle === puzzle.id}
                style={{
                  borderColor: selectedPuzzle === puzzle.id ? 'var(--accent)' : 'var(--border)',
                }}
              >
                {puzzle.label}
                <span className="muted" style={{ display: 'block', fontSize: '0.78rem' }}>
                  {puzzle.hint}
                </span>
              </button>
            ))}
          </div>
        </fieldset>

        <AliasForm
          submitLabel="Crear sala"
          busy={busy}
          error={createError}
          onSubmit={handleCreate}
        />
      </section>

      <section className="card" style={{ marginBottom: '1.5rem' }}>
        <h2 style={{ marginTop: 0, fontSize: '1.05rem' }}>Explorar el catálogo</h2>
        <p className="muted" style={{ marginBottom: '0.75rem' }}>
          Rompecabezas ya listos para armar, sin subir nada.
        </p>
        <Link href="/catalog">Ver el catálogo →</Link>
      </section>

      <section className="card" style={{ marginBottom: '1.5rem' }}>
        <h2 style={{ marginTop: 0, fontSize: '1.05rem' }}>Usar una foto tuya</h2>
        <p className="muted" style={{ marginBottom: '0.75rem' }}>
          Sube una foto y conviértela en un rompecabezas. Sin cuenta.
        </p>
        <Link href="/puzzles/create">Crear un rompecabezas desde una foto →</Link>
      </section>

      <section className="card">
        <h2 style={{ marginTop: 0, fontSize: '1.05rem' }}>Entrar con un código</h2>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <label htmlFor="room-code" style={{ position: 'absolute', left: -9999 }}>
            Código de sala
          </label>
          <input
            id="room-code"
            value={joinCode}
            onChange={(event) => setJoinCode(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') handleJoin();
            }}
            placeholder="K7PQ3M"
            autoComplete="off"
            spellCheck={false}
            maxLength={ROOM_CODE_LENGTH + 4}
            style={{ textTransform: 'uppercase', letterSpacing: '0.12em', flex: '1 1 12ch' }}
          />
          <button type="button" onClick={handleJoin}>
            Entrar
          </button>
        </div>
        {joinError && (
          <p className="error" role="alert" style={{ marginBottom: 0 }}>
            {joinError}
          </p>
        )}
      </section>
    </main>
  );
}

/**
 * `useSearchParams` obliga a un límite de Suspense para que la portada siga siendo estática:
 * sin él, Next no puede prerenderizarla porque el parámetro solo se conoce en el navegador.
 */
export default function HomePage() {
  return (
    <Suspense
      fallback={
        <main style={{ maxWidth: 720, margin: '0 auto', padding: '3rem 1.25rem' }}>
          <p className="muted">Cargando…</p>
        </main>
      }
    >
      <HomeContent />
    </Suspense>
  );
}
