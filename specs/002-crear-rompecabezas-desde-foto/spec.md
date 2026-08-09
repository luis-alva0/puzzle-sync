# Feature Specification: Creación de un Rompecabezas a partir de una Foto

**Feature Branch**: `002-crear-rompecabezas-desde-foto`

**Created**: 2026-08-09

**Status**: Draft

**Input**: User description: "Especificar la funcionalidad de creacion de un rompecabezas a partir de una foto subida por el usuario. Esta funcionalidad es independiente de la creacion de una sala de juego: el jugador crea el rompecabezas primero y este queda guardado para poder usarse despues en cualquier sala. El actor es cualquier jugador de la aplicacion, sin necesidad de tener una cuenta registrada. [...] El criterio de exito medible para esta funcionalidad es que un jugador debe poder completar todo el proceso, desde subir la foto hasta obtener el enlace del rompecabezas listo para jugar, en menos de un minuto bajo condiciones normales de conexion, sin contar el tiempo que el jugador dedique a ajustar el encuadre."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Convertir una foto en un rompecabezas jugable (Priority: P1)

Una persona quiere armar un rompecabezas de una foto suya. Entra a la aplicación, sube la foto
desde su dispositivo, elige cuántas piezas quiere y confirma. El sistema genera el rompecabezas
y le entrega un enlace único que puede guardar y usar más adelante para jugar. No necesita
crear cuenta en ningún momento.

**Why this priority**: Es la funcionalidad completa en su forma mínima. Sin este recorrido no
existe la feature; con él ya se entrega valor real (un rompecabezas propio, guardado y listo
para jugar).

**Independent Test**: Subir una foto JPG válida, seleccionar una cantidad de piezas, confirmar,
y verificar que se obtiene un enlace único que abre un rompecabezas generado a partir de esa
foto con la cantidad de piezas elegida.

**Acceptance Scenarios**:

1. **Given** un jugador sin cuenta que quiere crear un rompecabezas, **When** sube una foto en
   formato JPG o PNG de hasta 10 MB, **Then** el sistema acepta la imagen y le permite
   continuar con el proceso de creación.
2. **Given** una foto ya aceptada y encuadrada, **When** el jugador llega al paso de
   configuración final, **Then** el sistema le presenta las opciones predefinidas de 20, 50,
   100, 200 y 500 piezas, y solo puede elegir una de ellas.
3. **Given** un jugador que seleccionó la cantidad de piezas, **When** confirma la creación,
   **Then** el sistema genera el rompecabezas a partir de la imagen recortada con la cantidad
   elegida y lo guarda de forma permanente.
4. **Given** un rompecabezas recién generado, **When** el proceso termina, **Then** el sistema
   presenta al jugador un enlace único, con acción para copiarlo, que le permite usar ese
   rompecabezas en una sala en cualquier momento futuro.
5. **Given** un enlace único de un rompecabezas creado previamente, **When** el jugador lo abre
   días después, **Then** el rompecabezas sigue disponible y utilizable para crear una sala.

---

### User Story 2 - Ajustar el encuadre antes de generar (Priority: P2)

Antes de generar el rompecabezas, el jugador ve una vista previa de su foto y puede recortarla
para quedarse solo con la parte que le interesa, sin tener que editar la imagen fuera de la
aplicación.

**Why this priority**: Mejora sustancialmente el resultado (una foto vertical de celular rara
vez funciona bien completa como rompecabezas), pero el flujo de US1 ya entrega un rompecabezas
utilizable con el encuadre por defecto.

**Independent Test**: Subir una foto, mover y redimensionar el área de recorte, confirmar, y
verificar que el rompecabezas generado corresponde exactamente a la porción seleccionada y no
a la imagen completa.

**Acceptance Scenarios**:

1. **Given** una foto subida correctamente, **When** el sistema muestra la vista previa,
   **Then** el jugador puede recortar y ajustar el encuadre seleccionando la porción de la
   imagen que se usará para el rompecabezas.
