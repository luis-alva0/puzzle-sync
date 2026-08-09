'use client';

import { useState } from 'react';
import Link from 'next/link';
import { PieceCountSelector } from '@/components/PieceCountSelector';
import { PuzzleLinkResult } from '@/components/PuzzleLinkResult';
import { ApiError, createPuzzle } from '@/lib/api/client';
import { MAX_FILE_BYTES } from '@/lib/upload/validate';
import { type PieceCountOption } from '@/types/puzzle';
import type { CreatePuzzleResponse } from '@/types/api';

/**
 * Creación de un rompecabezas a partir de una foto. Sin cuenta (Principio III).
 *
 * Tres pasos: subir → configurar → resultado. La validación que se hace aquí es una cortesía
 * para responder rápido; la que decide está en el servidor, porque cualquiera puede hacer POST
 * directo al endpoint.
 */

interface LoadedImage {
  file: File;
  /** Dimensiones **ya orientadas**: `createImageBitmap` aplica la rotación EXIF al decodificar. */
  width: number;
  height: number;
  previewUrl: string;
}

export default function CreatePuzzlePage() {
  const [image, setImage] = useState<LoadedImage | null>(null);
  const [pieceCount, setPieceCount] = useState<PieceCountOption | null>(100);
  // Pasa a ser estado con interruptor en US4 (T042). Hasta entonces, privado siempre (FR-029).
  const isPublic = false;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CreatePuzzleResponse | null>(null);

  async function handleFile(file: File) {
    setError(null);

    // Cortesía: responder sin esperar al servidor. No es la frontera de confianza.
    if (file.size > MAX_FILE_BYTES) {
      setError('La imagen no puede pesar más de 10 MB.');
      return;
    }
    if (file.type !== 'image/jpeg' && file.type !== 'image/png') {
      setError('Solo se admiten imágenes JPG o PNG.');
      return;
    }

    try {
      // `imageOrientation: 'from-image'` aplica la rotación EXIF al decodificar (FR-016). Sin
      // esto, una foto de móvil se encuadra derecha y sale girada 90°.
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
      setImage({
        file,
        width: bitmap.width,
        height: bitmap.height,
        previewUrl: URL.createObjectURL(file),
      });
      bitmap.close();
    } catch {
      setError('No pudimos leer esa imagen. ¿Está completa?');
    }
  }

  async function handleSubmit() {
    if (!image || !pieceCount) return;
    setBusy(true);
    setError(null);
    try {
      setResult(await createPuzzle({ image: image.file, nominalPieceCount: pieceCount, isPublic }));
    } catch (cause) {
      // Se conmuta sobre el código, nunca sobre el texto (Principio V).
      const code = cause instanceof ApiError ? cause.code : 'INTERNAL_ERROR';
      setError(
        code === 'INVALID_FILE_TYPE'
          ? 'Ese archivo no es una imagen JPG o PNG válida.'
          : code === 'FILE_TOO_LARGE'
            ? 'La imagen supera el límite de 10 MB.'
            : code === 'INVALID_PIECE_COUNT'
              ? 'Elige una de las cantidades disponibles.'
              : 'No se pudo crear el rompecabezas. Inténtalo de nuevo.',
      );
    } finally {
      setBusy(false);
    }
  }

  if (result) {
    return (
      <main style={{ maxWidth: 640, margin: '0 auto', padding: '3rem 1.25rem' }}>
        <PuzzleLinkResult result={result} />
        <p style={{ marginTop: '1.5rem' }}>
          <Link href="/puzzles/create">Crear otro</Link> · <Link href="/">Inicio</Link>
        </p>
      </main>
    );
  }

  return (
    <main style={{ maxWidth: 640, margin: '0 auto', padding: '3rem 1.25rem' }}>
      <header style={{ marginBottom: '2rem' }}>
        <h1 style={{ margin: 0, fontSize: '1.4rem' }}>Crear un rompecabezas</h1>
        <p className="muted" style={{ marginTop: '0.4rem' }}>
          Sube una foto y elige en cuántas piezas cortarla. No hace falta cuenta.
        </p>
      </header>

      <section className="card" style={{ marginBottom: '1.25rem' }}>
        <label htmlFor="photo" style={{ display: 'block', fontWeight: 600, marginBottom: '0.6rem' }}>
          Tu foto
        </label>
        <input
          id="photo"
          type="file"
          accept="image/jpeg,image/png"
          disabled={busy}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void handleFile(file);
          }}
        />
        <p className="muted" style={{ fontSize: '0.85rem', marginBottom: 0 }}>
          JPG o PNG, hasta 10 MB.
        </p>

        {image && (
          <div style={{ marginTop: '1rem' }}>
            {/* eslint-disable-next-line @next/next/no-img-element -- es un blob local del
                navegador, no una imagen remota que Next pueda optimizar */}
            <img
              src={image.previewUrl}
              alt="Vista previa de la foto elegida"
              style={{
                maxWidth: '100%',
                maxHeight: 320,
                borderRadius: 'var(--radius)',
                display: 'block',
              }}
            />
            <p className="muted" style={{ fontSize: '0.85rem', marginBottom: 0 }}>
              {image.width} × {image.height} píxeles
            </p>
          </div>
        )}
      </section>

      {image && (
        <section className="card" style={{ marginBottom: '1.25rem' }}>
          <PieceCountSelector
            cropWidth={image.width}
            cropHeight={image.height}
            value={pieceCount}
            onChange={setPieceCount}
            disabled={busy}
          />
        </section>
      )}

      {error && (
        <p className="card error" role="alert" style={{ marginBottom: '1.25rem' }}>
          {error}
        </p>
      )}

      <button
        type="button"
        className="primary"
        disabled={!image || !pieceCount || busy}
        onClick={() => void handleSubmit()}
      >
        {busy ? 'Creando…' : 'Crear rompecabezas'}
      </button>
    </main>
  );
}
