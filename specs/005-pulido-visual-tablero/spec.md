# Feature Specification: Pulido Visual del Tablero

**Feature Branch**: `005-pulido-visual-tablero`

**Created**: 2026-08-11

**Status**: Draft

**Input**: User description: "Vamos a corregir detalles de UI. Primero que nada, las piezas no encajan entre si, en la foto que te mande se ve como se unen pero quedan espacios entre ellas. Ademas, las fotos deben de tener un efecto de borde/profundidad que hace que se vea mas realista como una pieza fisica. Las formas de las piezas deben ser iguales que las del ejemplo, seguro debe de tener unos pocos modelos de piezas que se repiten pero debes identificarlos y copiarlos. Ademas, cuando se juntan las piezas correctas se debe reproducir un sonido para saber que se unieron, y al mover un grupo de piezas se debe mover sin bugs visuales (actualmente hay un bug visual debido a que se mueve un bloque como si se estuviar moviendo solo la primera pieza y luego cuando se suelta se vuelve a centrar). Copia las proporciones de UI del ejemplo, actualmente el canvas no ocupa toda la ventana disponible como se ve en la foto. Identifica otros aspectos que se puedan mejorar."

## Clarifications

### Session 2026-08-11

- Q: Cuando otro jugador encaja dos piezas, ¿suena también en mi pantalla? → A: Sí. Suena todo encaje de la sala, propio o ajeno: el progreso es común y enterarse de que el compañero avanza es parte de jugar juntos.
- Q: Para que las piezas se vean un 25 % más grandes, ¿vale la pena sustituir la rejilla de huecos uniforme por un empaquetado por filas de anchura variable? → A: Sí. La rejilla uniforme fija el paso según la pieza más ancha posible; el empaquetado por filas usa la anchura real de cada una y sigue garantizando el no solape por construcción.
- Q: Con el contorno plano convertido en relieve, ¿cómo se muestra que una pieza está capturada? → A: El relieve se mantiene siempre y la captura añade un halo de color por fuera del contorno. Las dos señales conviven en canales distintos.
- Q: ¿El clic del encaje es un archivo de audio del repositorio o se genera con código? → A: Se genera con código. Sin archivo que licenciar en un repositorio público, sin recurso que cargar y sin bytes en la descarga.
- Q: En una sala retomada al día siguiente, ¿el cronómetro debe contar desde la creación o medir solo tiempo de juego? → A: Desde la creación, como está. No se toca: medir tiempo activo obligaría a acumularlo en el servidor y a definir qué cuenta como activo con varios jugadores.

---

## Contexto

Es la primera vez que se ve la aplicación funcionando. La feature 004 entregó el reparto en banda
y la barra superior, pero al mirarla al lado de la referencia (jigsawexplorer.com) el tablero no
pasa por un rompecabezas: las piezas parecen flores, se ven costuras entre las que ya están
unidas, arrastrar un bloque lo descoloca, y el tablero flota dentro de un marco oscuro en vez de
ocupar la ventana.

Esta funcionalidad **no añade capacidades de juego**. Corrige defectos y acerca el aspecto a la
referencia.

### Lo que se ve en la captura de la aplicación

| Defecto | Qué se observa |
|---|---|
| Costuras | La tira de piezas ya unidas del centro deja ver el fondo entre pieza y pieza |
| Silueta | Las piezas leen como flores o estrellas, no como piezas de rompecabezas |
| Sin relieve | Son recortes planos; no parecen cartón |
| Marco oscuro | La barra es azul marino y hay un borde oscuro alrededor del tablero |
| Área central | Se dibuja un rectángulo de contorno que en la referencia no existe |
| Banda holgada | Las piezas quedan muy separadas entre sí, y por eso salen pequeñas |

### Dos causas ya localizadas

Se investigaron antes de escribir esta especificación, porque cambian el tamaño del trabajo:

1. **La complementariedad de las lengüetas es correcta.** Se comprobó numéricamente: para los dos
   valores de signo, la lengüeta de una pieza y el hueco de su vecina se desplazan exactamente lo
   mismo. **Las costuras no vienen de la geometría de encaje**, así que hay que buscarlas en el
   dibujado.
