---
description: "Lista de tareas de la interfaz del tablero de armado"
---

# Tasks: Interfaz del Tablero de Armado

**Input**: documentos de diseño en `specs/004-interfaz-tablero-armado/`
**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/board-layout.md](./contracts/board-layout.md)

**Tests**: el Principio VI de la constitución pide pruebas sobre la lógica crítica. El reparto de
piezas lo es —FR-002 depende entero de él— y es lógica pura, así que lleva unitarias. El dibujado
en canvas no las lleva: probarlo exigiría un DOM falso que probaría el falso.

## Format: `[ID] [P?] [Story] Descripción`

- **[P]**: se puede hacer en paralelo con otras marcadas igual (archivos distintos, sin dependencias)
- **[Story]**: a qué historia pertenece
- Cada tarea indica la ruta exacta del archivo

## Path Conventions

Aplicación web de un solo repositorio, App Router de Next.js. Rutas desde la raíz del proyecto.

## Git Workflow

Constitución v2.0.0: **un commit por fase**, no por tarea. Al alcanzar el checkpoint de cada fase,
y antes de empezar la siguiente, `git add` de todo su trabajo y un único `git commit` con la
historia de usuario como scope y el rango de tareas al final.

Esta funcionalidad son **7 commits**:

| Fase | Tareas | Mensaje |
|---|---|---|
| 1. Setup | T001 | `chore(setup): confirmar punto de partida limpio - T001` |
| 2. Foundational | T002–T006 | `feat(foundational): definir el tamano del tablero y la rejilla de huecos - T002-T006` |
| 3. US1 | T007–T021 | `feat(US1): repartir las piezas en banda perimetral sin solapes - T007-T021` |
| 4. US2 | T022–T025 | `feat(US2): fondo neutro y legibilidad de las siluetas - T022-T025` |
| 5. US4 | T026–T036 | `feat(US4): barra superior con conexion, cronometro y menu - T026-T036` |
| 6. US3 | T037–T041 | `feat(US3): imagen de referencia en el area central - T037-T041` |
| 7. Polish | T042–T052 | `perf(polish): cachear rutas y verificar rendimiento - T042-T052` |

Si una fase deja el build o los tipos rotos, se corrige **dentro de esa misma fase** antes de
commitear. Las correcciones que aparezcan al verificar y no pertenezcan a ninguna fase van en su
propio commit, con scope descriptivo y sin rango de tareas.

---

## Phase 1: Setup

Esta funcionalidad **no necesita preparación**: sin dependencias nuevas, sin variables de entorno,
sin migraciones. Se anota para dejar constancia de que se comprobó, no por trámite.

- [X] T001 Confirmar que el punto de partida está limpio ejecutando `npm run lint`, `npm run typecheck` y `npm test`, y anotar el número de pruebas en verde como referencia para el final

---

## Phase 2: Foundational (Blocking Prerequisites)

**Propósito**: el tamaño del tablero es la pieza que comparten el servidor y el navegador. Mientras
no exista una única fuente de verdad, cualquier trabajo sobre la banda o sobre el canvas se hace
contra un blanco móvil.

**⚠️ Ninguna historia puede empezar antes de terminar esta fase.**

- [X] T002 Crear `lib/puzzle/board-layout.ts` con las constantes de la rejilla: el paso derivado de `PIECE_SIZE` y `tabOverflow(PIECE_SIZE)` según research R2, nunca escrito a mano, y la proporción objetivo 16:10 de research R3
- [X] T003 Implementar `boardSize(gridRows, gridCols)` en `lib/puzzle/board-layout.ts` según [contracts/board-layout.md](./contracts/board-layout.md): devuelve ancho, alto y el rectángulo del área central, sin consultar `window` ni el DOM (FR-030)
- [X] T004 Escribir `tests/unit/board-layout.test.ts` con las garantías de `boardSize`: el área central nunca es menor que el rompecabezas resuelto, conserva su proporción, está centrado, y hay huecos de banda suficientes para las cinco cantidades admitidas (20, 50, 100, 200, 500) (FR-003, FR-007)
- [X] T005 Implementar en `lib/puzzle/board-layout.ts` la generación de huecos: recorrer el tablero con el paso de la rejilla y descartar los que caen dentro del área central
- [X] T006 Añadir a `tests/unit/board-layout.test.ts` las garantías de los huecos: dos huecos nunca se solapan, ninguno invade el área central, y la cantidad disponible cubre todas las piezas

