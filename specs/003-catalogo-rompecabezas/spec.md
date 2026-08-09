# Feature Specification: Catálogo de Rompecabezas Pre-creados

**Feature Branch**: `003-catalogo-rompecabezas`

**Created**: 2026-08-09

**Status**: Draft

**Input**: User description: "Especificar la funcionalidad de seleccionar un rompecabezas pre-creado desde un catalogo, en lugar de crear uno nuevo a partir de una foto. El catalogo esta compuesto tanto por un conjunto curado que el administrador del proyecto carga y mantiene, como por rompecabezas que otros jugadores crearon desde foto y decidieron marcar explicitamente como publicos en el momento de crearlos. [...] El criterio de exito medible para esta funcionalidad es que un jugador debe poder pasar de abrir el catalogo a tener el rompecabezas seleccionado listo para usarse en una sala en menos de treinta segundos bajo condiciones normales de conexion."

## Clarifications

### Session 2026-08-09

- Q: ¿Cómo se resuelve la dependencia D-001, dado que el catálogo debe incluir rompecabezas publicados por jugadores pero la spec 002 los define como privados sin excepción? → A: Ampliar la spec 002 con una opción de marcar el rompecabezas como público al crearlo, con privado como valor por defecto.
- Q: Cuando un jugador marca su rompecabezas como público, ¿aparece en el catálogo de inmediato, o necesita aprobación del administrador antes de ser visible? → A: Publicación inmediata, sin revisión previa, pero el administrador puede retirar una entrada del catálogo desde la pantalla de administración (moderación reactiva).
- Q: Cuando el jugador toca un rompecabezas del catálogo, ¿se crea la sala en ese mismo momento, o hay un paso intermedio? → A: Pantalla de detalle con vista previa ampliada y un botón explícito para crear la sala.
- Q: ¿El jugador ve cuántas veces se ha jugado cada rompecabezas, o el contador es solo un dato interno para ordenar? → A: Visible tanto en la tarjeta del listado como en la pantalla de detalle.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Explorar el catálogo y elegir un rompecabezas para jugar (Priority: P1)

Una persona quiere ponerse a armar algo ya mismo, sin subir una foto propia. Abre la sección de
catálogo, ve las opciones disponibles con su imagen y su cantidad de piezas, elige la que le
gusta y queda lista para llevarla a una sala de juego. No necesita cuenta ni registro.

**Why this priority**: Es el camino de entrada más rápido al producto y la razón de ser de esta
funcionalidad. Sin esta historia el catálogo no existe.

**Independent Test**: Abrir la sección de catálogo con al menos un rompecabezas cargado,
seleccionar uno, y verificar que queda preparado para usarse en una sala con la misma cantidad
de piezas con la que fue creado.

**Acceptance Scenarios**:

1. **Given** un jugador que quiere usar un rompecabezas existente en lugar de crear uno nuevo,
   **When** abre la sección de catálogo, **Then** ve un listado de todos los rompecabezas
   disponibles, tanto los curados como los publicados por otros jugadores.
2. **Given** un catálogo con rompecabezas de ambos orígenes, **When** el jugador los observa,
   **Then** aparecen mezclados entre sí, sin ninguna distinción visual que revele si son
   curados o publicados por jugadores.
3. **Given** cada rompecabezas del listado, **When** el jugador lo revisa, **Then** ve una
   imagen de referencia, la cantidad de piezas y cuántas veces se ha jugado, suficiente para
   decidir sin abrirlo.
4. **Given** un jugador que encuentra un rompecabezas que le interesa, **When** lo selecciona,
   **Then** el sistema muestra una pantalla de detalle con una vista previa ampliada, la
   cantidad de piezas, y una acción explícita para crear una sala con él.
5. **Given** un jugador en la pantalla de detalle, **When** confirma la creación de la sala,
   **Then** el sistema prepara ese rompecabezas para ser usado en una sala de juego,
   respetando la cantidad de piezas con la que fue originalmente creado y sin ofrecer ninguna
   opción para cambiarla.
