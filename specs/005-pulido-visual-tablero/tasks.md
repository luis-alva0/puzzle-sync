---
description: "Lista de tareas del pulido visual del tablero"
---

# Tasks: Pulido Visual del Tablero

**Input**: documentos de diseño en `specs/005-pulido-visual-tablero/`
**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/](./contracts/)

**Tests**: el Principio VI pide pruebas sobre la lógica crítica. Aquí lo son el empaquetado —de él
depende que ninguna pieza se solape—, la reconciliación del arrastre, la complementariedad de los
perfiles y el limitador del sonido. Las cuatro son lógica pura y llevan unitarias. El dibujado en
canvas no las lleva: se verifica mirando.

## Format: `[ID] [P?] [Story] Descripción`

- **[P]**: paralelizable con otras marcadas igual (archivos distintos, sin dependencias)
- **[Story]**: a qué historia pertenece
- Cada tarea indica la ruta exacta del archivo

## Path Conventions

Aplicación web de un solo repositorio, App Router de Next.js. Rutas desde la raíz del proyecto.

## Git Workflow

Constitución v2.0.0: **un commit por fase**. Al llegar al checkpoint, `git add` de todo el trabajo
de la fase y un único `git commit`.

| Fase | Tareas | Mensaje |
|---|---|---|
| 1. Setup | T001 | `chore(setup): confirmar punto de partida limpio - T001` |
| 2. Foundational | T002–T008 | `feat(foundational): catalogo de perfiles de lenguetas con cuello - T002-T008` |
| 3. US1 | T009–T017 | `fix(US1): dibujar por grupo para eliminar las costuras - T009-T017` |
| 4. US2 | T018–T024 | `fix(US2): mover grupos con desplazamiento en vez de posicion - T018-T024` |
| 5. US3 | T025–T029 | `feat(US3): siluetas con cuello y cabeza en el tablero - T025-T029` |
| 6. US4 | T030–T036 | `feat(US4): relieve de carton y halo de captura por grupo - T030-T036` |
| 7. US5 | T037–T044 | `feat(US5): clic sintetizado al encajar, con limitador - T037-T044` |
| 8. US6 | T045–T055 | `feat(US6): empaquetado por filas y tablero a ventana completa - T045-T055` |
| 9. Polish | T056–T064 | `chore(polish): verificar rendimiento y comparar con la referencia - T056-T064` |

Las correcciones que aparezcan al verificar y no pertenezcan a ninguna fase van en su propio
commit, con scope descriptivo y sin rango.

---

## Phase 1: Setup

- [ ] T001 Confirmar el punto de partida ejecutando `npm run lint`, `npm run typecheck` y `npm test`, y anotar el número de pruebas en verde como referencia para el final

---

## Phase 2: Foundational (Blocking Prerequisites)

**Propósito**: los perfiles de lengüeta los necesitan dos historias que no se tocan entre sí —la
US3 los dibuja y la US6 los mide para empaquetar—, así que van antes que ambas. Cambiar la
profundidad de la lengüeta después de calcular el empaquetado obligaría a rehacerlo.

**⚠️ Ninguna historia puede empezar antes de terminar esta fase.**

