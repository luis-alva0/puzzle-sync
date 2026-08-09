# Contract: REST API

**Feature**: 002-crear-rompecabezas-desde-foto | Endpoints: `POST /api/puzzles`, `GET /api/puzzles/[id]`

Dos endpoints. Reutiliza el helper de errores de 001 (`lib/api/errors.ts`) y su formato
uniforme `{ error: { code, message } }` (Principio V).

Requiere `Authorization: Bearer <jwt>` con la sesión anónima de Supabase, igual que el resto de
la API.

## Códigos de error

Se añaden **tres** a la unión `ErrorCode` de `types/api.ts`:

| `code` | HTTP | Cuándo |
|---|---|---|
| `INVALID_FILE_TYPE` | 400 | El archivo no es JPG ni PNG, según sus **números mágicos** (FR-006) |
| `FILE_TOO_LARGE` | 413 | Supera los 10 MB (FR-007) |
| `INVALID_PIECE_COUNT` | 400 | La cantidad no es una de las cinco opciones (FR-017) |

Ya existentes, reutilizados sin cambiar su significado:

| `code` | HTTP | Cuándo |
|---|---|---|
| `UNAUTHENTICATED` | 401 | Falta el JWT o es inválido |
| `PUZZLE_NOT_FOUND` | 404 | El UUID no corresponde a ningún rompecabezas (FR-031). Existe desde 001 |
| `INTERNAL_ERROR` | 500 | Fallo de subida, de inserción o no previsto |

Los tres nuevos se añaden a `ErrorCode` y a `ERROR_STATUS`. Ninguno existente se reutiliza con
significado distinto: cambiar el significado de un código ya publicado es un cambio incompatible
(Principio V).

---

## `POST /api/puzzles`

**Request** — `multipart/form-data`:

| Campo | Tipo | Notas |
|---|---|---|
| `image` | `File` | La imagen **ya recortada** por el jugador. JPG o PNG, ≤ 10 MB |
| `nominalPieceCount` | `"20"\|"50"\|"100"\|"200"\|"500"` | Una de las cinco opciones |
| `isPublic` | `"true"\|"false"` | Ausente ⇒ `false`. Privado por defecto (FR-029) |

Se usa `multipart/form-data` y no JSON con base64 porque base64 infla el cuerpo un 33 % y
obligaría a materializar los 10 MB en memoria antes de poder mirarlos.

**Response `201`**:

```json
{
  "puzzleId": "0f9c1a2b-3d4e-4f50-8a1b-2c3d4e5f6071",
  "url": "/puzzles/0f9c1a2b-3d4e-4f50-8a1b-2c3d4e5f6071",
  "gridRows": 10,
  "gridCols": 10,
  "pieceCount": 100,
  "nominalPieceCount": 100,
  "visibility": "private"
}
```

`pieceCount` es la cantidad **real** y puede diferir de `nominalPieceCount` (research R4). El
cliente ya la conoce antes de enviar, porque calcula la cuadrícula con la misma función; se
devuelve para que no haya dudas sobre lo que quedó guardado.

**Comportamiento**

1. Verifica el JWT → `UNAUTHENTICATED`.
2. Lee el `FormData` **en streaming**, cortando en cuanto se superan 10 MB → `FILE_TOO_LARGE`.
   No se acepta el archivo entero para medirlo después.
3. Comprueba los números mágicos del contenido → `INVALID_FILE_TYPE`. No se mira `Content-Type`
   ni la extensión: los controla quien envía la petición (research R6).
4. Lee las dimensiones de la cabecera de la imagen. Si no se pueden leer, el archivo está
   truncado o corrupto → `INVALID_FILE_TYPE` (FR-008).
5. Valida `nominalPieceCount` contra el conjunto de cinco → `INVALID_PIECE_COUNT`.
6. Calcula `chooseGrid(nominalPieceCount, width, height)` **en el servidor**. La cuadrícula nunca
   llega del cliente: si llegara, se podría pedir 1×5000.