2. **El bug del grupo tiene causa exacta.** Al arrastrar se envía la posición de la **pieza
   agarrada**, pero al pintar se interpreta como la posición del **ancla** del grupo —la pieza de
   menor fila y columna—. Si agarras cualquier otra, el bloque entero se dibuja desplazado por la
   distancia entre ambas, y al soltar el servidor aplica el movimiento correcto: de ahí el salto.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Las piezas unidas se ven como una sola pieza de cartón (Priority: P1)

Cuando dos piezas encajan, el jugador ve una superficie continua: la imagen sigue de una a otra
sin interrupciones y sin que el fondo del tablero asome por la junta. Se distingue la línea del
corte, como en un rompecabezas real, pero no un hueco.

**Why this priority**: Es lo primero que delata que esto no es un rompecabezas. Un jugador que ve
huecos entre piezas unidas duda de si de verdad encajaron.

**Independent Test**: Unir dos piezas y mirar la junta de cerca: no debe verse el fondo del
tablero en ningún punto del contorno compartido.

**Acceptance Scenarios**:

1. **Given** dos piezas vecinas, **When** encajan, **Then** no se ve el fondo del tablero entre
   ellas en ningún punto de la junta.
2. **Given** un grupo de varias piezas ya unidas, **When** el jugador lo observa, **Then** la
   imagen es continua a través de todas las juntas.
3. **Given** una pieza con lengüeta y su vecina con el hueco correspondiente, **When** encajan,
   **Then** la lengüeta ocupa el hueco por completo, sin espacio ni superposición visible.
4. **Given** un grupo unido, **When** se mira su contorno exterior, **Then** el borde del grupo se
   distingue del fondo con la misma claridad que el de una pieza suelta.

---

### User Story 2 - Arrastrar un grupo lo mueve entero, sin saltos (Priority: P1)

El jugador agarra cualquier pieza de un bloque ya formado y lo arrastra. El bloque sigue al cursor
como una unidad rígida, con la pieza agarrada exactamente bajo el puntero. Al soltar, el bloque se
queda donde el jugador lo dejó, sin reacomodarse.

**Why this priority**: Es un defecto que hace el juego incómodo en cuanto se forma el primer
bloque, que es justo cuando empieza a ser divertido.

**Independent Test**: Formar un grupo de tres o más piezas, agarrarlo por una que **no** sea la
de arriba a la izquierda y arrastrarlo. Ni salta al empezar ni se recoloca al soltar.

**Acceptance Scenarios**:

1. **Given** un grupo de varias piezas, **When** el jugador lo agarra por cualquiera de ellas,
   **Then** el bloque no salta: se queda donde estaba y empieza a seguir al cursor.
2. **Given** un grupo en movimiento, **When** el jugador mueve el cursor, **Then** la pieza
   agarrada permanece bajo el puntero y las demás conservan su posición relativa.
3. **Given** un grupo arrastrado, **When** el jugador suelta, **Then** el bloque se queda
   exactamente donde estaba al soltar, sin desplazarse.
4. **Given** dos jugadores en la sala, **When** uno arrastra un grupo, **Then** el otro lo ve
   moverse igual de entero y en la misma posición.

---

### User Story 3 - Las piezas tienen la silueta de un rompecabezas de verdad (Priority: P1)

Las piezas tienen la forma clásica: lengüetas de **cuello estrecho y cabeza redonda**, con sus
huecos complementarios. Un puñado de perfiles distintos que se repiten por el tablero, como en un
rompecabezas troquelado.

**Why this priority**: La forma es la mitad de la información que usa una persona para armar. Las
siluetas actuales —jorobas anchas y poco profundas, sin cuello— no dan pistas de encaje y hacen
que el tablero parezca otra cosa.

**Independent Test**: Comparar una pieza suelta con la de referencia: debe verse el cuello
estrechándose antes de la cabeza redonda, no una ondulación suave.

**Acceptance Scenarios**:

1. **Given** cualquier pieza con lengüeta, **When** el jugador la mira, **Then** la lengüeta tiene
   un cuello más estrecho que su cabeza.