**Checkpoint**: existe una única definición del tamaño del tablero, probada. A partir de aquí el
servidor y el canvas pueden apoyarse en ella.

---

## Phase 3: User Story 1 - Ver todas las piezas de un vistazo, sin que se tapen (Priority: P1) 🎯 MVP

**Goal**: sustituir el reparto aleatorio que solapa piezas por una banda perimetral en la que cada
pieza se ve entera, con el centro despejado.

**Independent Test**: crear una sala de 104 piezas y comprobar que ninguna pieza tapa a otra ni
parcialmente, que el rectángulo central queda libre, y que dos navegadores ven lo mismo.

### Tests for User Story 1

- [X] T007 [P] [US1] Añadir a `tests/unit/board-layout.test.ts` **la prueba que justifica la funcionalidad**: para las cinco cantidades admitidas, comparar todos los pares de piezas y afirmar que sus cajas envolventes —con lengüetas, no la celda de 100— no se cortan (FR-002)
- [X] T008 [P] [US1] Añadir a `tests/unit/board-layout.test.ts` la cobertura exacta: hay `filas × columnas` piezas y cada celda aparece una sola vez
- [X] T009 [P] [US1] Añadir a `tests/unit/board-layout.test.ts` que ninguna pieza cae dentro del área central (FR-001) y que ninguna pareja vecina arranca encajada — la comprobación correcta es la separación **entre vecinas**, porque `release_piece` encaja de forma relativa, no contra una posición absoluta
- [X] T010 [P] [US1] Añadir a `tests/unit/board-layout.test.ts` el determinismo —misma semilla, mismo resultado— y el desorden de FR-008 con umbral medido, no elegido a ojo, y un control negativo que confirme que el umbral detecta el caso sin barajar

### Implementation for User Story 1

- [X] T011 [US1] Implementar la permutación determinista en `lib/puzzle/board-layout.ts` reutilizando `splitmix32` de `lib/puzzle-generation/prng.ts`, en lugar del generador congruencial de `geometry.ts` (research R4)
- [X] T012 [US1] Implementar `layoutPieces(gridRows, gridCols, seed)` en `lib/puzzle/board-layout.ts`: asignar cada pieza a un hueco según la permutación y aplicar la sacudida acotada de research R2
- [X] T013 [US1] Sustituir la llamada a `scatterPieces` por `layoutPieces` en `app/api/rooms/route.ts`
- [X] T014 [P] [US1] Sustituir la llamada a `scatterPieces` por `layoutPieces` en `tests/integration/helpers.ts`
- [X] T015 [P] [US1] Sustituir la llamada a `scatterPieces` por `layoutPieces` en `tests/integration/play-count.test.ts`
- [X] T016 [US1] Eliminar `scatterPieces` y su generador congruencial `createSeededRandom` de `lib/puzzle/geometry.ts`, junto con la constante `SCATTER_MARGIN` que solo usaba él
- [X] T017 [US1] Reemplazar en `components/BoardCanvas.tsx` el cálculo propio del mundo —`solvedWidth + PIECE_SIZE * 4`— por una llamada a `boardSize()`, que es lo que evita que las piezas caigan fuera de lo dibujado (FR-031)
- [X] T018 [US1] Poner a cero `originX` y `originY` en `components/BoardCanvas.tsx`: con `boardSize()` las coordenadas empiezan en 0, mientras que hoy valen `PIECE_SIZE * 2`. Hay que cambiarlo **en los tres sitios** —el `translate` del dibujado y las dos entradas de `dataset` que lee `toBoard()`— o el tablero se dibuja desplazado 200 unidades y el arrastre agarra donde no hay pieza
- [X] T019 [US1] Ajustar en `components/BoardCanvas.tsx` el elemento `<canvas>` para que ocupe el espacio disponible en lugar de fijar `aspectRatio` a partir de la cuadrícula, de modo que el tablero completo quepa siempre en la ventana (FR-032), **centrando el tablero** en el espacio sobrante: con proporción 16:10 y ventanas de otra proporción siempre sobra margen en un eje
- [X] T020 [US1] Sustituir en `components/BoardCanvas.tsx` la silueta del rompecabezas resuelto por el rectángulo del área central que devuelve `boardSize()`, para que la referencia visual coincida con el hueco real (FR-003)