- [ ] T002 Crear `lib/puzzle-generation/tab-profiles.ts` con el catálogo de **cuatro** perfiles de research R4: cada uno una lista de puntos de control normalizados, con cuello más estrecho que la cabeza y **profundidad del 22 %** (FR-009, FR-010). El 22 % está acoplado a la tabla de research R6: cambiarlo obliga a rehacerla
- [ ] T003 Crear `tests/unit/tab-profiles.test.ts` afirmando, para cada perfil, que **el ancho del cuello es menor que el de la cabeza** —es lo que separa una lengüeta de la joroba actual— y que el perfil empieza y acaba sobre la línea del borde
- [ ] T004 Añadir a `tests/unit/tab-profiles.test.ts` que ningún perfil supera la profundidad que reserva `tabOverflow`, o las lengüetas saldrían recortadas al dibujarse
- [ ] T005 Cambiar `Edge` en `types/puzzle.ts`: el campo `size` pasa a ser `profile`, el índice del perfil elegido (data-model)
- [ ] T006 Adaptar `lib/puzzle-generation/edges.ts` para elegir perfil con el mismo hash que hoy elige la anchura, conservando que **el borde sea un solo objeto leído por las dos piezas vecinas**: es lo que hace la complementariedad estructural y no una coincidencia
- [ ] T007 Actualizar `tests/unit/edges.test.ts` al campo nuevo, conservando la prueba de identidad referencial entre el borde derecho de una pieza y el izquierdo de su vecina
- [ ] T008 Hacer que `tabOverflow` en `lib/puzzle-generation/path.ts` se derive de la profundidad máxima del catálogo en lugar de una constante suelta, para que medir y dibujar no puedan discrepar

**Checkpoint**: existen los perfiles, probados, y el resto del proyecto compila contra el campo
nuevo. Las siluetas todavía se dibujan como antes: eso es la US3.

---

## Phase 3: User Story 1 - Las piezas unidas se ven como una sola pieza de cartón (Priority: P1) 🎯 MVP

**Goal**: eliminar las costuras dibujando cada grupo de una vez en lugar de pieza a pieza.

**Independent Test**: unir dos piezas y acercarse a la junta. No debe verse el fondo del tablero en
ningún punto; sí la línea del corte.

**Es el cambio estructural del que dependen la US4 y el halo de captura.** Se hace primero por eso,
además de por ser P1.

- [ ] T009 [US1] Añadir a `lib/puzzle-generation/path.ts` una función que componga el contorno de un grupo con `Path2D.addPath()` y una matriz de traslación por pieza, apoyándose en la regla de relleno `nonzero` para que los contornos que se tocan cuenten como una sola figura (research R3)
- [ ] T010 [US1] Añadir a `lib/puzzle-generation/path.ts` los **otros dos trazados** del grupo, en el mismo recorrido: el **exterior**, con los lados sin vecino dentro del grupo, y el de **juntas**, con los lados que sí lo tienen, cada uno trazado una sola vez (research R3). Sin esta separación el relieve biselaría las costuras interiores igual que el borde, que es lo contrario de FR-016
- [ ] T011 [US1] Agrupar las piezas por `groupId` en `components/BoardCanvas.tsx` antes del bucle de dibujado, en lugar de recorrer piezas sueltas, y dibujar **al final los grupos capturados**: con relieve y sombra, un bloque arrastrado por debajo de otras piezas se ve mal
- [ ] T012 [US1] Dibujar cada grupo en `components/BoardCanvas.tsx` con **un solo** `clip()` y **un solo** `drawImage()` sobre la caja envolvente del grupo, en vez de uno por pieza (FR-001) (SC-001)
- [ ] T013 [US1] Calcular en `components/BoardCanvas.tsx` la región de imagen del grupo: el **origen** sale de su celda mínima en la cuadrícula —de ahí viene la foto— y el **destino**, de su posición actual en el tablero. Son cajas distintas en cuanto alguien mueve el grupo, y confundirlas descuadra la imagen (FR-002)
- [ ] T014 [US1] Dibujar el **trazado de juntas** en `components/BoardCanvas.tsx` encima del grupo, como líneas de corte: dejan de ser un artefacto y pasan a ser una decisión (FR-003)
- [ ] T015 [US1] Cachear **los tres trazados** de cada grupo en `components/BoardCanvas.tsx` en **coordenadas relativas al origen del grupo**, trasladándolos al pintar, e invalidarlos solo cuando cambie la composición. Si se construyeran en coordenadas absolutas, el caché no se invalidaría al arrastrar —la composición no cambia— y **el grupo se dibujaría congelado** mientras lo mueves
- [ ] T016 [US1] Verificar sobre una sala real que dos piezas unidas no dejan ver el fondo en ningún punto de la junta, y que un bloque de cinco muestra la imagen continua — **requiere navegador**
- [ ] T017 [US1] Verificar que una pieza suelta —un grupo de una— se sigue dibujando bien: es el caso que el camino de grupo no puede olvidar — **requiere navegador**

