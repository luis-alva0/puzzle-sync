---

description: "Task list for 002-crear-rompecabezas-desde-foto"
---

# Tasks: Creación de un Rompecabezas a partir de una Foto

**Input**: Design documents from `/specs/002-crear-rompecabezas-desde-foto/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/)

**Tests**: Incluidos donde el Principio VI (v1.2.0) los exige, y **se prueba donde la lógica vive**. A diferencia de 001, aquí casi toda la lógica crítica está en TypeScript, así que sus pruebas son unitarias y sin infraestructura: generador determinista, elección de cuadrícula y validación de archivo. Solo el flujo de subida necesita integración.

**Organization**: Agrupadas por historia de usuario. La Fase 7 no corresponde a ninguna historia: es el trabajo transversal de las formas irregulares, que además toca la feature 001.

**Base existente**: esta feature parte de 001 ya implementada. Reutiliza `lib/api/errors.ts`, `lib/supabase/server.ts`, `lib/format/datetime.ts` y la sesión anónima, y **extiende** la tabla `puzzles` en lugar de crearla.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Puede ejecutarse en paralelo (archivos distintos, sin dependencias pendientes)
- **[Story]**: Historia de usuario (US1–US4)
- Cada tarea indica la ruta exacta del archivo

---

## Phase 1: Setup

**Purpose**: Dependencia nueva y tipos compartidos.

- [ ] T001 Instalar `react-easy-crop` con `npm install react-easy-crop` y registrar en `package.json`. La justificación exigida por el Principio I ya está escrita en [research.md](./research.md) R2
- [ ] T002 [P] Definir los tipos de generación en `types/puzzle.ts`: `Edge`, `EdgeGrid`, `PieceEdges`, `GridDimensions`, y la constante `PIECE_COUNT_OPTIONS = [20, 50, 100, 200, 500]`
- [ ] T003 [P] Extender `types/api.ts` con el contrato de `POST /api/puzzles` (`CreatePuzzleResponse`) y añadir `INVALID_FILE_TYPE`, `FILE_TOO_LARGE` e `INVALID_PIECE_COUNT` a `ErrorCode` y a `ERROR_STATUS`, según [contracts/rest-api.md](./contracts/rest-api.md)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Esquema, almacenamiento y las dos funciones puras que el endpoint necesita para existir.

**⚠️ CRITICAL**: Ninguna historia puede empezar hasta que esta fase esté completa.

- [ ] T004 Crear la migración `supabase/migrations/0008_puzzles_from_photo.sql` con el `ALTER TABLE` de `puzzles`: `nominal_piece_count`, `visibility`, `storage_path`, `play_count` y `source`, con sus `CHECK`, según [data-model.md](./data-model.md)
- [ ] T005 Añadir en la misma migración la actualización de las filas de la semilla (`nominal_piece_count := piece_count`, `visibility := 'public'`, `source := 'seed'`) **antes** de aplicar los `NOT NULL`, o la migración fallará sobre datos existentes
- [ ] T006 Añadir en la misma migración los índices parciales `(visibility, created_at desc)` y `(visibility, play_count desc)` sobre `where visibility = 'public'`, que consumirá la feature 003
- [ ] T007 Crear el bucket privado `puzzle-images` en la misma migración, con límite de 10 MB y tipos MIME `image/jpeg` e `image/png`, de forma idempotente
- [ ] T008 Restringir en la misma migración la política de lectura de `puzzles` que creó 001: pasa de toda la tabla a solo `visibility = 'public'`. Sin esto, cualquiera con la llave anónima podría enumerar los rompecabezas privados
- [ ] T009 Añadir en `supabase/migrations/0008_puzzles_from_photo.sql` la política de lectura del bucket, que permite `select` sobre los objetos cuyo primer segmento de ruta corresponde a un rompecabezas existente
- [ ] T010 [P] Test de elección de cuadrícula en `tests/unit/grid.test.ts`: las cinco opciones sobre varias relaciones de aspecto, piezas lo más cuadradas posible, nunca menos de 2 filas o columnas, y determinismo ante las mismas entradas
- [ ] T011 [P] Test de validación de archivo en `tests/unit/validate-upload.test.ts`: números mágicos de JPG y PNG, rechazo de PDF y de un PDF renombrado a `.jpg`, límite de 10 MB **inclusive**, rechazo a 10 MB + 1 byte, y rechazo de un JPEG truncado
- [ ] T012 Implementar `chooseGrid(targetPieces, cropWidth, cropHeight)` en `lib/puzzle-generation/grid.ts` como función pura, según [contracts/piece-generation.md](./contracts/piece-generation.md)
- [ ] T013 Implementar la validación de archivo en `lib/upload/validate.ts`: tipo por números mágicos, tamaño real y lectura de dimensiones de la cabecera. Vive fuera del route handler precisamente para poder probarla sin montar una petición HTTP
- [ ] T014 Implementar el helper de Storage en `lib/storage/upload.ts` con `uploadPuzzleImage(puzzleId, bytes, contentType)` y `deletePuzzleImage(puzzleId)`, usando `service_role` desde `lib/supabase/server.ts`

**Checkpoint**: esquema migrado, bucket listo, y las funciones puras que el endpoint necesita, probadas.

---

## Phase 3: User Story 1 - Convertir una foto en un rompecabezas jugable (Priority: P1) 🎯 MVP

**Goal**: Subir una foto, elegir cuántas piezas y obtener un enlace único a un rompecabezas guardado de forma permanente, sin cuenta.

**Independent Test**: Subir un JPG válido, elegir 100 piezas, confirmar, y verificar que se obtiene un enlace que abre un rompecabezas generado a partir de esa foto; comprobar en la base de datos que la fila tiene `source = 'user_photo'` y `visibility = 'private'`.

### Implementation for User Story 1

- [ ] T015 [US1] Implementar `POST /api/puzzles` en `app/api/puzzles/route.ts`: lectura del `FormData` **en streaming** cortando al superar 10 MB, validación con `lib/upload/validate.ts`, cálculo de la cuadrícula en el servidor, subida a Storage e inserción de la fila
- [ ] T016 [US1] Generar el UUID por adelantado en `app/api/puzzles/route.ts`, para usarlo como carpeta en Storage antes de que exista la fila
- [ ] T017 [US1] Implementar el borrado compensatorio en `app/api/puzzles/route.ts`: si la inserción falla tras una subida correcta, borrar el objeto. Storage y Postgres no comparten transacción (FR-033)
- [ ] T018 [P] [US1] Crear el selector de cantidad de piezas en `components/PieceCountSelector.tsx` con las cinco opciones y la **cantidad real** calculada con `chooseGrid`, visible antes de confirmar (FR-019)
- [ ] T019 [P] [US1] Crear la presentación del resultado en `components/PuzzleLinkResult.tsx`: enlace, acción de copiar, y la advertencia de que sin cuenta el enlace es la única vía de acceso (FR-026)
- [ ] T020 [US1] Crear la pantalla de creación en `app/puzzles/create/page.tsx` con los pasos subir → configurar → resultado, y el envío del `FormData` al endpoint
- [ ] T021 [US1] Implementar en la pantalla la selección de archivo y su lectura como `File`, sin subirlo todavía: el envío ocurre al confirmar
- [ ] T022 [US1] Añadir un enlace desde `app/page.tsx` a `/puzzles/create`, para que la pantalla sea alcanzable

**Checkpoint**: US1 funciona sola. Una foto se convierte en un rompecabezas con enlace permanente.

---

## Phase 4: User Story 2 - Ajustar el encuadre antes de generar (Priority: P2)

**Goal**: El jugador recorta la foto dentro de la aplicación y el rompecabezas se construye solo con la porción elegida.

**Independent Test**: Subir una foto vertical, mover y redimensionar el marco de recorte, confirmar, y verificar que la imagen almacenada corresponde exactamente a la porción seleccionada y no a la imagen completa.

### Implementation for User Story 2

- [ ] T023 [US2] Crear el componente de encuadre en `components/ImageCropper.tsx` sobre `react-easy-crop`, con arrastre, zoom y marco redimensionable, devolviendo las coordenadas de recorte en píxeles de la imagen original
- [ ] T024 [US2] Implementar el recorte real en `components/ImageCropper.tsx`: dibujar la región seleccionada en un canvas y exportarla como `Blob`. La biblioteca solo da coordenadas; el recorte es código propio
- [ ] T025 [US2] Aplicar en `components/ImageCropper.tsx` un encuadre por defecto que abarque la mayor porción posible cuando el jugador no lo toca (FR-014)
- [ ] T026 [US2] Exigir en `components/ImageCropper.tsx` un área de recorte mínima utilizable antes de permitir continuar (FR-015)
- [ ] T027 [US2] Integrar el encuadre como paso intermedio en `app/puzzles/create/page.tsx`, y permitir volver atrás para subir otra foto sin reiniciar la aplicación

**Checkpoint**: US1 y US2 funcionan. El jugador controla qué porción de su foto se convierte en rompecabezas.

---

## Phase 5: User Story 3 - Rechazo claro de archivos no válidos (Priority: P2)

**Goal**: Un archivo no admitido se rechaza de inmediato y con un motivo específico, sin crear nada.

**Independent Test**: Intentar subir un PDF y una imagen de 15 MB, y verificar que ambos son rechazados con mensajes **distintos** y específicos, y que no se creó ningún rompecabezas. Repetirlo con `curl` directo al endpoint, saltándose el navegador.

### Implementation for User Story 3

- [ ] T028 [US3] Añadir validación en el navegador en `app/puzzles/create/page.tsx`: tipo y tamaño antes de enviar, para dar respuesta inmediata. Es cortesía, **no** frontera de confianza
- [ ] T029 [US3] Mostrar mensajes diferenciados por código de error en `app/puzzles/create/page.tsx`, conmutando sobre `code` y nunca sobre el texto: `INVALID_FILE_TYPE` indica los formatos admitidos, `FILE_TOO_LARGE` indica el límite
- [ ] T030 [US3] Permitir en `app/puzzles/create/page.tsx` reintentar con otro archivo tras un rechazo, sin reiniciar el flujo (FR-010)
- [ ] T031 [US3] Verificar por la ruta completa —de `app/puzzles/create/page.tsx` a `app/api/puzzles/route.ts`— el rechazo de un archivo con extensión válida y contenido ilegible, no solo en la prueba unitaria (FR-008)
- [ ] T032 [US3] Verificar con `curl` directo al endpoint, declarando `type=image/jpeg` sobre un PDF, que el servidor lo rechaza igualmente. Es la comprobación que demuestra que la validación no mira el `Content-Type`

**Checkpoint**: las tres primeras historias funcionan. El flujo resiste entradas reales y malintencionadas.

---

## Phase 6: User Story 4 - Privado por defecto, público solo si el jugador lo decide (Priority: P3)

**Goal**: La foto personal no queda expuesta salvo que el jugador lo pida explícitamente, y la decisión es irreversible.

**Independent Test**: Crear un rompecabezas dejando la opción por defecto y verificar `visibility = 'private'`; crear otro marcándolo público y verificar `visibility = 'public'`. Comprobar que no existe ninguna interfaz para cambiar la visibilidad después.

### Implementation for User Story 4

- [ ] T033 [US4] Añadir la opción de hacer público en `components/PieceCountSelector.tsx` o en el paso de configuración de `app/puzzles/create/page.tsx`, **desmarcada por defecto** (FR-028)
- [ ] T034 [US4] Mostrar en `app/puzzles/create/page.tsx`, junto a esa opción, la advertencia de que un rompecabezas público será visible para cualquiera y de que la decisión no se puede revertir (FR-029d)
- [ ] T035 [US4] Enviar `isPublic` en el `FormData` y traducirlo a `visibility` en `app/api/puzzles/route.ts`, con `'private'` cuando el campo falta
- [ ] T036 [US4] Verificar que no existe ningún camino de escritura que modifique `visibility` tras la creación (FR-029c): revisar el endpoint y confirmar que la ausencia de ese camino es la restricción

**Checkpoint**: las cuatro historias funcionan. La feature está completa a nivel de producto.

---

## Phase 7: Formas irregulares de pieza (transversal)

**Purpose**: El generador determinista que pediste en el plan. No corresponde a ninguna historia del spec: es una mejora visual que atraviesa esta feature y **modifica la 001**.

**⚠️ Toca código ya entregado**: `components/BoardCanvas.tsx` es de la feature 001 y está en producción.

- [ ] T037 [P] Test del generador pseudoaleatorio en `tests/unit/prng.test.ts`: `splitmix32` y `seedFromUuid` producen la misma secuencia ante la misma semilla, secuencias distintas ante semillas distintas, y no usan coma flotante
- [ ] T038 [P] Test de la rejilla de bordes en `tests/unit/edges.test.ts`: determinismo ante la misma semilla, perímetro recto, y —lo más importante— que el borde derecho de una pieza y el izquierdo de su vecina **son el mismo borde**, no dos cálculos que casualmente coinciden
- [ ] T039 Implementar `splitmix32` y `seedFromUuid` en `lib/puzzle-generation/prng.ts`. `Math.random`, `Date` y la iteración sobre claves de objeto quedan prohibidos en todo el módulo: romper esa regla hace que dos jugadores vean tableros distintos sin ningún error visible
- [ ] T040 Implementar `buildEdgeGrid(seed, rows, cols)` y `pieceEdges(grid, row, col)` en `lib/puzzle-generation/edges.ts`, generando cada borde interior **una sola vez** y leyéndolo desde ambos lados
- [ ] T041 Implementar `piecePath(edges, size)` en `lib/puzzle-generation/path.ts`, trazando las lengüetas con curvas de Bézier y devolviendo un `Path2D` cerrado
- [ ] T042 Añadir a `tests/unit/edges.test.ts` una instantánea de la rejilla para un UUID fijo. Si el algoritmo cambia, este test **debe** fallar: cambiar la generación rompe los rompecabezas ya creados, que se dibujarían distintos a como se crearon
- [ ] T043 Modificar `components/BoardCanvas.tsx` para recortar cada pieza con su `Path2D` y pintar una región de imagen **mayor** que la celda, porque las lengüetas sobresalen; trazar el contorno con el path en lugar de `strokeRect`
- [ ] T044 Verificar en `app/rooms/[code]/page.tsx` que los rompecabezas de la semilla de 001 se siguen viendo correctamente tras el cambio de `components/BoardCanvas.tsx`: su perímetro es recto y las piezas interiores ahora tendrán lengüetas

**Checkpoint**: los rompecabezas se ven como rompecabezas de verdad, y todos los jugadores ven exactamente las mismas formas.

---

## Phase 8: Polish & Cross-Cutting Concerns

- [ ] T045 [P] Test de integración del flujo completo en `tests/integration/create-puzzle.test.ts`: subida, fila creada con los valores correctos, objeto presente en Storage y enlace devuelto
- [ ] T046 [P] Añadir a `tests/integration/create-puzzle.test.ts` el caso de visibilidad: privada por defecto, pública solo al marcarla
- [ ] T047 Añadir a `tests/integration/create-puzzle.test.ts` el caso del objeto huérfano: forzar el fallo de la inserción y verificar que el objeto subido se borró
- [ ] T048 [P] Añadir estados de carga y de error a `app/puzzles/create/page.tsx`, incluida la interrupción de la subida por pérdida de conexión
- [ ] T049 [P] Añadir etiquetas ARIA y navegación por teclado a los controles de creación en `components/`, con especial atención al marco de recorte, que es el menos accesible
- [ ] T050 Medir el proceso completo desde `app/puzzles/create/page.tsx` y confirmar SC-001 (< 60 s sin contar el encuadre) y SC-002 (generación < 15 s con 500 piezas y una foto de 10 MB)
- [ ] T051 Ejecutar `npm run build` y `npm run check:secrets`, confirmando que la llave de servicio no llega al bundle pese a los nuevos módulos de servidor
- [ ] T052 Ejecutar la validación completa descrita en [quickstart.md](./quickstart.md), los 6 escenarios de principio a fin
- [ ] T053 Revisar el cumplimiento de la constitución antes del merge: dependencia nueva justificada por escrito, sin secretos, formato de error uniforme en el endpoint nuevo, y `npm test` en verde

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Fase 1)**: sin dependencias
- **Foundational (Fase 2)**: depende de Setup — **bloquea todas las historias**
- **US1 (Fase 3)**: depende de Fase 2
- **US2 (Fase 4)**: depende de US1 — el encuadre se inserta como paso del flujo que US1 crea
- **US3 (Fase 5)**: depende de US1 — hay que tener un flujo que rechace entradas
- **US4 (Fase 6)**: depende de US1 — la visibilidad es un campo del formulario de creación
- **Fase 7 (formas irregulares)**: depende solo de Fase 1 (los tipos). Se puede abordar en cualquier momento tras el Setup, incluso antes que US1
- **Polish (Fase 8)**: depende de las historias que se decida entregar

### Orden dentro de la migración

`0008_puzzles_from_photo.sql` es un solo archivo, y las tareas T004–T009 son secciones suyas en
este orden obligatorio:

```text
ALTER TABLE (columnas nullable) → UPDATE de las filas de la semilla → SET NOT NULL
  → índices → bucket → políticas
