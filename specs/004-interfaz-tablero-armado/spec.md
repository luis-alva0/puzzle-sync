# Feature Specification: Interfaz del Tablero de Armado

**Feature Branch**: `004-interfaz-tablero-armado`

**Created**: 2026-08-10

**Status**: Draft

**Input**: User description: "Asi de debe ver la interfaz del armado de rompecabezas (imagenes adjuntas). Tienes dos ejemplos, una con 104 piezas y otra con 150 piezas, mira como no se solapan entre ellas y se colocan de manera que en el centro queda un espacio libre. Las piezas deben estar rotadas en el sentido en el que van puestas, por el momento no se debe poder rotar piezas. En la barra de navegacion superior se debe poder ver elementos como: el estado de 'conectado', el tiempo transcurrido, un boton para entrar en full screen, un icono de imagen que al hacer hover sobre el con el mouse se muestra la imagen completa del rompecabezas para que sirva como ayuda para armar (asi como se ve en la tercera foto), y en la esquina izquierda un boton para desplegar el menu que aun no definimos (puedes implementar las opciones que creas convenientes, luego refinaremos esto). La forma de las piezas la debes copiar de la foto de referencia (para mayor investigacion se trata de https://www.jigsawexplorer.com/)."

---

## Contexto

La feature 001 dejó un tablero funcional pero visualmente crudo: las piezas se reparten en
posiciones aleatorias que **se solapan entre sí**, y no hay ninguna barra de herramientas. Esta
funcionalidad no añade capacidades nuevas de juego —no cambia la captura, ni el encaje, ni la
sincronización—, sino que hace que el tablero **se pueda usar de verdad**.

Las tres imágenes de referencia (jigsawexplorer.com) definen el objetivo:

1. **104 piezas** repartidas en una banda alrededor del borde, sin solaparse, con el centro libre.
2. **150 piezas** con la misma disposición, banda más densa, mismo centro libre.
3. La imagen completa mostrada en ese centro libre al posar el ratón sobre el icono de imagen.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Ver todas las piezas de un vistazo, sin que se tapen (Priority: P1)

Una persona entra a una sala recién creada. En lugar de un montón de piezas amontonadas unas
encima de otras, ve **todas las piezas repartidas en una banda alrededor del borde**, cada una
visible por completo, con un área despejada en el centro donde va a armar. Puede reconocer el
contenido de cada pieza sin tener que moverlas primero.

**Why this priority**: Es la diferencia entre un tablero que se puede usar y uno que no. Con
piezas solapadas, encontrar una pieza concreta exige apartar las de encima, y en un rompecabezas
de 100 o más piezas eso convierte el juego en una tarea de excavación. Sin esta historia las
demás no aportan nada.

**Independent Test**: Crear una sala de 104 piezas y comprobar que ninguna pieza tapa
parcialmente a otra, que el rectángulo central queda despejado, y que ese rectángulo es al menos
tan grande como el rompecabezas armado.

**Acceptance Scenarios**:

1. **Given** una sala nueva de 104 piezas, **When** el jugador abre el tablero, **Then** las 104
   piezas están repartidas en una banda perimetral y **ninguna se solapa con otra**.
2. **Given** una sala nueva de 150 piezas, **When** el jugador abre el tablero, **Then** la banda
   perimetral se hace más densa para acomodarlas, y el centro sigue despejado.
3. **Given** dos jugadores en la misma sala, **When** ambos abren el tablero, **Then** ven las
   piezas en **las mismas posiciones**: la disposición inicial forma parte del estado compartido,
   no se calcula en cada pantalla.
4. **Given** cualquier pieza del tablero, **When** el jugador la observa, **Then** está orientada
   tal y como encaja en la imagen final, sin girar.
5. **Given** un jugador que arrastra una pieza al centro, **When** la suelta, **Then** el
   comportamiento de captura y encaje de la feature 001 no cambia en absoluto.

---

### User Story 2 - Reconocer las piezas por su forma (Priority: P1)

Las piezas tienen la silueta clásica de rompecabezas: lengüetas redondeadas que sobresalen y
huecos que las reciben, con un borde que las separa visualmente del fondo. Las piezas del
contorno exterior del rompecabezas tienen **lados rectos**, igual que en un rompecabezas físico,
lo que permite identificarlas y empezar por ahí.

**Why this priority**: Es la mitad de la información que usa una persona para armar. Sin forma
distinguible, solo queda el color, y en zonas de cielo o césped uniforme el rompecabezas se
vuelve imposible. Va emparejada con la US1 porque una banda ordenada de cuadrados sigue sin
servir para jugar.

