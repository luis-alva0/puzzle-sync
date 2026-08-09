# Phase 1 Data Model: Armado Colaborativo en Tiempo Real

**Feature**: 001-sala-armado-colaborativo | **Date**: 2026-08-09

Todas las columnas de tiempo son `timestamptz`. La presentación al usuario aplica el offset fijo
`-05:00` (`America/Lima`), según la constitución. Ninguna tabla tiene política de purga.

---

## Diagrama de relaciones

```text
puzzles (1) ──< (N) rooms (1) ──< (N) room_players
                    │                      │
                    │                      └──< captured_by
                    └──< (N) pieces ───────────┘
                    │
                    └──< (0..1) game_history
```

---

## `puzzles`

Forma mínima necesaria para que esta feature sea ejecutable. Las especificaciones 002 y 003
extenderán esta tabla; no la sustituirán (ver research R7).

| Columna | Tipo | Restricciones | Notas |
|---|---|---|---|
| `id` | `uuid` | PK, default `gen_random_uuid()` | |
| `image_url` | `text` | NOT NULL | Ruta en Supabase Storage |
| `rows` | `smallint` | NOT NULL, `> 0` | Filas de la cuadrícula |
| `cols` | `smallint` | NOT NULL, `> 0` | Columnas de la cuadrícula |
| `piece_count` | `smallint` | NOT NULL, generada `rows * cols` | Cantidad real de piezas |
| `created_at` | `timestamptz` | NOT NULL, default `now()` | |

---

## `rooms`

| Columna | Tipo | Restricciones | Notas |
|---|---|---|---|
| `id` | `uuid` | PK, default `gen_random_uuid()` | |
| `code` | `char(6)` | NOT NULL, **UNIQUE** | Alfabeto sin ambigüedad (ver reglas) |
| `puzzle_id` | `uuid` | NOT NULL, FK → `puzzles.id` | |
| `max_players` | `smallint` | NOT NULL, default `4`, `between 1 and 4` | |
| `status` | `text` | NOT NULL, default `'in_progress'`, in (`in_progress`, `completed`) | |
| `started_at` | `timestamptz` | NOT NULL, default `now()` | Marca de inicio de la partida |
| `completed_at` | `timestamptz` | NULL | Se fija al conectar la última pieza |

**Índices**: único sobre `code`.

**Reglas de validación**:

- `code`: exactamente 6 caracteres del alfabeto `ABCDEFGHJKMNPQRSTUVWXYZ23456789` (31 símbolos).
  Excluye `0`, `O`, `1`, `I`, `L` para que el código se pueda dictar de palabra. Espacio de
  claves ≈ 8.87 × 10⁸.
- La unicidad la garantiza la restricción de la base de datos, no el generador. El generador
  reintenta ante colisión (ver contrato de `POST /api/rooms`).

**Transiciones de estado**:

```text
in_progress ──(todas las piezas en un solo grupo)──> completed
```

`completed` es terminal. Una sala completada conserva su tablero y sigue accesible por su código
(**FR-026**).

---

## `room_players`

| Columna | Tipo | Restricciones | Notas |
|---|---|---|---|
| `id` | `uuid` | PK, default `gen_random_uuid()` | Es el `player_id` de los contratos |
| `room_id` | `uuid` | NOT NULL, FK → `rooms.id` ON DELETE CASCADE | |
| `auth_user_id` | `uuid` | NOT NULL, FK → `auth.users.id` | Sesión anónima (research R1) |
| `alias` | `text` | NOT NULL, longitud 2–20 tras recortar espacios | |
| `last_seen_at` | `timestamptz` | NOT NULL, default `now()` | Refrescado por heartbeat |
| `joined_at` | `timestamptz` | NOT NULL, default `now()` | |

**Índices**: único sobre `(room_id, auth_user_id)` — un jugador ocupa una sola plaza por sala, y
esto es lo que hace que reconectar reutilice la fila en lugar de crear una nueva.
Índice sobre `(room_id, last_seen_at)` para el conteo de conectados.

**Reglas de validación**:

- `alias`: entre 2 y 20 caracteres tras `trim`. Se rechaza vacío o solo espacios (**FR-002**).
- Se permiten alias duplicados dentro de una sala; la interfaz los desambigua con un sufijo
  numérico al pintar, sin tocar el dato almacenado.

**Conectado / desconectado** es un estado **derivado**, no una columna:

```sql
last_seen_at > now() - interval '30 seconds'
```

Sin columna booleana que mantener sincronizada y sin job que la actualice (research R2). El límite
de 4 (**FR-005**) se evalúa contando filas que cumplan esa condición.

---

## `pieces`

Una fila por pieza y por sala. Se materializan al crear la sala, a partir de la cuadrícula del
rompecabezas.

