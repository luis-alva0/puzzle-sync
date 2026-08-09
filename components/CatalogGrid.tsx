'use client';

import { useEffect, useRef } from 'react';
import { CatalogCard } from '@/components/CatalogCard';
import type { CatalogItem } from '@/types/catalog';

/**
 * Rejilla del catálogo con scroll infinito.
 *
 * El centinela es un `IntersectionObserver` sobre un elemento vacío al final de la lista: API
 * nativa, unas quince líneas, y sin medir alturas ni escuchar `scroll`. Cualquier biblioteca de
 * scroll infinito haría esto mismo envuelto en más superficie (research R7).
 */

interface CatalogGridProps {
  items: CatalogItem[];
  hasMore: boolean;
  loading: boolean;
  onLoadMore: () => void;
}

export function CatalogGrid({ items, hasMore, loading, onLoadMore }: CatalogGridProps) {
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // `onLoadMore` cambia en cada render de la página; guardarlo en una ref evita recrear el
  // observador cada vez. La copia va en un efecto, no durante el render.
  const loadMoreRef = useRef(onLoadMore);
  useEffect(() => {
    loadMoreRef.current = onLoadMore;
  }, [onLoadMore]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !hasMore || loading) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) loadMoreRef.current();
      },
      // Se dispara un poco antes de llegar al final, para que la siguiente página esté cargando
      // mientras el jugador todavía tiene tarjetas que mirar.
      { rootMargin: '400px' },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, loading]);

  return (
    <>
      <div
        style={{
          display: 'grid',
          gap: '1rem',
          gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
        }}
      >
        {items.map((item) => (
          <CatalogCard key={item.puzzleId} item={item} />
        ))}
      </div>

      <div ref={sentinelRef} aria-hidden="true" style={{ height: 1 }} />

      <p className="muted" role="status" aria-live="polite" style={{ minHeight: '1.5em' }}>
        {loading && 'Cargando más rompecabezas…'}
        {!loading && !hasMore && items.length > 0 && 'No hay más rompecabezas.'}
      </p>
    </>
  );
}
