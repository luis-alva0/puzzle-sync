# Feature Specification: Armado Colaborativo en Tiempo Real dentro de una Sala

**Feature Branch**: `001-sala-armado-colaborativo`

**Created**: 2026-08-09

**Status**: Draft

**Input**: User description: "Especificar la funcionalidad de armado colaborativo de rompecabezas en tiempo real dentro de una sala. Los actores son el jugador que crea la sala, quien ingresa un alias para identificarse y genera un enlace de invitacion para compartir, y los jugadores invitados, quienes ingresan a la sala a traves de ese enlace y tambien ingresan un alias propio para diferenciarse dentro de la sala; todos los jugadores dentro de una sala tienen exactamente los mismos permisos, sin roles especiales para el creador. Una sala admite un maximo de cuatro jugadores conectados simultaneamente. [...] El criterio de exito medible para esta funcionalidad es que el movimiento de una pieza realizado por un jugador debe reflejarse en las pantallas de los demas jugadores conectados a la misma sala con una latencia percibida menor a un segundo bajo condiciones normales de conexion."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Crear una sala e invitar a otro jugador (Priority: P1)

Una persona quiere armar un rompecabezas con alguien más. Abre la aplicación, elige un
rompecabezas, escribe un alias para identificarse y obtiene un enlace de invitación que puede
compartir por el canal que prefiera. Quien recibe el enlace lo abre, escribe su propio alias y
entra directamente a la misma sala, sin crear cuenta ni iniciar sesión. Ambos ven la lista de
quiénes están dentro de la sala.

**Why this priority**: Sin sala compartida no existe colaboración. Es la puerta de entrada a
toda la funcionalidad y la única historia que entrega valor por sí sola (dos personas viendo
el mismo tablero).

**Independent Test**: Se puede probar completamente creando una sala desde un navegador,
abriendo el enlace en otro navegador, ingresando un alias distinto y verificando que ambos
aparecen en la lista de participantes de la misma sala viendo el mismo tablero inicial.

**Acceptance Scenarios**:

1. **Given** un visitante sin sesión previa, **When** crea una sala e ingresa un alias,
   **Then** entra a la sala y obtiene un enlace de invitación compartible.
2. **Given** una sala activa con un enlace de invitación válido, **When** otra persona abre el
   enlace e ingresa su alias, **Then** entra a la misma sala y ambos jugadores se ven
   mutuamente en la lista de participantes.
3. **Given** un jugador dentro de una sala, **When** revisa las acciones disponibles,
   **Then** dispone exactamente de las mismas acciones que cualquier otro participante, sin
   distinción entre creador e invitado.
4. **Given** una sala que ya tiene cuatro jugadores conectados, **When** una quinta persona
   intenta entrar mediante el enlace de invitación, **Then** el sistema rechaza el ingreso y
   muestra un mensaje indicando que la sala está llena.
5. **Given** un enlace de invitación que no corresponde a ninguna sala existente, **When**
   alguien lo abre, **Then** el sistema muestra un mensaje de sala no encontrada y ofrece
   crear una sala nueva.

---

### User Story 2 - Mover piezas en tiempo real con captura exclusiva (Priority: P2)

Estando dos o más jugadores en la misma sala, cada uno puede tomar una pieza y arrastrarla por
el tablero. Mientras un jugador tiene una pieza capturada, los demás la ven moverse en vivo
pero no pueden tomarla; la pieza queda visiblemente marcada como ocupada. Al soltarla, la
pieza queda libre para cualquiera.

**Why this priority**: Es el núcleo de la experiencia colaborativa. Sin captura exclusiva, dos
jugadores arrastrando la misma pieza producen un tablero incoherente.

**Independent Test**: Con dos clientes en la misma sala, tomar una pieza en el cliente A y
verificar en el cliente B que la pieza se desplaza en vivo, aparece marcada como ocupada y no
responde a intentos de captura hasta que A la suelta.

**Acceptance Scenarios**:

1. **Given** un jugador dentro de una sala activa, **When** captura una pieza libre, **Then**
   la pieza queda bloqueada para los demás jugadores mientras la mantiene capturada.