2. **Given** el tablero completo, **When** se recorren las piezas, **Then** se reconocen unos
   pocos perfiles de lengüeta repetidos, no uno solo ni todos distintos.
3. **Given** dos piezas vecinas, **When** encajan, **Then** el perfil de la lengüeta y el del
   hueco coinciden exactamente.
4. **Given** las piezas del contorno exterior, **When** se miran, **Then** conservan sus lados
   rectos hacia afuera.

---

### User Story 4 - Las piezas parecen cartón, no recortes planos (Priority: P2)

Cada pieza tiene un relieve sutil en el borde —una arista clara arriba y una sombra abajo— que
sugiere grosor. El conjunto parece un rompecabezas físico sobre una mesa.

**Why this priority**: Es lo que separa un prototipo de un producto, pero el juego funciona sin
ello.

**Acceptance Scenarios**:

1. **Given** una pieza suelta, **When** el jugador la mira, **Then** su borde muestra relieve y no
   un contorno plano de un solo color.
2. **Given** una pieza suelta sobre el tablero, **When** el jugador la mira, **Then** proyecta una
   sombra corta que la despega del fondo, sin ensuciarlo.
3. **Given** un grupo unido, **When** el jugador lo mira, **Then** el relieve marca el contorno
   **del grupo**, y las juntas interiores se ven como líneas de corte, no como bordes de piezas
   sueltas apiladas.

---

### User Story 5 - Un sonido confirma que dos piezas encajaron (Priority: P2)

Al unirse dos piezas correctas suena un clic breve. El jugador sabe que acertó sin tener que
mirar fijamente la junta.

**Why this priority**: Refuerzo inmediato del único acierto del juego. Prescindible, pero barato y
muy notorio.

**Acceptance Scenarios**:

1. **Given** un jugador arrastrando una pieza, **When** encaja con otra, **Then** suena un clic
   breve.
2. **Given** una pieza que se suelta sin encajar, **When** cae en el tablero, **Then** no suena
   nada.
3. **Given** un encaje en cascada que une varios grupos a la vez, **When** ocurre, **Then** suena
   **una sola vez**, no una por pareja.
4. **Given** un jugador que ha silenciado el sonido, **When** encaja una pieza, **Then** no suena
   nada, y la preferencia se recuerda al volver.

---

### User Story 6 - El tablero ocupa toda la ventana (Priority: P2)

La barra superior es una franja delgada del color del tablero, y justo debajo el tablero llega
hasta los cuatro bordes de la ventana. No hay marco oscuro ni márgenes desaprovechados.

**Why this priority**: Cada píxel que gana el tablero es tamaño de pieza. Con 500 piezas es la
diferencia entre jugables e incómodas.

**Acceptance Scenarios**:

1. **Given** el tablero abierto, **When** el jugador lo mira, **Then** la superficie del tablero
   llega a los bordes izquierdo, derecho e inferior de la ventana.
2. **Given** el tablero abierto, **When** el jugador mira arriba, **Then** la barra es una franja
   delgada, del mismo color que el tablero, sin separación entre ambos.
3. **Given** el área central de armado, **When** el jugador la mira, **Then** no hay ningún
   rectángulo de contorno dibujado.
4. **Given** un rompecabezas de 104 piezas, **When** se compara con la referencia, **Then** las
   piezas se ven de un tamaño comparable, no notablemente más pequeñas.

---

### Edge Cases

- **Sonido bloqueado por el navegador**: los navegadores no dejan sonar nada antes de que el
  usuario interactúe con la página. El primer encaje llega siempre después de un arrastre, así que
  no debería darse; si el navegador lo rechaza igualmente, no puede romper el encaje.
- **Encaje provocado por otro jugador**: suena igual que el propio. Es progreso compartido y el
  jugador quiere enterarse.
- **Muchos encajes seguidos**: al completar los últimos huecos pueden encadenarse varias uniones
  en poco tiempo, y con dos jugadores encajando a la vez el riesgo se duplica. El sonido no puede
  solaparse consigo mismo hasta convertirse en ruido.
- **Encaje ajeno que llega en ráfaga tras reconectar**: al recuperar el estado se descubren de
  golpe todos los encajes ocurridos durante la ausencia. Eso NO es un encaje que acaba de pasar y
  no debe sonar; si no, volver de una desconexión sería una traca.