- [ ] T021 [US1] Comprobar que el arrastre sigue funcionando tras los cambios de escala y origen: `toBoard()` en `components/BoardCanvas.tsx` traduce coordenadas usando el origen y la escala, y T017–T019 modifican los dos. Es la comprobación que cierra la fase, no una tarea de pulido — **requiere navegador**

**Checkpoint**: una sala nueva muestra las piezas repartidas en la banda, sin solapes y con el
centro libre, y las piezas se pueden arrastrar. El MVP de esta funcionalidad está entregado.

---

## Phase 4: User Story 2 - Reconocer las piezas por su forma (Priority: P1)

**Goal**: que la silueta de cada pieza sea legible sobre el tablero.

**Independent Test**: mirar cualquier pieza y distinguir sus lengüetas y huecos; comprobar que las
del contorno exterior tienen el lado de fuera recto.

**Nota sobre el alcance**: al leer el código antes de planificar se comprobó que
[edges.ts](../../lib/puzzle-generation/edges.ts) ya marca rectos los bordes del perímetro y que
[BoardCanvas.tsx](../../components/BoardCanvas.tsx) ya recorta cada pieza con su `Path2D` y la
contornea. **FR-009 a FR-013 ya se cumplen.** Esta fase se reduce a lo que falta —el fondo— y a
confirmar que el cambio de reparto no rompió lo que ya funcionaba.

- [X] T022 [US2] Cambiar el fondo del tablero en `components/BoardCanvas.tsx` del gris oscuro actual a una superficie neutra tipo cartón, que no compita con las piezas (FR-014)
- [X] T023 [US2] Revisar en `components/BoardCanvas.tsx` que el contorno y la sombra de cada pieza siguen distinguiéndose sobre el fondo nuevo, ajustando opacidad y grosor si el cambio de fondo los deja invisibles (FR-013)
- [ ] T024 [US2] Verificar visualmente sobre una sala real que las cuatro esquinas tienen dos lados rectos, que las piezas del borde tienen recto el lado exterior y que dos vecinas encajan sin hueco ni superposición (FR-009, FR-010, FR-011, SC-001, SC-008) — **requiere navegador**
- [ ] T025 [US2] Verificar que cada pieza muestra su porción de imagen recortada por la silueta, lengüetas incluidas, y no un rectángulo (FR-012); y que **ninguna pieza aparece girada** ni existe control alguno para rotarla (FR-004, FR-005) — **requiere navegador**

**Checkpoint**: las piezas se leen bien sobre el tablero.

---

## Phase 5: User Story 4 - Barra superior con el estado de la partida (Priority: P2)

**Goal**: reunir en una barra el estado de conexión, el cronómetro, la pantalla completa, la ayuda
de imagen y el menú.

**Independent Test**: abrir el tablero y comprobar que los cinco elementos están presentes,
legibles y que ninguno tapa piezas.

**Se implementa antes que la US3** aunque tenga la misma prioridad: el icono que dispara la imagen
de referencia vive en esta barra, así que la US3 no se puede probar sin ella.