2. **Given** un jugador que está arrastrando una pieza capturada, **When** la desplaza por el
   tablero, **Then** los demás jugadores ven el desplazamiento en tiempo real.
3. **Given** una pieza capturada por un jugador, **When** otro jugador intenta tomarla,
   **Then** el intento es rechazado y ese jugador ve que la pieza está ocupada, junto con el
   alias de quien la tiene.
4. **Given** dos jugadores que intentan capturar la misma pieza libre en el mismo instante,
   **When** ambas solicitudes llegan al servidor, **Then** la captura la gana el jugador cuya
   solicitud fue recibida primero y el otro ve que la pieza ya está ocupada.
5. **Given** un jugador que tiene una pieza capturada, **When** la suelta, **Then** la pieza
   queda libre y cualquier otro jugador puede capturarla.

---

### User Story 3 - Encaje automático y movimiento en grupo (Priority: P3)

Cuando un jugador suelta una pieza junto a la pieza con la que realmente encaja, ambas se
conectan solas y quedan alineadas. Desde ese momento el conjunto se comporta como una sola
pieza: quien lo tome mueve todas sus piezas juntas, y todos los jugadores de la sala ven el
grupo formado.

**Why this priority**: Es lo que convierte movimientos sueltos en progreso real del
rompecabezas. Depende de que el movimiento colaborativo (US2) ya funcione.

**Independent Test**: Soltar una pieza dentro de la tolerancia de encaje junto a su pareja
correcta y verificar que se conectan, quedan alineadas, y que al arrastrar cualquiera de las
dos se mueven ambas, reflejándose igual en el otro cliente.

**Acceptance Scenarios**:

1. **Given** dos piezas adyacentes en el rompecabezas, **When** un jugador suelta una junto a
   su pareja correcta dentro de la tolerancia de encaje, **Then** ambas se conectan
   automáticamente y quedan alineadas en su posición relativa correcta.
2. **Given** dos piezas ya conectadas, **When** cualquier jugador captura una de ellas,
   **Then** ambas se mueven como un único grupo para todos los jugadores de la sala.
3. **Given** un grupo de piezas conectadas, **When** un jugador lo suelta junto a otro grupo o
   pieza con el que encaja correctamente, **Then** ambos se fusionan en un solo grupo mayor.
4. **Given** una pieza soltada lejos de su posición correcta, **When** se suelta, **Then** no
   se conecta con nada y queda libre en la posición donde fue soltada.
5. **Given** un grupo de piezas capturado por un jugador, **When** otro jugador intenta
   capturar cualquier pieza de ese grupo, **Then** el intento es rechazado por estar ocupado.

---

### User Story 4 - Reconexión automática sin pérdida de progreso (Priority: P4)

A un jugador se le cae la conexión a mitad del armado. La aplicación se lo indica y sigue
intentando reconectar sola. Cuando la red vuelve, el jugador regresa a la sala automáticamente
y ve el tablero tal como está en ese momento, incluyendo todo lo que los demás avanzaron
mientras estuvo fuera. No tiene que recargar la página ni volver a ingresar su alias.

**Why this priority**: Protege el activo central del producto — el progreso compartido — pero
solo tiene sentido una vez que hay progreso que perder (US2 y US3).

**Independent Test**: Cortar la red de un cliente mientras el otro sigue moviendo piezas,
restaurar la red y verificar que el cliente vuelve solo a la sala mostrando el estado más
reciente del tablero, sin recargar y sin haber perdido movimientos.

**Acceptance Scenarios**:

1. **Given** un jugador dentro de una sala activa, **When** pierde la conexión a internet,
   **Then** la interfaz muestra de forma visible el estado de conexión e intenta reconectar
   automáticamente sin intervención del jugador.
2. **Given** un jugador que perdió la conexión, **When** la conexión se restablece, **Then**
   el sistema lo reconecta automáticamente a la misma sala con el mismo alias y le muestra el
   estado actual y más reciente del tablero, sin pérdida de progreso.
3. **Given** un jugador que tenía una pieza capturada al desconectarse, **When** su
   desconexión se detecta, **Then** la pieza se libera automáticamente para que los demás
   puedan seguir armando.
4. **Given** un jugador desconectado, **When** los demás jugadores miran la lista de
   participantes, **Then** ven que ese jugador está desconectado y su plaza deja de ocupar
   cupo en el límite de cuatro conectados.

