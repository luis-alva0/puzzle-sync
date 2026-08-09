'use client';

import Link from 'next/link';
import type { CatalogItem } from '@/types/catalog';

/**
 * Tarjeta del catálogo (FR-004).
 *
 * Muestra imagen, cantidad de piezas y veces jugado: lo suficiente para decidir sin abrirla.
 *
 * **No hay distintivo de origen**, y no por omisión en el diseño: la respuesta del endpoint ni
 * siquiera trae `source`, así que este componente no podría pintarlo aunque quisiera (FR-003).
 */

export function CatalogCard({ item }: { item: CatalogItem }) {
  return (
    <Link
      href={`/puzzles/${item.puzzleId}`}
      className="card"
      style={{ display: 'block', textDecoration: 'none', color: 'inherit', padding: 0 }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- URL firmada que caduca en 1 hora;
          el optimizador de Next la cachearía más allá de su validez */}
      <img
        src={item.imageUrl}
        alt=""
        loading="lazy"
        style={{
          width: '100%',
          aspectRatio: `${item.gridCols} / ${item.gridRows}`,
          objectFit: 'cover',
          display: 'block',
          borderRadius: 'var(--radius) var(--radius) 0 0',
          background: '#0d0f15',
        }}
      />
      <div style={{ padding: '0.75rem 1rem' }}>
        <strong>{item.pieceCount} piezas</strong>
        <span className="muted" style={{ display: 'block', fontSize: '0.85rem' }}>
          {item.playCount === 0
            ? 'Aún no lo ha jugado nadie'
            : `Jugado ${item.playCount} ${item.playCount === 1 ? 'vez' : 'veces'}`}
        </span>
      </div>
    </Link>
  );
}