6. **Given** un jugador en la pantalla de detalle que cambia de opinión, **When** vuelve al
   catálogo, **Then** no se crea ninguna sala y el listado conserva el ordenamiento elegido y
   la posición previa.
7. **Given** un jugador sin cuenta, **When** explora y selecciona del catálogo, **Then** puede
   hacerlo completamente sin registro ni inicio de sesión.
8. **Given** un catálogo todavía vacío, **When** un jugador lo abre, **Then** ve un mensaje que
   explica que aún no hay rompecabezas disponibles y lo invita a crear uno desde una foto.

---

### User Story 2 - Ordenar el catálogo por recientes o por más jugados (Priority: P2)

Al explorar el catálogo, el jugador puede alternar entre ver lo último que se agregó y ver lo
que más gente ha jugado, para orientarse cuando hay muchas opciones.

**Why this priority**: Hace el catálogo navegable a medida que crece, pero con pocos elementos
el listado de US1 ya es suficiente para elegir.

**Independent Test**: Con varios rompecabezas de distintas fechas y distintos contadores de
uso, alternar entre ambos ordenamientos y verificar que el orden del listado cambia
correctamente en cada caso.

**Acceptance Scenarios**:

1. **Given** un catálogo con varios rompecabezas, **When** el jugador lo abre por primera vez,
   **Then** el listado aparece ordenado por los más recientes.
2. **Given** un catálogo ordenado por recientes, **When** el jugador cambia el orden a más
   jugados, **Then** el listado se reordena por cantidad de partidas, de mayor a menor.
3. **Given** un catálogo ordenado por más jugados, **When** dos rompecabezas tienen la misma
   cantidad de partidas, **Then** el más reciente aparece primero, de forma estable y
   reproducible.
4. **Given** un catálogo con más rompecabezas de los que caben en una pantalla, **When** el
   jugador avanza en el listado, **Then** se cargan más elementos sin perder el ordenamiento
   elegido.

---

### User Story 3 - El administrador carga rompecabezas curados al catálogo (Priority: P2)

El administrador del proyecto necesita que el catálogo tenga contenido de calidad desde el
primer día. Entra a una pantalla de administración protegida, se identifica con su cuenta de
administrador, sube una foto, ajusta el encuadre y elige la cantidad de piezas. El rompecabezas
queda publicado en el catálogo de inmediato. Nadie que no sea administrador puede llegar a esa
pantalla ni ver sus opciones.

**Why this priority**: Sin contenido curado el catálogo arranca vacío y US1 no tiene nada que
mostrar. Es P2 y no P1 porque el catálogo también puede poblarse con rompecabezas que los
jugadores publiquen.

**Independent Test**: Autenticarse como administrador, cargar un rompecabezas curado completo,
y verificar que aparece en el catálogo público. Luego intentar acceder a la misma pantalla sin
sesión y verificar que el acceso es denegado.

**Acceptance Scenarios**:

1. **Given** el administrador del proyecto, **When** ingresa a la pantalla de administración y
   se autentica con su cuenta de administrador, **Then** obtiene acceso a un formulario para
   subir una foto, recortar su encuadre y elegir la cantidad de piezas.
2. **Given** el administrador en el formulario de carga, **When** compara el proceso con la
   creación desde foto que usan los jugadores, **Then** las reglas de formato, tamaño máximo,
   encuadre y opciones de cantidad de piezas son equivalentes.
3. **Given** un administrador que completa y confirma el formulario, **When** el sistema procesa
   la solicitud, **Then** el rompecabezas resultante queda publicado en el catálogo
   automáticamente, sin ningún paso adicional de publicación.
4. **Given** alguien que no ha iniciado sesión, **When** intenta acceder a la pantalla de
   administración, **Then** el sistema le niega el acceso y no muestra ninguna opción para
   cargar contenido al catálogo.
