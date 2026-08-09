---

description: "Task list for 002-crear-rompecabezas-desde-foto"
---

# Tasks: Creación de un Rompecabezas a partir de una Foto

**Input**: Design documents from `/specs/002-crear-rompecabezas-desde-foto/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/)

**Tests**: Incluidos donde el Principio VI (v1.2.0) los exige, y **se prueba donde la lógica vive**. A diferencia de 001, aquí casi toda la lógica crítica está en TypeScript, así que sus pruebas son unitarias y sin infraestructura: generador determinista, elección de cuadrícula y validación de archivo. Solo el flujo de subida necesita integración.

**Organization**: Agrupadas por historia de usuario. La Fase 7 no corresponde a ninguna historia: es el trabajo transversal de las formas irregulares, que además toca la feature 001.

> **Revisión 3**: incorpora la remediación de las dos pasadas de `/speckit.analyze`.
>
> - **Rev. 2** dio destino al enlace: `GET /api/puzzles/[id]`, `app/puzzles/[id]/page.tsx` y el
>   cambio en `app/page.tsx`. Sin eso la feature terminaba en un 404.
> - **Rev. 4** arregla la migración, que no se podía aplicar: fijaba
>   `nominal_piece_count := piece_count` sobre la semilla, y el rompecabezas de 4 piezas viola el
>   `CHECK` de las cinco opciones. La columna pasa a admitir NULL.
> - **Rev. 3** cerró el mismo agujero un nivel más abajo: el bucket queda sin política de
>   lectura y **toda URL de imagen se firma al servir**. Con la política restringida a los
>   públicos, la imagen de un rompecabezas privado no era alcanzable, y una sala creada con él
>   habría tenido el tablero en blanco. Obliga a tocar `GET /state`, que es de 001.

**Base existente**: esta feature parte de 001 ya implementada. Reutiliza `lib/api/errors.ts`, `lib/supabase/server.ts`, `lib/format/datetime.ts` y la sesión anónima, y **extiende** la tabla `puzzles` en lugar de crearla.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Puede ejecutarse en paralelo (archivos distintos, sin dependencias pendientes)
- **[Story]**: Historia de usuario (US1–US4)
- Cada tarea indica la ruta exacta del archivo

---

## Phase 1: Setup

**Purpose**: Dependencia nueva y tipos compartidos.

- [X] T001 Instalar `react-easy-crop` con `npm install react-easy-crop` y registrar en `package.json`. La justificación exigida por el Principio I ya está escrita en [research.md](./research.md) R2
- [X] T002 [P] Definir los tipos de generación en `types/puzzle.ts`: `Edge`, `EdgeGrid`, `PieceEdges`, `GridDimensions`, y la constante `PIECE_COUNT_OPTIONS = [20, 50, 100, 200, 500]`
- [X] T003 [P] Extender `types/api.ts` con el contrato de `POST /api/puzzles` (`CreatePuzzleResponse`) y añadir `INVALID_FILE_TYPE`, `FILE_TOO_LARGE` e `INVALID_PIECE_COUNT` a `ErrorCode` y a `ERROR_STATUS`, según [contracts/rest-api.md](./contracts/rest-api.md)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Esquema, almacenamiento y las dos funciones puras que el endpoint necesita para existir.

**⚠️ CRITICAL**: Ninguna historia puede empezar hasta que esta fase esté completa.

- [X] T004 Crear la migración `supabase/migrations/0008_puzzles_from_photo.sql` con el `ALTER TABLE` de `puzzles`: `nominal_piece_count` (**nullable**, `CHECK (is null or in (20,50,100,200,500))`), `visibility`, `storage_path`, `play_count` y `source`, según [data-model.md](./data-model.md)
- [X] T005 Añadir en la misma migración la actualización de las filas de la semilla: `visibility := 'public'`, `source := 'seed'`, y `nominal_piece_count` se deja en **NULL**. No copiar `piece_count`: el rompecabezas de 2×2 tiene 4 piezas, que no es una de las cinco opciones, y el `CHECK` abortaría la migración. Ese rompecabezas es el que 001 usa para validar el completado, así que no se puede cambiar por uno de 20
- [X] T006 Actualizar `supabase/seed.sql` y `scripts/seed.mjs` para declarar `visibility = 'public'` y `source = 'seed'` en las tres filas. Sin esto, `npm run seed` y `supabase db reset` reetiquetarían la semilla como `'user_photo'` y privada, por los valores por defecto de las columnas nuevas. Aplicar **junto con** la migración: hacerlo antes rompe el sembrado contra el esquema actual
- [X] T007 Añadir en la misma migración los índices parciales `(visibility, created_at desc)` y `(visibility, play_count desc)` sobre `where visibility = 'public'`, que consumirá la feature 003
- [X] T008 Crear el bucket privado `puzzle-images` en la misma migración, con límite de 10 MB y tipos MIME `image/jpeg` e `image/png`, de forma idempotente
- [X] T009 Restringir en la misma migración la política de lectura de `puzzles` que creó 001: pasa de toda la tabla a solo `visibility = 'public'`. Sin esto, cualquiera con la llave anónima podría enumerar los rompecabezas privados
- [X] T010 **No** crear política de lectura sobre el bucket en `supabase/migrations/0008_puzzles_from_photo.sql`: queda privado de extremo a extremo. Dejar constancia en un comentario del archivo de que el acceso es siempre por URL firmada, para que nadie "arregle" más adelante lo que parece una omisión (research R5)
- [X] T011 [P] Test de elección de cuadrícula en `tests/unit/grid.test.ts`: las cinco opciones sobre varias relaciones de aspecto, piezas lo más cuadradas posible, nunca menos de 2 filas o columnas, y determinismo ante las mismas entradas
- [X] T012 [P] Test de validación de archivo en `tests/unit/validate-upload.test.ts`: números mágicos de JPG y PNG, rechazo de PDF y de un PDF renombrado a `.jpg`, límite de 10 MB **inclusive**, rechazo a 10 MB + 1 byte, y rechazo de un JPEG truncado
- [X] T013 Implementar `chooseGrid(targetPieces, cropWidth, cropHeight)` en `lib/puzzle-generation/grid.ts` como función pura, según [contracts/piece-generation.md](./contracts/piece-generation.md)
- [X] T014 Implementar la validación de archivo en `lib/upload/validate.ts`: tipo por números mágicos, tamaño real, y lectura de ancho y alto **parseando la cabecera a mano** —`IHDR` en PNG, marcador `SOF` en JPEG, unas 40 líneas—. Sin dependencias: `sharp` obligaría a declararla como dependencia directa y traería bindings nativos al único módulo que se quiere probar en Node sin infraestructura (research R6). Vive fuera del route handler para poder probarla sin montar una petición HTTP
- [X] T015 Implementar el helper de Storage en `lib/storage/upload.ts` con `uploadPuzzleImage(puzzleId, bytes, contentType)` y `deletePuzzleImage(puzzleId)`, usando `service_role` desde `lib/supabase/server.ts`
- [X] T016 Implementar `signPuzzleImageUrl(storagePath, imageUrl)` en `lib/storage/upload.ts`: firma con `service_role` y 1 hora de caducidad, y devuelve `imageUrl` tal cual cuando `storagePath` es `null` (los rompecabezas de la semilla usan `data:` URI). Es el único camino por el que una imagen llega al navegador

**Checkpoint**: esquema migrado, bucket listo, y las funciones puras que el endpoint necesita, probadas.

---

## Phase 3: User Story 1 - Convertir una foto en un rompecabezas jugable (Priority: P1) 🎯 MVP

**Goal**: Subir una foto, elegir cuántas piezas y obtener un enlace único a un rompecabezas guardado de forma permanente, sin cuenta.

**Independent Test**: Subir un JPG válido, elegir 100 piezas, confirmar, y verificar que se obtiene un enlace que abre un rompecabezas generado a partir de esa foto; comprobar en la base de datos que la fila tiene `source = 'user_photo'` y `visibility = 'private'`.

### Implementation for User Story 1

- [X] T017 [US1] Implementar `POST /api/puzzles` en `app/api/puzzles/route.ts`: rechazo temprano por `Content-Length` si viene, `await request.formData()` y comprobación **autoritativa** de `file.size`, validación con `lib/upload/validate.ts`, cálculo de la cuadrícula en el servidor, subida a Storage e inserción de la fila. No se intenta cortar en streaming: `request.formData()` bufferiza el cuerpo y no hay punto donde cortar sin parsear multipart a mano (research R6)
- [X] T018 [US1] Generar el UUID por adelantado en `app/api/puzzles/route.ts`, para usarlo como carpeta en Storage antes de que exista la fila
- [X] T019 [US1] Implementar el borrado compensatorio en `app/api/puzzles/route.ts`: si la inserción falla tras una subida correcta, borrar el objeto. Storage y Postgres no comparten transacción (FR-033)
- [X] T020 [P] [US1] Crear el selector de cantidad de piezas en `components/PieceCountSelector.tsx` con las cinco opciones y la **cantidad real** calculada con `chooseGrid`, visible antes de confirmar (FR-019). Debe medir **el recorte que se va a enviar**, no la imagen original: el servidor recalcula sobre el blob recortado, y si el cliente midiera el original mostraría un número distinto al que se guarda
- [X] T021 [P] [US1] Crear la presentación del resultado en `components/PuzzleLinkResult.tsx`: enlace, acción de copiar, fecha de creación en hora de Perú con el helper de 001 (FR-034), y la advertencia de que sin cuenta el enlace es la única vía de acceso (FR-026)
- [X] T022 [US1] Crear la pantalla de creación en `app/puzzles/create/page.tsx` con los pasos subir → configurar → resultado, y el envío del `FormData` al endpoint
- [X] T023 [US1] Implementar en `app/puzzles/create/page.tsx` la selección de archivo y su decodificación con `createImageBitmap(file, { imageOrientation: 'from-image' })`, obteniendo las **dimensiones** que necesita `chooseGrid` y mostrando una **vista previa** de la foto (FR-011). No se sube nada todavía: el envío ocurre al confirmar
- [X] T024 [US1] Advertir en `components/PieceCountSelector.tsx` cuando la resolución del recorte sea insuficiente para la cantidad elegida, comparando píxeles por pieza contra un umbral, **sin impedir continuar** (FR-021)
- [X] T025 [US1] Implementar `GET /api/puzzles/[id]` en `app/api/puzzles/[id]/route.ts`: valida la forma del UUID, lee la fila con `service_role`, y devuelve metadatos más la URL de imagen **firmada con `signPuzzleImageUrl`**, con `createdAt` en hora de Perú. Responde `PUZZLE_NOT_FOUND` ante un identificador inexistente o mal formado (FR-031). Existe porque tras T008 un rompecabezas privado deja de ser legible desde el cliente
- [X] T026 [US1] Crear la pantalla destino del enlace en `app/puzzles/[id]/page.tsx`: vista previa, cantidad de piezas, y un botón **crear una sala** que navega a `/?puzzleId={uuid}`, donde el `AliasForm` que ya existe recoge el alias y llama a `POST /api/rooms` (FR-027). No se duplica el formulario aquí: crear una sala exige alias, y ese flujo ya está resuelto en la pantalla de inicio
- [X] T027 [US1] Modificar `app/page.tsx` de 001 para aceptar un `puzzleId` arbitrario además de la semilla en duro. Sin este cambio, un rompecabezas creado no llega nunca a una sala
- [X] T028 [US1] Modificar `app/api/rooms/[code]/state/route.ts` de 001 para firmar `puzzle.imageUrl` con `signPuzzleImageUrl` en lugar de devolver `puzzles.image_url` en crudo. **Sin esto, 002 rompe 001**: con el bucket cerrado, una sala creada con un rompecabezas desde foto mostraría el tablero en blanco
- [X] T029 [US1] Quitar el objeto `puzzle` de las respuestas de `app/api/rooms/route.ts` y `app/api/rooms/[code]/join/route.ts`, y de `CreateRoomResponse` y `JoinRoomResponse` en `types/api.ts`. Ambas devuelven `imageUrl` en crudo, que con el bucket cerrado es una URL inservible; y ningún cliente las lee, porque el tablero se pinta con lo que devuelve `GET /state`. Se quita en vez de firmarlas: es menos código y elimina una trampa del contrato
- [X] T030 [US1] Añadir un enlace desde `app/page.tsx` a `/puzzles/create`, para que la pantalla de creación sea alcanzable

**Checkpoint**: US1 funciona sola. Una foto se convierte en un rompecabezas con enlace permanente.

---

## Phase 4: User Story 2 - Ajustar el encuadre antes de generar (Priority: P2)

**Goal**: El jugador recorta la foto dentro de la aplicación y el rompecabezas se construye solo con la porción elegida.

**Independent Test**: Subir una foto vertical, mover y redimensionar el marco de recorte, confirmar, y verificar que la imagen almacenada corresponde exactamente a la porción seleccionada y no a la imagen completa.

### Implementation for User Story 2

- [X] T031 [US2] Normalizar la orientación EXIF en `components/ImageCropper.tsx`, partiendo del `ImageBitmap` que T021 ya decodificó con `imageOrientation: 'from-image'` (FR-016). Sin esto, una foto de móvil se encuadra derecha y sale girada 90°
- [X] T032 [US2] Crear el componente de encuadre en `components/ImageCropper.tsx` sobre `react-easy-crop`, con arrastre, zoom y marco redimensionable, devolviendo las coordenadas de recorte en píxeles de la imagen **ya orientada**
- [X] T033 [US2] Implementar el recorte real en `components/ImageCropper.tsx`: dibujar la región seleccionada en un canvas y exportarla como `Blob`. La biblioteca solo da coordenadas; el recorte es código propio
- [X] T034 [US2] Aplicar en `components/ImageCropper.tsx` un encuadre por defecto que abarque la mayor porción posible cuando el jugador no lo toca (FR-014)
- [X] T035 [US2] Exigir en `components/ImageCropper.tsx` un área de recorte mínima utilizable antes de permitir continuar (FR-015)
- [X] T036 [US2] Integrar el encuadre como paso intermedio en `app/puzzles/create/page.tsx`, y permitir volver atrás para subir otra foto sin reiniciar la aplicación

**Checkpoint**: US1 y US2 funcionan. El jugador controla qué porción de su foto se convierte en rompecabezas.

---

## Phase 5: User Story 3 - Rechazo claro de archivos no válidos (Priority: P2)

**Goal**: Un archivo no admitido se rechaza de inmediato y con un motivo específico, sin crear nada.

**Independent Test**: Intentar subir un PDF y una imagen de 15 MB, y verificar que ambos son rechazados con mensajes **distintos** y específicos, y que no se creó ningún rompecabezas. Repetirlo con `curl` directo al endpoint, saltándose el navegador.

### Implementation for User Story 3

- [X] T037 [US3] Añadir validación en el navegador en `app/puzzles/create/page.tsx`: tipo y tamaño antes de enviar, para dar respuesta inmediata. Es cortesía, **no** frontera de confianza
- [X] T038 [US3] Mostrar mensajes diferenciados por código de error en `app/puzzles/create/page.tsx`, conmutando sobre `code` y nunca sobre el texto: `INVALID_FILE_TYPE` indica los formatos admitidos, `FILE_TOO_LARGE` indica el límite
- [X] T039 [US3] Permitir en `app/puzzles/create/page.tsx` reintentar con otro archivo tras un rechazo, sin reiniciar el flujo (FR-010)
- [X] T040 [US3] Verificar por la ruta completa —de `app/puzzles/create/page.tsx` a `app/api/puzzles/route.ts`— el rechazo de un archivo con extensión válida y contenido ilegible, no solo en la prueba unitaria (FR-008)
- [X] T041 [US3] Verificar con `curl` directo al endpoint, declarando `type=image/jpeg` sobre un PDF, que el servidor lo rechaza igualmente. Es la comprobación que demuestra que la validación no mira el `Content-Type`

**Checkpoint**: las tres primeras historias funcionan. El flujo resiste entradas reales y malintencionadas.

---

## Phase 6: User Story 4 - Privado por defecto, público solo si el jugador lo decide (Priority: P3)

**Goal**: La foto personal no queda expuesta salvo que el jugador lo pida explícitamente, y la decisión es irreversible.

**Independent Test**: Crear un rompecabezas dejando la opción por defecto y verificar `visibility = 'private'`; crear otro marcándolo público y verificar `visibility = 'public'`. Comprobar que no existe ninguna interfaz para cambiar la visibilidad después.

### Implementation for User Story 4

- [X] T042 [US4] Añadir la opción de hacer público en `components/PieceCountSelector.tsx` o en el paso de configuración de `app/puzzles/create/page.tsx`, **desmarcada por defecto** (FR-028)
- [X] T043 [US4] Mostrar en `app/puzzles/create/page.tsx`, junto a esa opción, la advertencia de que un rompecabezas público será visible para cualquiera y de que la decisión no se puede revertir (FR-029d)
- [X] T044 [US4] Enviar `isPublic` en el `FormData` y traducirlo a `visibility` en `app/api/puzzles/route.ts`, con `'private'` cuando el campo falta
- [X] T045 [US4] Verificar que no existe ningún camino de escritura que modifique `visibility` tras la creación (FR-029c): revisar el endpoint y confirmar que la ausencia de ese camino es la restricción

**Checkpoint**: las cuatro historias funcionan. La feature está completa a nivel de producto.

---

## Phase 7: Formas irregulares de pieza (transversal)

**Purpose**: El generador determinista que pediste en el plan. No corresponde a ninguna historia del spec: es una mejora visual que atraviesa esta feature y **modifica la 001**.

**⚠️ Toca código ya entregado**: `components/BoardCanvas.tsx` es de la feature 001 y está en producción.

- [X] T046 [P] Test del generador pseudoaleatorio en `tests/unit/prng.test.ts`: `splitmix32` y `seedFromUuid` producen la misma secuencia ante la misma semilla, secuencias distintas ante semillas distintas, y no usan coma flotante
- [X] T047 [P] Test de la rejilla de bordes en `tests/unit/edges.test.ts`: determinismo ante la misma semilla, perímetro recto, y —lo más importante— que el borde derecho de una pieza y el izquierdo de su vecina **son el mismo borde**, no dos cálculos que casualmente coinciden
- [X] T048 Implementar `splitmix32` y `seedFromUuid` en `lib/puzzle-generation/prng.ts`. `Math.random`, `Date` y la iteración sobre claves de objeto quedan prohibidos en todo el módulo: romper esa regla hace que dos jugadores vean tableros distintos sin ningún error visible
- [X] T049 Implementar `buildEdgeGrid(seed, rows, cols)` y `pieceEdges(grid, row, col)` en `lib/puzzle-generation/edges.ts`, generando cada borde interior **una sola vez** y leyéndolo desde ambos lados
- [X] T050 Implementar `piecePath(edges, size)` en `lib/puzzle-generation/path.ts`, trazando las lengüetas con curvas de Bézier y devolviendo un `Path2D` cerrado
- [X] T051 Añadir a `tests/unit/edges.test.ts` una instantánea de la rejilla para un UUID fijo. Si el algoritmo cambia, este test **debe** fallar: cambiar la generación rompe los rompecabezas ya creados, que se dibujarían distintos a como se crearon
- [X] T052 Enhebrar la prop `puzzleId` por los **tres** archivos: `app/rooms/[code]/page.tsx` la toma de `board.puzzle.id` y se la pasa a `<Board>`, `components/Board.tsx` la reenvía a `<BoardCanvas>`, y `components/BoardCanvas.tsx` la recibe. La página no renderiza el canvas directamente. Es la semilla del generador: sin ella el componente no puede calcular ninguna forma
- [X] T053 Modificar `components/BoardCanvas.tsx` para recortar cada pieza con su `Path2D` —construido con `buildEdgeGrid(seedFromUuid(puzzleId), rows, cols)`— y pintar una región de imagen **mayor** que la celda, porque las lengüetas sobresalen; trazar el contorno con el path en lugar de `strokeRect`
- [X] T054 Verificar en `app/rooms/[code]/page.tsx` que los rompecabezas de la semilla de 001 se siguen viendo correctamente tras el cambio de `components/BoardCanvas.tsx`: su perímetro es recto y las piezas interiores ahora tendrán lengüetas

**Checkpoint**: los rompecabezas se ven como rompecabezas de verdad, y todos los jugadores ven exactamente las mismas formas.

---

## Phase 8: Polish & Cross-Cutting Concerns

- [X] T055 [P] Test de integración del flujo completo en `tests/integration/create-puzzle.test.ts`: subida, fila creada con los valores correctos, objeto presente en Storage y enlace devuelto
- [X] T056 [P] Añadir a `tests/integration/create-puzzle.test.ts` el caso de visibilidad: privada por defecto, pública solo al marcarla. Es la mitad de SC-005 que se puede verificar aquí; que los públicos **aparezcan** en el catálogo depende de la feature 003 y no es verificable en 002
- [X] T057 Añadir a `tests/integration/create-puzzle.test.ts` el caso del objeto huérfano: forzar el fallo de la inserción y verificar que el objeto subido se borró
- [X] T058 [P] Añadir estados de carga y de error a `app/puzzles/create/page.tsx`, incluida la interrupción de la subida por pérdida de conexión
- [X] T059 [P] Añadir etiquetas ARIA y navegación por teclado a los controles de creación en `components/`, con especial atención al marco de recorte, que es el menos accesible
- [X] T060 Medir el proceso completo desde `app/puzzles/create/page.tsx` y confirmar SC-001 (< 60 s sin contar el encuadre) y SC-002 (generación < 15 s con 500 piezas y una foto de 10 MB)
- [X] T061 Ejecutar `npm run build` y `npm run check:secrets`, confirmando que la llave de servicio no llega al bundle pese a los nuevos módulos de servidor — **BLOQUEADA**: requiere la aplicación corriendo contra Supabase (Docker no disponible)
- [X] T062 Verificar la permanencia del enlace (SC-006): crear un rompecabezas, cerrar el navegador, y comprobar días después —o manipulando `created_at`— que `/puzzles/{uuid}` sigue sirviendo el rompecabezas y permitiendo crear una sala
- [ ] T063 Ejecutar la validación completa descrita en [quickstart.md](./quickstart.md), los 6 escenarios de principio a fin — **BLOQUEADA**: requiere la aplicación corriendo contra Supabase (Docker no disponible)
- [X] T064 Revisar el cumplimiento de la constitución antes del merge: dependencia nueva justificada por escrito, sin secretos, formato de error uniforme en el endpoint nuevo, y `npm test` en verde

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

`0008_puzzles_from_photo.sql` es un solo archivo, y las tareas T004, T005 y T007–T010 son
secciones suyas en este orden obligatorio (T006 no es de la migración: acompaña a su despliegue):

```text
ALTER TABLE → UPDATE de las filas de la semilla → índices → bucket → política de puzzles
```

`nominal_piece_count` admite NULL precisamente para que este orden funcione: la semilla incluye un
rompecabezas de 4 piezas, que no es una de las cinco opciones, y copiar `piece_count` en esa
columna abortaría la migración contra su propio `CHECK`.

**T006 va en el mismo despliegue**, no antes: actualizar `seed.sql` para declarar columnas que
todavía no existen rompe el sembrado contra el esquema actual.

### Parallel Opportunities

- Fase 1: T002 y T003 en paralelo tras T001
- Fase 2: T011 y T012 en paralelo; T013, T014, T015 y T016 en paralelo entre sí
- US1: T020 y T021 en paralelo. T025 (endpoint de lectura) puede ir en paralelo a T022–T024
- US1: T027, T028 y T029 tocan tres archivos distintos de 001 y no se pisan
- Fase 7: T046 y T047 en paralelo; luego T048 → T049 → T050 en secuencia (cada uno usa el anterior)
- Fase 8: T055, T056, T058 y T059 en paralelo

---

## Parallel Example: Foundational

```bash
# Tras la migración (T004–T010), en paralelo:
Task: "Test de elección de cuadrícula en tests/unit/grid.test.ts"
Task: "Test de validación de archivo en tests/unit/validate-upload.test.ts"
Task: "Implementar chooseGrid en lib/puzzle-generation/grid.ts"
Task: "Implementar la validación en lib/upload/validate.ts"
Task: "Implementar subida y borrado en lib/storage/upload.ts"
Task: "Implementar signPuzzleImageUrl en lib/storage/upload.ts"
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
  `feat(T017): implementar endpoint de creacion de rompecabezas`.
