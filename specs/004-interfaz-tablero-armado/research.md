# Research: Interfaz del Tablero de Armado

**Feature**: 004-interfaz-tablero-armado | **Date**: 2026-08-10

Decisiones de diseño previas a la implementación. La especificación no dejó ninguna ambigüedad
abierta; lo que se resuelve aquí es **cómo** cumplir FR-002 y FR-030 a la vez.

---

## R1 — Colocar las piezas en una rejilla de huecos, no empaquetarlas libremente

**Decisión**: dividir el tablero en una rejilla regular de huecos del tamaño de una pieza, marcar
como inutilizables los huecos que caen dentro del área central de armado, y repartir las piezas
entre los huecos restantes, uno por hueco.

**Rationale**: FR-002 —ninguna pieza se solapa— es el requisito central de la funcionalidad. Con
una rejilla de huecos se cumple **por construcción**: dos piezas no pueden solaparse porque nunca
comparten hueco, y los huecos no se solapan entre sí. No hay nada que comprobar en tiempo de
ejecución ni nada que pueda fallar con una cantidad de piezas concreta.

**Alternatives considered**:

- **Empaquetado libre con detección de colisiones**: colocar cada pieza en una posición aleatoria
  y reintentar mientras choque con alguna ya colocada. Aprovecha mejor el espacio y se parece más
  a la referencia, pero exige comparar contra las piezas ya puestas —cuadrático en el caso peor— y
  **no garantiza terminar**: con el tablero casi lleno los reintentos se disparan. Un algoritmo
  que puede no converger no sirve para el camino de creación de una sala.
- **Colocación en espiral desde el borde**: elegante, pero produce una banda de grosor irregular
  que no se parece a la referencia.
- **Montones apilados por zonas**: es lo que hay hoy, y es justamente el problema.

---

## R2 — Paso de la rejilla: el ancho de la pieza más sus lengüetas

**Decisión**: el paso de la rejilla es `PIECE_SIZE + 2 × tabOverflow(PIECE_SIZE) + holgura`, con
un valor de **160 unidades** frente a las 148 que ocupa una pieza con las lengüetas totalmente
salidas. Las 12 unidades sobrantes se reparten como una sacudida aleatoria de ±6 dentro del hueco.

**Rationale**: una pieza no ocupa `PIECE_SIZE × PIECE_SIZE`. Sus lengüetas sobresalen
`tabOverflow` = 24 unidades por lado, así que su caja envolvente en el peor caso —lengüeta saliente
en los dos lados opuestos— es de 148 × 148. Espaciar los huecos 100 unidades dejaría las lengüetas
invadiendo el hueco vecino: piezas visualmente solapadas, que es exactamente lo que FR-002
prohíbe. El paso se calcula desde `tabOverflow`, no con una constante escrita a mano, para que
siga siendo correcto si algún día cambia la profundidad de la lengüeta.

La sacudida existe porque una rejilla perfecta se ve artificial; en las imágenes de referencia las
piezas están ligeramente descolocadas. Al ser menor que la holgura, **no puede provocar solapes**.

**Alternatives considered**:

- **Paso de 100 y aceptar que las lengüetas se toquen**: incumple FR-002 en su lectura visual, que
  es la que importa para el jugador.
- **Calcular la caja envolvente real de cada pieza** según hacia dónde apuntan sus lengüetas:
  permitiría apretar la rejilla, pero ata el reparto a la generación de formas y complica la
  prueba de no solape. La ganancia de espacio no compensa.

---

## R3 — El tablero adopta la proporción de la pantalla, no la del rompecabezas

**Decisión**: el tamaño del tablero se elige buscando una proporción de **16:10**, creciendo hasta
que la banda tenga huecos suficientes. El área central de armado conserva la proporción del
rompecabezas (FR-003), pero el tablero que la rodea no.

**Rationale**: es lo que decide cuán grandes se ven las piezas. Con la escala uniforme de FR-031,
el factor lo fija el eje más apretado: `min(ancho_ventana / ancho_tablero, alto_ventana /
alto_tablero)`. Un tablero cuadrado en una pantalla apaisada desperdicia los laterales y encoge
las piezas sin necesidad. Acercar la proporción del tablero a la de la pantalla es lo que mantiene
las piezas grandes.

También explica algo de las imágenes de referencia que al principio parece un descuido: **la banda
es más gruesa a izquierda y derecha que arriba y abajo**. No es casual, es la consecuencia de
meter un hueco apaisado en un tablero apaisado.

Tamaños que resultan, con el paso de 160 y una ventana de 1920 × 1080:

| Piezas | Cuadrícula | Hueco central | Tablero | Huecos en banda | Pieza en pantalla |
|---|---|---|---|---|---|
| 20 | 4 × 5 | 4 × 3 | 8 × 5 | 28 | 135 px |
| 50 | 5 × 10 | 7 × 4 | 12 × 7 | 56 | 96 px |
| 100 | 10 × 10 | 7 × 7 | 16 × 10 | 111 | 68 px |
| 104 | 8 × 13 | 9 × 5 | 16 × 10 | 115 | 68 px |
| 150 | 10 × 15 | 10 × 7 | 20 × 12 | 170 | 56 px |
| 200 | 10 × 20 | 13 × 7 | 23 × 14 | 231 | 48 px |
| 500 | 20 × 25 | 16 × 13 | 36 × 22 | 584 | 31 px |

**Los 31 px de las 500 piezas son el punto flaco de esta decisión, y conviene decirlo claro.** Es
la consecuencia directa de la respuesta Q1 —que todo quepa siempre en la ventana— y así quedó
aceptado en A-009. Una pieza de 31 px se distingue, pero apuntar a ella con el ratón es incómodo.
Si en la práctica molesta, la salida es añadir desplazamiento y ampliación como funcionalidad
aparte, no rehacer esta.

**Alternatives considered**:

- **Tablero con la proporción del rompecabezas**: más simple de razonar, pero con 500 piezas baja
  a 25 px en lugar de 31, un 20 % peor sin ninguna ventaja.
- **Proporción tomada de la ventana real**: daría el mejor aprovechamiento en cada pantalla, pero
  el tamaño del tablero **no puede depender de la ventana** sin romper FR-006. Es precisamente la
  trampa que el checklist de la especificación señala. 16:10 es un compromiso fijo entre 16:9 y
  4:3.

---

## R4 — Repartir las piezas entre los huecos con una permutación determinista

**Decisión**: recorrer los huecos disponibles en un orden fijo y asignarles las piezas según una
permutación derivada de la semilla, generada con el mismo `splitmix32` que ya usa la generación de
formas.

**Rationale**: FR-008 pide que dos piezas contiguas en la imagen no acaben contiguas en la banda.
Sin barajar, la pieza (0,0) caería en el primer hueco y la (0,1) en el segundo, y el jugador se
encontraría el rompecabezas medio ordenado alrededor del borde: se pierde el juego. La permutación
tiene que ser determinista porque el resultado viaja al servidor como estado compartido y las
pruebas necesitan reproducirlo.

Reutilizar `splitmix32` en lugar del generador congruencial que hoy tiene `geometry.ts` evita
tener dos generadores en el proyecto haciendo lo mismo.

**Alternatives considered**:

- **Fisher-Yates con `Math.random`**: no determinista, imposible de probar y de reproducir.
- **Colocar cada pieza en el hueco más lejano a su posición correcta**: garantiza el desorden pero
  produce un patrón regular y reconocible, y deja las esquinas siempre en el mismo sitio.

---

## R5 — Cachear los `Path2D` en lugar de reconstruirlos cada frame

**Decisión**: calcular un `Path2D` por celda de la cuadrícula una sola vez, junto con la rejilla
de bordes, y reutilizarlos en el bucle de dibujado.

**Rationale**: el código actual llama a `piecePath(...)` **dentro del bucle de piezas, dentro del
bucle de frames**. Con 150 piezas a 60 fps son 9 000 objetos `Path2D` por segundo, cada uno con
sus curvas Bézier trazadas de nuevo; con 500 piezas, 30 000. Es trabajo puramente repetido: la
forma de una pieza depende de su celda y de la semilla del rompecabezas, y ninguna de las dos
cambia durante la partida. SC-006 pide 50 fps con 150 piezas y este es el obstáculo evidente.

El caché es un array indexado por `fila × columnas + columna`, construido en el mismo `useMemo`
que ya construye la rejilla de bordes.

**Alternatives considered**:

- **Dejarlo como está y medir primero**: defendible en general, pero aquí el desperdicio es obvio
  y la corrección son tres líneas. Medir para confirmar que reconstruir 30 000 objetos por segundo
  es caro no aporta información.
- **Rasterizar cada pieza a un canvas fuera de pantalla**: más rápido todavía, pero multiplica la
  memoria por 500 y complica el escalado. Se deja como salida si el caché de rutas no basta.

---

## R6 — El cronómetro no necesita nada del servidor

**Decisión**: calcular el desfase entre el reloj del navegador y el del servidor a partir de
`serverTime`, que `GET /state` ya devuelve, y contar desde `startedAt`, que también viene ya.