---

### User Story 5 - Completar el rompecabezas y registrarlo en el histórico (Priority: P5)

Cuando se coloca la última pieza, todos los que están en la sala reciben al mismo tiempo el
aviso de que el rompecabezas quedó completado. La partida se guarda en el histórico con la
hora en que empezó y la hora en que terminó, para poder consultarla después.

**Why this priority**: Cierra el ciclo de la experiencia y alimenta el histórico permanente
del producto, pero el armado ya entrega valor sin ella.

**Independent Test**: Conectar las piezas restantes hasta la última y verificar que todos los
clientes conectados reciben la notificación de completado y que la partida queda registrada en
el histórico con marca de inicio y de finalización.

**Acceptance Scenarios**:

1. **Given** un rompecabezas al que le falta una sola pieza por conectar, **When** un jugador
   conecta esa última pieza, **Then** el sistema notifica a todos los jugadores conectados en
   ese momento que el rompecabezas fue completado.
2. **Given** un rompecabezas recién completado, **When** se registra la partida, **Then** el
   histórico guarda la marca de tiempo de inicio y la de finalización de esa partida.
3. **Given** una partida ya registrada como completada, **When** transcurre cualquier periodo
   de tiempo, **Then** el registro sigue disponible en el histórico, sin purga automática.

---

### Edge Cases

- **Alias vacío o solo espacios**: el sistema no permite entrar hasta que se ingrese un alias
  válido.
- **Alias duplicado dentro de la misma sala**: se permite, y la interfaz los distingue con un
  sufijo numérico para que dos jugadores no aparezcan idénticos.
- **Desconexión con pieza capturada**: el bloqueo no puede quedar huérfano; la pieza se libera
  al detectarse la desconexión, de modo que el tablero nunca queda con una pieza bloqueada
  indefinidamente por alguien que ya no está.
- **Jugador que se va y vuelve**: mientras haya cupo entre los cuatro conectados, puede
  reingresar por el mismo enlace; su alias anterior se recupera si la sesión sigue vigente en
  su navegador.
- **Enlace de invitación inválido o de sala inexistente**: mensaje claro de sala no encontrada,
  nunca una pantalla en blanco o un error crudo.
- **Sala llena por reingreso**: si un jugador intenta volver y ya hay cuatro conectados, recibe
  el mismo mensaje de sala llena que cualquier otro.
- **Dos piezas soltadas casi al mismo tiempo en la misma zona de encaje**: el resultado es
  determinista y consistente para todos los jugadores; el orden de llegada al servidor decide.
- **Rompecabezas completado mientras un jugador está desconectado**: ese jugador no recibe la
  notificación en vivo, pero al reconectar ve el rompecabezas ya completado.
- **Último jugador abandona la sala**: el estado del tablero se conserva; la sala puede
  retomarse más tarde con el mismo enlace.
- **Movimiento recibido dos veces por reintento de red**: aplicar el mismo movimiento más de
  una vez no altera el resultado del tablero.

## Requirements *(mandatory)*

### Functional Requirements

**Salas, acceso e identidad**

- **FR-001**: El sistema MUST permitir crear una sala de armado sin cuenta, registro ni inicio
  de sesión.
- **FR-002**: El sistema MUST requerir un alias no vacío antes de que un jugador entre a una
  sala, tanto al crearla como al unirse.
- **FR-003**: El sistema MUST generar para cada sala un enlace de invitación compartible que
  permita a otras personas entrar directamente a esa sala.
- **FR-004**: El sistema MUST otorgar a todos los jugadores de una sala exactamente los mismos
  permisos, sin acciones reservadas al creador.
- **FR-005**: El sistema MUST limitar cada sala a un máximo de cuatro jugadores conectados
  simultáneamente.
- **FR-006**: El sistema MUST rechazar el ingreso a una sala que ya tiene cuatro jugadores
  conectados y mostrar un mensaje indicando que la sala está llena.
- **FR-007**: El sistema MUST mostrar a cada jugador la lista de participantes de la sala con
  su alias y su estado de conexión.
