# Quickstart: Creación de un Rompecabezas a partir de una Foto

**Feature**: 002-crear-rompecabezas-desde-foto

Guía para levantar y validar la feature. Los detalles de contrato están en
[contracts/](./contracts/) y el esquema en [data-model.md](./data-model.md).

---

## Prerrequisitos

Los de la feature 001, ya funcionando: Node.js 20+, Supabase CLI, Docker, y **Anonymous Sign-In
habilitado** en el proyecto de Supabase.

Adicional para esta feature:

```bash
npm install react-easy-crop
supabase db push          # aplica 0008_puzzles_from_photo.sql
npm run seed              # re-siembra con visibility y source ya declarados
```

`seed.sql` y `scripts/seed.mjs` se actualizan **en el mismo despliegue** que la migración: declaran
`visibility = 'public'` y `source = 'seed'`. Sin eso, los valores por defecto de las columnas
nuevas etiquetarían la semilla como foto de usuario y privada.

El bucket `puzzle-images` lo crea la migración. Si ya existe de un intento anterior, la migración
es idempotente y no falla.

Las variables de entorno son **las mismas** que ya usa el proyecto. No hay ninguna nueva.

---

## Escenarios de validación

### 1. Foto → rompecabezas jugable (US1)

1. `npm run dev`, ir a `/puzzles/create`.
2. Subir un JPG de menos de 10 MB.
3. Sin tocar el encuadre, elegir **100 piezas** y confirmar.

**Esperado**: aparece el enlace `/puzzles/{uuid}` con acción de copiar, la fecha de creación en
hora de Perú, y la advertencia de que sin cuenta ese enlace es la única vía de acceso. La interfaz
mostró la cantidad **real** antes de confirmar, que puede no ser exactamente 100 (research R4).

4. **Abrir el enlace.** Debe mostrar el rompecabezas y un botón para crear una sala con él. Es la
   mitad de la feature que hace que la otra mitad sirva de algo: sin esta pantalla, el enlace es
   un 404.

**Comprobar en la base de datos**:

```sql
select nominal_piece_count, piece_count, grid_rows, grid_cols, visibility, source, storage_path
  from puzzles order by created_at desc limit 1;
```

`visibility` debe ser `private` y `source` debe ser `user_photo`.

### 1b. Rompecabezas privado accesible por su enlace

Abrir el enlace de un rompecabezas **privado** en una ventana de incógnito.

**Esperado**: se muestra **con la imagen visible**. Conocer el UUID es la credencial. Y comprobar
que un UUID inventado responde con "rompecabezas no encontrado", sin filtrar nada.

La imagen llega por una URL **firmada** que caduca en 1 hora y se emite de nuevo en cada visita: el
bucket no tiene política de lectura (research R5). Comprobar también lo contrario —que pegar la
ruta cruda del objeto en el navegador **no** funciona— porque es lo que protege las fotos
personales.

### 2. Encuadre (US2)

Subir una foto vertical de móvil, mover y redimensionar el marco de recorte, confirmar.

**Esperado**: el rompecabezas se construye con la porción seleccionada, no con la imagen
completa. La vista previa reflejaba el recorte en tiempo real.

### 3. Rechazo de archivos inválidos (US3)

| Prueba | Esperado |
|---|---|
| Subir un PDF | Rechazo con motivo **formato inválido**, sin crear nada |
| Subir una imagen de 15 MB | Rechazo con motivo **tamaño excedido**, indicando el límite |
| Renombrar un PDF a `.jpg` y subirlo | Rechazo: la validación mira los **números mágicos**, no la extensión |
| Un JPG truncado a la mitad | Rechazo por archivo no legible |

**La prueba que de verdad importa** es el `curl` directo, saltándose el navegador:

```bash
curl -X POST http://localhost:3000/api/puzzles \
  -H "Authorization: Bearer $JWT" \
  -F "image=@archivo.pdf;type=image/jpeg" \
  -F "nominalPieceCount=100"
```

Debe responder `400 INVALID_FILE_TYPE`. Declarar `type=image/jpeg` es precisamente lo que un
atacante haría, y por eso el servidor no lo mira (research R6).