**Rationale**: FR-018 exige que todos los jugadores vean el mismo tiempo. La respuesta de estado
ya trae los dos datos necesarios, así que **no hace falta ni un endpoint nuevo ni un campo nuevo**.
Con `desfase = serverTime − Date.now()` en el momento de la respuesta, el tiempo transcurrido es
`Date.now() + desfase − startedAt`. Dos jugadores con relojes mal puestos convergen al mismo valor
porque ambos se corrigen contra el mismo servidor.

SC-005 admite hasta 1 segundo de diferencia, holgado para el error que introduce la latencia de la
petición.

**Alternatives considered**:

- **Contar desde que el jugador abre el tablero**: trivial, pero incumple FR-018 de forma
  descarada: dos jugadores que entran con cinco minutos de diferencia verían cronómetros
  distintos.
- **Difundir el tiempo por el canal de tiempo real**: tráfico constante para un dato que se puede
  derivar de uno solo.

---

## R7 — La imagen de referencia se dibuja en el canvas, debajo de las piezas

**Decisión**: pintarla dentro del propio bucle de dibujado, en el rectángulo del área central,
**antes** de las piezas, activada por una propiedad booleana.

**Rationale**: el canvas ya conoce la transformación —escala y origen— y el rectángulo del área de
armado. Dibujar ahí es una llamada a `drawImage` y ninguna coordenada que traducir. Superponer un
elemento del DOM obligaría a exportar la escala fuera del canvas y a mantenerla sincronizada en
cada redimensionado, que es plumbing gratuito.

Pintarla **debajo** de las piezas tiene una ventaja concreta: cuando ya hay piezas colocadas en el
centro, se ven sobre la referencia en lugar de quedar tapadas. Es lo que uno querría al comparar.

La imagen ya está cargada en `imageRef` para recortar las piezas, así que mostrarla es inmediato y
cumple SC-004 sin ninguna precarga extra.

**Alternatives considered**:

- **`<img>` superpuesto con CSS**: más fácil de animar, pero exige exportar la escala.
- **Ventana flotante en una esquina**: se aleja de la referencia, que la muestra centrada y grande.

---

## R8 — Pantalla completa y aviso de pantalla pequeña con API del navegador

**Decisión**: `Element.requestFullscreen()` sobre el contenedor del tablero, escuchando
`fullscreenchange` para mantener el botón en su sitio. El aviso de pantalla pequeña se decide con
una consulta de medios sobre el ancho de la ventana.

**Rationale**: el Principio I pide no añadir piezas que mantener. Las dos cosas son nativas y no
necesitan ninguna dependencia. Escuchar `fullscreenchange` en lugar de guardar un booleano propio
resuelve el caso límite que la especificación señala: si el navegador **deniega** la petición, o
si el usuario sale con Escape, el estado del botón sigue siendo correcto porque nunca fue nuestro.

El umbral del aviso se fija en **1024 px de ancho**, por debajo del cual una banda perimetral deja
de tener sentido. El aviso no bloquea (A-008).

**Alternatives considered**:

- **Guardar el estado de pantalla completa en React**: se desincroniza en cuanto el usuario pulsa
  Escape o el navegador rechaza la petición.
- **Detectar el móvil por `user-agent`**: frágil y desaconsejado; el ancho de la ventana es lo que
  de verdad importa, y además cubre la ventana de escritorio empequeñecida.

---

## R9 — La barra superior se sitúa fuera del área de dibujo

**Decisión**: la barra es un elemento del DOM sobre el canvas, y el canvas ocupa la altura
restante de la ventana. La barra **no** se dibuja dentro del canvas.

**Rationale**: FR-015 pide que la barra no tape piezas. Si fuese parte del canvas habría que
reservar una franja del mundo lógico para ella y las piezas quedarían por debajo, lo que ata el
tamaño del mundo a la altura de la barra. Manteniéndola fuera, el canvas recibe el espacio que
queda y la escala se calcula sobre ese espacio: el tablero cabe entero por debajo de la barra sin
ningún caso especial.

Además, en el DOM la barra es accesible —botones reales, foco, lectores de pantalla—, cosa que
dentro del canvas habría que reconstruir a mano. El canvas ya arrastra esa limitación para las
piezas y la compensa con un resumen textual; no tiene sentido extenderla a los controles.

**Alternatives considered**:

- **Barra dentro del canvas**, como en la referencia, que probablemente lo hace así: uniforme
  visualmente, pero pierde accesibilidad y complica el cálculo de la escala.
- **Barra superpuesta con posición absoluta sobre el canvas**: taparía piezas, que es justo lo que
  FR-015 prohíbe.
