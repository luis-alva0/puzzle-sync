'use client';

import { chooseGrid, actualPieceCount } from '@/lib/puzzle-generation/grid';
import { PIECE_COUNT_OPTIONS, type PieceCountOption } from '@/types/puzzle';

/**
 * Selección de la cantidad de piezas (FR-017, FR-018, FR-019, FR-021).
 *
 * La cantidad elegida es un **objetivo**: una cuadrícula rectangular no puede dar 50 piezas con
 * cualquier relación de aspecto sin deformarlas. Por eso se muestra la cantidad real antes de
 * confirmar, calculada con la misma función que usa el servidor.
 *
 * Las dimensiones que se le pasan deben ser las del **recorte que se va a enviar**, no las de la
 * imagen original: el servidor recalcula sobre el blob recortado, y medir cosas distintas haría
 * que el número mostrado no fuese el guardado.
 */

/**
 * Píxeles por pieza por debajo de los cuales la imagen se ve borrosa al ampliarla.
 * Equivale a unos 110×110 píxeles de origen por pieza.
 */
const MIN_PIXELS_PER_PIECE = 12_000;

interface PieceCountSelectorProps {
  /** Ancho del recorte, en píxeles de la imagen original. */
  cropWidth: number;
  /** Alto del recorte, en píxeles de la imagen original. */
  cropHeight: number;
  value: PieceCountOption | null;
  onChange: (value: PieceCountOption) => void;
  disabled?: boolean;
}

export function PieceCountSelector({
  cropWidth,
  cropHeight,
  value,
  onChange,
  disabled = false,
}: PieceCountSelectorProps) {
  const grid = value ? chooseGrid(value, cropWidth, cropHeight) : null;
  const realCount = grid ? actualPieceCount(grid) : null;

  const pixelsPerPiece = realCount ? (cropWidth * cropHeight) / realCount : Infinity;
  const lowResolution = pixelsPerPiece < MIN_PIXELS_PER_PIECE;

  return (
    <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
      <legend style={{ padding: 0, marginBottom: '0.6rem', fontWeight: 600 }}>
        ¿Cuántas piezas?
      </legend>

      <div role="radiogroup" style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        {PIECE_COUNT_OPTIONS.map((option) => (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={value === option}
            disabled={disabled}
            onClick={() => onChange(option)}
            style={{ borderColor: value === option ? 'var(--accent)' : 'var(--border)' }}
          >
            {option}
          </button>
        ))}
      </div>

      {realCount !== null && grid !== null && (
        <p className="muted" aria-live="polite" style={{ marginBottom: 0 }}>
          Serán <strong>{realCount} piezas</strong> ({grid.cols} × {grid.rows}).
          {realCount !== value && ' La cuadrícula se ajusta a la forma de tu foto.'}
        </p>
      )}

      {lowResolution && realCount !== null && (
        <p className="error" role="alert" style={{ marginBottom: 0, fontSize: '0.9rem' }}>
          Tu foto tiene poca resolución para {realCount} piezas: se verán borrosas. Puedes
          continuar igualmente, o elegir menos piezas.
        </p>
      )}
    </fieldset>
  );
}