**Independent Test**: Generar un rompecabezas y comprobar visualmente que las piezas del borde
tienen lado recto hacia afuera, que las interiores tienen lengüetas y huecos, y que dos piezas
vecinas encajan una en la otra sin dejar hueco ni superponerse.

**Acceptance Scenarios**:

1. **Given** una pieza de la esquina, **When** el jugador la mira, **Then** tiene dos lados rectos
   contiguos.
2. **Given** una pieza del borde superior, **When** el jugador la mira, **Then** su lado superior
   es recto y los otros tres tienen lengüeta o hueco.
3. **Given** dos piezas vecinas, **When** se colocan encajadas, **Then** la lengüeta de una ocupa
   exactamente el hueco de la otra.
4. **Given** cualquier pieza, **When** se dibuja sobre el fondo, **Then** su silueta se distingue
   del fondo por un contorno o sombra.

---

### User Story 3 - Consultar la imagen de referencia sin perder el tablero (Priority: P2)

Mientras arma, la persona necesita mirar cómo es la imagen completa. Posa el ratón sobre el icono
de imagen de la barra superior y la fotografía aparece en el área central libre, del tamaño
aproximado del rompecabezas armado. Al quitar el ratón, desaparece y el tablero vuelve a estar
como estaba.

**Why this priority**: Es la ayuda que hace que un rompecabezas de 150 piezas sea abordable, pero
el tablero funciona sin ella. Va después de US1 y US2.

**Independent Test**: Posar el ratón sobre el icono, comprobar que la imagen aparece en el centro
y no tapa las piezas de la banda; quitarlo y comprobar que desaparece sin dejar rastro.

**Acceptance Scenarios**:

1. **Given** un jugador en el tablero, **When** posa el ratón sobre el icono de imagen,
   **Then** la imagen completa del rompecabezas aparece en el área central.
2. **Given** la imagen visible, **When** el jugador retira el ratón del icono, **Then** la imagen
   desaparece.
3. **Given** la imagen visible, **When** otro jugador mueve una pieza, **Then** ese movimiento se
   sigue recibiendo y aplicando: la ayuda es local y no interrumpe la partida.
4. **Given** un dispositivo sin ratón, **When** el jugador toca el icono, **Then** la imagen se
   muestra, y se oculta al tocar de nuevo o fuera de ella.

---

### User Story 4 - Barra superior con el estado de la partida (Priority: P2)

La barra superior reúne, sin tapar el tablero, lo que la persona necesita consultar de un vistazo:
si sigue conectada, cuánto tiempo lleva la partida, el acceso a la imagen de referencia, el paso a
pantalla completa y el menú.

**Why this priority**: Ordena elementos que hoy están sueltos o no existen. Aporta mucho a la
sensación de producto terminado, pero el juego funciona sin ella.

**Independent Test**: Abrir el tablero y comprobar que los cinco elementos están presentes,
legibles y que ninguno tapa piezas.

**Acceptance Scenarios**:

1. **Given** un jugador conectado, **When** mira la barra, **Then** ve un indicador de estado
   **conectado**.
2. **Given** un jugador que pierde la conexión, **When** mira la barra, **Then** el indicador pasa
   a **reconectando** y vuelve a **conectado** al restablecerse, reflejando el comportamiento que
   la feature 001 ya define.
3. **Given** una sala en curso, **When** el jugador mira la barra, **Then** ve el tiempo
   transcurrido desde que empezó la partida, avanzando segundo a segundo.
4. **Given** dos jugadores en la misma sala que entraron en momentos distintos, **When** ambos
   miran el tiempo, **Then** ven **el mismo valor**: el cronómetro cuenta desde el inicio de la
   partida, no desde que cada uno entró.
5. **Given** un jugador en el tablero, **When** pulsa el botón de pantalla completa, **Then** el
   tablero ocupa toda la pantalla y el botón permite volver.
6. **Given** un jugador en el tablero, **When** pulsa el botón de menú de la esquina izquierda,
   **Then** se despliega un menú con las opciones disponibles y se cierra al elegir una o al
   pulsar fuera.

---

### Edge Cases

- **Más piezas de las que caben**: un rompecabezas de 500 piezas necesita mucho más espacio
  perimetral que uno de 20. El sistema debe seguir garantizando que no se solapan.
  [NEEDS CLARIFICATION: ¿Cómo se resuelve? Ver Q1.]
- **Pantallas pequeñas**: una banda perimetral que funciona en un monitor no cabe igual en un
  teléfono. [NEEDS CLARIFICATION: ¿Está el teléfono en alcance? Ver Q2.]
