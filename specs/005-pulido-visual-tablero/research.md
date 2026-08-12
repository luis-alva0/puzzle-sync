# Research: Pulido Visual del Tablero

**Feature**: 005-pulido-visual-tablero | **Date**: 2026-08-11

La especificación dejó una causa sin localizar —las costuras— y una decisión con número por
confirmar —cuánto crecen las piezas—. Las dos se resuelven aquí.

---

## R1 — El bug del arrastre: el mensaje no dice de qué pieza habla

**Diagnóstico confirmado en el código.** `PieceDragPayload` es `{ groupId, x, y }`. Nada indica a
**qué pieza** corresponde ese punto, así que emisor y receptor lo interpretan distinto:

- [Board.tsx:157](../../components/Board.tsx#L157) envía la posición de la **pieza agarrada**:
  `targetX = x - drag.offsetX`.
- [boardSync.ts:114](../../lib/realtime/boardSync.ts#L114) la interpreta como la posición del
  **ancla** del grupo —la pieza de menor fila y columna— y desplaza todas las demás en
  consecuencia.

Si agarras el ancla, coinciden por casualidad y todo funciona. Si agarras cualquier otra, el
bloque se dibuja desplazado exactamente `(agarrada − ancla)`. Al soltar, el servidor aplica el
movimiento correcto y el bloque «se recentra»: el salto que se reporta.

**Decisión**: el mensaje pasa a llevar un **desplazamiento**, `{ groupId, dx, dy }`, en lugar de
una posición absoluta.

**Rationale**: un desplazamiento no admite dos lecturas. No hay ancla que elegir, ni pieza de
referencia que comunicar, ni forma de que emisor y receptor discrepen. El receptor suma `dx` y
`dy` a la posición confirmada de **cada** pieza del grupo, que es literalmente lo que significa
mover un bloque rígido. Además **borra** la búsqueda del ancla de `renderPieces`: el arreglo deja
menos código del que había.

**Alternatives considered**:

- **Añadir `pieceId` al mensaje** para que el receptor sepa de quién es la posición. Corrige el
  fallo, pero conserva la traducción posición→desplazamiento en el receptor y la posibilidad de
  volver a equivocarse en ella.
- **Que el emisor mande siempre la posición del ancla.** Obliga a cada emisor a saber cuál es el
  ancla del grupo y a recalcularla cuando el grupo crece. Traslada la complejidad, no la quita.

---

## R2 — Las costuras: el antialias del recorte, y por qué da igual

**La geometría está descartada.** Se comprobó numéricamente antes de escribir la especificación:
para los dos valores de signo, la lengüeta de una pieza y el hueco de su vecina se desplazan
exactamente lo mismo. Encajan.

**Hipótesis**: el antialias de `clip()`. Cada pieza se recorta y se pinta por separado, y en los
píxeles del borde compartido el recorte cubre alrededor de la mitad del píxel. Al pintar A y luego
B sobre el fondo:

```
tras A:  píxel = fondo·0,5 + A·0,5
tras B:  píxel = (fondo·0,5 + A·0,5)·0,5 + B·0,5 = fondo·0,25 + A·0,25 + B·0,5
```

**El fondo sobrevive a un 25 %** en toda la junta. Sobre un tablero de cartón claro y una foto
oscura, eso es exactamente el hilo claro que se ve en la captura. Explica también por qué la
comprobación de geometría no encontró nada: el problema no está en dónde acaban las formas, sino
en cómo se mezclan dos coberturas parciales.

**Decisión**: dibujar **por grupo, no por pieza**. Un grupo se recorta con un solo trazado —la
unión de los contornos de sus piezas— y se pinta con un solo `drawImage`.

**Rationale**: y aquí está lo que importa. La corrección **no depende de que la hipótesis sea
correcta**. Un grupo dibujado de una vez no tiene bordes interiores, así que no hay nada que
mezclar mal: ni antialias, ni redondeo de coordenadas, ni cualquier otra causa que se me haya
escapado. Se elimina la clase entera de fallo en lugar de la instancia.

Las juntas interiores no desaparecen de la vista: se dibujan **encima**, como líneas de corte
(FR-003). Pasan de ser un artefacto a ser una decisión.

Y arrastra tres beneficios que la especificación pide por separado: el relieve del contorno del
grupo (FR-016), la sombra que no se repite pieza a pieza, y el halo de captura alrededor del
bloque en vez de veinte halos sueltos.

**Alternatives considered**:

- **Ensanchar cada pieza medio píxel** para que se solapen y tapen la costura. Es el apaño
  habitual, cuesta una línea, y deforma la silueta justo cuando la US3 la quiere precisa. Además
  no arregla el relieve ni el halo.
- **Desactivar el suavizado del recorte.** No hay forma estándar de hacerlo en canvas 2D.
- **Pintar la imagen del grupo entera y recortar después.** Es lo elegido, dicho de otra manera.

---

## R3 — El contorno de un grupo, sin unión de polígonos

**Decisión**: el trazado de un grupo es un `Path2D` al que se le **añaden** los contornos de todas
sus piezas, cada uno trasladado a su posición. No se calcula la unión geométrica.

**Rationale**: `Path2D.addPath()` acepta una matriz de transformación, así que componer el grupo
es un bucle de una línea por pieza. Al rellenar con la regla **`nonzero`** —la de por defecto—,
los contornos que se solapan o se tocan cuentan como interior y el resultado se comporta como una
sola figura. No hace falta calcular la unión de polígonos, que es el tipo de algoritmo que uno no
quiere escribir ni depurar.

Hay un detalle que hace que esto funcione: los contornos de dos piezas vecinas **comparten
exactamente** el borde, y la lengüeta de una está dentro del hueco de la otra. Con `nonzero` no
queda ningún agujero entre ellas.

**El trazado compuesto no sirve para el relieve, y esto se pasó por alto al escribir R3.**
`stroke()` sobre él recorre *todos* los subtrazados, así que biselaría las juntas interiores igual
que el borde exterior: un bloque con todas sus costuras marcadas como si fueran bordes, que es lo
contrario de lo que pide FR-016. Recortar el trazo no lo arregla, porque las juntas interiores
están dentro del recorte y se dibujarían enteras.

Hacen falta **tres trazados por grupo**, no uno:

| Trazado | Para qué | Cómo se construye |
|---|---|---|
| Compuesto | Recortar y rellenar la imagen | `addPath` de las cuatro caras de cada pieza |
| **Exterior** | Relieve, sombra y halo | Solo los lados **sin vecino dentro del grupo** |
| **Juntas** | Líneas de corte (FR-003) | Solo los lados **con vecino dentro del grupo**, cada uno una vez |

Saber si un lado es exterior es una consulta al propio grupo: la pieza `(r, c)` tiene vecino por la
derecha si `(r, c+1)` está en el mismo grupo. Para no trazar cada junta dos veces, solo la dibuja
la pieza de la izquierda y la de arriba.

Los tres se construyen en el mismo recorrido y se cachean juntos: es un bucle sobre las piezas del
grupo, no tres.

**Alternatives considered**:

- **Calcular la unión de polígonos** con un algoritmo de clipping. Correcto y caro, en código y en
  tiempo por frame.
- **Rasterizar el grupo a un canvas fuera de pantalla** y pintarlo como una imagen. Más rápido al
  arrastrar, pero hay que invalidarlo en cada fusión y multiplica la memoria. Se deja como salida
  si SC-007 no se cumple.

---

## R4 — Cuatro perfiles de lengüeta, con cuello y cabeza

**Decisión**: un catálogo de **cuatro** perfiles fijos, cada uno una lista de puntos de control
normalizados. El borde elige perfil con el hash que ya usa hoy, y el mismo perfil se lee desde los
dos lados: la complementariedad se mantiene estructural.

**Rationale**: la lengüeta actual es una joroba: **34 % de ancho, 20 % de profundidad y sin
cuello**. Por eso las piezas leen como flores. Una lengüeta de rompecabezas real se estrecha antes
de ensancharse —cuello de un 20 % del lado, cabeza de un 35 %— y **ese estrechamiento, no la
profundidad, es lo que hace reconocible la silueta** incluso pequeña.

**Profundidad: 22 %**, y el número está elegido, no heredado. La primera versión de R4 decía 25 %
sin más criterio que sonar realista, y ahí había una contradicción con R6 que nadie vio: una
lengüeta más profunda ensancha la pieza, y eso se come lo que el empaquetado gana.

| Profundidad | `tabOverflow` | Celda media | Pieza en pantalla |
|---|---|---|---|
| 20 % (hoy, sin cuello) | 24 | 124 | +29 % |
| **22 %** | **26** | **126** | **+27 %** |
| 25 % (R4 inicial) | 30 | 130 | +23 % ✗ |

Con el 25 % inicial, SC-006 —que pide +25 %— **era inalcanzable por diseño**. El 22 % lo cumple
con dos puntos de margen y conserva lo que de verdad importa, que es el cuello. Cualquier cambio
futuro de esta profundidad **tiene que rehacer la tabla de R6**: están acopladas.

Cuatro es suficiente para que el tablero no parezca repetitivo y pocos para poder mirarlos uno a
uno y afinarlos a mano, que es lo que pide FR-010. Con cuatro perfiles, dos signos y el
desplazamiento lateral que ya existe, un borde tiene decenas de aspectos distintos.

**Alternatives considered**:

- **Un solo perfil.** Más fácil de afinar, tablero monótono, e incumple FR-010.
- **Perfil paramétrico continuo**, como ahora. Da variedad infinita y ningún control: no se puede
  mirar «el perfil feo» y arreglarlo, porque no hay perfiles, hay un espacio de ellos.
- **Copiar los perfiles trazando sobre la imagen de referencia.** Más fiel, pero exige un trabajo
  manual de calco que no cabe en esta funcionalidad.

---

## R5 — Relieve por trazo interior, no por filtro

**Decisión**: dentro del recorte del grupo, trazar su contorno dos veces —una clara desplazada
arriba a la izquierda, otra oscura desplazada abajo a la derecha— y por fuera, la sombra.

**Rationale**: el recorte hace todo el trabajo. Un trazo grueso centrado en el contorno se
recortaría a su mitad interior, que es justo el bisel que se busca, y no invade a las piezas
vecinas ni al tablero. Son dos `stroke()` por grupo, no por pieza, y ningún filtro ni
`globalCompositeOperation`, que son lo caro.

Que el relieve se dibuje **dentro** del recorte es también lo que cumple FR-017: por muy marcado
que sea, no puede tapar más que el borde de la propia pieza.

El grosor se escala con el tamaño de la pieza en pantalla. A 29 px el bisel es de menos de un
píxel y desaparece solo, que es lo correcto: a ese tamaño lo que importa es la silueta, no la
textura.

**Alternatives considered**:

- **Filtro `drop-shadow` del canvas** para el relieve interior. No hay bisel interior en la API;
  habría que combinar varias pasadas.
- **Una textura de cartón repetida sobre la pieza.** Más realista y otro recurso que mantener, con
  su licencia, en un repositorio público.

---

## R6 — Empaquetado por filas, con las filas agrupadas por altura

**Decisión**: las piezas se colocan en filas dentro de la banda. Cada pieza ocupa su **anchura
real**, y las filas se forman agrupando piezas de **altura real parecida**.

**Rationale**: la anchura y la altura de una pieza dependen de por qué lados le sale lengüeta. Con
lengüeta hacia fuera en un lado se suman 24 unidades; los dos lados de un eje son independientes y
cada uno saca lengüeta la mitad de las veces, así que cada eje mide 100, 124 o 148 con
probabilidad 1/4, 1/2 y 1/4. **La media es 124 y el peor caso, 148.**

La rejilla uniforme usaba 160 en los dos ejes: el peor caso más holgura. Ahí está todo el
desperdicio.

Agrupar las filas por altura no es un adorno: si una fila mezcla alturas, **su alto es el de la
pieza más alta** y se pierde en vertical lo que se gana en horizontal. Con las filas agrupadas, el
alto medio de fila baja de 148 a 124.

| Disposición | Celda media | Área relativa | Tamaño de pieza |
|---|---|---|---|
| Rejilla uniforme (hoy) | 160 × 160 | 100 % | referencia |
| Filas, sin agrupar por altura | 126 × 160 | 79 % | +13 % |
| **Filas agrupadas por altura** | **126 × 126** | **62 %** | **+27 %** |

**Las cifras usan `tabOverflow = 26`, la profundidad del 22 % que fija R4.** Las dos secciones
están acopladas: subir la profundidad ensancha las piezas y baja esta tabla. Con el 25 % que R4
proponía al principio, el resultado era +23 % y SC-006 quedaba fuera de alcance sin que nada
avisara.

**Estas cifras son una estimación, no una medida.** La tabla equivalente de la feature 004 se
escribió antes de programar y salió un 10-15 % optimista; conviene contar con que esta también
pueda quedarse corta. SC-006 pide un 25 % y **el margen es de dos puntos**, así que hay que medir
en cuanto exista el empaquetado.

Si no llega, el orden de preferencia es: **bajar el criterio de SC-006 a lo medido**, no bajar más
la profundidad de la lengüeta. La silueta es lo que el usuario pidió copiar de la referencia; el
25 % es un número que puse yo.

La garantía de FR-030 se mantiene por construcción y sin comparar piezas entre sí: dentro de una
fila se colocan consecutivas sumando anchuras, y las filas no se solapan porque cada una empieza
donde acabó la anterior. Nada que reintentar, nada que pueda no terminar.

**Alternatives considered**:

- **Mantener la rejilla y quitar solo la holgura** (160 → 148). Un 7 %, tres líneas de cambio. Se
  descartó al elegir la opción A de la clarificación.
- **Empaquetado en dos dimensiones** de los que buscan el hueco óptimo. Aprovecharía algo más y
  entra en el terreno de los algoritmos que no garantizan terminar, que es lo que la feature 004
  rechazó con razón.

---

## R7 — El clic, sintetizado y con limitador

**Decisión**: una envolvente corta generada con la Web Audio API —un golpe de ruido filtrado de
unos 40 ms con caída exponencial— y un limitador que impide que suene más de una vez cada 150 ms.

**Rationale**: sin archivo no hay licencia que documentar en un repositorio público, ni recurso
que servir, ni formato que elegir por navegador, ni precarga que pueda no haber terminado cuando
llega el primer encaje. Con la síntesis, SC-004 se cumple porque no hay nada que esperar.

El limitador existe por la respuesta a Q1: al sonar también los encajes ajenos, dos jugadores
rematando el rompecabezas a la vez pueden disparar varios en el mismo segundo. Un contador del
último instante en que sonó, comparado contra 150 ms, resuelve FR-020a en tres líneas y es lógica
pura, así que se puede probar.

El contexto de audio se crea **en el primer encaje**, no al montar el tablero: los navegadores
suspenden los contextos creados sin interacción previa, y crear uno que no se va a usar es gasto
por si acaso.

**Alternatives considered**:

- **Archivo corto en el repositorio.** Suena mejor, y trae licencia, procedencia, descarga y
  precarga. Descartado en la clarificación.
- **`<audio>` con un `data:` URI.** Evita la petición pero conserva la licencia y engorda el
  bundle con audio en base64.

---

## R8 — La ventana entera, y la barra teñida del tablero

**Decisión**: la página del tablero pierde su relleno y su color de fondo propio; la barra pasa a
ser una franja delgada de un tono derivado del cartón, pegada al tablero; y el rectángulo del área
central deja de dibujarse.

**Rationale**: hoy la página tiene `padding: 0.6rem`, un hueco entre barra y tablero, y un fondo
oscuro que rodea el cartón. Sumado, es un marco que no aporta nada y que se come cerca de un 10 %
del alto útil, que es tamaño de pieza (SC-005, SC-006).

La barra en azul marino sobre cartón claro compite con el tablero por la atención. Teñirla del
mismo material es lo que hace la referencia y es también lo que la vuelve invisible cuando no la
miras, que es lo que quieres de una barra de herramientas.

El contorno del área central se quita porque la referencia no lo tiene y porque **el hueco ya se
ve**: lo dibujan las piezas que lo rodean.

**Alternatives considered**:

- **Barra superpuesta sobre el tablero**, translúcida. Gana el alto de la barra entera, y taparía
  piezas, que FR-015 de la feature 004 prohíbe.
- **Barra que se oculta sola** al empezar a arrastrar. Gana lo mismo y añade un comportamiento que
  nadie ha pedido y que sorprende.
