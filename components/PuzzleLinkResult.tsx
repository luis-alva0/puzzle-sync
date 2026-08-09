'use client';

import { useState } from 'react';
import Link from 'next/link';
import { formatPeruDisplay } from '@/lib/format/datetime';
import type { CreatePuzzleResponse } from '@/types/api';

/**
 * Resultado de la creación: el enlace y su advertencia (FR-024, FR-025, FR-026).
 *
 * La advertencia no es un adorno. Sin cuentas no hay forma de recuperar el enlace: si el jugador
 * lo pierde, pierde el rompecabezas. Es la contrapartida de no pedir registro, y decirlo aquí es
 * más honesto que resolverlo introduciendo cuentas.
 */

interface PuzzleLinkResultProps {
  result: CreatePuzzleResponse;
}

export function PuzzleLinkResult({ result }: PuzzleLinkResultProps) {
  const [copied, setCopied] = useState(false);
  const fullUrl = typeof window !== 'undefined' ? window.location.origin + result.url : result.url;

  async function copy() {
    await navigator.clipboard.writeText(fullUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2_000);
  }

  return (
    <section className="card" aria-labelledby="result-heading">
      <h2 id="result-heading" style={{ marginTop: 0, fontSize: '1.05rem' }}>
        Tu rompecabezas está listo
      </h2>

      <p className="muted" style={{ marginTop: 0 }}>
        {result.pieceCount} piezas ({result.gridCols} × {result.gridRows}) ·{' '}
        {result.visibility === 'public' ? 'Público' : 'Privado'} · Creado el{' '}
        {formatPeruDisplay(new Date())}
      </p>

      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', margin: '1rem 0' }}>
        <input
          readOnly
          value={fullUrl}
          aria-label="Enlace del rompecabezas"
          onFocus={(event) => event.currentTarget.select()}
          style={{ flex: '1 1 20ch', fontFamily: 'ui-monospace, monospace', fontSize: '0.85rem' }}
        />
        <button type="button" className="primary" onClick={() => void copy()}>
          {copied ? 'Copiado' : 'Copiar enlace'}
        </button>
      </div>

      <p
        className="error"
        role="note"
        style={{ margin: '0 0 1rem', fontSize: '0.9rem', lineHeight: 1.5 }}
      >
        <strong>Guarda este enlace.</strong> Como no hay cuentas, es la única forma de volver a tu
        rompecabezas. Si lo pierdes, tendrás que crearlo de nuevo.
      </p>

      <Link href={result.url}>Abrir el rompecabezas →</Link>
    </section>
  );
}