5. **Given** una persona autenticada que no es administrador, **When** intenta acceder a la
   pantalla de administración, **Then** el sistema le niega el acceso igual que a un visitante
   sin sesión.
6. **Given** un jugador cualquiera navegando la aplicación, **When** recorre la interfaz,
   **Then** no encuentra enlaces, botones ni pistas que sugieran la existencia de la pantalla
   de administración.
7. **Given** un administrador cuya sesión expira a mitad de la carga, **When** intenta
   confirmar, **Then** el sistema rechaza la operación, no publica nada y le pide autenticarse
   de nuevo.
8. **Given** una entrada del catálogo que el administrador considera inapropiada, **When** la
   retira desde la pantalla de administración, **Then** deja de aparecer en el catálogo para
   todos los jugadores, sin eliminar el rompecabezas ni invalidar su enlace único.
9. **Given** una entrada retirada del catálogo, **When** existen salas ya creadas con ese
   rompecabezas, **Then** esas partidas continúan sin verse afectadas.

---

### Edge Cases

- **Catálogo vacío**: mensaje explicativo con invitación a crear un rompecabezas desde foto,
  nunca una pantalla en blanco.
- **Empate en "más jugados"**: el desempate por fecha más reciente hace el orden determinista;
  recargar la página no reordena arbitrariamente.
- **Catálogo grande**: el listado carga por tramos; el rendimiento de la primera pantalla no
  depende de cuántos rompecabezas existan en total.
- **El mismo rompecabezas seleccionado por varios jugadores a la vez**: cada uno obtiene su
  propia sala independiente; el rompecabezas del catálogo es una plantilla reutilizable, no un
  recurso exclusivo.
- **Un rompecabezas del catálogo en uso en varias salas simultáneamente**: el progreso de cada
  sala es independiente y no se contamina entre salas.
- **Acceso directo por URL a la pantalla de administración**: denegado igual que por
  navegación, sin filtrar la existencia de opciones de carga.
- **Sesión de administrador expirada o revocada**: cualquier operación de carga es rechazada
  antes de publicar nada.
- **Rompecabezas público cuyo enlace único también circula de forma privada**: ambos caminos
  llevan al mismo rompecabezas; ser público no invalida el enlace.
- **Contenido inapropiado publicado por un jugador**: aparece en el catálogo sin revisión
  previa y permanece visible hasta que el administrador lo retira (ver Riesgos Aceptados).
- **Entrada retirada mientras un jugador la está seleccionando**: si intenta usarla después de
  retirada, recibe un mensaje de rompecabezas no disponible y vuelve al catálogo.
- **Un rompecabezas curado y uno publicado por un jugador con la misma imagen**: coexisten como
  entradas separadas; no hay deduplicación.

## Requirements *(mandatory)*

### Functional Requirements

**Exploración del catálogo**

- **FR-001**: El sistema MUST permitir a cualquier jugador explorar el catálogo sin cuenta,
  registro ni inicio de sesión.
- **FR-002**: El sistema MUST incluir en el catálogo tanto los rompecabezas curados cargados
  por el administrador como los creados por jugadores desde foto y marcados explícitamente como
  públicos al crearlos.
- **FR-003**: El sistema MUST presentar ambos orígenes mezclados en un mismo listado, sin
  distinción visual ni etiqueta que revele si un rompecabezas es curado o publicado por un
  jugador.
- **FR-004**: El sistema MUST mostrar, para cada rompecabezas del catálogo, una imagen de
  referencia, su cantidad de piezas y su contador de partidas.
- **FR-005**: El sistema MUST NOT incluir en el catálogo ningún rompecabezas privado.
- **FR-006**: El sistema MUST mostrar un mensaje explicativo, con invitación a crear un
  rompecabezas desde foto, cuando el catálogo no tiene ningún elemento.