- **Piezas del borde exterior**: no tienen lengüeta hacia afuera, así que su relieve no puede
  suponer que las cuatro caras sobresalen.
- **Grupo capturado**: el halo debe rodear el contorno **del grupo**, igual que el relieve, y no
  aparecer en cada pieza por separado. Un bloque de veinte piezas con veinte halos sería ilegible.
- **Halo y sombra a la vez**: la pieza capturada lleva halo por fuera y sombra por debajo. Los dos
  se dibujan alrededor del contorno y no pueden mezclarse en un borrón.
- **Grupo agarrado por su propia ancla**: es el caso que hoy funciona por casualidad; debe seguir
  funcionando después del arreglo.
- **Grupo grande arrastrado deprisa**: mover cincuenta piezas a la vez no puede degradar el
  arrastre.
- **Imagen muy alargada**: si la proporción de la foto no coincide con la de la cuadrícula, las
  piezas salen estiradas. Se ve poco porque la cuadrícula se elige a partir de la foto, pero el
  relieve lo hará más evidente.

## Requirements *(mandatory)*

### Functional Requirements

**Encaje sin costuras**

- **FR-001**: Dos piezas encajadas NO DEBEN dejar ver el fondo del tablero en ningún punto de su
  junta.
- **FR-002**: La imagen DEBE ser continua a través de la junta: la porción que muestra una pieza
  DEBE alinearse con la de su vecina sin salto ni repetición.
- **FR-003**: La junta entre dos piezas unidas DEBE seguir siendo visible como línea de corte. No
  se resuelve haciendo desaparecer el contorno.

**Arrastre de grupos**

- **FR-004**: Al agarrar un grupo por cualquiera de sus piezas, el grupo NO DEBE desplazarse en el
  instante de agarrarlo.
- **FR-005**: Durante el arrastre, la pieza agarrada DEBE permanecer bajo el puntero.
- **FR-006**: Durante el arrastre, las piezas del grupo DEBEN conservar su posición relativa.
- **FR-007**: Al soltar, el grupo DEBE quedarse donde estaba en el último instante del arrastre,
  sin reacomodarse.
- **FR-008**: Los demás jugadores DEBEN ver el grupo moverse entero y en la misma posición.

**Silueta de las piezas**

- **FR-009**: Las lengüetas DEBEN tener cuello más estrecho que la cabeza.
- **FR-010**: El sistema DEBE usar un conjunto pequeño de perfiles de lengüeta —entre dos y seis—
  repartidos por el tablero, en lugar de un perfil único o de uno distinto por borde.
- **FR-011**: Cada perfil de lengüeta DEBE tener su hueco exactamente complementario.
- **FR-012**: Las piezas del contorno exterior DEBEN conservar rectos los lados que dan afuera.
- **FR-013**: La silueta DEBE ser reconocible como pieza de rompecabezas al tamaño en que se
  dibuja con 500 piezas, que es el más pequeño admitido.

**Relieve**

- **FR-014**: Cada pieza DEBE dibujarse con un relieve en el borde que sugiera grosor.
- **FR-015**: Cada pieza suelta DEBE proyectar una sombra corta sobre el tablero.
- **FR-016**: En un grupo unido, el relieve y la sombra DEBEN marcar el contorno **del grupo**; las
  juntas interiores se dibujan como líneas de corte.
- **FR-017**: El relieve NO DEBE oscurecer la imagen hasta impedir reconocer el contenido de la
  pieza.
- **FR-017a**: Una pieza capturada DEBE conservar su relieve y añadir un **halo de color por
  fuera** del contorno, no sustituir uno por otro.
- **FR-017b**: El halo DEBE distinguir la captura propia de la ajena, como hoy, y DEBE convivir
  con la etiqueta del alias que ya existe.
- **FR-017c**: El halo DEBE dibujarse por fuera del contorno, sin invadir la imagen de la pieza:
  la señal de "ocupada" no puede estropear la de "esto es cartón".

**Sonido**