**Checkpoint**: las piezas unidas se ven como una sola superficie. Es el MVP de esta funcionalidad.

---

## Phase 4: User Story 2 - Arrastrar un grupo lo mueve entero, sin saltos (Priority: P1)

**Goal**: que el bloque siga al cursor sin saltar al agarrarlo ni recolocarse al soltarlo.

**Independent Test**: formar un bloque de tres, agarrarlo por la pieza del medio, arrastrarlo y
soltarlo. Ni salta ni se recentra.

**No depende de la US1**: se puede hacer en paralelo.

- [ ] T018 [P] [US2] Cambiar `PieceDragPayload` en `types/realtime.ts` de `{x, y}` a `{dx, dy}` según [contracts/realtime-drag.md](./contracts/realtime-drag.md)
- [ ] T019 [US2] Añadir a `tests/unit/boardSync.test.ts` **la prueba que hoy fallaría**: un grupo de tres en fila arrastrado agarrando la pieza **del medio**; las tres se desplazan lo mismo y la del medio queda donde la dejó el puntero
- [ ] T020 [US2] Añadir a `tests/unit/boardSync.test.ts` que el desplazamiento se aplica a todas las piezas del grupo y a ninguna de otro, y que un mensaje sobre un grupo desconocido se ignora (FR-004, FR-006)
- [ ] T021 [US2] Reescribir `applyProvisionalDrag` y `renderPieces` en `lib/realtime/boardSync.ts` para guardar y aplicar un desplazamiento, **eliminando la búsqueda del ancla**: el arreglo quita código
- [ ] T022 [US2] Calcular el desplazamiento en `components/Board.tsx` respecto de la posición **confirmada** de la pieza agarrada, recalculándolo en cada movimiento en lugar de acumularlo (FR-005, FR-007)
- [ ] T023 [US2] Adaptar el emisor y el receptor de `lib/realtime/channel.ts` al formato nuevo
- [ ] T024 [US2] Verificar con dos navegadores que un bloque agarrado por cualquier pieza se mueve entero en ambas pantallas, y que al soltar no se recentra (FR-008, SC-002) — **requiere navegador**

**Checkpoint**: arrastrar bloques deja de tener saltos.

---

## Phase 5: User Story 3 - Las piezas tienen la silueta de un rompecabezas de verdad (Priority: P1)

**Goal**: llevar los perfiles de la Fase 2 al trazado, de modo que las lengüetas tengan cuello.

**Independent Test**: mirar una pieza suelta y ver el cuello estrecharse antes de la cabeza.

- [ ] T025 [US3] Reescribir `traceEdge` en `lib/puzzle-generation/path.ts` para recorrer los puntos de control del perfil elegido en lugar de las dos curvas de la joroba actual
- [ ] T026 [US3] Conservar en `lib/puzzle-generation/path.ts` que el mismo borde recorrido desde lados opuestos produzca lengüeta y hueco complementarios: es la propiedad que hace seguro cambiar de perfiles (FR-011)
- [ ] T027 [US3] Añadir a `tests/unit/tab-profiles.test.ts` la complementariedad numérica de cada perfil, con la misma comprobación que se usó para descartar la geometría como causa de las costuras
- [ ] T028 [US3] Verificar sobre una sala real que las lengüetas tienen cuello, que se reconocen varios perfiles repetidos por el tablero y que las piezas del contorno exterior conservan sus lados rectos (FR-012) — **requiere navegador**
- [ ] T029 [US3] Verificar con **500 piezas** que la silueta sigue leyéndose como pieza de rompecabezas al tamaño más pequeño que admite la aplicación (FR-013) (SC-003) — **requiere navegador**

