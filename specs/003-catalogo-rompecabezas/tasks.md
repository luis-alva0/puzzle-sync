---

description: "Task list for 003-catalogo-rompecabezas"
---

# Tasks: Catálogo de Rompecabezas Pre-creados

**Input**: Design documents from `/specs/003-catalogo-rompecabezas/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/)

**Tests**: Incluidos donde el Principio VI (v1.2.0) los exige, y **se prueba donde la lógica vive**. El cursor y el ordenamiento son TypeScript puro y van a unitarias; la paginación con empates, el forzado de visibilidad y el middleware necesitan Postgres y sesiones reales, y van a integración.

**Organization**: Agrupadas por historia de usuario (US1–US3).

**Base existente**: esta feature parte de 001 y 002 implementadas. **No crea ninguna tabla**: añade una columna, reemplaza dos índices, redefine una función de 001 y reutiliza `ImageCropper`, `PieceCountSelector`, `lib/api/errors.ts`, `lib/storage/upload.ts` y el endpoint de creación tal como están.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Puede ejecutarse en paralelo (archivos distintos, sin dependencias pendientes)
- **[Story]**: Historia de usuario (US1–US3)
- Cada tarea indica la ruta exacta del archivo

---

## Phase 1: Setup

- [ ] T001 Instalar `@supabase/ssr` con `npm install @supabase/ssr` y registrar en `package.json`. La justificación que exige el Principio I ya está escrita en [research.md](./research.md) R1: un middleware corre en el servidor y no puede leer `localStorage`
- [ ] T002 [P] Definir los tipos del catálogo en `types/catalog.ts`: `CatalogItem`, `SortOrder` (`'recent' | 'played'`), `CatalogCursor` y `CatalogPage`
- [ ] T003 [P] Añadir `FORBIDDEN` (403) e `INVALID_CURSOR` (400) a `ErrorCode` y a `ERROR_STATUS` en `types/api.ts`, y sus mensajes por defecto en `lib/api/errors.ts`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: La migración y las dos funciones puras sin las que no existe el listado.

**⚠️ CRITICAL**: Ninguna historia puede empezar hasta que esta fase esté completa.

- [ ] T004 Crear la migración `supabase/migrations/0009_catalog.sql` con la columna `catalog_status text not null default 'visible' check (catalog_status in ('visible','retired'))` sobre `puzzles`
- [ ] T005 Reemplazar en la misma migración los dos índices de 002 por versiones con desempate: `(created_at desc, id desc)` y `(play_count desc, id desc)`, ambos parciales sobre `visibility = 'public' and catalog_status = 'visible'`. **Sin el `id` la paginación produce duplicados y saltos** cuando hay empates, que con `play_count = 0` es el caso normal (research R3)
- [ ] T006 Redefinir `create_room` en la misma migración para incrementar `puzzles.play_count` dentro de la **misma transacción** que crea la sala (FR-013). Es una función de la feature 001; hoy no menciona el contador (research R4)
- [ ] T007 Restringir en la misma migración la política de lectura de `puzzles` a `visibility = 'public' and catalog_status = 'visible'`, para que un rompecabezas retirado deje de ser legible desde el cliente
- [ ] T008 [P] Test del cursor en `tests/unit/catalog-cursor.test.ts`: ida y vuelta para ambos ordenamientos, rechazo de un cursor corrupto, y rechazo cuando el `sort` codificado no coincide con el pedido
- [ ] T009 [P] Test del ordenamiento en `tests/unit/catalog-ordering.test.ts`: la comparación de tupla es la correcta para cada `sort`, y el desempate por `id` siempre está presente
- [ ] T010 Implementar `encodeCursor` y `decodeCursor` en `lib/catalog/cursor.ts` sobre base64 de `{ sort, key, id }`. Opaco pero no secreto: no lleva nada sensible y no autoriza nada
- [ ] T011 Implementar en `lib/catalog/ordering.ts` la construcción de la condición de keyset y el `order by` para cada `SortOrder`, siempre con `id desc` como segunda clave
- [ ] T012 Implementar el cliente de sesión con cookies en `lib/supabase/admin-session.ts` sobre `@supabase/ssr`, con la variante para middleware y la variante para route handlers
- [ ] T013 Implementar en `lib/supabase/admin-session.ts` el helper `requireAdmin(request)` que verifica la sesión y `app_metadata.is_admin === true`. **Nunca `user_metadata`**: lo puede escribir el propio usuario desde el cliente, y usarlo aquí sería regalar el rol (research R2)

**Checkpoint**: esquema migrado, cursor y ordenamiento probados, y la comprobación de administrador disponible.

---

## Phase 3: User Story 1 - Explorar el catálogo y elegir un rompecabezas (Priority: P1) 🎯 MVP

**Goal**: Cualquiera, sin cuenta, ve los rompecabezas disponibles y lleva uno a una sala.

**Independent Test**: Abrir `/catalog` con rompecabezas públicos sembrados, comprobar que se listan con imagen, piezas y veces jugado, y que al elegir uno se llega a la pantalla del rompecabezas y de ahí a crear sala.

### Implementation for User Story 1

- [ ] T014 [US1] Implementar `GET /api/catalog` en `app/api/catalog/route.ts`: consulta keyset con `limit 21` para deducir `hasMore` sin una consulta de conteo, y firma cada `imageUrl` con `signPuzzleImageUrl` de 002
- [ ] T015 [US1] **No** incluir `source` ni `visibility` en la respuesta de `app/api/catalog/route.ts`. FR-003 prohíbe distinguir el origen, y la forma robusta de garantizarlo es no mandar el dato: una interfaz no puede pintar lo que no recibe
- [ ] T016 [P] [US1] Crear la tarjeta en `components/CatalogCard.tsx` con imagen de referencia, cantidad de piezas y contador de partidas (FR-004)
- [ ] T017 [P] [US1] Crear la rejilla en `components/CatalogGrid.tsx` con el centinela de `IntersectionObserver` al final de la lista. API nativa, sin biblioteca de scroll infinito (research R7)
- [ ] T018 [US1] Crear la pantalla en `app/catalog/page.tsx`: carga inicial, acumulación de páginas y estado de carga
- [ ] T019 [US1] Mostrar en `app/catalog/page.tsx` el mensaje de catálogo vacío con invitación a crear un rompecabezas desde foto (FR-006)
- [ ] T020 [US1] Enlazar cada tarjeta a `/puzzles/{id}`, la pantalla que 002 ya construyó y que lleva a crear sala (FR-014, FR-015)
- [ ] T021 [US1] Añadir un enlace al catálogo desde `app/page.tsx`, para que la pantalla sea alcanzable

**Checkpoint**: US1 funciona sola. Hay catálogo navegable y se puede jugar lo que hay en él.

---

## Phase 4: User Story 2 - Ordenar por recientes o más jugados (Priority: P2)

**Goal**: El jugador alterna entre lo último añadido y lo que más se ha jugado.

**Independent Test**: Con rompecabezas de distintas fechas y contadores, alternar entre ambos ordenamientos y verificar que el listado se reordena, y que al seguir bajando se mantiene el orden elegido.

### Implementation for User Story 2

- [ ] T022 [US2] Aceptar el parámetro `sort` en `app/api/catalog/route.ts` y aplicar el ordenamiento correspondiente con `lib/catalog/ordering.ts`; un valor desconocido se trata como `recent`, sin error
- [ ] T023 [US2] Rechazar con `INVALID_CURSOR` en `app/api/catalog/route.ts` cuando el `sort` codificado dentro del cursor no coincide con el de la petición: cambiar de ordenamiento a media lista invalida el cursor viejo
- [ ] T024 [P] [US2] Crear el selector en `components/SortSelector.tsx` con las dos opciones, `recent` marcada por defecto (FR-009)
- [ ] T025 [US2] Reiniciar la lista y el cursor al cambiar de ordenamiento en `app/catalog/page.tsx`
- [ ] T026 [US2] Mantener el ordenamiento elegido al cargar tramos adicionales en `app/catalog/page.tsx` (FR-012)

**Checkpoint**: US1 y US2 funcionan. El catálogo es navegable y ordenable.

---

## Phase 5: User Story 3 - El administrador carga rompecabezas curados (Priority: P2)

**Goal**: El administrador entra a una pantalla protegida, sube contenido curado que queda público, y puede retirar cualquier entrada. Nadie más llega ahí.

**Independent Test**: Autenticarse como administrador, cargar un rompecabezas y verificar que queda `public` + `curated` y aparece en el catálogo. Luego intentar entrar a `/admin` sin sesión y con sesión de jugador, y verificar que ambos son rechazados.

### Tests for User Story 3

- [ ] T027 [P] [US3] Test de integración del acceso a administración en `tests/integration/admin-access.test.ts`: sin sesión redirige al login, con sesión sin `is_admin` redirige a la portada, con administrador entra, y **`user_metadata.is_admin = true` puesto desde el cliente NO da acceso**. Esa última es la que hace que el resto valga algo
- [ ] T028 [P] [US3] Test de integración del forzado de visibilidad en `tests/integration/admin-upload.test.ts`: lo creado por un administrador queda `public` + `curated` sin excepción, y un jugador que envía un campo tipo `isAdminUpload` en el `FormData` sigue obteniendo `user_photo`

### Implementation for User Story 3

- [ ] T029 [US3] Crear `middleware.ts` en la raíz del repositorio con `matcher: ['/admin/:path*']`, refrescando la sesión desde la cookie y **propagando la cookie renovada a la respuesta**: sin eso, la siguiente navegación vuelve a fallar
- [ ] T030 [US3] Implementar en `middleware.ts` las dos redirecciones: sin sesión a `/admin/login`, y con sesión sin `app_metadata.is_admin` a `/`. Se redirige y no se responde `403` porque es una navegación de página, no una llamada de API
- [ ] T031 [US3] Crear la pantalla de acceso en `app/admin/login/page.tsx` con email y contraseña contra Supabase Auth. Sin registro, sin recuperación y sin enlace mágico: las cuentas se crean fuera de la aplicación
- [ ] T032 [US3] Modificar `app/api/puzzles/route.ts` para derivar la condición de administrador con `requireAdmin` y, cuando lo sea, forzar `visibility = 'public'` y `source = 'curated'`, **ignorando cualquier campo del cuerpo**. Un campo del `FormData` permitiría a cualquier jugador marcar su rompecabezas como curado (research R2)
- [ ] T033 [US3] Crear la pantalla de carga curada en `app/admin/page.tsx` reutilizando `components/ImageCropper.tsx` y `components/PieceCountSelector.tsx` **sin modificarlos**, y sin mostrar el interruptor de visibilidad
- [ ] T034 [US3] Verificar en `app/admin/page.tsx` que las validaciones de archivo son las mismas que para un jugador: tipo, 10 MB y las cinco cantidades. Un administrador no es un usuario de confianza para el validador (FR-024)
- [ ] T035 [US3] Implementar `POST /api/puzzles/[id]/retire` en `app/api/puzzles/[id]/retire/route.ts`: comprueba administrador con `requireAdmin`, marca `catalog_status = 'retired'`, y es idempotente
- [ ] T036 [US3] Garantizar en `app/api/puzzles/[id]/retire/route.ts` que retirar **no** toca `visibility`, **no** borra la fila y **no** borra el objeto de Storage: el enlace del creador sigue funcionando (FR-030) y las salas en curso no se enteran (FR-031)
- [ ] T037 [US3] Añadir a `app/admin/page.tsx` el listado de entradas del catálogo con acción de retirar
- [ ] T038 [US3] Comprobar la condición de administrador **también dentro de cada route handler**, no solo en el middleware. El `matcher` es una lista y se puede quedar corta al añadir una ruta; esa comprobación es lo que evita que el endpoint quede abierto
- [ ] T039 [US3] Verificar que ninguna pantalla del producto enlaza a `/admin` ni revela su existencia a quien no es administrador (FR-022)

**Checkpoint**: las tres historias funcionan. La feature está completa a nivel de producto.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [ ] T040 [P] Test de integración de la paginación en `tests/integration/catalog-pagination.test.ts`: sembrar 50 rompecabezas **con el mismo `play_count`**, recorrer todas las páginas y verificar 50 identificadores distintos, sin repetidos ni ausentes. Repetir con `created_at` idéntico. Es la prueba que justifica el desempate por `id`
- [ ] T041 [P] Añadir a `tests/integration/catalog-pagination.test.ts` el caso del retirado: desaparece del listado y su enlace `/puzzles/{id}` sigue funcionando
- [ ] T042 [P] Test de integración del contador en `tests/integration/play-count.test.ts`: crear una sala incrementa `play_count` del rompecabezas en la misma transacción
- [ ] T043 [P] Añadir estados de carga y error a `app/catalog/page.tsx`, distinguiendo el catálogo vacío del fallo de carga
- [ ] T044 [P] Añadir etiquetas ARIA y navegación por teclado al selector de ordenamiento y a las tarjetas en `components/`, y anunciar la carga de nuevos tramos con `aria-live`
- [ ] T045 Medir en `app/catalog/page.tsx` el tiempo hasta la primera pantalla y confirmar SC-002 (< 2 s)
- [ ] T046 Sembrar 500 rompecabezas públicos y confirmar que SC-002 se mantiene: el keyset sobre `puzzles_public_recent_idx` no debe degradarse con el tamaño del catálogo
- [ ] T047 Cronometrar el recorrido `app/catalog/page.tsx` → `app/puzzles/[id]/page.tsx` → sala y confirmar SC-001 (< 30 s)
- [ ] T048 Confirmar SC-008 sobre `GET /api/catalog`: dos cargas consecutivas con el mismo `sort` devuelven el mismo orden si no cambió ningún dato
- [ ] T049 Ejecutar `npm run build` y `npm run check:secrets`, confirmando que la llave de servicio no llega al bundle pese al middleware y al cliente de sesión
- [ ] T050 Ejecutar la validación completa descrita en [quickstart.md](./quickstart.md), los 6 escenarios de principio a fin
- [ ] T051 Revisar el cumplimiento de la constitución antes del merge: dependencia nueva justificada por escrito, ninguna variable de entorno nueva, formato de error uniforme en los endpoints nuevos, y `npm test` en verde

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Fase 1)**: sin dependencias
- **Foundational (Fase 2)**: depende de Setup — **bloquea todas las historias**
- **US1 (Fase 3)**: depende de Fase 2
- **US2 (Fase 4)**: depende de US1 — el ordenamiento se aplica sobre un listado que ya existe
- **US3 (Fase 5)**: depende de Fase 2, **no de US1**. Se puede abordar en paralelo al catálogo: la pantalla de administración y el middleware no comparten archivos con el listado
- **Polish (Fase 6)**: depende de las historias que se decida entregar

### Orden dentro de la migración

`0009_catalog.sql` es un solo archivo, y T004–T007 son secciones suyas en este orden:

```text
ALTER TABLE (catalog_status) → DROP + CREATE de los dos índices
  → CREATE OR REPLACE create_room → política RLS