- [X] T026 [P] [US4] Crear `lib/format/duration.ts` con el formateo del tiempo transcurrido como `m:ss`, pasando a `h:mm:ss` a partir de una hora
- [X] T027 [P] [US4] Crear `tests/unit/duration.test.ts` cubriendo el cero, el cambio de minuto, el paso a horas y los valores negativos, que pueden darse si el desfase de reloj se estima mal
- [X] T028 [US4] Crear `components/BoardToolbar.tsx` con la maqueta de la barra: menú a la izquierda, iconos al centro, estado y controles a la derecha, como elemento del DOM situado **encima** del canvas y no dibujado dentro (research R9, FR-015)
- [X] T029 [US4] Calcular en `app/rooms/[code]/page.tsx` el desfase entre el reloj local y el del servidor a partir de `serverTime` de la respuesta de estado, y guardarlo para el cronómetro (research R6). *La tarea decía `components/Board.tsx`; se implementó en la página porque es donde llega la respuesta y `Board` nunca la ve.*
- [X] T030 [US4] Crear `components/ElapsedTime.tsx` que cuente desde `startedAt` corrigiendo con el desfase, se actualice cada segundo y **se detenga al completarse** el rompecabezas (FR-017, FR-018, FR-019)
- [X] T031 [US4] Integrar `components/ConnectionStatus.tsx` dentro de la barra y retirarlo de donde esté hoy, para que no aparezca duplicado (FR-016, FR-029)
- [X] T032 [US4] Añadir a `components/BoardToolbar.tsx` el control de pantalla completa sobre el contenedor del tablero, tomando el estado del evento `fullscreenchange` y no de un booleano propio, para que el botón siga siendo correcto si el navegador deniega la petición o el usuario sale con Escape (research R8, FR-020)
- [X] T033 [US4] Crear `components/BoardMenu.tsx` con las opciones provisionales de FR-026 —ver y copiar el código de sala, jugadores conectados, salir de la sala y ayuda— que se cierra al elegir una o al pulsar fuera (FR-027) (FR-025)
- [X] T034 [US4] Mover el contenido de `components/PlayerList.tsx` dentro del menú y retirarlo de la pantalla principal, sin duplicarlo (FR-029)
- [X] T035 [US4] Montar la barra en `app/rooms/[code]/page.tsx` de modo que ocupe la parte superior y el canvas reciba la altura restante, sin superponerse (FR-015)
- [X] T036 [P] [US4] Añadir etiquetas accesibles y navegación por teclado a los controles de `components/BoardToolbar.tsx` y `components/BoardMenu.tsx`: son botones reales del DOM precisamente para poder tenerlas

**Checkpoint**: la barra está completa y el cronómetro es común a todos los jugadores.

---

## Phase 6: User Story 3 - Consultar la imagen de referencia sin perder el tablero (Priority: P2)

**Goal**: mostrar la imagen completa en el área central mientras el ratón esté sobre el icono.

**Independent Test**: posar el ratón sobre el icono, comprobar que la imagen aparece en el centro y
desaparece al retirarlo, sin interrumpir la partida.

**Depende de la Phase 5**: el icono que la dispara está en la barra.

- [X] T037 [US3] Añadir a `components/BoardCanvas.tsx` una propiedad booleana que dibuje la imagen completa en el rectángulo del área central, **antes de las piezas**, para que las ya colocadas se vean por encima (research R7)
- [X] T038 [US3] Crear `components/ReferenceImage.tsx` con el icono de la barra que activa esa propiedad al entrar el ratón y la desactiva al salir (FR-021, FR-022)
- [X] T039 [US3] Añadir a `components/ReferenceImage.tsx` el comportamiento táctil: un toque muestra la imagen y otro la oculta (FR-023)
- [X] T040 [US3] Mostrar en `components/ReferenceImage.tsx` un aviso en el icono cuando la imagen no haya cargado, en lugar de dejar que se muestre un recuadro vacío
- [ ] T041 [US3] Verificar que mostrar la imagen no interrumpe la partida: con la imagen visible, un movimiento de otro jugador debe llegar y aplicarse (FR-024), y **medir que aparece y desaparece en menos de 300 ms** desde que el ratón entra y sale del icono (SC-004) — **requiere navegador**