**Checkpoint**: las piezas dejan de parecer flores.

---

## Phase 6: User Story 4 - Las piezas parecen cartón, no recortes planos (Priority: P2)

**Goal**: relieve en el borde y halo de captura, ambos alrededor del **grupo**.

**Independent Test**: mirar una pieza suelta y ver relieve y sombra corta; que otro jugador agarre
un bloque y ver un solo halo rodeándolo.

**Depende de la Fase 3**: sin el dibujado por grupo no hay contorno de grupo que biselar.

- [ ] T030 [US4] Añadir a `components/BoardCanvas.tsx` el bisel interior de cada grupo: dos trazos del **trazado exterior** dentro del recorte, uno claro desplazado arriba a la izquierda y otro oscuro abajo a la derecha (research R5, FR-014). Usar el trazado compuesto aquí biselaría también las juntas
- [ ] T031 [US4] Escalar el grosor del bisel con el tamaño de pieza en pantalla en `components/BoardCanvas.tsx`, de modo que con 500 piezas se desvanezca solo en lugar de ensuciar la silueta
- [ ] T032 [US4] Sustituir en `components/BoardCanvas.tsx` la sombra por pieza por una sombra corta del **trazado exterior** del grupo (FR-015, FR-016)
- [ ] T033 [US4] Sustituir en `components/BoardCanvas.tsx` el contorno de color de la pieza capturada por un **halo por fuera** del trazado exterior del grupo, conservando el relieve debajo (FR-017a, FR-017c)
- [ ] T034 [US4] Mantener en `components/BoardCanvas.tsx` la distinción entre captura propia y ajena y la etiqueta del alias que ya existen (FR-017b, FR-028a)
- [ ] T035 [US4] Verificar que una pieza capturada por otro jugador conserva su relieve y gana el halo, y que un bloque capturado muestra **un solo** halo rodeándolo entero — **requiere navegador**
- [ ] T036 [US4] Verificar que el halo y la sombra no se mezclan en un borrón alrededor del contorno de un grupo capturado — **requiere navegador**

**Checkpoint**: el tablero parece cartón sobre una mesa.

---

## Phase 7: User Story 5 - Un sonido confirma que dos piezas encajaron (Priority: P2)

**Goal**: un clic breve al encajar, propio o ajeno, sin archivo de audio y sin convertirse en ruido.

**Independent Test**: encajar dos piezas y oír un clic; soltar sin encajar y no oír nada.

- [ ] T037 [P] [US5] Crear `lib/audio/click.ts` con el clic sintetizado de research R7: una envolvente corta de ruido filtrado, sin ningún archivo (FR-018c)
- [ ] T038 [P] [US5] Crear el contexto de audio en `lib/audio/click.ts` **en el primer encaje** y no al montar el tablero: los navegadores suspenden los contextos creados sin interacción previa
- [ ] T039 [US5] Añadir a `lib/audio/click.ts` el limitador de research R7: como mucho un sonido cada 150 ms (FR-020a)
- [ ] T040 [P] [US5] Crear `tests/unit/audio-click.test.ts` cubriendo el limitador —dos llamadas seguidas suenan una vez, dos separadas suenan dos— y que un fallo al reproducir no propaga excepción (FR-022)
- [ ] T041 [US5] Disparar el sonido en `components/Board.tsx` cuando la confirmación de encaje devuelva grupos fusionados: **una sola vez por confirmación**, aunque la cascada una varios grupos (FR-020)
- [ ] T042 [US5] Detectar en `components/Board.tsx` el **encaje ajeno** (FR-018a): `merged_group_ids` solo llega del RPC local, así que la fusión de otro jugador hay que deducirla de que el `groupId` de una pieza confirmada cambie a un grupo distinto del que tenía. Sin esta tarea, la respuesta de la clarificación no llega al código
- [ ] T043 [US5] Distinguir en `components/Board.tsx` los encajes que acaban de ocurrir de los que se descubren al recuperar el estado tras una desconexión, y **no sonar** en el segundo caso (FR-018b). Es el mismo camino que T040a: una recarga cambia el `groupId` de muchas piezas a la vez sin que nadie acabe de encajar nada
- [ ] T044 [US5] Añadir el interruptor de sonido a `components/BoardMenu.tsx`, guardando la preferencia en el navegador como se guarda el alias (FR-021)