- **FR-007**: El sistema MUST cargar el listado por tramos, de modo que el tiempo de la primera
  pantalla no dependa del tamaño total del catálogo.

**Ordenamiento**

- **FR-008**: El sistema MUST ofrecer exactamente dos ordenamientos: por más recientes y por
  más jugados.
- **FR-009**: El sistema MUST aplicar el orden por más recientes de forma predeterminada.
- **FR-010**: El sistema MUST ordenar por cantidad de partidas de mayor a menor cuando se elige
  el orden por más jugados.
- **FR-011**: El sistema MUST desempatar por fecha de publicación más reciente, produciendo un
  orden determinista y reproducible entre recargas.
- **FR-012**: El sistema MUST mantener el ordenamiento elegido al cargar tramos adicionales del
  listado.
- **FR-013**: El sistema MUST incrementar el contador de partidas de un rompecabezas cada vez
  que se crea una sala con él.

**Selección para jugar**

- **FR-014**: El sistema MUST mostrar una pantalla de detalle al seleccionar un rompecabezas
  del catálogo, con una vista previa ampliada de su imagen, su cantidad de piezas y su contador
  de partidas.
- **FR-015**: El sistema MUST ofrecer en esa pantalla de detalle una acción explícita para
  crear una sala de juego con ese rompecabezas.
- **FR-016**: El sistema MUST permitir volver de la pantalla de detalle al catálogo sin crear
  nada, conservando el ordenamiento elegido y la posición previa en el listado.
- **FR-017**: El sistema MUST respetar la cantidad de piezas con la que el rompecabezas fue
  originalmente creado.
- **FR-018**: El sistema MUST NOT ofrecer ninguna opción para cambiar la cantidad de piezas, ni
  en el listado ni en la pantalla de detalle.
- **FR-019**: El sistema MUST permitir que un mismo rompecabezas del catálogo se use en
  múltiples salas simultáneas e independientes entre sí.

**Administración**

- **FR-020**: El sistema MUST exigir autenticación con una cuenta de administrador para acceder
  a la pantalla de administración.
- **FR-021**: El sistema MUST denegar el acceso a la pantalla de administración a visitantes sin
  sesión y a personas autenticadas que no sean administradores, aplicando la verificación tanto
  a la pantalla como a la operación de carga.
- **FR-022**: El sistema MUST NOT mostrar ninguna opción, enlace ni indicio de la carga de
  contenido a quien no sea administrador, incluido el acceso directo por dirección.
- **FR-023**: El sistema MUST ofrecer al administrador autenticado un formulario para subir una
  foto, recortar su encuadre y elegir la cantidad de piezas.
- **FR-024**: El sistema MUST aplicar en ese formulario las mismas reglas de formato admitido,
  tamaño máximo, encuadre y opciones de cantidad de piezas que rigen la creación desde foto de
  los jugadores.
- **FR-025**: El sistema MUST publicar automáticamente en el catálogo el rompecabezas curado
  resultante, sin ningún paso adicional de publicación.
- **FR-026**: El sistema MUST rechazar la operación de carga y no publicar nada cuando la sesión
  del administrador ha expirado o ha sido revocada.

**Retirada de contenido del catálogo**

- **FR-027**: El sistema MUST publicar los rompecabezas marcados como públicos por un jugador
  de forma inmediata, sin revisión previa ni cola de aprobación.
- **FR-028**: El sistema MUST permitir al administrador autenticado retirar cualquier entrada
  del catálogo, sea curada o publicada por un jugador.
- **FR-029**: El sistema MUST dejar de mostrar a los jugadores toda entrada retirada, en el
  listado y en cualquier ordenamiento.
- **FR-030**: El sistema MUST NOT eliminar el rompecabezas ni invalidar su enlace único al
  retirar su entrada del catálogo; quien tenga el enlace conserva el acceso privado.