7. Genera el UUID del rompecabezas por adelantado, para poder usarlo como carpeta en Storage.
8. Sube el objeto a `puzzle-images/{uuid}/cropped.jpg` con `service_role`.
9. Inserta la fila en `puzzles`.
10. Si el paso 9 falla, **borra el objeto** subido en el paso 8 y devuelve `INTERNAL_ERROR`. No
    hay transacción entre Storage y Postgres; esto es una compensación explícita (FR-033).

**Idempotencia**: no la tiene, y no la necesita. Dos envíos de la misma foto crean dos
rompecabezas distintos, que es exactamente lo que dice el spec (edge case: no hay deduplicación).

---

## `GET /api/puzzles/[id]` — Leer un rompecabezas por su enlace

Es lo que hace que el enlace devuelto por `POST` sirva de algo (FR-027).

**Por qué existe y no se consulta la tabla desde el cliente**: la migración de esta feature
restringe la política de lectura de `puzzles` a `visibility = 'public'` (research R5). A partir de
ahí, un rompecabezas **privado** no es legible con la llave anónima, y su enlace no funcionaría.
Este endpoint lo sirve con `service_role`, tras comprobar el UUID de la ruta.

Conocer el UUID es la credencial. Es la misma regla de acceso que el spec define para el enlace
(FR-024, FR-028), aplicada donde puede aplicarse.

**Response `200`**:

```json
{
  "puzzleId": "0f9c1a2b-3d4e-4f50-8a1b-2c3d4e5f6071",
  "imageUrl": "https://…/storage/v1/object/sign/puzzle-images/0f9c…/cropped.jpg?token=…",
  "gridRows": 10,
  "gridCols": 10,
  "pieceCount": 100,
  "visibility": "private",
  "createdAt": "2026-08-09T14:32:10.000-05:00"
}
```

**Comportamiento**

1. Valida que el parámetro de ruta tenga forma de UUID → `PUZZLE_NOT_FOUND` si no.
2. Busca la fila con `service_role` → `PUZZLE_NOT_FOUND` si no existe.
3. **Firma** la URL de la imagen con `service_role`, con 1 hora de caducidad, y la devuelve. El
   bucket no tiene política de lectura: sin firmar, la imagen no es alcanzable ni siendo pública
   (research R5). Si `storage_path` es `null` —los rompecabezas de la semilla— devuelve
   `image_url` tal cual, que es un `data:` URI.
4. `createdAt` se serializa con el helper de 001, en hora de Perú (FR-034).

**`imageUrl` caduca, el enlace no.** La URL firmada dura 1 hora y se emite de nuevo en cada
lectura. Lo permanente que promete FR-023 es `/puzzles/{uuid}`, no la dirección del objeto en
Storage. No hay que guardar ni cachear la URL firmada en ningún sitio.

**No requiere autenticación de miembro de nada**: cualquiera con el UUID puede leerlo, igual que
cualquiera con el enlace de una sala puede entrar en ella. Sí requiere la sesión anónima, como el
resto de la API.

**Respuesta a un UUID inexistente o mal formado**: `PUZZLE_NOT_FOUND`, sin revelar si el
identificador existió alguna vez ni información de otros rompecabezas (FR-031).

---

## Impacto en `GET /api/rooms/[code]/state` (feature 001)

Ese endpoint ya existe y devuelve `puzzle.imageUrl` leyendo `puzzles.image_url` en crudo. Con el
bucket cerrado, esa URL deja de servir para cualquier rompecabezas creado desde foto, y el tablero
se quedaría en blanco.

**Debe firmar igual que `GET /api/puzzles/[id]`**, con el mismo helper. Es un cambio pequeño en un
endpoint de 001, y sin él la feature 002 rompe la 001 en cuanto alguien juegue con una foto propia.

---

## Nota sobre lo que estos endpoints NO hacen

- **No genera imágenes por pieza.** Las formas se calculan en el navegador desde el UUID
  (research R3). El servidor almacena una sola imagen: el recorte.
- **No recorta.** Llega ya recortada. El recorte ocurre en el navegador, donde el jugador lo
  decide, y evita subir la original completa.
- **No modera.** Declarado fuera de alcance en el spec.