2. **Given** un jugador ajustando el encuadre, **When** modifica el área de recorte, **Then**
   la vista previa refleja de inmediato la porción seleccionada.
3. **Given** un jugador que no modifica el encuadre, **When** continúa al siguiente paso,
   **Then** se usa un encuadre por defecto que abarca la mayor porción posible de la imagen.
4. **Given** un encuadre seleccionado, **When** se genera el rompecabezas, **Then** el
   rompecabezas se construye exclusivamente a partir de la porción recortada.
5. **Given** un jugador en el paso de encuadre, **When** decide que la foto no era la correcta,
   **Then** puede volver atrás y subir una foto distinta sin reiniciar la aplicación.

---

### User Story 3 - Rechazo claro de archivos no válidos (Priority: P2)

Si el jugador intenta subir algo que no es una foto admitida —un formato distinto o un archivo
demasiado grande— la aplicación se lo dice de inmediato y con claridad, en lugar de fallar a
medio proceso o generar un rompecabezas roto.

**Why this priority**: Sin validación, el flujo principal falla de forma confusa ante entradas
reales muy comunes (HEIC de iPhone, fotos de cámara de más de 10 MB).

**Independent Test**: Intentar subir un archivo PDF y un archivo de imagen de 15 MB, y
verificar que ambos son rechazados con mensajes distintos y específicos, y que no se crea
ningún rompecabezas.

**Acceptance Scenarios**:

1. **Given** un jugador que intenta subir un archivo en un formato no soportado, **When** el
   sistema valida el archivo, **Then** rechaza la subida y muestra un mensaje indicando que el
   formato es inválido, señalando los formatos admitidos.
2. **Given** un jugador que intenta subir un archivo que excede los 10 MB, **When** el sistema
   valida el archivo, **Then** rechaza la subida y muestra un mensaje indicando que se excedió
   el tamaño máximo permitido, señalando el límite.
3. **Given** una subida rechazada por cualquier motivo, **When** el jugador revisa el estado,
   **Then** no se generó ningún rompecabezas y puede intentar de nuevo con otro archivo sin
   reiniciar el flujo.
4. **Given** un archivo con extensión de imagen válida pero contenido que no es una imagen
   legible, **When** el sistema lo valida, **Then** lo rechaza con un mensaje de archivo no
   válido en lugar de generar un rompecabezas corrupto.

---

### User Story 4 - El rompecabezas es privado y accesible solo por su enlace (Priority: P3)

El rompecabezas creado desde una foto personal no queda expuesto a nadie más. Solo quien tenga
el enlace único puede acceder a él o usarlo en una sala, y nunca aparece en ningún listado
público de la aplicación.

**Why this priority**: Es una garantía de privacidad indispensable para fotos personales, pero
depende de que la creación (US1) ya exista.

**Independent Test**: Crear un rompecabezas desde una foto, verificar que no aparece en ninguna
biblioteca o listado de exploración de la aplicación, y verificar que solo es accesible
mediante su enlace único.

**Acceptance Scenarios**:

1. **Given** un rompecabezas creado desde una foto, **When** cualquier persona explora la
   aplicación, **Then** ese rompecabezas no aparece listado en ninguna biblioteca pública ni
   resultado de exploración.
2. **Given** un rompecabezas privado, **When** alguien accede con su enlace único, **Then**
   puede verlo y usarlo para crear una sala.
3. **Given** un identificador de rompecabezas inexistente o mal formado, **When** alguien
   intenta acceder con él, **Then** el sistema responde que el rompecabezas no existe, sin
   revelar información sobre otros rompecabezas.
4. **Given** un rompecabezas creado desde foto, **When** se compara con los rompecabezas
   pre-creados del catálogo, **Then** el privado se distingue por requerir enlace y no ser
   explorable.

---

### Edge Cases