### 4. Privacidad (US4)

1. Crear un rompecabezas **sin** marcar público. Comprobar que `visibility = 'private'`.
2. Crear otro **marcando** público. Comprobar `visibility = 'public'`.
3. Comprobar que no existe ninguna interfaz para cambiar la visibilidad después.

### 5. Determinismo de las formas — el escenario crítico

Abrir el **mismo** rompecabezas en dos navegadores distintos y comparar las formas de las piezas.

**Esperado**: idénticas, lengüeta a lengüeta. Si difieren, algo del módulo de generación usó
`Math.random`, la fecha, o el orden de las claves de un objeto.

Verificación mecánica, más fiable que mirar:

```bash
npm test -- piece-generation
```

Compara la rejilla de bordes generada con una instantánea fijada para un UUID conocido. Si el
algoritmo cambia, este test falla — y **debe** fallar: cambiar la generación rompe los
rompecabezas ya creados, que se dibujarían distintos a como se crearon.

### 6. Extremo a extremo con una sala real

Crear un rompecabezas **privado**, copiar su UUID, crear una sala con él desde la pantalla de
inicio, y armarlo entre dos navegadores.

Que sea privado no es un detalle: es el caso que rompía la feature 001 antes de firmar las URL. Si
el tablero sale en blanco, `GET /state` no está firmando la imagen.

**Esperado**: las piezas se ven con forma irregular, encajan, y el encaje sigue funcionando igual
que con las piezas cuadradas de la semilla. Las lengüetas son decoración: el encaje se calcula
sobre la cuadrícula regular en `release_piece` (research R8).

---

## Pruebas

```bash
npm test          # unitarias: PRNG, rejilla de bordes, cuadrícula, validación de archivo
npm run test:db   # integración: flujo de creación, visibilidad, limpieza de huérfanos
```

---

## Fallos habituales

| Síntoma | Causa probable |
|---|---|
| Dos jugadores ven piezas con formas distintas | Algo del módulo de generación usa `Math.random` o depende del orden de iteración |
| Las piezas se ven cortadas por los bordes | El dibujado recorta con el path pero pinta solo la celda; las lengüetas sobresalen y hay que pintar una región mayor |
| `FILE_TOO_LARGE` con un archivo pequeño | Se está midiendo `Content-Length` en vez del cuerpo real |
| Un PDF renombrado a `.jpg` pasa la validación | Se está mirando la extensión o el `Content-Type` en vez de los números mágicos |
| Objetos huérfanos en Storage | El borrado compensatorio del `catch` no se está ejecutando cuando falla el `INSERT` |
| La cantidad real no coincide con la elegida | Es lo esperado (research R4). Si molesta, el problema está en la interfaz que no la muestra antes de confirmar |
| El enlace devuelto da 404 | Falta `app/puzzles/[id]/page.tsx` |
| El enlace de un rompecabezas privado da error, el de uno público funciona | Falta `GET /api/puzzles/[id]`: tras la migración, los privados no son legibles con la llave anónima |
| La página del rompecabezas carga pero la imagen sale rota | La URL no se está firmando. El bucket no tiene política de lectura: sin firma, ninguna imagen es alcanzable |
| El tablero de una sala sale en blanco | `GET /state` de 001 devuelve `puzzles.image_url` en crudo en vez de firmarla |
| La imagen funciona un rato y luego deja de funcionar | Se está guardando o cacheando la URL firmada, que caduca en 1 hora. Hay que pedirla de nuevo en cada lectura |
| `supabase db push` falla con violación de `CHECK` | Se está copiando `piece_count` en `nominal_piece_count`: el rompecabezas de 4 piezas de la semilla no es una de las cinco opciones. Debe quedar NULL |
| `npm run seed` falla tras la migración | `seed.sql` no declara `visibility` ni `source` |
| La semilla aparece como privada o como foto de usuario | Mismo motivo: faltan las columnas en el sembrado |
| La foto sale girada 90° | No se normalizó la orientación EXIF: decodificar con `createImageBitmap(file, { imageOrientation: 'from-image' })` |