**Checkpoint**: el encaje suena, propio y ajeno, y se puede silenciar.

---

## Phase 8: User Story 6 - El tablero ocupa toda la ventana (Priority: P2)

**Goal**: sustituir la rejilla de huecos por el empaquetado por filas y quitar el marco.

**Independent Test**: el cartón llega a los bordes de la ventana y las piezas se ven en torno a un
cuarto más grandes.

**Depende de la Fase 2**: el empaquetado mide las piezas con los perfiles nuevos.

- [ ] T045 [US6] Implementar `pieceExtent(edges)` en `lib/puzzle/board-layout.ts` según [contracts/band-packing.md](./contracts/band-packing.md): una pieza suma `tabOverflow` por cada lado con lengüeta **saliente**, y nada por los huecos entrantes
- [ ] T046 [US6] Añadir a `tests/unit/board-layout.test.ts` las garantías de `pieceExtent`: los tres tamaños posibles por eje, y que una pieza de esquina con dos lados rectos nunca supere `PIECE_SIZE + tabOverflow` por eje. **Si subestima, las piezas se tocarán**
- [ ] T047 [US6] Reescribir el reparto de `lib/puzzle/board-layout.ts` como empaquetado por filas agrupadas por altura (research R6), eliminando `bandSlots` y `SLOT_PITCH` (FR-027a)
- [ ] T048 [US6] Derivar el tamaño del tablero del empaquetado en `lib/puzzle/board-layout.ts` en lugar de calcularlo por adelantado, y retirar los contadores de rejilla de `BoardSize`
- [ ] T049 [US6] Adaptar `tests/unit/board-layout.test.ts` a la firma de dos semillas, conservando **el aserto de no solape** sobre las cajas envolventes reales y **el del determinismo** —mismas semillas, misma disposición—, que es lo que sostiene FR-027b y FR-029 (FR-030)
- [ ] T050 [US6] Añadir a `tests/unit/board-layout.test.ts` la prueba de que el empaquetado aprovecha: el área del tablero **no supera el 70 %** de la que daría el paso uniforme del peor caso. El umbral comprueba que el empaquetado sirve —lo uniforme sería el 100 %—, **no es un sustituto de SC-006**: eso se mide en el navegador en T056. Confundirlos fue lo que hizo que el umbral anterior del 65 % quedara por debajo de lo alcanzable
- [ ] T051 [US6] Actualizar los tres llamadores a la firma de dos semillas: `app/api/rooms/route.ts`, `tests/integration/helpers.ts` y `tests/integration/play-count.test.ts`
- [ ] T052 [US6] Quitar el marco en `app/rooms/[code]/page.tsx`: sin relleno ni fondo propio, el tablero llega a los bordes izquierdo, derecho e inferior (FR-023)
- [ ] T053 [US6] Verificar con **dos navegadores** que tras reescribir el empaquetado la disposición inicial sigue siendo idéntica en ambos (FR-029). Es justo lo que la reescritura puede romper y ninguna unitaria lo ve — **requiere navegador**
- [ ] T054 [US6] Actualizar la llamada a `boardSize` de `components/BoardCanvas.tsx` a la firma de tres argumentos, pasando `seedFromUuid(puzzleId)` como semilla de formas —la misma que ya usa para la rejilla de bordes—. **Es el cuarto llamador**, y T051 solo cubre los tres de `layoutPieces`: si se pasa la semilla equivocada, el canvas dibuja un tablero distinto del que empaquetó el servidor
- [ ] T055 [US6] Adelgazar `components/BoardToolbar.tsx` y teñirla de un tono derivado del cartón, pegada al tablero (FR-024, FR-025); y retirar de `components/BoardCanvas.tsx` el rectángulo del área central (FR-026)

