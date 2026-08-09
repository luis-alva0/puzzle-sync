# Phase 0 Research: Creación de un Rompecabezas a partir de una Foto

**Feature**: 002-crear-rompecabezas-desde-foto | **Date**: 2026-08-09

Resuelve las decisiones que la especificación deja abiertas y las que el input de planificación
no fija. A diferencia de 001, esta feature **no parte de cero**: la tabla `puzzles` ya existe y
el tablero ya renderiza piezas. Buena parte del trabajo es extender sin romper.

---

## R1. Extender la tabla `puzzles`, no crearla

**Decisión**: Una migración `0008_puzzles_from_photo.sql` que hace `ALTER TABLE` sobre la tabla
que creó 001. No se crea ninguna tabla nueva.

**Estado actual** (`0001_initial_schema.sql`):

```sql
puzzles (id, image_url, grid_rows, grid_cols, piece_count generated, created_at)
```

**Lo que añade 002**:

| Columna | Por qué |
|---|---|
| `nominal_piece_count` | La opción que eligió el jugador (20/50/100/200/500). `piece_count` es la real, derivada de la cuadrícula, y las dos difieren (FR-019, ver R4). |
| `visibility` | `'private'` por defecto, `'public'` si el jugador lo marca (FR-028, FR-029). |
| `storage_path` | Ruta dentro del bucket, además de `image_url`. Necesaria para poder borrar el objeto si la creación falla a medias. |
| `play_count` | Contador de partidas (ver R7). |
| `source` | `'seed'` o `'user_photo'`. Distingue los rompecabezas de la semilla de 001 de los creados por jugadores. |

**Rationale**: el input de planificación describe el modelo de datos como si la tabla no
existiera. Crearla de nuevo rompería la clave foránea desde `rooms` y borraría las salas en
curso. La forma mínima de 001 se declaró explícitamente como base a extender (research R7 de
001), y esto es exactamente esa extensión.

**Compatibilidad**: las filas existentes de la semilla reciben `nominal_piece_count = piece_count`,
`visibility = 'public'` y `source = 'seed'` en la misma migración. Sin eso, `NOT NULL` fallaría.

---

## R2. `react-easy-crop` como dependencia nueva

**Decisión**: Adoptarla. Es la primera dependencia de terceros del proyecto más allá del SDK de
Supabase y el tooling.

**Justificación exigida por el Principio I** (toda dependencia nueva debe justificarse por
escrito indicando por qué la plataforma no lo cubre):

- El recorte con encuadre (FR-012, FR-013) necesita: arrastre de la imagen, zoom con rueda y con
  gesto de pinza, un marco de recorte redimensionable, y la conversión de la selección a
  coordenadas de píxel de la imagen original. La plataforma no ofrece nada de esto: no existe un
  control nativo de recorte en HTML.
- Escribirlo a mano son varios cientos de líneas de manejo de punteros, y el gesto de pinza en
  táctil es el tipo de código que parece terminado y no lo está.
- `react-easy-crop` no arrastra dependencias transitivas, pesa ~15 kB comprimido y hace
  exactamente esto y nada más.

**Alternativas consideradas**:

| Alternativa | Por qué se descartó |
|---|---|
| Recorte a mano sobre `<canvas>` | Cientos de líneas para replicar un control resuelto; el gesto de pinza es la parte que siempre queda a medias. |
| `cropperjs` | Más grande, imperativo y con envoltorio de React de terceros. |
| Sin recorte, solo la imagen completa | Contradice FR-012, que es una historia de usuario completa (US2). |

**Techo conocido**: la biblioteca solo produce las **coordenadas** del recorte. El recorte real
—dibujar la región en un canvas y exportarla— se hace con la API del navegador, en código propio
de unas 20 líneas.

---

## R3. Formas de pieza deterministas sin generar imágenes

**Decisión**: Las formas se calculan **en el navegador de cada jugador** a partir de un generador
pseudoaleatorio determinista sembrado con el UUID del rompecabezas. El servidor no genera ni
almacena ninguna imagen por pieza.

**Diseño**:

1. `seedFromUuid(uuid)` → entero de 32 bits, por mezcla de los 16 bytes del UUID.
2. Se genera una **rejilla de bordes**, no una lista de piezas:
   - bordes horizontales: `(rows + 1) × cols`
   - bordes verticales: `rows × (cols + 1)`
   - los del perímetro son rectos; los interiores llevan lengüeta.
3. Cada borde interior deriva su forma de `splitmix32(seed ^ hash(fila, columna, orientación))`:
   signo de la lengüeta (hacia dentro o hacia fuera) y unos pocos parámetros de forma.
4. Cada pieza lee sus cuatro bordes de esa rejilla.

