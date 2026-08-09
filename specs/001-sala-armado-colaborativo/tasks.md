---

description: "Task list for 001-sala-armado-colaborativo"
---

# Tasks: Armado Colaborativo en Tiempo Real dentro de una Sala

**Input**: Design documents from `/specs/001-sala-armado-colaborativo/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/)

**Tests**: Incluidos y **obligatorios** solo donde el Principio VI de la constitución los exige — emparejamiento de piezas, sincronización y reconciliación, validación de alias y generación de códigos. No hay tests de UI, de wrappers ni de andamiaje, y no se aplica TDD estricto.

**Organization**: Agrupadas por historia de usuario para que cada una se implemente, se pruebe y se demuestre por separado.

> **Revisión 2**: incorpora la remediación de los 13 hallazgos de `/speckit.analyze` (2026-08-09). Cambios estructurales respecto de la revisión 1: la suscripción base al canal de Realtime pasa a Foundational, y `release_piece` se divide entre US2 (forma mínima) y US3 (encaje y fusión). Las tareas fueron renumeradas; el total pasa de 70 a 77.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Puede ejecutarse en paralelo (archivos distintos, sin dependencias pendientes)
- **[Story]**: Historia de usuario a la que pertenece (US1–US5)
- Cada tarea indica la ruta exacta del archivo

## Path Conventions

App Router de Next.js en la raíz del repositorio: `app/`, `components/`, `lib/`, `types/`, `supabase/`, `tests/`. Sin `src/` y sin separación frontend/backend (ver Structure Decision en [plan.md](./plan.md)).

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Dejar el repositorio ejecutable y desplegable.

- [ ] T001 Inicializar repositorio Git con `git init`, crear `main` y la rama de trabajo `001-sala-armado-colaborativo`
- [ ] T002 Inicializar proyecto Next.js 15 con App Router y TypeScript en modo estricto: `package.json`, `tsconfig.json`, `next.config.ts`
- [ ] T003 [P] Configurar ESLint y Prettier en `eslint.config.mjs` y `.prettierrc`
- [ ] T004 [P] Configurar Vitest en `vitest.config.ts` con los scripts `test` (unitarias, sin infraestructura) y `test:db` (integración) en `package.json`
- [ ] T005 [P] Crear `.env.example` con `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY` sin valores, y `.gitignore` que excluya `.env*` salvo `.env.example`
- [ ] T006 Inicializar Supabase local con `supabase init`, generando `supabase/config.toml`
- [ ] T007 [P] Configurar el despliegue en Railway y declarar las tres variables de entorno en el proyecto, documentando el procedimiento en `README.md`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Esquema, seguridad, contratos y transporte compartidos que toda historia necesita.

**⚠️ CRITICAL**: Ninguna historia de usuario puede empezar hasta que esta fase esté completa.

- [ ] T008 Crear la migración del esquema inicial en `supabase/migrations/0001_initial_schema.sql` con las tablas `puzzles`, `rooms`, `room_players`, `pieces` y `game_history`, sus índices, restricciones `CHECK` e invariantes según [data-model.md](./data-model.md)
- [ ] T009 Crear la migración de seguridad en `supabase/migrations/0002_rls_policies.sql`: habilitar RLS en todas las tablas con denegación por defecto, políticas de lectura para miembros de sala, y política sobre `realtime.messages` que restringe el canal `room:{code}` a quien tenga fila en `room_players`
- [ ] T010 Añadir `pieces` y `rooms` a la publicación `supabase_realtime` en `supabase/migrations/0003_realtime_publication.sql`
- [ ] T011 [P] Crear la semilla con 3 rompecabezas de prueba (uno de 4 piezas para validar el completado) en `supabase/seed.sql`, y el script `npm run seed` en `package.json`
- [ ] T012 [P] Definir los tipos de la API en `types/api.ts`: cuerpos de petición y respuesta de los tres endpoints y la unión `ErrorCode`
- [ ] T013 [P] Definir los tipos del tablero en `types/board.ts`: `Piece`, `PieceGroup`, `BoardState`, `PlayerSummary`
- [ ] T014 [P] Definir los tipos de Realtime en `types/realtime.ts`: payloads de `piece_drag`, `piece_drop` y estado de Presence
- [ ] T015 [P] Implementar el cliente de navegador en `lib/supabase/client.ts` con la llave `anon` y establecimiento de sesión anónima vía `signInAnonymously()`
- [ ] T016 [P] Implementar el cliente de servidor en `lib/supabase/server.ts` usando `SUPABASE_SERVICE_ROLE_KEY`, con `import 'server-only'` para que un import accidental desde el cliente rompa el build
- [ ] T017 Implementar el helper de errores en `lib/api/errors.ts` que devuelve `{ error: { code, message } }` con el código HTTP correspondiente, según [contracts/rest-api.md](./contracts/rest-api.md)
- [ ] T018 [P] Implementar la geometría de la cuadrícula en `lib/puzzle/geometry.ts`: posiciones correctas por `row`/`col`, dispersión inicial y la constante de tolerancia de encaje compartida
- [ ] T019 [P] Implementar el formateo de timestamps a hora de Perú con offset fijo `-05:00` en `lib/format/datetime.ts`
- [ ] T020 Implementar la suscripción base al canal de sala en `lib/realtime/channel.ts`: conexión a `room:{code}`, ciclo de vida de la suscripción y desmontaje limpio. Broadcast y `postgres_changes` se añaden en US2
- [ ] T021 Crear el layout base y los estilos globales en `app/layout.tsx` y `app/globals.css`

**Checkpoint**: Esquema aplicado, RLS activa, tipos, clientes y canal listos. Pueden empezar las historias.

---

## Phase 3: User Story 1 - Crear una sala e invitar a otro jugador (Priority: P1)

**Goal**: Dos personas sin cuenta entran a la misma sala mediante un enlace y se ven mutuamente, con tope de 4 conectados.

**Independent Test**: Crear una sala en un navegador, abrir el enlace en otro, escribir alias distintos y verificar que ambos aparecen en la lista de participantes de la misma sala. Un quinto navegador recibe `ROOM_FULL`.

### Tests for User Story 1

- [ ] T022 [P] [US1] Test de validación de alias en `tests/unit/alias.test.ts`: acepta 2–20 caracteres tras `trim`, rechaza vacío, solo espacios, 1 carácter y 21 caracteres (FR-002)
- [ ] T023 [P] [US1] Test de generación de códigos en `tests/unit/room-code.test.ts`: longitud 6, alfabeto `ABCDEFGHJKMNPQRSTUVWXYZ23456789`, ausencia de `0 O 1 I L`, y unicidad sobre 10 000 generaciones

### Implementation for User Story 1

- [ ] T024 [P] [US1] Implementar la validación de alias en `lib/rooms/alias.ts` (2–20 caracteres tras recortar espacios)
- [ ] T025 [P] [US1] Implementar el generador de códigos de sala en `lib/rooms/code.ts` sobre el alfabeto sin caracteres ambiguos
- [ ] T026 [US1] Crear la función `heartbeat(p_player_id)` en `supabase/migrations/0004_heartbeat_fn.sql` que refresca `room_players.last_seen_at`
- [ ] T027 [US1] Implementar `POST /api/rooms` en `app/api/rooms/route.ts`: validar alias, verificar el rompecabezas, generar código con reintento ante colisión, e insertar sala, piezas y jugador creador en una sola transacción
- [ ] T028 [US1] Implementar `POST /api/rooms/[code]/join` en `app/api/rooms/[code]/join/route.ts`: validar alias, reconocer reconexión por `auth_user_id` existente (sin aplicar aforo), y devolver `ROOM_FULL` cuando ya hay `max_players` conectados
- [ ] T029 [US1] Implementar `GET /api/rooms/[code]/state` en `app/api/rooms/[code]/state/route.ts` devolviendo sala, rompecabezas, jugadores con `connected` derivado, piezas y `serverTime`, con timestamps formateados por `lib/format/datetime.ts`
- [ ] T030 [US1] Implementar el bucle de heartbeat cada 10 segundos y la suscripción a Presence en `lib/realtime/presence.ts`, apoyándose en el canal creado en T020
- [ ] T031 [P] [US1] Crear el formulario de alias en `components/AliasForm.tsx` con validación en cliente reflejando `lib/rooms/alias.ts`
- [ ] T032 [P] [US1] Crear la lista de participantes en `components/PlayerList.tsx` mostrando alias, estado de conexión y desambiguación por sufijo numérico para alias repetidos
- [ ] T033 [US1] Crear la pantalla de inicio en `app/page.tsx`: elegir un rompecabezas de la semilla o entrar por código de sala
- [ ] T034 [US1] Crear la pantalla de sala en `app/rooms/[code]/page.tsx`: cargar el estado, mostrar participantes y ofrecer el enlace de invitación con acción de copiar
- [ ] T035 [US1] Manejar en la interfaz los errores `ROOM_NOT_FOUND`, `ROOM_FULL` e `INVALID_ALIAS` conmutando sobre `code`, nunca sobre `message`
- [ ] T036 [US1] Verificar la ausencia de roles especiales (FR-004): revisar que ningún endpoint de `app/api/rooms/` ni ningún componente de `components/` ramifique según quién creó la sala, y dejar constancia en el commit

**Checkpoint**: US1 funciona sola. Hay salas, alias, enlace de invitación y aforo, aunque el tablero todavía no se mueva.

---

## Phase 4: User Story 2 - Mover piezas en tiempo real con captura exclusiva (Priority: P2) 🎯 MVP

**Goal**: Un jugador arrastra una pieza, los demás la ven moverse en vivo, no pueden tomarla hasta que la suelte, y al soltarla queda libre de inmediato.

**Independent Test**: Con dos clientes en la misma sala, capturar una pieza en A y verificar en B que se desplaza en vivo, aparece ocupada con el alias de A y no responde a intentos de captura; al soltarla en A, B puede capturarla al instante.

### Tests for User Story 2

- [ ] T037 [P] [US2] Test de integración de la carrera de captura en `tests/integration/capture-race.test.ts`: dos llamadas concurrentes a `capture_piece` sobre la misma pieza; exactamente una devuelve `success = true` (FR-013)

### Implementation for User Story 2

- [ ] T038 [US2] Crear `capture_piece(p_piece_id, p_player_id)` en `supabase/migrations/0005_capture_fn.sql` como `SECURITY DEFINER`, con `UPDATE` condicional atómico sobre todo el grupo y arrendamiento de 30 segundos, según [contracts/db-functions.md](./contracts/db-functions.md)
- [ ] T039 [US2] Crear `move_piece(p_piece_id, p_player_id, p_x, p_y)` en `supabase/migrations/0006_move_fn.sql`: escribe posiciones absolutas del grupo, refresca el arrendamiento y es no-op si el jugador no posee el grupo
- [ ] T040 [US2] Crear `release_piece(p_piece_id, p_player_id, p_x, p_y)` en su **forma mínima** en `supabase/migrations/0007_release_fn.sql`: fija la posición final absoluta del grupo y libera el bloqueo (`captured_by = NULL`, `captured_at = NULL`), sin lógica de encaje. Satisface FR-014 y FR-019; US3 la extenderá
- [ ] T041 [US2] Extender `lib/realtime/channel.ts` con la emisión de `piece_drag` con throttle de 50 ms, el evento `piece_drop`, y la recepción de `postgres_changes` sobre `pieces`
- [ ] T042 [US2] Implementar el render del tablero en `components/BoardCanvas.tsx` con un único `<canvas>` y bucle de `requestAnimationFrame`
- [ ] T043 [US2] Implementar la entrada de puntero y el ciclo completo capturar → arrastrar → soltar en `components/Board.tsx`, invocando `capture_piece` al tomar, `move_piece` con throttle durante el arrastre y `release_piece` al soltar
- [ ] T044 [US2] Renderizar el estado ocupado de una pieza con el alias de quien la tiene y bloquear los intentos de captura ajenos en `components/BoardCanvas.tsx`
- [ ] T045 [US2] Implementar en `lib/realtime/channel.ts` la precedencia de los eventos confirmados sobre los de broadcast: un `postgres_changes` siempre sobrescribe la posición provisional recibida por `piece_drag`, de modo que un broadcast perdido, duplicado o desordenado quede corregido
- [ ] T046 [US2] Integrar el tablero en `app/rooms/[code]/page.tsx` sobre el estado ya cargado en US1

**Checkpoint**: **MVP completo.** Dos personas mueven piezas del mismo tablero en tiempo real con exclusión mutua. Desplegable y demostrable.

---

## Phase 5: User Story 3 - Encaje automático y movimiento en grupo (Priority: P3)

**Goal**: Al soltar una pieza junto a su pareja correcta se conectan, se alinean y a partir de ahí se mueven juntas para todos.

**Independent Test**: Soltar una pieza dentro de la tolerancia junto a su vecina correcta y verificar que encajan, se alinean, y que arrastrar cualquiera mueve ambas en los dos clientes.

### Tests for User Story 3

- [ ] T047 [P] [US3] Test de emparejamiento en `tests/unit/matching.test.ts`: detecta la vecina correcta dentro de la tolerancia, la rechaza fuera de ella, no empareja piezas no adyacentes en la cuadrícula, y confirma que una pieza sin vecino encajable conserva la posición donde fue soltada (FR-019)
- [ ] T048 [P] [US3] Test de grupos en `tests/unit/groups.test.ts`: fusión de dos grupos, fusión en cascada, preservación de posiciones relativas e idempotencia de fusionar un grupo consigo mismo
- [ ] T049 [P] [US3] Test de integración de fusión concurrente en `tests/integration/merge-race.test.ts`: dos `release_piece` simultáneos sobre grupos vecinos producen un resultado determinista e idéntico para ambos jugadores, sin piezas duplicadas ni grupos huérfanos

### Implementation for User Story 3

- [ ] T050 [P] [US3] Implementar la detección de encaje en `lib/puzzle/matching.ts` como función pura `findSnapTarget(piece, pieces, tolerance)`
- [ ] T051 [P] [US3] Implementar la unión y fusión de grupos en `lib/puzzle/groups.ts` como funciones puras sobre `group_id`
- [ ] T052 [US3] Extender `release_piece` en `supabase/migrations/0008_release_snapping.sql`: tras fijar la posición, evaluar vecinos encajables, alinear el grupo entrante a su posición relativa exacta y fusionar en cascada; si no hay encaje, la pieza queda donde fue soltada (FR-019)
- [ ] T053 [US3] Aplicar la alineación devuelta por `release_piece` al soltar en `components/Board.tsx`
- [ ] T054 [US3] Renderizar los grupos como una unidad visual y arrastrarlos completos en `components/BoardCanvas.tsx`
- [ ] T055 [US3] Rechazar la captura de cualquier pieza perteneciente a un grupo ya capturado, verificando el retorno de `capture_piece` en `components/Board.tsx`

**Checkpoint**: El rompecabezas se puede armar de verdad, en colaboración.

---

## Phase 6: User Story 4 - Reconexión automática sin pérdida de progreso (Priority: P4)

**Goal**: Una caída de red no cuesta progreso: el jugador vuelve solo y ve el tablero al día.

**Independent Test**: Cortar la red de un cliente mientras el otro mueve piezas, restaurarla, y verificar que el primero vuelve sin recargar ni reescribir el alias y muestra el estado más reciente en menos de 5 segundos.

### Tests for User Story 4

- [ ] T056 [P] [US4] Test de reconciliación en `tests/unit/reconcile.test.ts`: el estado remoto reemplaza por completo al local, los movimientos locales sin confirmar se descartan, y aplicar el mismo estado dos veces es idempotente (FR-025)
- [ ] T057 [P] [US4] Test de integración de expiración del arrendamiento en `tests/integration/lease-expiry.test.ts`: una captura con `captured_at` de hace más de 30 segundos es tomada por otro jugador (FR-015, SC-007)

### Implementation for User Story 4

- [ ] T058 [US4] Implementar el reemplazo completo del estado del tablero en `lib/realtime/reconcile.ts` a partir de la respuesta de `GET /state`
- [ ] T059 [US4] Implementar la detección de pérdida de conexión y la resuscripción automática en `lib/realtime/channel.ts`, disparando la recarga de estado y la reanudación del heartbeat al volver
- [ ] T060 [P] [US4] Crear el indicador de conexión en `components/ConnectionStatus.tsx` con los estados conectado, reconectando y desconectado
- [ ] T061 [US4] Recuperar la sesión anónima persistida y rehidratar el alias sin volver a pedirlo en `app/rooms/[code]/page.tsx`
- [ ] T062 [US4] Reflejar en `components/PlayerList.tsx` que un jugador desconectado libera su cupo del aforo de cuatro

**Checkpoint**: El progreso compartido sobrevive a las caídas de red.

---

## Phase 7: User Story 5 - Completar el rompecabezas y registrarlo en el histórico (Priority: P5)

**Goal**: Al colocar la última pieza todos reciben el aviso y la partida queda registrada con sus marcas de tiempo.

**Independent Test**: Con el rompecabezas de 4 piezas de la semilla, conectarlas todas y verificar que ambos clientes reciben la notificación y que `game_history` tiene la fila con inicio y fin.

### Implementation for User Story 5

- [ ] T063 [US5] Extender `release_piece` en `supabase/migrations/0009_completion.sql` para detectar que todas las piezas comparten `group_id`, marcar `rooms.status = 'completed'`, fijar `completed_at` e insertar en `game_history` dentro de la misma transacción
- [ ] T064 [US5] Suscribirse a los cambios de `rooms.status` en `lib/realtime/channel.ts` para notificar el completado a todos los conectados
- [ ] T065 [P] [US5] Crear el aviso de rompecabezas completado en `components/CompletionBanner.tsx`
- [ ] T066 [US5] Verificar que una sala completada sigue accesible por su código y muestra el tablero terminado en `app/rooms/[code]/page.tsx`

**Checkpoint**: Las cinco historias funcionan. La feature está completa.

---

## Phase 8: Polish & Cross-Cutting Concerns

- [ ] T067 Verificar que `SUPABASE_SERVICE_ROLE_KEY` no aparece en el bundle del cliente, inspeccionando la salida de `npm run build` y buscando la cadena en `.next/static`
- [ ] T068 [P] Añadir controles de teclado y etiquetas ARIA a los controles de la sala (alias, copiar enlace, lista de participantes) en `components/`, compensando la ausencia de árbol de accesibilidad del canvas
- [ ] T069 [P] Añadir estados de carga y de error a la pantalla de sala en `app/rooms/[code]/page.tsx`
- [ ] T070 Medir la latencia percibida con **4 clientes concurrentes** moviendo piezas a la vez y confirmar SC-001 (< 1 s) y SC-002 (sin degradación con el aforo lleno), ajustando el throttle de broadcast si hiciera falta
- [ ] T071 Verificar el rendimiento del canvas con un rompecabezas de 500 piezas y confirmar 60 fps durante el arrastre
- [ ] T072 Verificar la convergencia de estado (SC-008): tras una secuencia larga de movimientos y fusiones, comparar la disposición de piezas y grupos entre dos clientes y confirmar que es idéntica
- [ ] T073 Verificar la persistencia de la sala (FR-026): con piezas ya movidas, cerrar todos los navegadores, volver a abrir el enlace y confirmar que el tablero conserva el progreso
- [ ] T074 Medir el tiempo de reconexión (SC-004): cronometrar desde que vuelve la red hasta que el tablero está al día y confirmar que es menor a 5 segundos con 0 movimientos confirmados perdidos
- [ ] T075 [P] Escribir el `README.md` con puesta en marcha, variables de entorno y el orden obligatorio de despliegue (migración antes que merge)
- [ ] T076 Ejecutar la validación completa de [quickstart.md](./quickstart.md), los 6 escenarios de principio a fin
- [ ] T077 Revisar el cumplimiento de la constitución antes del merge: sin secretos en el código, RLS activa en todas las tablas, formato de error uniforme en los tres endpoints, ausencia de roles especiales (FR-004) y `npm test` en verde

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Fase 1)**: sin dependencias
- **Foundational (Fase 2)**: depende de Setup — **bloquea todas las historias**
- **US1 (Fase 3)**: depende de Fase 2
- **US2 (Fase 4)**: depende de US1 — necesita una sala con jugadores y piezas materializadas
- **US3 (Fase 5)**: depende de US2 — extiende `release_piece`, que US2 crea
- **US4 (Fase 6)**: depende de US2 — sin progreso que perder, la reconexión no es demostrable
- **US5 (Fase 7)**: depende de US3 — el completado se detecta al fusionar el último grupo
- **Polish (Fase 8)**: depende de las historias que se decida entregar

### Cadena de migraciones

Se aplican en orden; cada una asume la anterior:

```text
0001 esquema → 0002 RLS → 0003 publicación realtime → 0004 heartbeat
  → 0005 capture_piece → 0006 move_piece → 0007 release_piece (mínima)
  → 0008 release con encaje y fusión → 0009 completado e histórico