**Checkpoint**: el tablero llena la ventana y las piezas son más grandes.

---

## Phase 9: Polish & Cross-Cutting Concerns

- [ ] T056 **Medir SC-006** con 104 piezas y comparar con la captura anterior. Research R6 estima un 29 % con solo cuatro puntos de margen sobre el 25 % exigido, y **la tabla equivalente de la feature 004 salió un 10-15 % optimista**. Si no llega, ajustar el criterio en `spec.md` en lugar de forzar el número — **requiere navegador**
- [ ] T057 [P] Actualizar la tabla de tamaños de [research.md](./research.md) con las cifras medidas, como se hizo en la feature 004
- [ ] T058 Medir SC-007 arrastrando un bloque de 20 piezas en un rompecabezas de 150, **y también con un rompecabezas de 500 casi completo**: ahí todas las piezas son un solo grupo y cada frame recorta y traza un trazado de 500 subtrazados, que es el caso peor real y el que SC-007 no cubre. Si ese cae, la salida está en research R3: rasterizar el grupo a un canvas fuera de pantalla. Dibujar por grupo debería **mejorar** el rendimiento; si baja, el sospechoso es el contorno del grupo reconstruyéndose por frame — **requiere navegador**
- [ ] T059 Verificar SC-005: el tablero ocupa al menos el 92 % del alto de la ventana y el 100 % del ancho — **requiere navegador**
- [ ] T060 Verificar los cinco casos del sonido: cascada que suena una vez, encaje ajeno que suena, vuelta de una desconexión que **no** suena, soltar sin encajar que **no** suena (FR-019), y los tiempos de SC-004 y SC-004a —100 ms el propio, 1 s el ajeno, nunca dos solapados— — **requiere navegador**
- [ ] T061 Ejecutar `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:db` y `npm run build`, confirmando que las tres pruebas de integración que construyen salas siguen en verde
- [ ] T062 Comparar con la referencia (SC-008): abrir jigsawexplorer al lado y preguntar a alguien cuál tiene las piezas «de verdad». Anotar **qué** lo delató si acierta — **requiere navegador**
- [ ] T063 Ejecutar la validación completa de [quickstart.md](./quickstart.md), los 9 escenarios — **requiere navegador**
- [ ] T064 Revisar el cumplimiento de la constitución antes del merge y actualizar la tabla de trampas conocidas de `README.md` con lo que aparezca al implementar

---

## Dependencies & Execution Order

### Phase Dependencies

```
Phase 1 (Setup)
    │
Phase 2 (Foundational: perfiles de lengüeta)   ← BLOQUEA todo
    │
    ├─► Phase 3 (US1: dibujado por grupo)  🎯 MVP
    │        │
    │        └─► Phase 6 (US4: relieve y halo)   necesita el contorno del grupo
    │
    ├─► Phase 4 (US2: arrastre)      independiente del dibujado
    ├─► Phase 5 (US3: siluetas)      solo aplica los perfiles de la Fase 2
    ├─► Phase 7 (US5: sonido)        no toca el dibujado
    └─► Phase 8 (US6: empaquetado)   mide con los perfiles de la Fase 2
                 │
                 └─► Phase 9 (Polish)
```

### User Story Dependencies

- **US1** solo depende de la Fase 2. Es el MVP y arrastra a la US4.
- **US2** es independiente de todo lo visual: podría hacerse la primera.
- **US3** aplica lo que la Fase 2 dejó listo.
- **US4** necesita la US1: sin contorno de grupo no hay nada que biselar.
- **US5** no toca el dibujado ni el reparto.
- **US6** necesita la Fase 2 para medir las piezas.