```

Los índices se crean **después** de la columna porque su condición parcial la referencia.

### Parallel Opportunities

- Fase 1: T002 y T003 en paralelo tras T001
- Fase 2: T008 y T009 en paralelo; T010, T011 y T012 en paralelo entre sí
- US1: T016 y T017 en paralelo
- **US1 y US3 completas en paralelo**: no comparten ningún archivo
- Fase 6: T040, T041, T042, T043 y T044 en paralelo

---

## Parallel Example: Foundational

```bash
# Tras la migración (T004–T007), en paralelo:
Task: "Test del cursor en tests/unit/catalog-cursor.test.ts"
Task: "Test del ordenamiento en tests/unit/catalog-ordering.test.ts"
Task: "Implementar cursor en lib/catalog/cursor.ts"
Task: "Implementar ordenamiento en lib/catalog/ordering.ts"
Task: "Implementar cliente de sesión en lib/supabase/admin-session.ts"
```

---

## Implementation Strategy

### MVP (US1)

US1 entrega el catálogo navegable con el orden por defecto, y es demostrable sola: hay contenido
que ver y se puede jugar. Ordenar y administrar son mejoras sobre eso.

1. Fase 1: Setup
2. Fase 2: Foundational
3. Fase 3: US1 → **PARAR Y VALIDAR** → desplegar

### Incremental Delivery

1. Setup + Foundational → base lista
2. US1 → catálogo navegable (MVP) → desplegar
3. US3 → contenido curado y retirada → desplegar
4. US2 → ordenamiento → desplegar

**US3 antes que US2** es deliberado, aunque el spec las empate en P2: sin contenido curado el
catálogo arranca casi vacío, y ordenar tres elementos no aporta nada. Cargar contenido vale más
que ordenarlo.

### Estrategia con un solo desarrollador

Las marcas `[P]` no reparten trabajo entre personas: señalan qué tareas no se pisan entre sí.

---

## Notes

- **Un commit por tarea**, con Conventional Commits y el ID como scope:
  `feat(T014): implementar endpoint de listado del catalogo`.
- **La migración no se despliega sola.** Antes de mergear T004–T007, aplicarla con
  `supabase db push`. Esta toca una función y una política que ya están en producción.
- **Esta feature modifica 001 y 002 en cuatro puntos**, y ninguno es opcional: `create_room`
  (T006, contador), los índices de 002 (T005, desempate), la política RLS de `puzzles` (T007,
  excluir retirados) y `POST /api/puzzles` (T032, forzar público para administradores).
- **El rol de administrador nunca se lee de `user_metadata`.** Es la única regla de esta feature
  que, si se rompe, entrega el rol a cualquiera con una llamada del SDK desde la consola del
  navegador. T027 la prueba explícitamente.
- `npm test` debe seguir corriendo sin infraestructura. `npm run test:db` requiere
  `supabase start`.
- Esta feature no añade ninguna variable de entorno.