- **FR-018**: Al producirse un encaje DEBE reproducirse un sonido breve.
- **FR-018c**: El sonido DEBE generarse en el navegador, sin ningún archivo de audio en el
  repositorio ni descarga asociada.
- **FR-018a**: DEBE sonar tanto el encaje propio como el que hace otro jugador de la sala.
- **FR-018b**: Los encajes que se descubren al recuperar el estado tras una desconexión NO DEBEN
  sonar: no acaban de ocurrir.
- **FR-019**: Soltar una pieza sin encaje NO DEBE producir sonido.
- **FR-020**: Un encaje en cascada que una varios grupos DEBE producir **un solo** sonido.
- **FR-020a**: Varios encajes muy seguidos NO DEBEN acumular sonidos solapados. Con dos jugadores
  encajando a la vez, el tablero debe sonar a rompecabezas y no a matraca.
- **FR-021**: El jugador DEBE poder silenciar el sonido, y la preferencia DEBE recordarse entre
  visitas.
- **FR-022**: Si el navegador impide reproducir sonido, el encaje DEBE completarse igual.

**Proporciones de la interfaz**

- **FR-023**: El tablero DEBE llegar a los bordes izquierdo, derecho e inferior de la ventana.
- **FR-024**: La barra superior DEBE ser una franja delgada, sin margen entre ella y el tablero.
- **FR-025**: La barra DEBE ir en un color derivado del tablero, no en un color que contraste con
  él.
- **FR-026**: NO DEBE dibujarse ningún contorno alrededor del área central de armado.
- **FR-027**: Las piezas de la banda DEBEN colocarse **por filas de anchura variable**, ocupando
  cada una solo el espacio que de verdad necesita según por qué lados le sale lengüeta.
- **FR-027a**: La colocación DEBE seguir garantizando el no solape **por construcción**, sin
  comparar piezas entre sí y sin ningún bucle de reintento que pueda no terminar.
- **FR-027b**: La colocación DEBE seguir siendo determinista: la misma semilla produce la misma
  disposición, y todos los jugadores ven lo mismo.

**Lo que no cambia**

- **FR-028**: Las reglas de captura, encaje, finalización y sincronización NO DEBEN cambiar.
- **FR-028a**: La señal visual de pieza ocupada de la feature 001 DEBE seguir siendo reconocible a
  distancia, sin obligar a leer la etiqueta del alias.
- **FR-029**: La disposición inicial DEBE seguir siendo idéntica para todos los jugadores.
- **FR-030**: Ninguna pieza DEBE solaparse con otra en la disposición inicial.

### Key Entities

- **Perfil de lengüeta**: la forma de una lengüeta, con su cuello y su cabeza. Hay unos pocos y se
  reparten por los bordes del rompecabezas.
- **Preferencia de sonido**: activado o silenciado. Local a cada jugador y persistente.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: En un grupo de piezas unidas, **cero puntos** de la junta dejan ver el fondo.
- **SC-002**: Agarrar un grupo por cualquiera de sus piezas produce **cero desplazamiento**
  perceptible, ni al agarrar ni al soltar.
- **SC-003**: Una persona que ve una pieza suelta la identifica como pieza de rompecabezas
  **sin dudarlo**, incluso en un tablero de 500 piezas.
- **SC-004**: El sonido se oye **antes de 100 ms** desde que las piezas encajan, y antes de
  **1 segundo** cuando el encaje lo hizo otro jugador.
- **SC-004a**: Diez encajes en cinco segundos producen **como mucho** un sonido cada 150 ms; nunca
  dos superpuestos.
- **SC-005**: La superficie del tablero ocupa **al menos el 92 %** del alto de la ventana y el
  **100 %** del ancho.
- **SC-006**: Con 104 piezas, cada pieza se dibuja **al menos un 25 % más grande** que hoy.
- **SC-007**: El tablero mantiene **al menos 50 imágenes por segundo** arrastrando un grupo de 20
  piezas en un rompecabezas de 150.
- **SC-008**: Puestas la aplicación y la referencia una al lado de la otra, una persona **no sabe
  decir cuál tiene las piezas “de verdad”**.

## Assumptions

