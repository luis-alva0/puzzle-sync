'use client';

import { useCallback, useState } from 'react';
import Cropper, { type Area } from 'react-easy-crop';

/**
 * Encuadre de la foto antes de generar el rompecabezas (FR-012 a FR-015).
 *
 * `react-easy-crop` aporta solo el **control**: arrastre, zoom con rueda y con pinza, y marco
 * redimensionable, devolviendo las coordenadas en píxeles de la imagen original. El recorte real
 * —dibujar la región en un canvas y exportarla— es código propio de unas veinte líneas, ahí
 * abajo.
 *
 * La orientación EXIF ya viene resuelta: la página decodifica con
 * `createImageBitmap(file, { imageOrientation: 'from-image' })` y aquí se trabaja sobre ese
 * bitmap, con los píxeles ya derechos (FR-016). Recortar sobre la imagen sin orientar daría un
 * rompecabezas girado 90° en cualquier foto de móvil.
 */

/**
 * Lado mínimo del recorte, en píxeles de origen (FR-015).
 *
 * Por debajo de esto, incluso 20 piezas quedarían por debajo de 50×50 píxeles cada una y el
 * rompecabezas sería ilegible.
 */
const MIN_CROP_SIDE = 240;

export interface CropResult {
  blob: Blob;
  width: number;
  height: number;
}

interface ImageCropperProps {
  /** Bitmap ya decodificado y orientado por la página. */
  bitmap: ImageBitmap;
  /** URL de objeto de la imagen original, para que el control la muestre. */
  previewUrl: string;
  onCropped: (result: CropResult) => void;
  onBack: () => void;
  busy?: boolean;
}

/**
 * Dibuja la región seleccionada en un canvas y la exporta.
 *
 * Se parte del `ImageBitmap` orientado, no del `File`: así lo que se sube ya tiene los píxeles
 * en su sitio y no arrastra metadatos de rotación.
 */
async function cropToBlob(bitmap: ImageBitmap, area: Area): Promise<CropResult> {
  const width = Math.round(area.width);
  const height = Math.round(area.height);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext('2d');
  if (!context) throw new Error('No se pudo crear el contexto de canvas para el recorte');

  context.drawImage(
    bitmap,
    Math.round(area.x),
    Math.round(area.y),
    width,
    height,
    0,
    0,
    width,
    height,
  );

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', 0.92),
  );
  if (!blob) throw new Error('No se pudo exportar el recorte');

  return { blob, width, height };
}

export function ImageCropper({
  bitmap,
  previewUrl,
  onCropped,
  onBack,
  busy = false,
}: ImageCropperProps) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [area, setArea] = useState<Area | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Sin tocar nada, el recorte abarca la mayor porción posible: zoom 1 y centrado (FR-014).
  const onCropComplete = useCallback((_: Area, areaPixels: Area) => {
    setArea(areaPixels);
  }, []);

  const tooSmall =
    area !== null && (area.width < MIN_CROP_SIDE || area.height < MIN_CROP_SIDE);

  async function confirm() {
    if (!area || tooSmall) return;
    setError(null);
    try {
      onCropped(await cropToBlob(bitmap, area));
    } catch {
      setError('No se pudo recortar la imagen. Inténtalo de nuevo.');
    }
  }

  return (
    <div>
      <div
        style={{
          position: 'relative',
          width: '100%',
          height: 360,
          background: '#0d0f15',
          borderRadius: 'var(--radius)',
          overflow: 'hidden',
        }}
      >
        <Cropper
          image={previewUrl}
          crop={crop}
          zoom={zoom}
          minZoom={1}
          maxZoom={4}
          restrictPosition
          onCropChange={setCrop}
          onZoomChange={setZoom}
          onCropComplete={onCropComplete}
        />
      </div>

      <label
        htmlFor="zoom"
        style={{ display: 'block', marginTop: '1rem', fontSize: '0.9rem', fontWeight: 600 }}
      >
        Zoom
      </label>
      <input
        id="zoom"
        type="range"
        min={1}
        max={4}
        step={0.05}
        value={zoom}
        disabled={busy}
        onChange={(event) => setZoom(Number(event.target.value))}
        style={{ width: '100%' }}
      />

      {area && (
        <p className="muted" aria-live="polite" style={{ fontSize: '0.85rem' }}>
          Recorte de {Math.round(area.width)} × {Math.round(area.height)} píxeles.
        </p>
      )}

      {tooSmall && (
        <p className="error" role="alert" style={{ fontSize: '0.9rem' }}>
          El recorte es demasiado pequeño: necesita al menos {MIN_CROP_SIDE} píxeles de lado.
          Reduce el zoom o elige otra foto.
        </p>
      )}

      {error && (
        <p className="error" role="alert" style={{ fontSize: '0.9rem' }}>
          {error}
        </p>
      )}

      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem', flexWrap: 'wrap' }}>
        <button type="button" onClick={onBack} disabled={busy}>
          Elegir otra foto
        </button>
        <button
          type="button"
          className="primary"
          onClick={() => void confirm()}
          disabled={busy || !area || tooSmall}
        >
          Usar este encuadre
        </button>
      </div>
    </div>
  );
}