- **Rompecabezas muy alargado**: una imagen panorámica produce una cuadrícula muy ancha y baja;
  la banda perimetral y el hueco central deben seguir la proporción de la imagen, no ser siempre
  un cuadrado.
- **Piezas ya movidas**: si un jugador entra a una sala en curso, ve las piezas donde están, no
  la disposición inicial. La banda perimetral es solo el punto de partida.
- **Partida completada**: al terminar, todas las piezas están en el centro y la banda queda
  vacía. La barra superior sigue visible y el cronómetro se detiene.
- **Imagen de referencia no disponible**: si la imagen no carga, el icono debe indicarlo en lugar
  de mostrar un recuadro vacío.
- **Pantalla completa denegada**: algunos navegadores la rechazan si no viene de un gesto directo;
  el botón no debe quedar en un estado inconsistente.
- **Redimensionar la ventana**: cambiar el tamaño de la ventana no puede mover las piezas, porque
  sus posiciones son estado compartido con los demás jugadores.

## Requirements *(mandatory)*

### Functional Requirements

**Disposición inicial de las piezas**

- **FR-001**: Al crear una sala, el sistema DEBE repartir las piezas en una banda alrededor del
  perímetro del tablero, dejando libre un área rectangular en el centro.
- **FR-002**: El sistema DEBE garantizar que **ninguna pieza se solapa con otra** en la
  disposición inicial.
- **FR-003**: El área central libre DEBE ser al menos tan grande como el rompecabezas armado, y
  DEBE respetar su proporción ancho/alto.
- **FR-004**: Las piezas DEBEN colocarse en su orientación correcta, sin rotación.
- **FR-005**: El sistema NO DEBE ofrecer ninguna forma de rotar piezas.
- **FR-006**: La disposición inicial DEBE formar parte del estado compartido de la sala: todos los
  jugadores ven las mismas piezas en las mismas posiciones.
- **FR-007**: La banda perimetral DEBE ajustar su grosor a la cantidad de piezas, de modo que
  quepan todas sin solaparse.
- **FR-008**: El reparto DEBE distribuir las piezas de forma que no queden agrupadas por vecindad
  en la imagen: dos piezas contiguas del rompecabezas no deben acabar contiguas en la banda.

**Forma y dibujo de las piezas**

- **FR-009**: Cada pieza DEBE dibujarse con la silueta de rompecabezas clásico: lados con lengüeta
  saliente, lados con hueco entrante y lados rectos.
- **FR-010**: Las piezas del contorno exterior del rompecabezas DEBEN tener rectos los lados que
  dan al exterior.
- **FR-011**: La lengüeta de una pieza y el hueco de su vecina DEBEN ser complementarios, de modo
  que al encajar no quede espacio ni superposición.
- **FR-012**: Cada pieza DEBE mostrar la porción de imagen que le corresponde, recortada según su
  silueta, incluidas las lengüetas.
- **FR-013**: Cada pieza DEBE distinguirse del fondo mediante contorno, sombra o ambos.
- **FR-014**: El fondo del tablero DEBE ser una superficie neutra que no compita visualmente con
  las piezas.

**Barra superior**

- **FR-015**: El tablero DEBE mostrar una barra superior fija que no tape piezas.
- **FR-016**: La barra DEBE mostrar el estado de conexión del jugador, reflejando los estados que
  la feature 001 ya define (conectado, reconectando, desconectado).
- **FR-017**: La barra DEBE mostrar el tiempo transcurrido desde el inicio de la partida,
  actualizándose al menos una vez por segundo.
- **FR-018**: El tiempo transcurrido DEBE ser el mismo para todos los jugadores de la sala,
  contado desde que la partida empezó y no desde que cada jugador entró.
- **FR-019**: El cronómetro DEBE detenerse cuando el rompecabezas se completa.
- **FR-020**: La barra DEBE incluir un control para entrar y salir de pantalla completa.
- **FR-021**: La barra DEBE incluir un icono de imagen que, al posar el ratón sobre él, muestre la
  imagen completa del rompecabezas en el área central.
- **FR-022**: La imagen de referencia DEBE ocultarse al retirar el ratón del icono.
- **FR-023**: En dispositivos táctiles, la imagen de referencia DEBE poder mostrarse y ocultarse
  mediante toque.
- **FR-024**: Mostrar la imagen de referencia NO DEBE interrumpir la recepción ni el envío de
  movimientos: es una ayuda local que no afecta a los demás jugadores.