```

### Nota sobre la independencia de las historias

La plantilla asume historias mutuamente independientes. Aquí **no lo son**, y forzarlo sería
artificial: US3 extiende una función que US2 crea, y US5 extiende la que US3 dejó. Lo que sí se
cumple es que cada checkpoint deja el producto en un estado **demostrable y desplegable**, que es
el objetivo real de la entrega incremental.

### Within Each User Story

- Los tests de lógica crítica se escriben junto a la función que verifican, no después
- Migraciones antes que los route handlers que las invocan
- Funciones puras de `lib/` antes que los componentes que las consumen
- Endpoints antes que las pantallas que los llaman

### Parallel Opportunities

- Fase 1: T003, T004, T005 y T007 en paralelo tras T002
- Fase 2: T011–T016, T018 y T019 en paralelo tras T008–T010
- US1: T022/T023 en paralelo; T024/T025 en paralelo; T031/T032 en paralelo
- US3: T047/T048/T049 en paralelo; T050/T051 en paralelo
- US4: T056/T057 en paralelo
- Fase 8: T068, T069 y T075 en paralelo

---

## Parallel Example: Foundational

```bash
# Tras aplicar las migraciones (T008–T010), en paralelo:
Task: "Definir tipos de la API en types/api.ts"
Task: "Definir tipos del tablero en types/board.ts"
Task: "Definir tipos de Realtime en types/realtime.ts"
Task: "Implementar cliente de navegador en lib/supabase/client.ts"
Task: "Implementar cliente de servidor en lib/supabase/server.ts"
Task: "Implementar geometría de la cuadrícula en lib/puzzle/geometry.ts"
Task: "Implementar formateo de fechas en lib/format/datetime.ts"
```

---

## Implementation Strategy

### MVP First (US1 + US2)

El MVP real son **dos** historias, no una. US1 sola entrega una sala donde dos personas se ven
pero no pueden hacer nada: no es un producto demostrable. El primer incremento con valor es
US1 + US2 — dos personas moviendo piezas del mismo tablero en tiempo real, con capturar y soltar
funcionando de punta a punta.

1. Fase 1: Setup
2. Fase 2: Foundational
3. Fase 3: US1 → validar
4. Fase 4: US2 → **PARAR Y VALIDAR** → desplegar y demostrar

### Incremental Delivery

1. Setup + Foundational → base lista
2. US1 + US2 → tablero colaborativo (MVP) → desplegar
3. US3 → el rompecabezas se puede armar de verdad → desplegar
4. US4 → resistente a caídas de red → desplegar
5. US5 → cierre del ciclo e histórico → desplegar

### Estrategia con un solo desarrollador

El proyecto lo mantiene una sola persona (Principio I). Las marcas `[P]` no sirven para repartir
trabajo entre personas, sino para indicar qué tareas no se pisan entre sí y pueden abordarse en
cualquier orden dentro de su fase, sin arrastrar dependencias.

---

## Notes

- **Un commit por tarea**, obligatorio por la sección Git Workflow de la constitución. Formato:
  `<tipo>(<ID-tarea>): <descripción en imperativo>` — por ejemplo
  `feat(T027): implementar endpoint de creacion de sala`.
- Si una tarea deja el build o los tipos rotos, se arregla dentro de esa misma tarea antes de
  commitear. La rama principal siempre desplegable.
- **Las migraciones no se despliegan solas.** Antes de mergear cualquier tarea que añada un
  archivo a `supabase/migrations/`, aplicarla con `supabase db push`.
- `npm test` debe correr sin infraestructura. `npm run test:db` requiere `supabase start` y solo
  se ejecuta antes de mergear cambios a funciones SQL.
- Nunca commitear valores reales de variables de entorno. Un secreto que entra al historial de un
  repositorio público es un secreto comprometido: rotar la llave de inmediato.
- **T068 y T069 no derivan de ningún requisito de la especificación.** Son mejoras deliberadas de
  Polish: accesibilidad de los controles de la sala y estados de carga y error. Se mantienen
  porque el coste es bajo y la ausencia se nota, pero si hay que recortar alcance, son las
  primeras candidatas.