| Columna | Tipo | Restricciones | Notas |
|---|---|---|---|
| `id` | `uuid` | PK, default `gen_random_uuid()` | |
| `room_id` | `uuid` | NOT NULL, FK → `rooms.id` ON DELETE CASCADE | |
| `row` | `smallint` | NOT NULL | Fila correcta en la cuadrícula |
| `col` | `smallint` | NOT NULL | Columna correcta en la cuadrícula |
| `x` | `real` | NOT NULL | Posición actual en el tablero |
| `y` | `real` | NOT NULL | Posición actual en el tablero |
| `group_id` | `uuid` | NOT NULL | Grupo de piezas conectadas (research R6) |
| `captured_by` | `uuid` | NULL, FK → `room_players.id` ON DELETE SET NULL | |
| `captured_at` | `timestamptz` | NULL | Inicio del arrendamiento del bloqueo |
| `updated_at` | `timestamptz` | NOT NULL, default `now()` | |

**Índices**: único sobre `(room_id, row, col)`; índice sobre `(room_id, group_id)`.

**Invariantes**:

- `captured_by IS NULL` ⟺ `captured_at IS NULL`. Se impone con un `CHECK`.
- Una pieza suelta tiene `group_id = id`. Al fusionar, todas las piezas del grupo perdedor adoptan
  el `group_id` del ganador.
- La posición se escribe siempre **absoluta**, nunca como delta. Esto es lo que hace idempotente
  la aplicación repetida de un movimiento (**FR-025**).

**Estado del bloqueo** (derivado, no almacenado):

| Condición | Estado |
|---|---|
| `captured_by IS NULL` | Libre |
| `captured_at > now() - interval '30 s'` | Bloqueada por `captured_by` |
| `captured_at <= now() - interval '30 s'` | Arrendamiento vencido → capturable |

La tercera fila es lo que satisface **FR-015** y **SC-007** sin ningún proceso de limpieza.

**Transiciones**:

```text
libre ──capture_piece()──> capturada ──release_piece()──> libre
  ▲                             │
  └────arrendamiento vencido────┘
```

---

## `game_history`

| Columna | Tipo | Restricciones | Notas |
|---|---|---|---|
| `id` | `uuid` | PK, default `gen_random_uuid()` | |
| `room_id` | `uuid` | NOT NULL, FK → `rooms.id`, **UNIQUE** | Una entrada por sala completada |
| `puzzle_id` | `uuid` | NOT NULL, FK → `puzzles.id` | Denormalizado a propósito |
| `aliases` | `text[]` | NOT NULL | Alias de quienes participaron |
| `started_at` | `timestamptz` | NOT NULL | Copiado de `rooms.started_at` |
| `completed_at` | `timestamptz` | NOT NULL | **FR-028** |

Se escribe una sola vez, dentro de la misma transacción que marca la sala como `completed`. La
restricción `UNIQUE` sobre `room_id` impide registrar la misma partida dos veces si el evento de
completado se procesa por duplicado.

Retención **indefinida** (**FR-029**): sin TTL, sin purga, sin borrado en cascada desde `rooms`
(la FK es `ON DELETE RESTRICT`, de modo que borrar una sala no puede llevarse su histórico por
delante).

---

## Row Level Security

RLS **habilitada en todas las tablas**. Política de partida: denegar todo.

| Tabla | `anon` / `authenticated` | Notas |
|---|---|---|
| `puzzles` | SELECT permitido | Datos públicos, sin información personal |
| `rooms` | SELECT permitido solo si el jugador tiene fila en `room_players` de esa sala | |
| `room_players` | SELECT permitido para miembros de la misma sala | Escritura solo vía `service_role` |
| `pieces` | SELECT permitido para miembros de la sala; escritura **solo** vía las funciones `SECURITY DEFINER` | Habilita Postgres Changes en el cliente |
| `game_history` | Sin acceso desde el cliente en esta feature | La lectura del histórico es otra feature |

Toda mutación pasa por route handlers con `service_role` o por funciones `SECURITY DEFINER`. El
cliente nunca ejecuta un `INSERT` ni un `UPDATE` directo.

---

## Trazabilidad requisito → modelo

| Requisito | Dónde se satisface |
|---|---|
| FR-002 alias no vacío | `room_players.alias`, validación 2–20 |
| FR-005 máximo 4 conectados | Conteo derivado sobre `last_seen_at` |
| FR-010 bloqueo exclusivo | `pieces.captured_by` + función atómica |
| FR-013 gana el primero | `UPDATE` condicional atómico (research R5) |
| FR-015 sin bloqueos huérfanos | Arrendamiento de 30 s con expiración perezosa |
| FR-017 movimiento en grupo | `pieces.group_id` |
| FR-021 estado autoritativo | Todas las mutaciones vía servidor / `SECURITY DEFINER` |
| FR-025 idempotencia | Posiciones absolutas, nunca deltas |
| FR-026 sala persiste sin jugadores | `rooms` y `pieces` no se borran al vaciarse la sala |
| FR-028 histórico con inicio y fin | `game_history` |
| FR-029 retención indefinida | Sin TTL; FK `ON DELETE RESTRICT` |
| FR-030 hora de Perú | `timestamptz` + formateo a `-05:00` |