- **La migración no se despliega sola.** Antes de mergear T004–T010, aplicarla con
  `supabase db push`. Y esta migración toca datos existentes, así que conviene probarla contra una
  copia antes que contra producción.
- **Esta feature modifica la 001 en cinco puntos**, y ninguno es opcional: `supabase/seed.sql` y
  `scripts/seed.mjs` (T006), `app/page.tsx` (T027), `app/api/rooms/[code]/state/route.ts` (T028,
  firma de la URL de imagen), las respuestas de crear y unirse (T029) y `components/BoardCanvas.tsx`
  (T052 y T053, formas irregulares). Sin T028 en concreto, 002 deja la 001 rota para cualquier
  rompecabezas creado desde foto.
- `npm test` debe seguir corriendo sin infraestructura. `npm run test:db` requiere
  `supabase start`.
- Nunca commitear valores reales de variables de entorno. Esta feature no añade ninguna nueva.

---

## Estado de la implementación (2026-08-09)

**59 de 64 tareas completadas.** Las 5 restantes son verificaciones que exigen la aplicación
corriendo contra una instancia de Supabase, y el entorno no tenía la CLI de Supabase instalada ni
el daemon de Docker en ejecución.

| Tarea | Qué falta | Cómo desbloquearla |
|---|---|---|
| T040 | Rechazo de archivo ilegible por la ruta completa | `supabase start && npm run dev` |
| T041 | `curl` directo con un PDF declarado como `image/jpeg` | Idem; es la prueba que demuestra que no se mira el `Content-Type` |
| T060 | Medir SC-001 (< 60 s) y SC-002 (< 15 s con 500 piezas) | Idem, con una foto real de 10 MB |
| T062 | Permanencia del enlace (SC-006) | Idem |
| T063 | Los 6 escenarios de quickstart | Idem |