- **Archivo exactamente en el límite de 10 MB**: se acepta; el límite es inclusivo.
- **Extensión válida pero contenido corrupto o que no es imagen**: se rechaza con mensaje de
  archivo no válido, sin generar nada.
- **Imagen de resolución muy baja para la cantidad de piezas elegida**: el sistema advierte que
  las piezas quedarán borrosas y ofrece una cantidad menor, sin bloquear al jugador.
- **Recorte con relación de aspecto extrema** (una franja muy alargada): el sistema exige un
  área de recorte mínima utilizable antes de permitir continuar.
- **Foto con orientación EXIF rotada**: la vista previa, el recorte y el rompecabezas final
  respetan la orientación con la que el jugador ve la foto.
- **Conexión interrumpida durante la subida**: la subida falla con un mensaje claro y el
  jugador puede reintentar; no queda un rompecabezas a medio crear.
- **Jugador abandona el flujo tras subir la foto pero sin confirmar**: no se crea ningún
  rompecabezas y la imagen no queda accesible por ningún enlace.
- **Jugador pierde el enlace único**: sin cuenta no hay forma de recuperarlo; debe crear el
  rompecabezas de nuevo. La interfaz advierte esto al entregar el enlace.
- **El mismo jugador sube la misma foto dos veces**: se crean dos rompecabezas independientes
  con enlaces distintos; no hay deduplicación.
- **Intento de enumerar o adivinar enlaces de otros rompecabezas**: el identificador es
  aleatorio y no secuencial, de modo que recorrerlos no es viable.
- **La cantidad de piezas resultante no coincide exactamente con la etiqueta elegida**: la
  interfaz muestra la cantidad real antes de confirmar (ver Assumptions).

## Requirements *(mandatory)*

### Functional Requirements

**Acceso y alcance**

- **FR-001**: El sistema MUST permitir crear un rompecabezas desde una foto sin cuenta,
  registro ni inicio de sesión.
- **FR-002**: El sistema MUST permitir crear un rompecabezas de forma independiente de
  cualquier sala de juego; la creación no requiere que exista una sala.

**Subida y validación**

- **FR-003**: El sistema MUST permitir al jugador subir una foto desde su dispositivo.
- **FR-004**: El sistema MUST aceptar archivos en formato JPG y PNG.
- **FR-005**: El sistema MUST aceptar archivos de hasta 10 MB inclusive.
- **FR-006**: El sistema MUST rechazar archivos en formatos no soportados y mostrar un mensaje
  que indique explícitamente que el motivo es formato inválido, e informe los formatos
  admitidos.
- **FR-007**: El sistema MUST rechazar archivos que excedan los 10 MB y mostrar un mensaje que
  indique explícitamente que el motivo es tamaño excedido, e informe el límite.
- **FR-008**: El sistema MUST rechazar archivos cuyo contenido no sea una imagen legible,
  aunque la extensión sea válida.
- **FR-009**: El sistema MUST NOT generar ningún rompecabezas cuando la validación del archivo
  falla por cualquier motivo.
- **FR-010**: El sistema MUST permitir reintentar con otro archivo tras un rechazo, sin
  reiniciar el flujo de creación.

**Vista previa y encuadre**

- **FR-011**: El sistema MUST mostrar una vista previa de la imagen una vez subida
  correctamente.
- **FR-012**: El sistema MUST permitir al jugador recortar y ajustar el encuadre, seleccionando
  la porción de la imagen que se usará para el rompecabezas.
- **FR-013**: El sistema MUST reflejar en la vista previa, de forma inmediata, el área de
  recorte seleccionada.
- **FR-014**: El sistema MUST aplicar un encuadre por defecto que abarque la mayor porción
  posible de la imagen cuando el jugador no lo modifica.
- **FR-015**: El sistema MUST exigir un área de recorte mínima utilizable antes de permitir
  continuar.