**Por qué la rejilla de bordes y no "una forma por pieza"**: dos piezas vecinas comparten un
borde. Si cada una calculase el suyo por separado, tendrían que ser exactamente complementarias,
y cualquier asimetría en el cálculo dejaría un hueco o un solape visible. Generando el borde una
sola vez y leyéndolo desde ambos lados, la complementariedad es estructural, no una propiedad que
haya que mantener.

**Determinismo entre clientes**: `Math.random` queda prohibido en esta ruta. `splitmix32` es
aritmética entera de 32 bits con `Math.imul` y desplazamientos, idéntica en todos los motores. El
resultado no depende de coma flotante, del orden de iteración ni del reloj.

**Alternativas consideradas**:

| Alternativa | Por qué se descartó |
|---|---|
| El servidor recorta y almacena una imagen PNG por pieza | 500 objetos en Storage por rompecabezas, coste y latencia de subida, y una operación de borrado en cascada que mantener. Contradice el Principio I. |
| El servidor genera las formas y las guarda como JSON en la fila | Un blob de varios cientos de kB por rompecabezas para algo reproducible con 4 bytes de semilla. |
| Formas aleatorias por cliente | Cada jugador vería un rompecabezas distinto. |

---

## R4. La cantidad nominal no es la cantidad real

**Decisión**: La opción elegida (20/50/100/200/500) es un **objetivo**. Se escoge la cuadrícula
`rows × cols` cuya relación de aspecto más se acerque a la del recorte y cuyo producto quede lo
más cerca posible del objetivo. La interfaz muestra la cantidad real antes de confirmar (FR-019).

**Función**: `chooseGrid(targetPieces, cropWidth, cropHeight)` → `{ rows, cols }`, pura y
determinista. Recorre las divisiones posibles y minimiza una penalización que combina la
desviación del total y la distorsión de la relación de aspecto de la pieza.

**Rationale**: una cuadrícula rectangular no puede dar exactamente 50 piezas con una relación de
aspecto arbitraria sin deformar las piezas. Deformarlas es peor: piezas muy alargadas se ven mal
y encajan peor. Ya está resuelto así en el spec (primera Assumption) y aquí solo se implementa.

**Restricción añadida**: se prefieren piezas lo más cuadradas posible. Una cuadrícula de 1×500
cumpliría el objetivo exacto y sería inservible, así que la penalización por distorsión la
descarta.

---

## R5. Almacenamiento de la imagen recortada

**Decisión**: Un bucket **privado** `puzzle-images` en Supabase Storage. El acceso de lectura se
resuelve con la política RLS del bucket, no haciéndolo público.

- Ruta del objeto: `{puzzle_id}/cropped.jpg`. El UUID es el nombre de carpeta, así que no hace
  falta un índice aparte para localizarlo ni se puede colisionar.
- Solo la **imagen recortada** se almacena. La original no se conserva (Assumption del spec): menos
  almacenamiento y menos dato personal custodiado.
- Se sube con `service_role` desde el route handler. El cliente nunca escribe en Storage.

**Lectura**: los rompecabezas públicos se leen a través de una política que permite `select` a
cualquiera; los privados, solo a quien conozca el UUID, que ya es la regla de acceso del propio
rompecabezas. La URL se firma con caducidad larga o se sirve por una política de lectura pública
sobre el bucket, según lo que resulte más simple al implementar; ambas opciones cumplen el
requisito y la decisión concreta se toma en la tarea correspondiente.

**Limpieza ante fallo parcial**: si la subida tiene éxito y el `INSERT` falla, el objeto queda
huérfano. El route handler borra el objeto en el `catch`. Es una compensación explícita, no una
transacción: Storage y Postgres no comparten transacción, y montar un mecanismo que lo garantice
sería infraestructura desproporcionada para un objeto huérfano ocasional.

---

## R6. Validación en el servidor sin confiar en el navegador

**Decisión**: El route handler valida **por sí mismo**, y no acepta como prueba nada que venga del
cliente.

| Qué se valida | Cómo |
|---|---|
| Tipo real del archivo | **Números mágicos** de los primeros bytes: `FF D8 FF` para JPEG, `89 50 4E 47` para PNG. No se confía en `Content-Type` ni en la extensión: ambos los controla quien envía la petición. |
| Tamaño ≤ 10 MB | Tamaño real del cuerpo recibido, no la cabecera `Content-Length`. |
| Imagen legible | Que las dimensiones se puedan leer de la cabecera del archivo. Un JPEG truncado tiene los números mágicos correctos y es inservible (FR-008). |
| Cantidad de piezas | Pertenencia al conjunto `{20, 50, 100, 200, 500}`. Un valor libre se rechaza (FR-017). |
| Visibilidad | Solo `'private'` o `'public'`; ausente ⇒ `'private'` (FR-029). |

**Rationale**: la validación del navegador es una conveniencia para dar respuesta inmediata, no
una frontera de confianza. Cualquiera puede hacer `POST` directamente al endpoint. El spec lo pide
de forma explícita y el Principio II lo respalda: la protección no puede descansar en el cliente.