- **FR-025**: La barra DEBE incluir, en la esquina izquierda, un botón que despliegue un menú.
- **FR-026**: El menú DEBE ofrecer, como punto de partida a refinar más adelante: ver el código de
  la sala y copiarlo, ver la lista de jugadores conectados, salir de la sala y ver la ayuda.
- **FR-027**: El menú DEBE cerrarse al elegir una opción o al pulsar fuera de él.

**Compatibilidad con lo ya construido**

- **FR-028**: Esta funcionalidad NO DEBE alterar las reglas de captura, movimiento, encaje ni
  finalización que define la feature 001.
- **FR-029**: Los elementos de la interfaz que hoy existen sueltos —indicador de conexión, lista
  de jugadores, aviso de completado— DEBEN integrarse en la nueva disposición sin duplicarse.

### Key Entities

- **Disposición inicial**: el conjunto de posiciones que ocupa cada pieza al empezar la partida.
  Se calcula una sola vez, al crear la sala, y queda guardada como parte del estado compartido.
- **Área de armado**: el rectángulo central libre de piezas, con la proporción del rompecabezas.
  Es donde se muestra la imagen de referencia y donde se espera que se arme.
- **Silueta de pieza**: la forma de cada pieza, determinada por sus cuatro lados. Ya existe en el
  proyecto; esta funcionalidad la lleva al tablero.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: En una sala recién creada, **el 100 % de las piezas es visible por completo**:
  ninguna queda tapada ni parcialmente por otra.
- **SC-002**: Un jugador puede localizar visualmente una pieza concreta descrita por su contenido
  en **menos de 15 segundos** en un rompecabezas de 104 piezas, sin mover ninguna pieza.
- **SC-003**: Dos jugadores que abren la misma sala recién creada ven **disposiciones idénticas**.
- **SC-004**: La imagen de referencia aparece en **menos de 300 ms** desde que el ratón entra en
  el icono, y desaparece igual de rápido al salir.
- **SC-005**: El tiempo transcurrido que ven dos jugadores de la misma sala **no difiere en más de
  1 segundo**.
- **SC-006**: El tablero mantiene **al menos 50 imágenes por segundo** durante el arrastre de una
  pieza en un rompecabezas de 150 piezas.
- **SC-007**: Una persona que nunca ha usado la aplicación identifica correctamente, en la primera
  pantalla y sin ayuda, **dónde están las piezas y dónde se arma**.
- **SC-008**: Las piezas del contorno exterior son identificables por su lado recto en el **100 %**
  de los casos.

## Assumptions

- **A-001**: El cronómetro cuenta desde el momento en que se creó la sala, que es el dato de
  inicio que la feature 001 ya registra en el histórico de partidas.
- **A-002**: El menú desplegable es provisional. El usuario pidió explícitamente proponer opciones
  razonables para refinarlas después, así que su contenido no es un compromiso cerrado.
- **A-003**: Los iconos de mano y de selección que aparecen en las imágenes de referencia **no
  están en alcance**: el usuario enumeró los elementos que quiere y no los incluyó.
- **A-004**: No hay salas en curso que migrar: nada está desplegado todavía, así que el cambio de
  disposición no afecta a ninguna partida existente.
- **A-005**: La silueta de las piezas se toma de las imágenes de referencia
  (jigsawexplorer.com) como objetivo visual, no como copia de su implementación.
- **A-006**: El fondo del tablero es una superficie neutra tipo cartón o fieltro, como en la
  referencia. El color exacto es una decisión de diseño, no un requisito.
- **A-007**: La disposición inicial se calcula una sola vez al crear la sala y se guarda; no se
  recalcula al entrar cada jugador ni al redimensionar la ventana.

## Dependencies

- **D-001**: Depende de la feature 001, cuyo estado compartido de piezas y cuyo indicador de
  conexión se reutilizan y se reorganizan.
- **D-002**: Depende de la generación de siluetas que introdujo la feature 002, que ya produce
  bordes complementarios entre piezas vecinas.
- **D-003**: La imagen de referencia usa el mismo acceso a la imagen del rompecabezas que ya
  emplean las pantallas de detalle y de sala.

## Out of Scope

- Rotación de piezas, ni como capacidad ni como control.
- Herramientas de desplazamiento y selección por área que aparecen en las imágenes de referencia.
- Ordenar, filtrar o agrupar las piezas de la banda (por ejemplo, "mostrar solo los bordes").
- Personalizar el fondo, el tamaño de las piezas o el nivel de dificultad.
- Cambiar las reglas de captura, encaje, finalización o sincronización de la feature 001.
- El contenido definitivo del menú, que se refinará más adelante.
