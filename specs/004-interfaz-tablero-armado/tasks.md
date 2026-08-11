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

Tras **cada** tarea, `git add` y `git commit` con mensaje Conventional Commits que incluya el ID,
antes de pasar a la siguiente. Ejemplo: `feat(T012): dibujar la imagen de referencia en el canvas`.

---

## Phase 1: Setup

Esta funcionalidad **no necesita preparación**: sin dependencias nuevas, sin variables de entorno,
sin migraciones. Se anota para dejar constancia de que se comprobó, no por trámite.

- [ ] T001 Confirmar que el punto de partida está limpio ejecutando `npm run lint`, `npm run typecheck` y `npm test`, y anotar el número de pruebas en verde como referencia para el final

---

## Phase 2: Foundational (Blocking Prerequisites)

**Propósito**: el tamaño del tablero es la pieza que comparten el servidor y el navegador. Mientras
no exista una única fuente de verdad, cualquier trabajo sobre la banda o sobre el canvas se hace
contra un blanco móvil.

**⚠️ Ninguna historia puede empezar antes de terminar esta fase.**

- [ ] T002 Crear `lib/puzzle/board-layout.ts` con las constantes de la rejilla: el paso derivado de `PIECE_SIZE` y `tabOverflow(PIECE_SIZE)` según research R2, nunca escrito a mano, y la proporción objetivo 16:10 de research R3
- [ ] T003 Implementar `boardSize(gridRows, gridCols)` en `lib/puzzle/board-layout.ts` según [contracts/board-layout.md](./contracts/board-layout.md): devuelve ancho, alto y el rectángulo del área central, sin consultar `window` ni el DOM
- [ ] T004 Escribir `tests/unit/board-layout.test.ts` con las garantías de `boardSize`: el hueco central nunca es menor que el rompecabezas resuelto, conserva su proporción, está centrado, y hay huecos de banda suficientes para las cinco cantidades admitidas (20, 50, 100, 200, 500)
- [ ] T005 Implementar en `lib/puzzle/board-layout.ts` la generación de huecos: recorrer el tablero con el paso de la rejilla y descartar los que caen dentro del área central
- [ ] T006 Añadir a `tests/unit/board-layout.test.ts` las garantías de los huecos: dos huecos nunca se solapan, ninguno invade el área central, y la cantidad disponible cubre todas las piezas

**Checkpoint**: existe una única definición del tamaño del tablero, probada. A partir de aquí el
servidor y el canvas pueden apoyarse en ella.

---

## Phase 3: User Story 1 - Ver todas las piezas de un vistazo, sin que se tapen (Priority: P1) 🎯 MVP

**Goal**: sustituir el reparto aleatorio que solapa piezas por una banda perimetral en la que cada
pieza se ve entera, con el centro despejado.

**Independent Test**: crear una sala de 104 piezas y comprobar que ninguna pieza tapa a otra ni
parcialmente, que el rectángulo central queda libre, y que dos navegadores ven lo mismo.

### Tests for User Story 1

- [ ] T007 [P] [US1] Añadir a `tests/unit/board-layout.test.ts` **la prueba que justifica la funcionalidad**: para las cinco cantidades admitidas, comparar todos los pares de piezas y afirmar que sus cajas envolventes —con lengüetas, no la celda de 100— no se cortan (FR-002)
- [ ] T008 [P] [US1] Añadir a `tests/unit/board-layout.test.ts` la cobertura exacta: hay `filas × columnas` piezas y cada celda aparece una sola vez
- [ ] T009 [P] [US1] Añadir a `tests/unit/board-layout.test.ts` que ninguna pieza cae dentro del área central (FR-001) y que ninguna empieza dentro de la tolerancia de encaje respecto de su posición correcta, regla heredada del reparto actual
- [ ] T010 [P] [US1] Añadir a `tests/unit/board-layout.test.ts` el determinismo —misma semilla, mismo resultado— y el desorden de FR-008: menos del 5 % de los pares vecinos en la imagen quedan vecinos en la banda

### Implementation for User Story 1