- **FR-031**: El sistema MUST NOT afectar las salas ya creadas con un rompecabezas cuya entrada
  fue retirada; esas partidas continúan normalmente.
- **FR-032**: El sistema MUST restringir la acción de retirada al administrador autenticado,
  aplicando la misma verificación que FR-021.

**Estados de carga y error**

- **FR-033**: El sistema MUST indicar visualmente que el catálogo se está cargando mientras la
  primera pantalla no esté disponible.
- **FR-034**: El sistema MUST mostrar un mensaje de error con una acción de reintento cuando el
  catálogo no se puede cargar, en lugar de un listado vacío o una pantalla en blanco.
- **FR-035**: El sistema MUST distinguir el catálogo vacío (FR-006) del fallo de carga
  (FR-034), con mensajes diferentes.
- **FR-036**: El sistema MUST responder con un mensaje de rompecabezas no disponible cuando un
  jugador intenta usar una entrada que fue retirada mientras la tenía abierta.

**Errores**

- **FR-037**: El sistema MUST responder a los fallos con un formato de error uniforme que
  incluya un código estable y un mensaje descriptivo, incluidos acceso denegado, sesión
  expirada, rompecabezas inexistente o retirado, fallo de carga del catálogo y fallo de
  retirada.

### Key Entities

- **Entrada de catálogo**: presencia pública de un rompecabezas en el catálogo. Atributos:
  rompecabezas referenciado, origen (curado por administrador o publicado por jugador), fecha
  de publicación, contador de partidas y estado (visible o retirada). El origen es información
  interna y no se expone en la interfaz; el estado retirada la excluye del listado sin borrar
  el rompecabezas.
- **Rompecabezas**: definido en la especificación 002. Aporta la imagen de referencia, la
  cantidad de piezas y la geometría de las piezas. El catálogo no lo modifica.
- **Administrador**: cuenta autenticada con permiso para cargar rompecabezas curados. Es la
  única identidad con cuenta en el producto; los jugadores no tienen ninguna.
- **Contador de partidas**: número acumulado de salas creadas con un rompecabezas del catálogo.
  Alimenta el ordenamiento por más jugados y se muestra al jugador en la tarjeta del listado y
  en la pantalla de detalle.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Un jugador pasa de abrir el catálogo a tener el rompecabezas seleccionado y listo
  para usarse en una sala en menos de 30 segundos bajo condiciones normales de conexión.
- **SC-002**: La primera pantalla del catálogo se muestra en menos de 2 segundos.
- **SC-003**: SC-002 se mantiene con un catálogo de 500 rompecabezas.
- **SC-004**: El 0% de los rompecabezas privados aparecen en el catálogo.
- **SC-005**: El 100% de los intentos de acceso a la administración sin cuenta de administrador
  son denegados, y en ninguno de ellos se muestra opción alguna de carga de contenido.
- **SC-006**: El 100% de los rompecabezas seleccionados desde el catálogo conservan exactamente
  la cantidad de piezas con la que fueron creados.
- **SC-007**: El administrador completa la carga de un rompecabezas curado en menos de 2
  minutos, sin contar el tiempo dedicado al encuadre.
- **SC-008**: Dos cargas consecutivas del catálogo con el mismo ordenamiento devuelven el mismo
  orden cuando no ha cambiado ningún dato.
- **SC-009**: Una entrada retirada por el administrador deja de aparecer en el catálogo para
  todos los jugadores en menos de 1 minuto, y en el 100% de los casos sin afectar las salas ya
  creadas con ese rompecabezas.

## Dependencies