```

Invertir los dos primeros pasos hace fallar la migración sobre los datos que 001 ya sembró.

### Parallel Opportunities

- Fase 1: T002 y T003 en paralelo tras T001
- Fase 2: T010 y T011 en paralelo; T012, T013 y T014 en paralelo entre sí
- US1: T018 y T019 en paralelo
- Fase 7: T037 y T038 en paralelo; luego T039 → T040 → T041 en secuencia (cada uno usa el anterior)
- Fase 8: T045, T046, T048 y T049 en paralelo

---

## Parallel Example: Foundational

```bash
# Tras la migración (T004–T009), en paralelo:
Task: "Test de elección de cuadrícula en tests/unit/grid.test.ts"
Task: "Test de validación de archivo en tests/unit/validate-upload.test.ts"
Task: "Implementar chooseGrid en lib/puzzle-generation/grid.ts"
Task: "Implementar la validación en lib/upload/validate.ts"
Task: "Implementar el helper de Storage en lib/storage/upload.ts"
```

---

## Implementation Strategy

### MVP (US1)

Aquí el MVP sí es **una sola historia**, a diferencia de 001. US1 entrega el recorrido completo
—foto dentro, enlace fuera— y es demostrable por sí sola: el encuadre por defecto abarca la
imagen completa, así que el rompecabezas resultante es utilizable sin US2.

1. Fase 1: Setup
2. Fase 2: Foundational
3. Fase 3: US1 → **PARAR Y VALIDAR** → desplegar

### Incremental Delivery

1. Setup + Foundational → base lista
2. US1 → foto a rompecabezas con enlace (MVP) → desplegar
3. US3 → resiste entradas reales y maliciosas → desplegar
4. US2 → el jugador controla el encuadre → desplegar
5. US4 → visibilidad, que además desbloquea la feature 003 → desplegar
6. Fase 7 → los rompecabezas se ven como rompecabezas

**US3 antes que US2** es deliberado: rechazar bien un HEIC de iPhone o una foto de 12 MB importa
más, y llega antes, que afinar el encuadre. Las prioridades del spec las empatan en P2.

### Estrategia con un solo desarrollador

Las marcas `[P]` no reparten trabajo entre personas: señalan qué tareas no se pisan entre sí y
pueden abordarse en cualquier orden dentro de su fase.

---

## Notes

- **Un commit por tarea**, con Conventional Commits y el ID como scope:
  `feat(T015): implementar endpoint de creacion de rompecabezas`.
- **La migración no se despliega sola.** Antes de mergear T004–T009, aplicarla con
  `supabase db push`. Y esta migración toca datos existentes, así que conviene probarla contra una
  copia antes que contra producción.
- **La Fase 7 modifica la feature 001.** No es una tarea aislada: cambia cómo se pinta el tablero
  para todos los rompecabezas, incluidos los que ya existen.
- `npm test` debe seguir corriendo sin infraestructura. `npm run test:db` requiere
  `supabase start`.
- Nunca commitear valores reales de variables de entorno. Esta feature no añade ninguna nueva.