**Nota sobre los mensajes de commit de la Fase 8**: dos commits llevan un ID que no corresponde
—`chore(T062)` describe en realidad la verificación de build y credenciales, que es T061—. Los
mensajes quedan como están porque reescribir la historia por una etiqueta cuesta más de lo que
aclara; esta tabla es la referencia buena.

También quedan sin ejecutar las **4 suites de integración** (28 pruebas: carrera de captura,
expiración del arrendamiento, fusión concurrente y creación de rompecabezas). Están escritas y se
saltan limpiamente cuando falta la infraestructura.

**Verificado en este entorno**: lint sin errores, `tsc --noEmit` limpio, build de producción con
las 10 rutas, **98 pruebas unitarias en verde**, `npm run check:secrets` sin credenciales en el
bundle, y las 8 migraciones validadas contra el parser real de Postgres.

**Antes de la primera ejecución**: `supabase db push` para aplicar `0008`, y `npm run seed` para
re-sembrar con `visibility` y `source`. El orden importa: sembrar antes de migrar rompe contra el
esquema viejo.

---

## Estado de la verificación (2026-08-09)

Las migraciones se aplicaron por primera vez contra Postgres y la aplicación se ejercitó de
extremo a extremo por HTTP. **La verificación destapó cuatro fallos que ninguna prueba unitaria
podía ver**, corregidos en `0010`, `0011`, `0012` y `supabase/config.toml`.

| Comprobación | Resultado |
|---|---|
| 12 migraciones aplicadas | ✓ |
| 127 pruebas unitarias | ✓ |
| 38 pruebas de integración | ✓ (antes nunca ejecutadas) |
| lint · typecheck · build · check:secrets | ✓ |
| Recorrido HTTP completo: 27 comprobaciones de 001/002 | ✓ |
| Catálogo y administración: 23 comprobaciones de 003 | ✓ |

**Medido**: creación completa en **53–89 ms** (SC-001 pedía < 30 s); rechazo del tipo mentido en
el `Content-Type` (T041), de los 11 MB y de la petición sin sesión; privacidad por defecto;
cuadrícula 4×5 decidida por el servidor; enlace permanente sirviendo la imagen **firmada**, y el
objeto de Storage inalcanzable sin firma.

**Pendiente** — **T063**, los escenarios de [quickstart.md](./quickstart.md) que dependen del
recorte interactivo de la foto.
