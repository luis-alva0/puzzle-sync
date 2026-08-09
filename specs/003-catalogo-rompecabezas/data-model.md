# Phase 1 Data Model: Catálogo de Rompecabezas Pre-creados

**Feature**: 003-catalogo-rompecabezas | **Date**: 2026-08-09

**No se crea ninguna tabla.** Se añade una columna, se reemplazan dos índices y se redefine una
función de 001.

---

## `puzzles` — lo que ya está y sirve tal cual

| Columna | De dónde viene | Para qué la usa 003 |
|---|---|---|
| `id` | 001 | Enlace y clave de desempate del cursor |
| `image_url`, `storage_path` | 001 / 002 | Miniatura de la tarjeta, servida con URL firmada |
| `grid_rows`, `grid_cols`, `piece_count` | 001 | Cantidad de piezas en la tarjeta (FR-004) |
| `created_at` | 001 | Ordenamiento por más recientes (FR-009) |
| `visibility` | 002 | Qué entra al catálogo (FR-002, FR-005) |
| `play_count` | 002 | Ordenamiento por más jugados (FR-010) |
| `source` | 002 | `'curated'` vs `'user_photo'`. **Interno**: no se expone (FR-003) |

Que 002 pusiera estas tres columnas en `puzzles` en lugar de crear una tabla `catalog_entries` es
lo que deja a esta feature sin modelo de datos propio.

---

## Lo único que añade 003

| Columna | Tipo | Restricciones | Notas |
|---|---|---|---|
| `catalog_status` | `text` | NOT NULL, default `'visible'`, `in ('visible','retired')` | Retirada reactiva por el administrador (FR-028) |

**Por qué una columna y no reutilizar `visibility`** (research R5):

- Poner `visibility = 'private'` al retirar cambiaría la decisión que el jugador tomó al crear, y
  el spec la declara inmutable (FR-029c de 002).
- Borrar la fila rompería el enlace del creador, y FR-030 exige que siga funcionando.

**Regla de aparición en el catálogo**, y es la única que importa:

```text
visible en el catálogo  ⟺  visibility = 'public'  ∧  catalog_status = 'visible'
```

Retirar no toca `visibility`, no borra nada y no invalida el enlace.

---

## Índices: se reemplazan los de 002

Los que creó 002 no tienen desempate, y sin él la paginación por cursor produce duplicados y
saltos entre páginas sucesivas (research R3).

```sql
drop index puzzles_public_recent_idx;
drop index puzzles_public_played_idx;

create index puzzles_public_recent_idx
  on puzzles (created_at desc, id desc)
  where visibility = 'public' and catalog_status = 'visible';

create index puzzles_public_played_idx
  on puzzles (play_count desc, id desc)
  where visibility = 'public' and catalog_status = 'visible';
```

El `id` en el índice no es adorno: es la columna que hace determinista el orden cuando dos filas
empatan, que con `play_count` —donde el valor más común será `0`— ocurre constantemente.

La condición parcial incorpora `catalog_status` para que el índice siga cubriendo exactamente las
filas que el listado consulta.

---

## `create_room` se redefine

Vive en `0004_room_functions.sql`, es de la feature 001, y hoy no menciona `play_count`. 003 la
redefine para incrementarlo **dentro de la misma transacción** que crea la sala:

```text
insert into rooms … → insert into pieces … → insert into room_players …
  → update puzzles set play_count = play_count + 1 where id = p_puzzle_id
```

Se cuenta al crear la sala y no al completar la partida: una partida abandonada también señala
interés (Assumption del spec), y esperar al final subestimaría los rompecabezas difíciles.

En la misma transacción, no en un disparador aparte, para que no exista un instante en el que la
sala existe y el contador no lo refleja.

---

## Row Level Security

`puzzles` ya tiene RLS con la política que dejó 002: lectura para `visibility = 'public'`. **Se
restringe** para que un rompecabezas retirado deje de ser legible desde el cliente:

```sql
using (visibility = 'public' and catalog_status = 'visible')
```

Un rompecabezas retirado sigue siendo accesible por su enlace, porque `GET /api/puzzles/[id]` usa
`service_role` y no pasa por la política. Es la misma asimetría que 002 introdujo para los
privados, aplicada al mismo mecanismo.

**Escritura**: ninguna política nueva. Retirar pasa por un route handler con `service_role` que
antes comprueba que quien llama es administrador.

---

## Entidades del spec, y dónde acabaron

| Entidad del spec | Dónde vive |
|---|---|
| **Entrada de catálogo** | No es una tabla: es `puzzles` filtrada por `visibility` y `catalog_status`. Sus atributos —origen, fecha, contador, estado— ya son columnas |
| **Rompecabezas** | `puzzles`, sin cambios |
| **Administrador** | `auth.users` con `app_metadata.is_admin = true`. No hay tabla propia |
| **Contador de partidas** | `puzzles.play_count`, incrementado por `create_room` |

---

## Trazabilidad requisito → modelo

| Requisito | Dónde se satisface |
|---|---|
| FR-002 curados y públicos juntos | `visibility = 'public'`, sin filtrar por `source` |
| FR-003 sin distinción de origen | `source` no se expone en la respuesta del listado |
| FR-005 sin privados en el catálogo | Condición de la política y de la consulta |
| FR-007 carga por tramos | Keyset sobre los índices con desempate |
| FR-009, FR-010 dos ordenamientos | Los dos índices parciales |
| FR-011 desempate determinista | `id desc` como segunda clave |
| FR-013 incremento del contador | `create_room` redefinida |
| FR-028 retirar del catálogo | `catalog_status = 'retired'` |
| FR-030 el enlace sobrevive a la retirada | No se borra la fila ni el objeto de Storage |
| FR-031 las salas en curso no se ven afectadas | `rooms` referencia `puzzles.id`, que sigue existiendo |