**Checkpoint**: la ayuda de imagen funciona y es local a cada jugador.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [X] T042 [P] Cachear los `Path2D` en `components/BoardCanvas.tsx` calculando uno por celda dentro del mismo `useMemo` que ya construye la rejilla de bordes, en lugar de reconstruirlos para cada pieza en cada frame (research R5)
- [X] T043 [P] Añadir en `app/rooms/[code]/page.tsx` el aviso de pantalla estrecha por debajo de 1024 px, que informa sin bloquear (FR-034, A-008)
- [ ] T044 Medir el rendimiento con 150 piezas y confirmar SC-006 (50 fps o más durante el arrastre) — **requiere navegador**
- [ ] T045 Medir el rendimiento con 500 piezas y confirmar que las piezas de 31 px se ven enteras y sin solapes (SC-009) — **requiere navegador**
- [ ] T046 Confirmar SC-010 sobre una sala real: capturar el estado con `GET /state`, redimensionar la ventana, volver a capturarlo y comprobar que **ninguna coordenada cambió** (FR-033, SC-010) — **requiere navegador**
- [ ] T047 Confirmar SC-003 abriendo la misma sala en dos navegadores **con ventanas de distinto tamaño**: la disposición debe ser la misma, cambiando solo la escala — **requiere navegador**
- [ ] T048 Confirmar SC-005 adelantando `started_at` cinco minutos en la base de datos y comprobando que un segundo navegador muestra el mismo tiempo, incluso con la hora del sistema cambiada — **requiere navegador**
- [X] T049 Ejecutar `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:db` y `npm run build`, confirmando que las pruebas de integración —que construyen salas con el reparto nuevo— siguen en verde (FR-028)
- [ ] T050 Ejecutar la validación completa de [quickstart.md](./quickstart.md), los 9 escenarios — **requiere navegador**
- [X] T051 Revisar el cumplimiento de la constitución antes del merge: sin dependencias nuevas, sin variables de entorno nuevas, sin migraciones, y commits en formato `tipo(Txxx):`
- [X] T052 Actualizar la tabla de trampas conocidas de `README.md` con lo que aparezca durante la implementación

---

## Dependencies & Execution Order

### Phase Dependencies

```
Phase 1 (Setup)
    │
Phase 2 (Foundational: boardSize + huecos)   ← BLOQUEA todo lo demás
    │
    ├─► Phase 3 (US1: reparto)  🎯 MVP
    │        │
    │        └─► Phase 4 (US2: fondo y forma)   depende del reparto para verse
    │
    └─► Phase 5 (US4: barra)    independiente del reparto
             │
             └─► Phase 6 (US3: imagen de referencia)   el icono vive en la barra
                      │
                      └─► Phase 7 (Polish)
```

### User Story Dependencies

- **US1** depende solo de la Phase 2. Es el MVP y se entrega sola.
- **US2** es casi toda verificación de lo que ya existe; necesita la US1 para poder mirarse.
- **US4** no depende de la US1: la barra se puede construir sobre el tablero actual.
- **US3** depende de la US4, porque su disparador es un icono de la barra.

### Within Each User Story

En la US1 las pruebas van antes que la implementación: FR-002 es el requisito que justifica la
funcionalidad, y escribir primero el aserto de no solape evita darlo por bueno de vista.

### Parallel Opportunities

- **T007 a T010**: cuatro pruebas del mismo contrato, sobre distintas garantías.
- **T014 y T015**: los dos llamadores de prueba, archivos distintos.
- **T026 y T027**: el formateo de duración y su prueba, independientes del resto de la barra.
- **Phase 3 y Phase 5 en paralelo**: el reparto y la barra no se tocan. Es el mayor ahorro
  disponible si se trabaja en dos frentes.
- **T042 y T043**: archivos distintos.

---

## Implementation Strategy

### MVP

**Phase 1 + Phase 2 + Phase 3.** Entrega lo que hoy está roto: piezas que no se tapan. Es la
diferencia entre un tablero usable y uno que no lo es, y se puede parar ahí con valor real
entregado.