- **FR-016**: El sistema MUST respetar la orientación con la que el jugador ve la foto en la
  vista previa, el recorte y el rompecabezas final.

**Configuración y generación**

- **FR-017**: El sistema MUST presentar exactamente las opciones predefinidas de 20, 50, 100,
  200 y 500 piezas, y MUST NOT admitir cantidades libres fuera de ese conjunto.
- **FR-018**: El sistema MUST requerir que el jugador seleccione una de esas opciones antes de
  poder confirmar la creación.
- **FR-019**: El sistema MUST mostrar, antes de confirmar, la cantidad real de piezas que
  tendrá el rompecabezas resultante.
- **FR-020**: El sistema MUST generar el rompecabezas a partir de la imagen recortada, con la
  cantidad de piezas correspondiente a la opción elegida.
- **FR-021**: El sistema MUST advertir al jugador cuando la resolución del recorte sea
  insuficiente para la cantidad de piezas elegida, sin impedirle continuar.
- **FR-022**: El sistema MUST generar piezas que en conjunto reconstruyan exactamente la imagen
  recortada, sin huecos ni solapamientos.

**Persistencia, enlace y privacidad**

- **FR-023**: El sistema MUST guardar el rompecabezas generado de forma permanente, sin purga
  ni caducidad automática.
- **FR-024**: El sistema MUST asociar cada rompecabezas creado a un enlace único.
- **FR-025**: El sistema MUST presentar ese enlace al jugador al finalizar la creación, con una
  acción para copiarlo.
- **FR-026**: El sistema MUST advertir al jugador, al entregar el enlace, que sin cuenta el
  enlace es la única vía de acceso al rompecabezas.
- **FR-027**: El sistema MUST permitir usar el rompecabezas para crear una sala en cualquier
  momento futuro mediante su enlace.
- **FR-028**: El sistema MUST tratar los rompecabezas creados desde foto como privados por
  defecto: accesibles únicamente por quien posea el enlace único.
- **FR-029**: El sistema MUST NOT listar los rompecabezas creados desde foto en ninguna
  biblioteca pública ni resultado de exploración.
- **FR-030**: El sistema MUST usar identificadores de enlace aleatorios y no secuenciales, de
  modo que no sean adivinables ni enumerables.
- **FR-031**: El sistema MUST responder que el rompecabezas no existe ante un identificador
  inexistente o mal formado, sin revelar información sobre otros rompecabezas.

**Errores y estado intermedio**

- **FR-032**: El sistema MUST responder a los fallos con un formato de error uniforme que
  incluya un código estable y un mensaje descriptivo, incluidos formato inválido, tamaño
  excedido, archivo ilegible, recorte insuficiente y fallo de generación.
- **FR-033**: El sistema MUST NOT dejar rompecabezas a medio crear ni imágenes accesibles por
  enlace cuando el jugador abandona el flujo antes de confirmar.
- **FR-034**: El sistema MUST registrar la marca de tiempo de creación de cada rompecabezas en
  hora local de Perú (UTC-5).

### Key Entities

- **Rompecabezas**: rompecabezas guardado de forma permanente. Atributos: origen (foto de
  usuario), imagen recortada de referencia, cantidad de piezas nominal y real, disposición de
  la cuadrícula, enlace único, visibilidad (privado), y marca de tiempo de creación.
- **Foto subida**: archivo de imagen aportado por el jugador, con su formato y tamaño. Es la
  entrada del proceso; una vez aplicado el recorte, la imagen recortada es lo que define el
  rompecabezas.
- **Encuadre**: área rectangular seleccionada sobre la foto que delimita qué porción se
  convierte en rompecabezas.
- **Definición de pieza**: forma y posición correcta de cada pieza dentro del rompecabezas,
  derivadas de la cuadrícula. Es información estática del rompecabezas, independiente de
  cualquier partida; la posición de una pieza *durante el juego* pertenece a la sala.
