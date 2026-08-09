'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ImageCropper, type CropResult } from '@/components/ImageCropper';
import { PieceCountSelector } from '@/components/PieceCountSelector';
import { ApiError, createPuzzle, fetchCatalog, retirePuzzle } from '@/lib/api/client';
import { MAX_FILE_BYTES } from '@/lib/upload/validate';
import type { PieceCountOption } from '@/types/puzzle';
import type { CatalogItem } from '@/types/catalog';

/**
 * Administración: carga de contenido curado y retirada de entradas.
 *
 * El middleware ya garantizó que quien llega aquí es administrador. Aun así, los endpoints
 * comprueban el rol por su cuenta: esta pantalla es una comodidad, no una frontera de seguridad.
 *
 * **Reutiliza `ImageCropper` y `PieceCountSelector` sin modificarlos.** Lo único que cambia
 * respecto de `/puzzles/create` es que no hay interruptor de visibilidad — y ocultarlo es
 * cosmética: el servidor fuerza `public` y `curated` por su cuenta, derivándolo de la sesión.
 *
 * Las validaciones de archivo son las mismas: tipo, 10 MB y las cinco cantidades. Un
 * administrador no es un usuario de confianza para el validador (FR-024).
 */

export default function AdminPage() {
  const [image, setImage] = useState<{ bitmap: ImageBitmap; previewUrl: string } | null>(null);
  const [crop, setCrop] = useState<CropResult | null>(null);
  const [pieceCount, setPieceCount] = useState<PieceCountOption | null>(100);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [entries, setEntries] = useState<CatalogItem[]>([]);
  const [loadingEntries, setLoadingEntries] = useState(true);

  const loadEntries = useCallback(async () => {
    setLoadingEntries(true);
    try {
      setEntries((await fetchCatalog('recent')).items);
    } catch {
      setError('No se pudo cargar el catálogo.');
    } finally {
      setLoadingEntries(false);
    }
  }, []);

  /* eslint-disable react-hooks/set-state-in-effect --
     Cargar el listado al montar es para lo que sirve este efecto, y `loadEntries` fija el estado
     después de un `await`, no durante el render. */
  useEffect(() => {
    void loadEntries();
  }, [loadEntries]);
  /* eslint-enable react-hooks/set-state-in-effect */

  async function handleFile(file: File) {
    setError(null);
    if (file.size > MAX_FILE_BYTES) {
      setError('La imagen no puede pesar más de 10 MB.');
      return;
    }
    if (file.type !== 'image/jpeg' && file.type !== 'image/png') {
      setError('Solo se admiten imágenes JPG o PNG.');
      return;
    }
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
      setCrop(null);
      setImage({ bitmap, previewUrl: URL.createObjectURL(file) });
    } catch {
      setError('No pudimos leer esa imagen. ¿Está completa?');
    }
  }

  async function handleSubmit() {
    if (!crop || !pieceCount) return;
    setBusy(true);
    setError(null);
    try {
      // `isPublic` no se envía: el servidor lo fuerza al detectar la sesión de administrador.
      const file = new File([crop.blob], 'curated.jpg', { type: 'image/jpeg' });
      await createPuzzle({ image: file, nominalPieceCount: pieceCount, isPublic: false });
      setNotice('Rompecabezas publicado en el catálogo.');
      setImage(null);
      setCrop(null);
      await loadEntries();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'No se pudo crear el rompecabezas.');
    } finally {
      setBusy(false);
    }
  }

  async function handleRetire(puzzleId: string) {
    try {
      await retirePuzzle(puzzleId);
      setEntries((current) => current.filter((entry) => entry.puzzleId !== puzzleId));
      setNotice('Entrada retirada del catálogo. Su enlace sigue funcionando.');
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'No se pudo retirar la entrada.');
    }
  }

  return (
    <main style={{ maxWidth: 720, margin: '0 auto', padding: '2.5rem 1.25rem' }}>
      <header style={{ marginBottom: '2rem' }}>
        <h1 style={{ margin: 0, fontSize: '1.4rem' }}>Administración</h1>
        <p className="muted" style={{ marginTop: '0.4rem' }}>
          Lo que subas aquí se publica en el catálogo de inmediato.
        </p>
      </header>

      {notice && (
        <p className="card" role="status" style={{ marginBottom: '1.25rem', borderColor: 'var(--success)' }}>
          {notice}
        </p>
      )}
      {error && (
        <p className="card error" role="alert" style={{ marginBottom: '1.25rem' }}>
          {error}
        </p>
      )}

      <section className="card" style={{ marginBottom: '1.25rem' }}>
        <h2 style={{ marginTop: 0, fontSize: '1.05rem' }}>Cargar contenido curado</h2>
        <input
          type="file"
          accept="image/jpeg,image/png"
          disabled={busy}
          aria-label="Foto para el rompecabezas curado"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void handleFile(file);
          }}
        />
      </section>

      {image && !crop && (
        <section className="card" style={{ marginBottom: '1.25rem' }}>
          <ImageCropper
            bitmap={image.bitmap}
            previewUrl={image.previewUrl}
            onCropped={setCrop}
            onBack={() => setImage(null)}
            busy={busy}
          />
        </section>
      )}

      {crop && (
        <section className="card" style={{ marginBottom: '1.25rem' }}>
          <PieceCountSelector
            cropWidth={crop.width}
            cropHeight={crop.height}
            value={pieceCount}
            onChange={setPieceCount}
            disabled={busy}
          />
          <p className="muted" style={{ fontSize: '0.85rem' }}>
            Se publicará como contenido curado, visible en el catálogo.
          </p>
          <button
            type="button"
            className="primary"
            disabled={busy || !pieceCount}
            onClick={() => void handleSubmit()}
          >
            {busy ? 'Publicando…' : 'Publicar en el catálogo'}
          </button>
        </section>
      )}

      <section className="card">
        <h2 style={{ marginTop: 0, fontSize: '1.05rem' }}>Entradas del catálogo</h2>
        {loadingEntries && <p className="muted">Cargando…</p>}
        {!loadingEntries && entries.length === 0 && <p className="muted">El catálogo está vacío.</p>}
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: '0.5rem' }}>
          {entries.map((entry) => (
            <li
              key={entry.puzzleId}
              style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}
            >
              <Link href={`/puzzles/${entry.puzzleId}`} style={{ flex: '1 1 12rem' }}>
                {entry.pieceCount} piezas · {entry.playCount} partidas
              </Link>
              <button type="button" onClick={() => void handleRetire(entry.puzzleId)}>
                Retirar
              </button>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
