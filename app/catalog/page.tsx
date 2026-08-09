'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { CatalogGrid } from '@/components/CatalogGrid';
import { SortSelector } from '@/components/SortSelector';
import { ApiError, fetchCatalog } from '@/lib/api/client';
import { isSortOrder, type CatalogItem, type SortOrder } from '@/types/catalog';

/**
 * Catálogo con scroll infinito y dos ordenamientos. Sin cuenta (Principio III).
 *
 * **El estado va en la URL**: `?sort=played&pages=4`. Se guarda el **número de páginas**, no el
 * cursor, porque un cursor apunta a una posición y no a un rango: restaurar desde él devolvería
 * solo la cola y las tarjetas de arriba desaparecerían. Con el número de páginas se piden en
 * secuencia y la lista se reconstruye entera.
 *
 * En la URL y no en `sessionStorage` porque además hace el estado compartible y sobrevive a una
 * recarga.
 */

function CatalogContent() {
  const router = useRouter();
  const params = useSearchParams();

  const rawSort = params.get('sort');
  const sort: SortOrder = isSortOrder(rawSort) ? rawSort : 'recent';
  const targetPages = Math.max(1, Number(params.get('pages') ?? '1') || 1);

  const [items, setItems] = useState<CatalogItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadedPages, setLoadedPages] = useState(0);

  // Identifica la carga en curso: si el jugador cambia de orden a media petición, la respuesta
  // vieja llega después y no debe pisar la nueva lista.
  const runRef = useRef(0);

  /** Carga `count` páginas en secuencia desde el principio. Reconstruye la lista entera. */
  const loadFrom = useCallback(
    async (nextSort: SortOrder, count: number) => {
      const run = ++runRef.current;
      setLoading(true);
      setError(null);

      const collected: CatalogItem[] = [];
      let nextCursor: string | null = null;
      let more = true;

      try {
        for (let page = 0; page < count && more; page++) {
          const result = await fetchCatalog(nextSort, nextCursor ?? undefined);
          if (runRef.current !== run) return; // llegó tarde: otra carga la reemplazó
          collected.push(...result.items);
          nextCursor = result.nextCursor;
          more = result.hasMore;
        }

        if (runRef.current !== run) return;
        setItems(collected);
        setCursor(nextCursor);
        setHasMore(more);
        setLoadedPages(Math.max(1, count));
      } catch (cause) {
        if (runRef.current !== run) return;
        setError(
          cause instanceof ApiError && cause.code === 'INVALID_CURSOR'
            ? 'La página ya no era válida. Vuelve a intentarlo.'
            : 'No se pudo cargar el catálogo.',
        );
      } finally {
        if (runRef.current === run) setLoading(false);
      }
    },
    [],
  );

  // Carga inicial y restauración al volver del detalle: `targetPages` viene de la URL.
  const restored = useRef('');
  useEffect(() => {
    const key = `${sort}:${targetPages}`;
    if (restored.current === key) return;
    restored.current = key;
    void loadFrom(sort, targetPages);
  }, [sort, targetPages, loadFrom]);

  /** Añade una página más y lo refleja en la URL, sin recargar lo ya cargado. */
  const loadMore = useCallback(async () => {
    if (loading || !hasMore || !cursor) return;
    const run = ++runRef.current;
    setLoading(true);
    try {
      const result = await fetchCatalog(sort, cursor);
      if (runRef.current !== run) return;

      const pages = loadedPages + 1;
      setItems((current) => [...current, ...result.items]);
      setCursor(result.nextCursor);
      setHasMore(result.hasMore);
      setLoadedPages(pages);
      restored.current = `${sort}:${pages}`;
      // `replace` y no `push`: paginar no debería llenar el historial de vuelta atrás.
      router.replace(`/catalog?sort=${sort}&pages=${pages}`, { scroll: false });
    } catch {
      if (runRef.current === run) setError('No se pudieron cargar más rompecabezas.');
    } finally {
      if (runRef.current === run) setLoading(false);
    }
  }, [loading, hasMore, cursor, sort, loadedPages, router]);

  function changeSort(next: SortOrder) {
    if (next === sort) return;
    // Cambiar de orden invalida el cursor y la lista: se empieza de cero.
    router.replace(`/catalog?sort=${next}&pages=1`, { scroll: false });
  }

  const empty = !loading && !error && items.length === 0;

  return (
    <main style={{ maxWidth: 1100, margin: '0 auto', padding: '2.5rem 1.25rem' }}>
      <header style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ margin: 0, fontSize: '1.4rem' }}>Catálogo</h1>
        <p className="muted" style={{ marginTop: '0.4rem' }}>
          Elige un rompecabezas y ármalo con alguien. Sin cuenta.
        </p>
      </header>

      <div style={{ marginBottom: '1.5rem' }}>
        <SortSelector value={sort} onChange={changeSort} disabled={loading} />
      </div>

      {error && (
        <p className="card error" role="alert" style={{ marginBottom: '1.25rem' }}>
          {error}{' '}
          <button
            type="button"
            onClick={() => void loadFrom(sort, targetPages)}
            style={{ padding: '0.15rem 0.6rem', fontSize: '0.85rem' }}
          >
            Reintentar
          </button>
        </p>
      )}

      {empty && (
        <section className="card">
          <h2 style={{ marginTop: 0, fontSize: '1.05rem' }}>Todavía no hay rompecabezas</h2>
          <p className="muted">
            El catálogo está vacío por ahora. Puedes crear el primero a partir de una foto tuya.
          </p>
          <Link href="/puzzles/create">Crear un rompecabezas desde una foto →</Link>
        </section>
      )}

      {!empty && (
        <CatalogGrid items={items} hasMore={hasMore} loading={loading} onLoadMore={() => void loadMore()} />
      )}
    </main>
  );
}

/**
 * `useSearchParams` obliga a un límite de Suspense: sin él, Next no puede prerenderizar esta
 * página y `npm run build` falla. Ya ocurrió en la feature 002 con `app/page.tsx`, y está
 * anotado en las Trampas conocidas del README.
 */
export default function CatalogPage() {
  return (
    <Suspense
      fallback={
        <main style={{ maxWidth: 1100, margin: '0 auto', padding: '2.5rem 1.25rem' }}>
          <p className="muted">Cargando catálogo…</p>
        </main>
      }
    >
      <CatalogContent />
    </Suspense>
  );
}
