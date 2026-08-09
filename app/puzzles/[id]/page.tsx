'use client';

import { use, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ApiError, fetchPuzzle } from '@/lib/api/client';
import { formatPeruDisplay } from '@/lib/format/datetime';
import type { PuzzleDetailResponse } from '@/types/api';

/**
 * Destino del enlace de un rompecabezas (FR-027, FR-031).
 *
 * Los datos se piden a `GET /api/puzzles/[id]` y no a la tabla: tras la migración de esta
 * feature, un rompecabezas privado no es legible con la llave anónima. La imagen llega por una
 * URL firmada que se emite en cada lectura.
 *
 * El botón de crear sala **navega a la portada** con el `puzzleId`, en lugar de duplicar aquí el
 * formulario de alias: crear una sala exige alias, y ese flujo ya está resuelto allí.
 */

export default function PuzzleDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();

  const [puzzle, setPuzzle] = useState<PuzzleDetailResponse | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setPuzzle(await fetchPuzzle(id));
    } catch (cause) {
      setErrorCode(cause instanceof ApiError ? cause.code : 'INTERNAL_ERROR');
    }
  }, [id]);

  /* eslint-disable react-hooks/set-state-in-effect --
     Cargar al montar es justamente para lo que sirve este efecto, y `load` fija el estado
     después de un `await`, no de forma síncrona durante el render. */
  useEffect(() => {
    void load();
  }, [load]);
  /* eslint-enable react-hooks/set-state-in-effect */

  if (errorCode === 'PUZZLE_NOT_FOUND') {
    return (
      <main style={{ maxWidth: 520, margin: '0 auto', padding: '4rem 1.25rem' }}>
        <section className="card">
          <h1 style={{ marginTop: 0, fontSize: '1.2rem' }}>Rompecabezas no encontrado</h1>
          <p className="muted">
            Ese enlace no corresponde a ningún rompecabezas. Revisa que esté completo.
          </p>
          <Link href="/">Volver al inicio</Link>
        </section>
      </main>
    );
  }

  if (errorCode) {
    return (
      <main style={{ maxWidth: 520, margin: '0 auto', padding: '4rem 1.25rem' }}>
        <section className="card">
          <p className="error" role="alert">
            No se pudo cargar el rompecabezas.
          </p>
          <button type="button" onClick={() => void load()}>
            Reintentar
          </button>
        </section>
      </main>
    );
  }

  if (!puzzle) {
    return (
      <main style={{ maxWidth: 520, margin: '0 auto', padding: '4rem 1.25rem' }}>
        <p className="muted" role="status" aria-live="polite">
          Cargando rompecabezas…
        </p>
      </main>
    );
  }

  return (
    <main style={{ maxWidth: 640, margin: '0 auto', padding: '3rem 1.25rem' }}>
      <section className="card">
        {/* eslint-disable-next-line @next/next/no-img-element -- URL firmada de Storage que
            caduca en 1 hora; el optimizador de Next la cachearía más allá de su validez */}
        <img
          src={puzzle.imageUrl}
          alt="Imagen del rompecabezas"
          style={{
            width: '100%',
            borderRadius: 'var(--radius)',
            display: 'block',
            marginBottom: '1rem',
          }}
        />

        {puzzle.catalogStatus === 'retired' && (
          <p className="muted" role="status" style={{ marginTop: 0, fontSize: '0.9rem' }}>
            Este rompecabezas ya no aparece en el catálogo. Tu enlace sigue funcionando y puedes
            jugarlo igualmente.
          </p>
        )}

        <h1 style={{ marginTop: 0, fontSize: '1.2rem' }}>
          Rompecabezas de {puzzle.pieceCount} piezas
        </h1>
        <p className="muted">
          {puzzle.gridCols} × {puzzle.gridRows} ·{' '}
          {puzzle.visibility === 'public' ? 'Público' : 'Privado'} · Creado el{' '}
          {formatPeruDisplay(puzzle.createdAt)}
        </p>

        <button
          type="button"
          className="primary"
          onClick={() => router.push(`/?puzzleId=${encodeURIComponent(puzzle.puzzleId)}`)}
        >
          Crear una sala con este rompecabezas
        </button>
      </section>

      <p style={{ marginTop: '1.5rem' }}>
        <Link href="/puzzles/create">Crear otro rompecabezas</Link> · <Link href="/">Inicio</Link>
      </p>
    </main>
  );
}