- **A-001**: Las causas localizadas en el Contexto se dan por buenas: el arreglo del arrastre pasa
  por hacer coincidir lo que se envía con lo que se interpreta al pintar, y las costuras hay que
  buscarlas en el dibujado y no en la geometría de encaje.
- **A-002**: El sonido se sintetiza en el navegador —una envolvente corta, del orden de 40 ms— en
  lugar de venir de un archivo. Tres motivos, en este orden: el repositorio es público y un audio
  arrastra su licencia y su procedencia; el Principio I pide no añadir piezas que mantener; y sin
  recurso que precargar, SC-004 se cumple sin esperar a nada. No se añade ninguna librería: el
  navegador sintetiza audio de serie.
- **A-002a**: El sonido resultante convence como clic seco, no como chasquido de cartón. Es el
  precio aceptado por no traer un archivo. Si algún día se quiere el sonido de verdad, cambiar la
  síntesis por un archivo es una sustitución local, no un rediseño.
- **A-003**: La preferencia de silencio se guarda en el navegador, como el alias. No viaja al
  servidor ni se comparte.
- **A-003a**: El encaje ajeno se detecta con lo que ya llega por el canal de tiempo real; no hace
  falta ningún mensaje nuevo. Por eso su sonido admite hasta 1 segundo de retraso mientras el
  propio se exige inmediato: uno es reacción a tu gesto y el otro, noticia de lo que pasa.
- **A-004**: "Unos pocos modelos que se repiten" se interpreta como un conjunto de perfiles fijos,
  elegido por borde de forma determinista a partir de la semilla del rompecabezas, para que dos
  jugadores sigan viendo lo mismo.
- **A-005**: El relieve se dibuja, no se toma de imágenes pregeneradas: el rompecabezas se corta
  en el navegador y no hay recursos por pieza.
- **A-006**: La rejilla de huecos uniforme que introdujo la feature 004 **se sustituye**. El
  motivo, medido: el paso único lo fija siempre la pieza más ancha posible —lengüeta saliente en
  dos lados opuestos, 148 unidades— aunque la pieza media ocupe 124, porque cada lado tiene
  lengüeta hacia fuera solo la mitad de las veces. Mientras el paso sea uno solo, calcular la caja
  real de cada pieza no sirve de nada.

  El reemplazo coloca las piezas en filas, una tras otra, sumando anchuras reales. Sigue sin haber
  detección de colisiones —dentro de una fila las piezas no pueden solaparse porque se colocan
  consecutivas— y sigue terminando siempre, que eran las dos razones por las que 004 eligió la
  rejilla.
- **A-006a**: El ~25 % de SC-006 viene solo del empaquetado. Quitar el marco oscuro y adelgazar la
  barra (FR-023, FR-024) aporta su propio ~10 % por separado.
- **A-007**: Sigue sin haber desplazamiento ni ampliación del tablero: el tablero entero cabe en
  la ventana, como decidió la feature 004.

## Dependencies

- **D-001**: Depende de la feature 004 y **sustituye su rejilla de huecos uniforme** por un
  empaquetado por filas. La barra superior y el tamaño de tablero también se ajustan aquí.
- **D-002**: Depende de la generación de siluetas de la feature 002, cuyos perfiles de lengüeta se
  sustituyen.
- **D-003**: El arreglo del arrastre toca la reconciliación de estado en tiempo real de la feature
  001, que es lógica crítica según el Principio VI.

## Out of Scope

- Rotación de piezas.
- Desplazar y ampliar el tablero.
- Sonidos que no sean el del encaje: ni al capturar, ni al soltar, ni al completar.
- Cambiar lo que mide el cronómetro. Se planteó porque en una sala retomada al día siguiente marca
  un número enorme —21:42:34 en la captura que motivó esta funcionalidad— y se decidió dejarlo:
  medir tiempo de juego real exige acumularlo en el servidor y definir qué cuenta como activo con
  varios jugadores entrando y saliendo, y eso rompe la propiedad de la feature 004 de derivarlo de
  un solo dato, que es lo que hace que una desconexión no lo desajuste.
- Animaciones de encaje, partículas o celebración al terminar.
- Elegir el fondo del tablero o el estilo de corte.
- Cambiar las reglas de captura, encaje o sincronización.