### Parallel Opportunities

- **T003 y T004**: dos garantías del mismo catálogo.
- **Fases 3 y 4 en paralelo** tras la Fase 2: el dibujado por grupo y el arrastre no comparten
  ningún archivo. Es el único paralelismo real entre fases.
- **Las fases 5 y 7 NO son paralelizables** con las anteriores, aunque lo parezca: la 5 reescribe
  `lib/puzzle-generation/path.ts`, que la 3 también toca, y la 7 modifica `components/Board.tsx`,
  que la 4 también toca. Van después de la 3 y de la 4 respectivamente.
- **T037, T038 y T040**: el sonido y su prueba.
- **T018**: el cambio de tipo, aislado del resto de su fase.

---

## Implementation Strategy

### MVP

**Fases 1 a 3.** Quita las costuras, que es lo primero que delata que el tablero no es un
rompecabezas. Desplegable por sí solo.

Si hubiera que elegir **una sola** cosa más, sería la **Fase 4**: el salto al arrastrar bloques es
el defecto que más estorba jugando, y es la fase más barata de las que quedan.

### Entrega incremental

1. **Fases 1-3** → las piezas unidas se ven como una superficie.
2. **Fase 4** → arrastrar bloques deja de dar saltos.
3. **Fase 5** → las piezas dejan de parecer flores.
4. **Fase 6** → parece cartón.
5. **Fase 7** → el encaje suena.
6. **Fase 8** → el tablero llena la ventana y las piezas crecen.
7. **Fase 9** → medir y comparar.

### Lo que hay que vigilar

**T045 es la tarea con más riesgo silencioso.** Si `pieceExtent` **subestima**, las piezas se
tocarán y el aserto de no solape de T049 lo cazará; pero si **sobrestima**, todo pasa en verde y
SC-006 simplemente no llega, sin que nada avise. Por eso T050 comprueba que el empaquetado
aprovecha, y no solo que es correcto.

**T056 puede desmentir el diseño, y el margen es estrecho.** La estimación es +27 % contra el
+25 % que exige SC-006: **dos puntos**, y la tabla equivalente de la feature 004 se quedó corta
un 10-15 %.

Si no llega, la instrucción es **bajar el criterio de SC-006 a lo medido**, no bajar la
profundidad de la lengüeta para forzarlo. La silueta es lo que el usuario pidió copiar de la
referencia; el 25 % es un número que puse yo. Y ojo con la tentación de mirar T050: su umbral del
70 % comprueba que el empaquetado sirve, **no es un sustituto de SC-006**. Confundirlos ya produjo
un umbral mal puesto una vez.

**T002 y research R6 están acoplados.** La profundidad de la lengüeta —22 %— sale de equilibrar
dos cosas que tiran en sentidos contrarios: más profunda hace la silueta más reconocible, y
también ensancha la pieza y se come lo que gana el empaquetado. Con el 25 % que el diseño tenía al
principio, SC-006 era inalcanzable sin que nada avisara. **Cambiar esa profundidad obliga a
rehacer la tabla de R6.**

**T010 es el otro hallazgo que el diseño se dejó.** La investigación resolvió el recorte del grupo con
un trazado compuesto y dio por hecho que el mismo trazado servía para el relieve. No sirve:
recorrerlo con `stroke()` bisela también las juntas interiores, y un bloque con todas sus costuras
marcadas como bordes es justo lo que FR-016 prohíbe. Por eso hay **tres** trazados por grupo y no
uno. Si el relieve sale raro, es el primer sitio donde mirar.

**T017 existe porque el camino de grupo puede olvidar el caso de una sola pieza.** Al principio de
la partida **todos** los grupos son de una pieza; si ese camino se rompe, el tablero aparece vacío
y no habrá ninguna prueba unitaria que lo diga.
