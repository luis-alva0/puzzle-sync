# Quickstart: Pulido Visual del Tablero

**Feature**: 005-pulido-visual-tablero | **Date**: 2026-08-11

## Prerrequisitos

Los de siempre, sin nada nuevo:

```bash
supabase db reset       # base limpia: las pruebas de catálogo lo esperan
supabase start
npm run dev
```

**Ninguna variable de entorno nueva. Ninguna migración. Ningún archivo de audio.**

---

## Escenarios de validación

Esta funcionalidad es casi toda visual. Solo dos cosas se comprueban sin mirar.

### 0. Lo que se prueba sin navegador

```bash
npm test -- board-layout boardSync tab-profiles audio-click
```

**Esperado**: en verde. Cuatro asertos sostienen la funcionalidad entera:

- **Ninguna pareja de piezas se solapa** con las cajas envolventes **reales**. Si esto falla,
  `pieceExtent` subestima y las piezas se van a tocar.
- **El empaquetado aprovecha**: el área del tablero es sensiblemente menor que la del peor caso
  uniforme. Si esto falla, el trabajo no ha servido y SC-006 no llega.
- **Arrastrar un grupo por la pieza del medio** desplaza las tres lo mismo. Es la prueba que hoy
  fallaría.
- **Cada perfil de lengüeta tiene el cuello más estrecho que la cabeza**. Es lo que separa una
  lengüeta de una joroba.

### 1. Las costuras (US1) — el escenario crítico

Crear una sala de **104 piezas**, encajar dos piezas y **acercarse a la junta**. Con el zoom del
navegador si hace falta.

**Esperado**: no se ve el fondo del tablero en ningún punto de la junta. Se ve la línea del corte,
que es distinto: una línea oscura es correcta, un hilo **claro del color del cartón** es el
defecto que esto viene a arreglar.

Encajar cuatro o cinco piezas y mirar el bloque entero: la imagen debe ser continua a través de
todas las juntas, y el relieve debe rodear **el bloque**, no cada pieza.

### 2. El arrastre de un grupo (US2)

Formar un bloque de tres o más piezas. Agarrarlo por una que **no** sea la de arriba a la
izquierda.

**Esperado**:

- Al agarrar, el bloque **no salta**.
- Al mover, la pieza agarrada se queda bajo el puntero.
- Al soltar, el bloque se queda donde estaba, **sin recentrarse**.

Repetir agarrando por la de arriba a la izquierda: es el caso que hoy funciona por casualidad y
tiene que seguir funcionando.

Y con dos navegadores: el otro jugador ve el bloque moverse entero y en la misma posición.

### 3. La forma de las piezas (US3)

Mirar una pieza suelta de cerca.

**Esperado**: la lengüeta se **estrecha antes de ensancharse**. Si se ve una ondulación suave sin
cuello, los perfiles nuevos no están puestos.

Recorrer el tablero: deben reconocerse unos pocos perfiles repetidos. Ni todas iguales ni todas
distintas.

Comprobar en un rompecabezas de **500 piezas** que la silueta sigue leyéndose como pieza de
rompecabezas al tamaño más pequeño que admite la aplicación.

### 4. El relieve y el halo (US4)

**Esperado**: cada pieza suelta tiene un borde con relieve —claro arriba, oscuro abajo— y una
sombra corta. No un contorno plano de un color.

**Las dos comprobaciones que importan**:

1. Con **otro jugador** agarrando una pieza, esa pieza conserva su relieve **y** gana un halo de
   color por fuera. No se aplana ni pierde el relieve.
2. Con un jugador agarrando un **bloque de varias piezas**, el halo rodea el bloque entero, no
   cada pieza. Veinte halos serían ilegibles.

### 5. El sonido (US5)

**Esperado**: al encajar suena un clic breve. Al soltar sin encajar, nada.

**Los tres casos que hay que forzar**:

1. **Encaje en cascada**: colocar una pieza en un hueco entre dos bloques, de modo que una sola
   soltada una tres grupos. Debe sonar **una vez**, no tres.
2. **Encaje ajeno**: que el otro jugador encaje algo. Debe sonar aquí también.
3. **Vuelta de una desconexión**: cortar la red, que el otro encaje varias piezas, volver. **No
   debe sonar nada**: esos encajes ya ocurrieron. Si suena una traca, falta FR-018b.

Y el silenciador del menú: silenciar, encajar —nada—, recargar la página y comprobar que sigue
silenciado.

### 6. La ventana (US6)

**Esperado**: el cartón llega a los bordes izquierdo, derecho e inferior. Arriba, una franja
delgada del mismo tono, pegada al tablero, sin hueco entre ambos ni marco oscuro alrededor.

El área central **no tiene ningún rectángulo dibujado**.

**Medir SC-006** poniendo la aplicación al lado de la captura anterior con el mismo rompecabezas
de 104 piezas: las piezas deben verse claramente más grandes, en torno a un cuarto.

### 7. Comparación con la referencia (SC-008)

Abrir jigsawexplorer.com al lado, con un rompecabezas de tamaño parecido. Enseñárselo a alguien
que no sepa cuál es cuál y preguntarle cuál tiene las piezas «de verdad».

**Esperado**: que dude. Si acierta a la primera, anotar **qué** lo delató: es la lista de trabajo
que queda.

### 8. Rendimiento (SC-007)

Con **150 piezas**, formar un bloque de unas 20 y arrastrarlo mientras se graba en
DevTools → Performance.

**Esperado**: 50 fps o más. Dibujar por grupo debería **mejorar** el rendimiento respecto de hoy
—menos recortes y menos `drawImage`—, así que si baja, el sospechoso es la construcción del
trazado del grupo dentro del bucle de frames en vez de en caché.

---

## Pruebas

```bash
npm test                # unitarias
npm run test:db         # integración; esta funcionalidad no añade ninguna
npm run lint && npm run typecheck && npm run build
```

Las de integración no cambian pero **tienen que seguir pasando**: tres construyen salas con el
reparto, así que avisan si el empaquetado nuevo rompe la creación de salas.

---

## Fallos habituales

| Síntoma | Causa probable |
|---|---|
| Hilo claro entre piezas unidas | Se sigue dibujando pieza a pieza; el grupo necesita un solo recorte |
| Piezas que se tocan o se montan | `pieceExtent` subestima: cuenta un hueco entrante como si no ocupara, o se olvida un lado |
| El bloque salta al agarrarlo | El mensaje sigue llevando posición absoluta en vez de desplazamiento |
| El bloque va bien pero se recentra al soltar | Se descarta el provisional del grupo arrastrado y no el de los grupos absorbidos |
| Piezas como flores | Los perfiles nuevos no están en uso, o el cuello es más ancho que la cabeza |
| Relieve invisible con 500 piezas | Correcto: el bisel se escala y a 29 px desaparece solo |
| Traca de clics al reconectar | Suenan los encajes recuperados del estado; deben distinguirse de los que acaban de pasar |
| El primer encaje no suena | El contexto de audio se creó antes de la primera interacción y el navegador lo suspendió |
| Arrastre a tirones con un bloque grande | El trazado del grupo se está reconstruyendo en cada frame |