- **Enlace único**: identificador aleatorio no adivinable que constituye la única vía de acceso
  a un rompecabezas privado.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Un jugador completa todo el proceso, desde subir la foto hasta obtener el enlace
  del rompecabezas listo para jugar, en menos de 1 minuto bajo condiciones normales de
  conexión, sin contar el tiempo dedicado a ajustar el encuadre.
- **SC-002**: La generación del rompecabezas tras confirmar tarda menos de 15 segundos, incluso
  en la opción de 500 piezas con una foto de 10 MB.
- **SC-003**: El 100% de los archivos con formato no soportado o que exceden el tamaño máximo
  son rechazados con un mensaje que identifica el motivo específico, y en ninguno de esos casos
  se crea un rompecabezas.
- **SC-004**: El 95% de los jugadores completan la creación en su primer intento, sin ayuda
  externa ni abandono del flujo.
- **SC-005**: El 0% de los rompecabezas creados desde foto aparecen en listados públicos o
  resultados de exploración de la aplicación.
- **SC-006**: Un rompecabezas creado sigue accesible y utilizable por su enlace de forma
  indefinida, sin caducidad.
- **SC-007**: El rompecabezas generado reconstruye la imagen recortada sin huecos ni
  solapamientos en el 100% de las combinaciones de cantidad de piezas y relación de aspecto
  admitidas.

## Assumptions

- **La cantidad de piezas es un objetivo, no un número exacto**: la cuadrícula se elige para
  que su relación de aspecto se aproxime a la del recorte y su total quede lo más cerca posible
  de la opción elegida. Por eso el sistema muestra la cantidad real antes de confirmar (FR-019)
  — por ejemplo, "100 piezas" puede resultar en 96 o 104 según el encuadre.
- Las piezas se generan sobre una cuadrícula rectangular regular. La forma exacta del borde de
  las piezas (recto o con lengüetas) es una decisión de diseño posterior y no altera esta
  especificación.
- Sin cuenta no existe recuperación del enlace: si el jugador lo pierde, debe crear el
  rompecabezas de nuevo. El sistema lo advierte explícitamente (FR-026) en lugar de resolverlo,
  para no introducir cuentas.
- El límite de 10 MB aplica al archivo tal como lo sube el jugador, antes de cualquier
  procesamiento o recorte.
- Los formatos admitidos son exactamente JPG y PNG. HEIC, WEBP, GIF y otros quedan fuera y se
  rechazan por formato inválido.
- La imagen original completa no se conserva como recurso accesible: lo que se guarda de forma
  permanente es la imagen recortada que define el rompecabezas.
- Un rompecabezas puede reutilizarse en múltiples salas a lo largo del tiempo. La creación de
  la sala y el armado son la funcionalidad 001 y quedan fuera de esta especificación; aquí solo
  se entrega el enlace que la habilita.
- El catálogo de rompecabezas pre-creados es una funcionalidad separada. Esta especificación
  solo cubre los creados desde foto por el jugador.
- "Condiciones normales de conexión" significa banda ancha o 4G estable, con el jugador en la
  misma región geográfica que el servicio.
- La creación se realiza principalmente desde navegador de escritorio; la subida desde móvil
  debe funcionar, pero su optimización no es un objetivo de esta especificación.

## Out of Scope

Explícitamente fuera del alcance de esta funcionalidad:

- Cualquier sistema de moderación automática o manual del contenido de las fotos subidas.
- Edición avanzada de la imagen más allá del recorte de encuadre: filtros, ajuste de brillo,
  contraste, color, rotación libre o retoque.
- Compartir públicamente un rompecabezas creado desde foto o publicarlo en una biblioteca.
- Editar, renombrar o eliminar un rompecabezas después de crearlo.
- Cuentas de usuario, biblioteca personal de rompecabezas creados o recuperación de enlaces
  perdidos.
- El catálogo de rompecabezas pre-creados.
- La creación de la sala y el armado colaborativo (especificación 001).
