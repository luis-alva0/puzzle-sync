# Contract: REST API

**Feature**: 002-crear-rompecabezas-desde-foto | Endpoint: `POST /api/puzzles`

Un único endpoint. Reutiliza el helper de errores de 001 (`lib/api/errors.ts`) y su formato
uniforme `{ error: { code, message } }` (Principio V).

Requiere `Authorization: Bearer <jwt>` con la sesión anónima de Supabase, igual que el resto de
la API.

## Códigos de error

Se añaden dos a la unión `ErrorCode` de `types/api.ts`:

| `code` | HTTP | Cuándo |
|---|---|---|
| `INVALID_FILE_TYPE` | 400 | El archivo no es JPG ni PNG, según sus **números mágicos** (FR-006) |
| `FILE_TOO_LARGE` | 413 | Supera los 10 MB (FR-007) |

Ya existentes que este endpoint usa:

| `code` | HTTP | Cuándo |
|---|---|---|
| `UNAUTHENTICATED` | 401 | Falta el JWT o es inválido |
| `INVALID_PIECE_COUNT` | 400 | La cantidad no es una de las cinco opciones (FR-017) |
| `INTERNAL_ERROR` | 500 | Fallo de subida, de inserción o no previsto |

`INVALID_PIECE_COUNT` también es nuevo. Los tres nuevos se añaden a `ErrorCode` y a
`ERROR_STATUS`; ninguno se reutiliza con significado distinto, porque cambiar el significado de un
código existente es un cambio incompatible (Principio V).

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

## Nota sobre lo que este endpoint NO hace

- **No genera imágenes por pieza.** Las formas se calculan en el navegador desde el UUID
  (research R3). El servidor almacena una sola imagen: el recorte.
- **No recorta.** Llega ya recortada. El recorte ocurre en el navegador, donde el jugador lo
  decide, y evita subir la original completa.
- **No modera.** Declarado fuera de alcance en el spec.
