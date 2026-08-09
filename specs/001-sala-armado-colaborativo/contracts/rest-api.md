# Contract: REST API

**Feature**: 001-sala-armado-colaborativo | Base: `/api/rooms`

Todos los endpoints requieren la cabecera `Authorization: Bearer <jwt>` con el JWT de la sesión
anónima de Supabase (research R1). Sin ella responden `401 UNAUTHENTICATED`.

## Formato uniforme de error

Todo fallo, sin excepción, responde con este cuerpo (Principio V de la constitución):

```json
{ "error": { "code": "ROOM_FULL", "message": "La sala ya tiene 4 jugadores conectados." } }
```

| `code` | HTTP | Cuándo |
|---|---|---|
| `UNAUTHENTICATED` | 401 | Falta el JWT o es inválido |
| `INVALID_ALIAS` | 400 | Alias fuera de 2–20 caracteres tras recortar espacios |
| `ROOM_NOT_FOUND` | 404 | El código de sala no existe |
| `ROOM_FULL` | 409 | Ya hay `max_players` conectados |
| `PUZZLE_NOT_FOUND` | 404 | `puzzle_id` inexistente |
| `INTERNAL_ERROR` | 500 | Cualquier fallo no previsto |

El cliente conmuta sobre `code`. `message` es para mostrar, nunca para comparar.

---

## `POST /api/rooms` — Crear sala

Crea la sala, materializa sus piezas y registra al creador como primer jugador.

**Request**

```json
{ "puzzleId": "0f9c…", "alias": "Luis" }
```

**Response `201`**

```json
{
  "roomCode": "K7PQ3M",
  "playerId": "3b1e…",
  "puzzle": { "id": "0f9c…", "imageUrl": "https://…", "rows": 10, "cols": 10 }
}
```

**Comportamiento**

1. Valida `alias` (2–20 tras `trim`) → `INVALID_ALIAS`.
2. Verifica que `puzzleId` existe → `PUZZLE_NOT_FOUND`.
3. Genera `roomCode` de 6 caracteres sobre `ABCDEFGHJKMNPQRSTUVWXYZ23456789`. Ante violación de
   la restricción `UNIQUE`, reintenta hasta 5 veces; agotados los reintentos → `INTERNAL_ERROR`.
4. En **una sola transacción**: inserta `rooms`, inserta `rows × cols` filas en `pieces` con
   posiciones iniciales dispersas y `group_id = id`, inserta la fila del creador en
   `room_players`.
5. El creador no recibe ningún permiso especial (**FR-004**).

El enlace de invitación es la URL de la sala, `/rooms/{roomCode}`; el servidor no devuelve una URL
completa para no acoplar el contrato al dominio de despliegue.

---

## `POST /api/rooms/[code]/join` — Unirse a una sala

**Request**

```json
{ "alias": "Ana" }
```

**Response `200`**

```json
{
  "playerId": "8d2a…",
  "roomId": "1c4f…",
  "puzzle": { "id": "0f9c…", "imageUrl": "https://…", "rows": 10, "cols": 10 }
}
```

**Comportamiento**

1. Valida `alias` (2–20 tras `trim`) → `INVALID_ALIAS`.
2. Busca la sala por `code` → `ROOM_NOT_FOUND`.
3. **Si el `auth_user_id` ya tiene fila en esa sala**: es una reconexión. Refresca `last_seen_at`,
   devuelve el `playerId` existente y **no** aplica el límite de aforo. Esto es lo que hace que un
   jugador que perdió la conexión pueda volver aunque su plaza aún figure ocupada (**FR-022**).
4. Si es un jugador nuevo: cuenta los conectados
   (`last_seen_at > now() - interval '30 seconds'`). Si `>= max_players` → `ROOM_FULL`
   (**FR-006**).
5. Inserta la fila en `room_players`.

Unirse a una sala con `status = 'completed'` está permitido: se ve el tablero terminado.

---

## `GET /api/rooms/[code]/state` — Estado completo del tablero

Usado al entrar por primera vez y al reconectar (**FR-023**). Es la única fuente de verdad para
reconstruir la pantalla.

**Response `200`**

```json
{
  "room": {
    "code": "K7PQ3M",
    "status": "in_progress",
    "startedAt": "2026-08-09T14:32:10-05:00",
    "completedAt": null,
    "maxPlayers": 4
  },
  "puzzle": { "id": "0f9c…", "imageUrl": "https://…", "rows": 10, "cols": 10 },
  "players": [
    { "id": "3b1e…", "alias": "Luis", "connected": true },
    { "id": "8d2a…", "alias": "Ana", "connected": false }
  ],
  "pieces": [
    { "id": "aa01…", "row": 0, "col": 0, "x": 120.5, "y": 340.0,
      "groupId": "aa01…", "capturedBy": null }
  ],
  "serverTime": "2026-08-09T14:35:02-05:00"
}
```

**Comportamiento**

- `connected` es derivado de `last_seen_at`, no una columna.
- `capturedBy` se devuelve como `null` cuando el arrendamiento está vencido: el cliente ve la
  pieza como libre sin tener que conocer la regla de los 30 s.
- `serverTime` permite al cliente detectar desfase de reloj sin confiar en el suyo.
- Todos los timestamps se serializan con offset `-05:00`.

Este endpoint no pagina. Con 500 piezas la respuesta ronda los 60 KB, muy por debajo de lo que
justificaría complicarlo.