- **D-001 (resuelta, requiere cambio en 002)**: La especificación 002 (creación desde foto)
  definía todos los rompecabezas como privados y declaraba la publicación fuera de alcance.
  **Decisión**: 002 se amplía con una opción de marcar el rompecabezas como público en el
  momento de crearlo, con **privado como valor por defecto**. La visibilidad se decide una sola
  vez, al crear, y no cambia después. El catálogo (FR-002) consume esa marca para incluir los
  rompecabezas publicados por jugadores junto a los curados. La ampliación de 002 debe estar
  implementada antes de que FR-002 pueda satisfacerse con contenido de jugadores; hasta
  entonces el catálogo opera solo con contenido curado.
- **D-002**: La especificación 001 (sala de armado) consume el rompecabezas seleccionado. Esta
  funcionalidad lo deja preparado; la creación de la sala y el armado quedan fuera de su
  alcance.
- **D-003**: La geometría de las piezas y la cantidad de piezas provienen del rompecabezas ya
  creado (002). El catálogo no las recalcula ni las altera.

## Assumptions

- **"Más jugados" se mide como el número acumulado de salas creadas con ese rompecabezas.** Se
  cuenta al crear la sala, no al completar la partida, porque es la señal de interés más
  directa y no depende de que la partida termine.
- El ordenamiento es una elección explícita del jugador entre dos opciones; no hay orden
  personalizado, algorítmico ni por relevancia.
- El listado carga por tramos mediante avance incremental. El tamaño de tramo es un valor fijo
  configurable.
- La imagen de referencia mostrada en el catálogo es la imagen recortada que define el
  rompecabezas, en tamaño reducido.
- El administrador es un conjunto pequeño y fijo de cuentas gestionadas fuera de la aplicación.
  No existe auto-registro de administradores ni pantalla para crear nuevos administradores.
- La cuenta de administrador es la única identidad con inicio de sesión en el producto. Esto no
  contradice el acceso sin cuentas de los jugadores: la administración no es funcionalidad de
  juego.
- Un rompecabezas público conserva además su enlace único; ser público añade visibilidad, no
  reemplaza el acceso por enlace.
- La visibilidad de un rompecabezas se decide al crearlo y no cambia después. Cambiar un
  rompecabezas de privado a público o al revés queda fuera de alcance.
- El catálogo es único y global; no hay catálogos por región, idioma ni segmento.
- "Condiciones normales de conexión" significa banda ancha o 4G estable, con el jugador en la
  misma región geográfica que el servicio.

## Riesgos Aceptados

- **Ventana de exposición antes de la retirada**: los rompecabezas que un jugador marca como
  públicos aparecen en el catálogo de inmediato, sin revisión previa. La moderación es
  **reactiva**: el administrador puede retirar cualquier entrada (FR-028), pero entre la
  publicación y la retirada el contenido es visible para todos. El riesgo residual es esa
  ventana, y depende de que el administrador se entere. Se asume conscientemente: una cola de
  aprobación previa fue descartada por convertir al administrador en cuello de botella del
  flujo de publicación.
- **Sin canal de reporte**: no existe forma de que un jugador avise al administrador sobre
  contenido inapropiado. La detección depende exclusivamente de que el administrador revise el
  catálogo por su cuenta.

## Out of Scope

Explícitamente fuera del alcance de esta funcionalidad:

- Búsqueda por texto dentro del catálogo.
- Filtros por categoría, temática, dificultad o cantidad de piezas.
- Calificaciones, reseñas, comentarios o favoritos de los jugadores.
- Elegir una cantidad de piezas distinta a la que el rompecabezas ya tiene definida.
- Moderación automática del contenido y revisión previa a la publicación (cola de aprobación).
- Canal para que los jugadores reporten contenido inapropiado.
- Editar o eliminar definitivamente un rompecabezas ya creado. La retirada del catálogo
  (FR-028) oculta la entrada pero no borra el rompecabezas ni su enlace.
- Cambiar la visibilidad de un rompecabezas después de creado.
- Estadísticas o panel de métricas para el administrador más allá de la carga de contenido.
- Gestión de cuentas de administrador desde la aplicación.
- La creación de la sala y el armado colaborativo (especificación 001).