- **FR-008**: El sistema MUST mostrar un mensaje de sala no encontrada cuando se abre un enlace
  de invitación que no corresponde a una sala existente.

**Captura y movimiento de piezas**

- **FR-009**: El sistema MUST permitir a cualquier jugador de la sala capturar una pieza libre
  y arrastrarla por el tablero.
- **FR-010**: El sistema MUST bloquear una pieza capturada frente a los demás jugadores
  mientras permanezca capturada.
- **FR-011**: El sistema MUST propagar el desplazamiento de una pieza capturada a las pantallas
  de todos los demás jugadores de la sala en tiempo real.
- **FR-012**: El sistema MUST indicar visualmente que una pieza está ocupada e identificar el
  alias del jugador que la tiene capturada.
- **FR-013**: El sistema MUST resolver capturas simultáneas de la misma pieza otorgándola al
  jugador cuya solicitud fue recibida primero por el servidor, y MUST informar al resto que la
  pieza ya está ocupada.
- **FR-014**: El sistema MUST liberar la pieza y dejarla disponible para cualquier jugador
  cuando quien la tenía la suelta.
- **FR-015**: El sistema MUST liberar automáticamente las piezas capturadas por un jugador
  cuya desconexión ha sido detectada, sin dejar bloqueos huérfanos.

**Encaje y grupos**

- **FR-016**: El sistema MUST conectar automáticamente dos piezas adyacentes cuando un jugador
  suelta una dentro de la tolerancia de encaje respecto de su pareja correcta, alineándolas en
  su posición relativa correcta.
- **FR-017**: El sistema MUST tratar las piezas conectadas como un único grupo que se mueve en
  conjunto para todos los jugadores de la sala.
- **FR-018**: El sistema MUST fusionar grupos entre sí cuando un grupo se suelta dentro de la
  tolerancia de encaje respecto de otro grupo o pieza con el que encaja.
- **FR-019**: El sistema MUST dejar la pieza libre en la posición donde fue soltada cuando no
  encaja con nada.
- **FR-020**: El sistema MUST rechazar la captura de cualquier pieza que pertenezca a un grupo
  actualmente capturado por otro jugador.

**Estado, sincronización y reconexión**

- **FR-021**: El sistema MUST mantener el estado del tablero como estado autoritativo del lado
  del servidor, del cual los clientes son réplicas.
- **FR-022**: El sistema MUST reconectar automáticamente a un jugador que recupera conexión,
  sin requerir recarga de página ni reingreso del alias.
- **FR-023**: El sistema MUST entregar al jugador reconectado el estado actual y más reciente
  del tablero, incluyendo los cambios ocurridos durante su ausencia, sin pérdida de progreso.
- **FR-024**: El sistema MUST mostrar de forma visible el estado de conexión del jugador
  (conectado, reconectando, desconectado).
- **FR-025**: El sistema MUST garantizar que aplicar el mismo movimiento más de una vez no
  altere el resultado del tablero.
- **FR-026**: El sistema MUST conservar el estado del tablero cuando todos los jugadores
  abandonan la sala, permitiendo retomarla más tarde con el mismo enlace.

**Completado e histórico**

- **FR-027**: El sistema MUST detectar cuando todas las piezas quedan correctamente conectadas
  y notificar el completado a todos los jugadores conectados en ese momento.
- **FR-028**: El sistema MUST registrar en el histórico cada partida completada con su marca de
  tiempo de inicio y de finalización.
- **FR-029**: El sistema MUST conservar los registros del histórico de forma indefinida, sin
  purga ni limpieza automática.
- **FR-030**: El sistema MUST presentar todas las marcas de tiempo en hora local de Perú
  (UTC-5).

**Errores**

- **FR-031**: El sistema MUST responder a los fallos con un formato de error uniforme que
  incluya un código estable y un mensaje descriptivo, incluidos los casos de sala llena, sala
  inexistente, pieza ocupada y alias inválido.

### Key Entities

- **Sala**: espacio de armado compartido asociado a un rompecabezas concreto. Tiene un
  identificador usado en el enlace de invitación, un estado (en progreso / completada), un
  máximo de cuatro jugadores conectados, y marcas de tiempo de inicio y de finalización.
