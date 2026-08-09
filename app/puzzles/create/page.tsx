'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ImageCropper, type CropResult } from '@/components/ImageCropper';
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
  /** Bitmap **ya orientado**: `createImageBitmap` aplica la rotación EXIF al decodificar. */
  bitmap: ImageBitmap;
  previewUrl: string;
}

export default function CreatePuzzlePage() {
  const [image, setImage] = useState<LoadedImage | null>(null);
  const [crop, setCrop] = useState<CropResult | null>(null);
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
      setCrop(null);
      setImage({ bitmap, previewUrl: URL.createObjectURL(file) });
    } catch {
      setError('No pudimos leer esa imagen. ¿Está completa?');
    }
  }

  function resetImage() {
    image?.bitmap.close();
    if (image) URL.revokeObjectURL(image.previewUrl);
    setImage(null);
    setCrop(null);
    setError(null);
  }

  async function handleSubmit() {
    if (!crop || !pieceCount) return;
    setBusy(true);
    setError(null);
    try {
      // Se envía el recorte, no el original: el rompecabezas se construye solo con la porción
      // elegida (FR-020), y así no se sube una foto de 10 MB para usar un cuarto de ella.
      const croppedFile = new File([crop.blob], 'cropped.jpg', { type: 'image/jpeg' });
      setResult(await createPuzzle({ image: croppedFile, nominalPieceCount: pieceCount, isPublic }));
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

      </section>

      {image && !crop && (
        <section className="card" style={{ marginBottom: '1.25rem' }}>
          <h2 style={{ marginTop: 0, fontSize: '1.05rem' }}>Ajusta el encuadre</h2>
          <p className="muted" style={{ marginTop: 0 }}>
            Mueve y amplía la foto para quedarte con la parte que quieras. Si no tocas nada, se usa
            la imagen completa.
          </p>
          <ImageCropper
            bitmap={image.bitmap}
            previewUrl={image.previewUrl}
            onCropped={setCrop}
            onBack={resetImage}
            busy={busy}
          />
        </section>
      )}

      {crop && (
        <section className="card" style={{ marginBottom: '1.25rem' }}>
          <p className="muted" style={{ marginTop: 0 }}>
            Recorte de {crop.width} × {crop.height} píxeles.{' '}
            <button
              type="button"
              onClick={() => setCrop(null)}
              style={{ padding: '0.15rem 0.5rem', fontSize: '0.85rem' }}
            >
              Cambiar encuadre
            </button>
          </p>
          {/* La cantidad real se calcula sobre el RECORTE que se va a enviar, no sobre la imagen
              original: el servidor recalcula sobre ese mismo blob, y medir cosas distintas haría
              que el número mostrado no fuese el guardado (FR-019). */}
          <PieceCountSelector
            cropWidth={crop.width}
            cropHeight={crop.height}
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
        disabled={!crop || !pieceCount || busy}
        onClick={() => void handleSubmit()}
      >
        {busy ? 'Creando…' : 'Crear rompecabezas'}
      </button>
    </main>
  );
}