**Nota sobre el límite de tamaño**: Next.js limita el cuerpo de las Server Actions, pero no el de
un route handler que lee un `FormData` en streaming. El límite de 10 MB se aplica en código, y se
corta la lectura al superarlo en lugar de aceptar el archivo entero y medirlo después.

---

## R7. El contador de partidas y la frontera con 003

**Decisión**: `play_count` vive en `puzzles`, no en una entidad "entrada de catálogo" aparte.

**Desviación declarada**: el data-model de 003 lo situaba en una entidad `Entrada de catálogo`
junto con `origen`, `fecha de publicación` y `estado`. Al implementar 002 antes que 003, la
alternativa sería crear ahora una tabla que ninguna funcionalidad de 002 usa.

Poner el contador —y la visibilidad, y el origen— directamente en `puzzles` deja a 003 sin tabla
propia que crear: su "entrada de catálogo" pasa a ser la vista de `puzzles` filtrada por
`visibility = 'public'`, más una columna `catalog_status` para la retirada (FR-028 de 003). Es
menos superficie que mantener y no pierde ninguna capacidad.

**Consecuencia para 003**: su plan debe consumir estas columnas en lugar de crear una tabla.
Registrado también en los Pendientes conocidos del plan.

**Quién incrementa el contador**: la creación de una sala, que es código de 001. Esta feature solo
crea la columna con valor `0`; el incremento es una tarea de 003.

---

## R8. Impacto en la feature 001 ya implementada

**Decisión**: 002 cambia cómo se pintan las piezas en el tablero de 001. Se declara aquí porque no
es evidente desde la especificación.

`components/BoardCanvas.tsx` dibuja hoy cada pieza como un rectángulo con `drawImage`. Con formas
irregulares hace falta:

1. Construir un `Path2D` por pieza a partir de sus cuatro bordes.
2. `ctx.save()` → `ctx.clip(path)` → `drawImage` de una región **mayor** que la celda, porque las
   lengüetas sobresalen → `ctx.restore()`.
3. Trazar el contorno con el path, no con `strokeRect`.

**Lo que NO cambia**: la detección de qué pieza está bajo el puntero sigue usando la caja
envolvente de la celda. Con lengüetas, las cajas de piezas vecinas se solapan, así que un clic en
la zona de solape puede elegir la pieza "equivocada". Se asume: la alternativa es
`isPointInPath` por pieza en cada evento, y con 500 piezas eso es 500 comprobaciones por
movimiento de puntero.

`ponytail:` caja envolvente para el impacto del puntero; si el solape molesta en la práctica, la
mejora es descartar candidatos por caja y luego afinar con `isPointInPath` solo sobre esos pocos.

**Lo que tampoco cambia**: la geometría de encaje. Las lengüetas son decoración visual; el encaje
se sigue calculando sobre la cuadrícula regular en `release_piece`. Dos piezas encajan por su
posición de celda, no por si sus formas embonan.

---

## R9. Estrategia de pruebas

Bajo el Principio VI en su versión 1.2.0: se prueba donde la lógica vive.

1. **Unitarias, sin infraestructura** (`npm test`):
   - `lib/puzzle-generation/prng.ts` — `splitmix32` y `seedFromUuid`: misma semilla ⇒ misma
     secuencia, y semillas distintas ⇒ secuencias distintas.
   - `lib/puzzle-generation/edges.ts` — la rejilla de bordes es determinista, el perímetro es
     recto, y **los bordes compartidos son exactamente complementarios**.
   - `lib/puzzle-generation/grid.ts` — `chooseGrid` para las cinco opciones y varias relaciones
     de aspecto; nunca devuelve una cuadrícula degenerada.
   - `lib/upload/validate.ts` — números mágicos de JPG y PNG, rechazo de otros formatos, límite
     de 10 MB inclusive, y archivo truncado.
2. **Integración contra Supabase local** (`npm run test:db`):
   - Flujo completo de creación: subida, fila creada, objeto en Storage, enlace devuelto.
   - Visibilidad por defecto privada, y pública solo si se marca.
   - Limpieza del objeto huérfano cuando el `INSERT` falla.

La validación del archivo vive en una función pura separada del route handler precisamente para
que sea unitaria. La subida a Storage no lo es, y por eso está en el nivel 2.

---

## R10. El enlace único

**Decisión**: El enlace es `/puzzles/{uuid}`. No se genera un identificador aparte.

`gen_random_uuid()` produce UUID v4: 122 bits aleatorios, no secuenciales y no enumerables, que
es exactamente lo que pide FR-030. Añadir un código corto propio —como el de las salas— sería una
segunda forma de identificar lo mismo, y aquí no hay ninguna razón para ello: el enlace se copia y
se pega, no se dicta de palabra.

**Contraste con las salas de 001**: allí el código corto existe porque tiene que poder dictarse en
voz alta. Un rompecabezas no se comparte así.