- **Jugador de sala**: participación de una persona en una sala, identificada por un alias de
  sesión y un estado de conexión. No es una cuenta ni una identidad persistente entre salas, y
  no otorga permisos diferenciados.
- **Pieza**: unidad del rompecabezas con una posición actual en el tablero, una posición
  correcta de destino, y un estado de captura (libre u ocupada por un jugador determinado).
- **Grupo de piezas**: conjunto de piezas ya conectadas entre sí que se desplaza y se captura
  como una sola unidad. Una pieza suelta es un grupo de un solo elemento.
- **Registro de partida**: entrada permanente del histórico con el rompecabezas armado, los
  alias de quienes participaron, y las marcas de tiempo de inicio y de finalización.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: El movimiento de una pieza realizado por un jugador se refleja en las pantallas
  de los demás jugadores de la misma sala con una latencia percibida menor a 1 segundo bajo
  condiciones normales de conexión.
- **SC-002**: Una sala con cuatro jugadores moviendo piezas al mismo tiempo mantiene la
  latencia de SC-001 sin degradación perceptible del arrastre.
- **SC-003**: En el 100% de los intentos de captura simultánea de la misma pieza, exactamente
  un jugador obtiene la pieza y el resto recibe el aviso de pieza ocupada; nunca dos jugadores
  mueven la misma pieza a la vez.
- **SC-004**: Tras restablecerse la conexión, el jugador vuelve a la sala y ve el tablero al
  día en menos de 5 segundos, con 0% de movimientos confirmados perdidos.
- **SC-005**: Una persona que recibe un enlace de invitación pasa de abrirlo a estar moviendo
  piezas en menos de 30 segundos, sin crear cuenta.
- **SC-006**: El 100% de las partidas completadas quedan registradas en el histórico con marca
  de inicio y de finalización, y siguen consultables indefinidamente.
- **SC-007**: Ningún tablero queda con una pieza bloqueada por un jugador ausente durante más
  de 30 segundos.
- **SC-008**: Todos los jugadores de una sala convergen al mismo estado del tablero: tras
  cualquier secuencia de movimientos, dos clientes de la misma sala muestran una disposición
  idéntica de piezas y grupos.

## Assumptions

- El rompecabezas (imagen y corte en piezas) ya existe y se selecciona al crear la sala. La
  creación de rompecabezas a partir de fotos y el catálogo de rompecabezas pre-creados son
  funcionalidades separadas, fuera del alcance de esta especificación.
- La consulta y visualización del histórico de partidas es una funcionalidad separada; aquí
  solo se especifica **escribir** el registro al completar una partida.
- El alias es identidad por sesión únicamente: no se reserva, no se verifica y no otorga
  permisos. Se recupera desde el navegador del jugador al reconectar mientras su sesión siga
  vigente.
- Se permiten alias duplicados dentro de una sala; la interfaz los desambigua visualmente.
- El límite de cuatro cuenta solo jugadores **conectados**. Un jugador desconectado libera su
  cupo, y podrá reingresar si al volver todavía hay espacio.
- La detección de desconexión y la liberación de las piezas que ese jugador tenía capturadas
  ocurre dentro de los 30 segundos posteriores a la caída (ver SC-007).
- La tolerancia de encaje (distancia máxima a la que dos piezas se consideran emparejadas al
  soltar) es un valor fijo configurable, igual para todos los jugadores y todas las piezas.
- "Condiciones normales de conexión" significa banda ancha o 4G estable, con los jugadores en
  la misma región geográfica que el servicio.
- El armado se realiza en navegador de escritorio con puntero (mouse o trackpad). La
  optimización para pantallas táctiles no es un objetivo de esta especificación.
- Una sala se asocia a un único rompecabezas. Cambiar de rompecabezas implica crear una sala
  nueva.

## Out of Scope

Explícitamente fuera del alcance de esta funcionalidad:

- Sistema de puntaje individual o de estadísticas por jugador.
- Turnos, modo competitivo o cualquier mecánica de competencia.
- Modo espectador.
- Visualización en tiempo real del cursor o posición del mouse de los demás jugadores.
- Chat, voz o cualquier canal de comunicación entre jugadores.
- Roles, moderación, expulsión de jugadores o salas privadas con contraseña.