- [ ] T011 [US1] Implementar la permutación determinista en `lib/puzzle/board-layout.ts` reutilizando `splitmix32` de `lib/puzzle-generation/prng.ts`, en lugar del generador congruencial de `geometry.ts` (research R4)
- [ ] T012 [US1] Implementar `layoutPieces(gridRows, gridCols, seed)` en `lib/puzzle/board-layout.ts`: asignar cada pieza a un hueco según la permutación y aplicar la sacudida acotada de research R2
- [ ] T013 [US1] Sustituir la llamada a `scatterPieces` por `layoutPieces` en `app/api/rooms/route.ts`
- [ ] T014 [P] [US1] Sustituir la llamada a `scatterPieces` por `layoutPieces` en `tests/integration/helpers.ts`
- [ ] T015 [P] [US1] Sustituir la llamada a `scatterPieces` por `layoutPieces` en `tests/integration/play-count.test.ts`
- [ ] T016 [US1] Eliminar `scatterPieces` y su generador congruencial `createSeededRandom` de `lib/puzzle/geometry.ts`, junto con la constante `SCATTER_MARGIN` que solo usaba él
- [ ] T017 [US1] Reemplazar en `components/BoardCanvas.tsx` el cálculo propio del mundo —`solvedWidth + PIECE_SIZE * 4`— por una llamada a `boardSize()`, que es lo que evita que las piezas caigan fuera de lo dibujado
- [ ] T018 [US1] Ajustar en `components/BoardCanvas.tsx` el elemento `<canvas>` para que ocupe el espacio disponible en lugar de fijar `aspectRatio` a partir de la cuadrícula, de modo que el tablero completo quepa siempre en la ventana (FR-032)
- [ ] T019 [US1] Sustituir en `components/BoardCanvas.tsx` la silueta del rompecabezas resuelto por el rectángulo del área central que devuelve `boardSize()`, para que la referencia visual coincida con el hueco real

**Checkpoint**: una sala nueva muestra las piezas repartidas en la banda, sin solapes y con el
centro libre. El MVP de esta funcionalidad está entregado.

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

- [ ] T020 [US2] Cambiar el fondo del tablero en `components/BoardCanvas.tsx` del gris oscuro actual a una superficie neutra tipo cartón, que no compita con las piezas (FR-014)
- [ ] T021 [US2] Revisar en `components/BoardCanvas.tsx` que el contorno y la sombra de cada pieza siguen distinguiéndose sobre el fondo nuevo, ajustando opacidad y grosor si el cambio de fondo los deja invisibles (FR-013)
- [ ] T022 [US2] Verificar visualmente sobre una sala real que las cuatro esquinas tienen dos lados rectos, que las piezas del borde tienen recto el lado exterior y que dos vecinas encajan sin hueco ni superposición — **requiere navegador**

**Checkpoint**: las piezas se leen bien sobre el tablero.

---

## Phase 5: User Story 4 - Barra superior con el estado de la partida (Priority: P2)

**Goal**: reunir en una barra el estado de conexión, el cronómetro, la pantalla completa, la ayuda
de imagen y el menú.

**Independent Test**: abrir el tablero y comprobar que los cinco elementos están presentes,
legibles y que ninguno tapa piezas.

**Se implementa antes que la US3** aunque tenga la misma prioridad: el icono que dispara la imagen
de referencia vive en esta barra, así que la US3 no se puede probar sin ella.

- [ ] T023 [P] [US4] Crear `lib/format/duration.ts` con el formateo del tiempo transcurrido como `m:ss`, pasando a `h:mm:ss` a partir de una hora
- [ ] T024 [P] [US4] Crear `tests/unit/duration.test.ts` cubriendo el cero, el cambio de minuto, el paso a horas y los valores negativos, que pueden darse si el desfase de reloj se estima mal
- [ ] T025 [US4] Crear `components/BoardToolbar.tsx` con la maqueta de la barra: menú a la izquierda, iconos al centro, estado y controles a la derecha, como elemento del DOM situado **encima** del canvas y no dibujado dentro (research R9, FR-015)
- [ ] T026 [US4] Calcular en `components/Board.tsx` el desfase entre el reloj local y el del servidor a partir de `serverTime` de la respuesta de estado, y guardarlo para el cronómetro (research R6)
- [ ] T027 [US4] Crear `components/ElapsedTime.tsx` que cuente desde `startedAt` corrigiendo con el desfase, se actualice cada segundo y **se detenga al completarse** el rompecabezas (FR-017, FR-018, FR-019)
- [ ] T028 [US4] Integrar `components/ConnectionStatus.tsx` dentro de la barra y retirarlo de donde esté hoy, para que no aparezca duplicado (FR-016, FR-029)
- [ ] T029 [US4] Añadir a `components/BoardToolbar.tsx` el control de pantalla completa sobre el contenedor del tablero, tomando el estado del evento `fullscreenchange` y no de un booleano propio, para que el botón siga siendo correcto si el navegador deniega la petición o el usuario sale con Escape (research R8, FR-020)
- [ ] T030 [US4] Crear `components/BoardMenu.tsx` con las opciones provisionales de FR-026 —ver y copiar el código de sala, jugadores conectados, salir de la sala y ayuda— que se cierra al elegir una o al pulsar fuera (FR-027)
- [ ] T031 [US4] Mover el contenido de `components/PlayerList.tsx` dentro del menú y retirarlo de la pantalla principal, sin duplicarlo (FR-029)
- [ ] T032 [US4] Montar la barra en `app/rooms/[code]/page.tsx` de modo que ocupe la parte superior y el canvas reciba la altura restante, sin superponerse (FR-015)
- [ ] T033 [P] [US4] Añadir etiquetas accesibles y navegación por teclado a los controles de `components/BoardToolbar.tsx` y `components/BoardMenu.tsx`: son botones reales del DOM precisamente para poder tenerlas

