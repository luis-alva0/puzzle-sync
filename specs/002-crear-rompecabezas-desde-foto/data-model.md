# Phase 1 Data Model: Creación de un Rompecabezas a partir de una Foto

**Feature**: 002-crear-rompecabezas-desde-foto | **Date**: 2026-08-09

Esta feature **no crea tablas**. Extiende `puzzles`, que ya existe desde
`0001_initial_schema.sql` (research R1), y añade un bucket de Storage.

---

## `puzzles` — estado actual y extensión

### Ya existe (feature 001)

| Columna | Tipo | Notas |
|---|---|---|
| `id` | `uuid` | PK, `gen_random_uuid()`. **Es el enlace único** (research R10). |
| `image_url` | `text` | NOT NULL |
| `grid_rows` | `smallint` | NOT NULL, `> 0` |
| `grid_cols` | `smallint` | NOT NULL, `> 0` |
| `piece_count` | `smallint` | Generada: `grid_rows * grid_cols`. Cantidad **real**. |
| `created_at` | `timestamptz` | NOT NULL, `now()` |

### Añade esta feature

| Columna | Tipo | Restricciones | Notas |
|---|---|---|---|
| `nominal_piece_count` | `smallint` | NOT NULL, `in (20,50,100,200,500)` | La opción que eligió el jugador (FR-017). Difiere de `piece_count` (research R4). |
| `visibility` | `text` | NOT NULL, default `'private'`, `in ('private','public')` | FR-028, FR-029. Se fija al crear y **no cambia** (FR-029c). |
| `storage_path` | `text` | NULL | Ruta dentro del bucket. NULL en los rompecabezas de la semilla, que usan data URI. |
| `play_count` | `integer` | NOT NULL, default `0`, `>= 0` | Partidas jugadas. Lo incrementa 001 al crear sala; lo ordena 003 (research R7). |
| `source` | `text` | NOT NULL, default `'user_photo'`, `in ('seed','user_photo','curated')` | Distingue origen. `'curated'` queda reservado para 003. |

### Migración de las filas existentes

Las tres filas de la semilla de 001 se actualizan en la misma migración antes de aplicar
`NOT NULL`:

```text
nominal_piece_count := piece_count     -- 4, 20 y 100: ya coinciden con opciones reales
visibility          := 'public'        -- son contenido de prueba, visibles para todos
source              := 'seed'
storage_path        := null            -- usan data URI, no Storage
```

### Índices nuevos

| Índice | Para qué |
|---|---|
| `(visibility, created_at desc)` parcial `where visibility = 'public'` | Listado del catálogo por recientes (003). |
| `(visibility, play_count desc)` parcial `where visibility = 'public'` | Listado por más jugados (003). |

Se crean aquí porque las columnas nacen aquí; los consulta 003.

### Reglas de validación

- `nominal_piece_count` ∈ {20, 50, 100, 200, 500}. Impuesto por `CHECK`, no solo por la
  aplicación: es la última línea si algún día otro camino inserta en la tabla.
- `visibility` se decide al crear. No existe ningún camino de escritura que la cambie después
  (FR-029c); la ausencia de ese camino **es** la restricción.
- `grid_rows`/`grid_cols` los calcula el servidor con `chooseGrid`, nunca llegan del cliente: si
  el cliente los enviara, podría pedir una cuadrícula de 1×5000.

### Transiciones de estado

`visibility` no tiene transiciones: es inmutable tras la creación.

```text
(no existe) ──POST /api/puzzles──> private   [terminal]
                                └─> public    [terminal]
```

---

## Storage: bucket `puzzle-images`

| Propiedad | Valor |
|---|---|
| Nombre | `puzzle-images` |
| Público | No. El acceso se resuelve con políticas. |
| Límite de tamaño | 10 MB, alineado con FR-005 |
| Tipos MIME permitidos | `image/jpeg`, `image/png` |
| Ruta del objeto | `{puzzle_id}/cropped.jpg` |

**Escritura**: solo `service_role`, desde el route handler. El cliente nunca sube directamente:
si lo hiciera, no habría forma de validar el archivo antes de que exista.

**Lectura**: política que permite `select` sobre objetos cuyo primer segmento de ruta corresponde
a un rompecabezas existente. Conocer el UUID es la credencial, igual que para el propio
rompecabezas.

**Un solo objeto por rompecabezas**: la imagen recortada. La original no se conserva.

---

## Row Level Security

`puzzles` ya tiene RLS habilitada con una política de lectura pública desde 001
(`puzzles legibles por cualquiera`). Esa política **sigue siendo correcta**: la fila contiene la
URL de la imagen y los metadatos, y el control de acceso real está en que el UUID no es
adivinable.

**No se añade ninguna política de escritura.** Toda creación pasa por el route handler con
`service_role`.

> **Matiz de privacidad, declarado**: con lectura pública sobre `puzzles`, alguien con la llave
> `anon` podría enumerar filas y descubrir rompecabezas privados. El UUID protege el enlace, no la
> tabla. Se restringe la política de 001 a lo que cada caso necesita:
>
> - `visibility = 'public'` → legible por cualquiera.
> - `visibility = 'private'` → legible solo consultando por `id` exacto, nunca en un listado.
>
> Postgres no distingue "consulta por clave" de "listado" en una política. La forma práctica es
> restringir la política a `visibility = 'public'` y servir los privados a través del route
> handler con `service_role`, que ya comprueba el UUID de la ruta. Es una tarea del plan.

---

## Trazabilidad requisito → modelo

| Requisito | Dónde se satisface |
|---|---|
| FR-004, FR-005 formatos y tamaño | Restricciones del bucket + validación por números mágicos (research R6) |
| FR-017 cinco opciones | `CHECK` sobre `nominal_piece_count` |
| FR-019 cantidad real visible | `piece_count` generada vs `nominal_piece_count` |
| FR-020 generar desde el recorte | `storage_path` apunta solo a la imagen recortada |
| FR-022 sin huecos ni solapes | Rejilla de bordes compartidos (research R3) |
| FR-023 permanencia | Sin TTL, sin purga |
| FR-024, FR-027 enlace único | `id` uuid v4 (research R10) |
| FR-028, FR-029 visibilidad | Columna `visibility`, default `'private'` |
| FR-029c inmutable | Ausencia de camino de escritura |
| FR-030 no enumerable | UUID v4, 122 bits aleatorios |
| FR-033 sin restos a medio crear | Borrado compensatorio del objeto (research R5) |
| FR-034 hora de Perú | `created_at` `timestamptz` + `lib/format/datetime.ts` de 001 |