### Entrega incremental

1. **Fases 1-3** → las piezas dejan de solaparse. Desplegable.
2. **Fase 4** → el tablero se ve como un rompecabezas de verdad.
3. **Fase 5** → la barra, que es lo que da sensación de producto terminado.
4. **Fase 6** → la ayuda de imagen, que es lo que hace abordable un rompecabezas de 150 piezas.
5. **Fase 7** → rendimiento y verificación.

### Lo que hay que vigilar

**T017 y T018 son las tareas con más riesgo silencioso**, y por el mismo motivo: producen un
tablero cuyo estado es correcto pero invisible o descolocado, y **ninguna prueba lo detecta**.

- **T017**: si el canvas y el reparto acaban usando tamaños de tablero distintos, las piezas se
  colocan donde nadie las pinta. Por eso `boardSize()` se construye en la Phase 2 y ambos lados la
  llaman, en vez de que cada uno calcule el suyo como ocurre hoy.
- **T018**: el origen vale `PIECE_SIZE * 2` y con `boardSize()` debe pasar a cero. Si se cambia en
  el dibujado pero no en el `dataset` que lee `toBoard()` —o al revés— el tablero se ve bien pero
  el arrastre agarra 200 unidades más allá.

Por eso **T021 cierra la fase comprobando el arrastre**, en lugar de dejarlo para el pulido: el
riesgo se introduce aquí y se descubre aquí.

**T042 no es cosmético.** Con 150 piezas a 60 fps hoy se construyen 9 000 objetos `Path2D` por
segundo. Si SC-006 no se cumple en T044, este es el primer sitio donde mirar.

---

## Estado de la implementación (2026-08-10)

**42 de 52 tareas completadas.** Las 10 restantes necesitan un navegador y una persona mirando.

| Tarea | Qué falta |
|---|---|
| T021 | Arrastrar una pieza y confirmar que el puntero agarra donde debe |
| T024, T025 | Siluetas, lados rectos del contorno, recorte de la imagen, ausencia de rotación |
| T041 | Que un movimiento ajeno llegue con la imagen de referencia visible |
| T044, T045 | Rendimiento con 150 y con 500 piezas |
| T046, T047, T048 | SC-010 (redimensionar), SC-003 (dos navegadores), SC-005 (cronómetro común) |
| T050 | Los 9 escenarios de [quickstart.md](./quickstart.md) |

**Verificado sin navegador**: 220 pruebas unitarias (127 → 220), 38 de integración, lint,
typecheck, build y `check:secrets`. Y una comprobación que vale más que las demás: sobre una sala
**recién creada de 150 piezas**, las posiciones que guardó el servidor caen todas dentro del
tablero que dibuja el canvas, **ninguna en el área central y ninguna solapada**. Es la garantía de
que `boardSize()` significa lo mismo a los dos lados.

### Lo que la implementación desmintió del diseño

Tres números y una regla del diseño resultaron equivocados al programar, y se corrigieron en sus
documentos en lugar de dejarlos:

1. **La tabla de tamaños de research** era un 10-15 % optimista. No contaba con el grosor mínimo
   de banda ni con la alineación del área central a la rejilla. Las cifras de ahora están medidas.
2. **El umbral de adyacencia del contrato**, al 5 %, estaba *por debajo* de lo que produce una
   permutación uniforme (5,4 % de media, hasta 9,1 %). Habría fallado la mitad de las veces sin
   que nada estuviera roto. Ahora es 15 %, con un control negativo que confirma que detecta el
   caso sin barajar.
3. **La garantía 3 del contrato** medía la distancia de cada pieza a su posición correcta, pero
   `release_piece` encaja de forma **relativa** entre vecinas. Se comprobaba algo que no decide el
   encaje. La rejilla ya garantiza lo correcto por construcción.
4. **T029** se implementó en `app/rooms/[code]/page.tsx` y no en `components/Board.tsx`: es donde
   llega la respuesta de estado con `serverTime`, y `Board` nunca la ve.