**Checkpoint**: la barra está completa y el cronómetro es común a todos los jugadores.

---

## Phase 6: User Story 3 - Consultar la imagen de referencia sin perder el tablero (Priority: P2)

**Goal**: mostrar la imagen completa en el área central mientras el ratón esté sobre el icono.

**Independent Test**: posar el ratón sobre el icono, comprobar que la imagen aparece en el centro y
desaparece al retirarlo, sin interrumpir la partida.

**Depende de la Phase 5**: el icono que la dispara está en la barra.

- [ ] T034 [US3] Añadir a `components/BoardCanvas.tsx` una propiedad booleana que dibuje la imagen completa en el rectángulo del área central, **antes de las piezas**, para que las ya colocadas se vean por encima (research R7)
- [ ] T035 [US3] Crear `components/ReferenceImage.tsx` con el icono de la barra que activa esa propiedad al entrar el ratón y la desactiva al salir (FR-021, FR-022)
- [ ] T036 [US3] Añadir a `components/ReferenceImage.tsx` el comportamiento táctil: un toque muestra la imagen y otro la oculta (FR-023)
- [ ] T037 [US3] Mostrar en `components/ReferenceImage.tsx` un aviso en el icono cuando la imagen no haya cargado, en lugar de dejar que se muestre un recuadro vacío
- [ ] T038 [US3] Verificar que mostrar la imagen no interrumpe la partida: con la imagen visible, un movimiento de otro jugador debe llegar y aplicarse (FR-024) — **requiere navegador**

**Checkpoint**: la ayuda de imagen funciona y es local a cada jugador.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [ ] T039 [P] Cachear los `Path2D` en `components/BoardCanvas.tsx` calculando uno por celda dentro del mismo `useMemo` que ya construye la rejilla de bordes, en lugar de reconstruirlos para cada pieza en cada frame (research R5)
- [ ] T040 [P] Añadir en `app/rooms/[code]/page.tsx` el aviso de pantalla estrecha por debajo de 1024 px, que informa sin bloquear (FR-034, A-008)
- [ ] T041 Comprobar que el arrastre sigue funcionando tras los cambios de escala: la traducción de coordenadas de pantalla a tablero de `components/BoardCanvas.tsx` depende del origen y la escala, que esta funcionalidad modifica
- [ ] T042 Medir el rendimiento con 150 piezas y confirmar SC-006 (50 fps o más durante el arrastre) — **requiere navegador**
- [ ] T043 Medir el rendimiento con 500 piezas y confirmar que las piezas de 31 px se ven enteras y sin solapes — **requiere navegador**
- [ ] T044 Confirmar SC-010 sobre una sala real: capturar el estado con `GET /state`, redimensionar la ventana, volver a capturarlo y comprobar que **ninguna coordenada cambió** — **requiere navegador**
- [ ] T045 Confirmar SC-003 abriendo la misma sala en dos navegadores **con ventanas de distinto tamaño**: la disposición debe ser la misma, cambiando solo la escala — **requiere navegador**
- [ ] T046 Confirmar SC-005 adelantando `started_at` cinco minutos en la base de datos y comprobando que un segundo navegador muestra el mismo tiempo, incluso con la hora del sistema cambiada — **requiere navegador**
- [ ] T047 Ejecutar `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:db` y `npm run build`, confirmando que las pruebas de integración —que construyen salas con el reparto nuevo— siguen en verde
- [ ] T048 Ejecutar la validación completa de [quickstart.md](./quickstart.md), los 8 escenarios — **requiere navegador**
- [ ] T049 Revisar el cumplimiento de la constitución antes del merge: sin dependencias nuevas, sin variables de entorno nuevas, sin migraciones, y commits en formato `tipo(Txxx):`
- [ ] T050 Actualizar la tabla de trampas conocidas de `README.md` con lo que aparezca durante la implementación

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
- **T023 y T024**: el formateo de duración y su prueba, independientes del resto de la barra.
- **Phase 3 y Phase 5 en paralelo**: el reparto y la barra no se tocan. Es el mayor ahorro
  disponible si se trabaja en dos frentes.
- **T039 y T040**: archivos distintos.

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

**T017 es la tarea con más riesgo silencioso.** Si el canvas y el reparto acaban usando tamaños de
tablero distintos, las piezas se colocan donde nadie las pinta y el fallo no salta en ninguna
prueba: el estado es correcto, solo que invisible. Por eso `boardSize()` se construye en la Phase 2
y ambos lados la llaman, en vez de que cada uno calcule el suyo como ocurre hoy.

**T039 no es cosmético.** Con 150 piezas a 60 fps hoy se construyen 9 000 objetos `Path2D` por
segundo. Si SC-006 no se cumple en T042, este es el primer sitio donde mirar.
