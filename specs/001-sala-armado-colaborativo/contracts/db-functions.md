# Contract: Funciones de base de datos

**Feature**: 001-sala-armado-colaborativo

Todas son `SECURITY DEFINER` con `search_path` fijado. Son el **único** camino por el que el
cliente puede mutar `pieces`. Constituyen el estado autoritativo exigido por **FR-021**.

Constante compartida: el arrendamiento de un bloqueo dura **30 segundos** (research R2).

---

## `capture_piece(p_piece_id uuid, p_player_id uuid) → capture_result`

Intenta capturar la pieza y **todo su grupo**. Resuelve la carrera de **FR-013**.

```sql
UPDATE pieces
   SET captured_by = p_player_id, captured_at = now()
 WHERE group_id = (SELECT group_id FROM pieces WHERE id = p_piece_id)
   AND NOT EXISTS (
         SELECT 1 FROM pieces p2
          WHERE p2.group_id = (SELECT group_id FROM pieces WHERE id = p_piece_id)
            AND p2.captured_by IS NOT NULL
            AND p2.captured_by <> p_player_id
            AND p2.captured_at > now() - interval '30 seconds')
RETURNING id;
```

**Retorno**

| Campo | Tipo | Significado |
|---|---|---|
| `success` | `boolean` | `true` si la captura fue concedida |
| `held_by_alias` | `text` | Alias de quien la tiene, cuando `success = false` |
| `piece_ids` | `uuid[]` | Piezas efectivamente capturadas |

**Garantías**

- Un único `UPDATE` ⇒ atómico por definición de Postgres. Con dos llamadas concurrentes sobre la
  misma pieza, exactamente una devuelve `success = true` (**FR-013**).
- Si el grupo ya está capturado por otro jugador con arrendamiento vigente → `success = false`
  (**FR-020**).
- Si el arrendamiento existente está vencido, la captura tiene éxito (**FR-015**).
- Recapturar una pieza que ya se posee es idempotente: solo refresca `captured_at`.

**Errores**: no lanza excepciones por captura denegada; la denegación es un valor de retorno, no
un error. Solo lanza si la pieza no existe.

---

## `move_piece(p_piece_id uuid, p_player_id uuid, p_x real, p_y real) → void`

Persiste la posición del grupo durante el arrastre y **refresca el arrendamiento**.

- Solo tiene efecto si `p_player_id` posee el grupo con arrendamiento vigente; en caso contrario
  es un no-op silencioso (un cliente rezagado no puede mover piezas ajenas).
- Escribe posiciones **absolutas** para todas las piezas del grupo, preservando sus
  desplazamientos relativos. Nunca deltas ⇒ idempotente (**FR-025**).
- Se llama con throttle desde el cliente (~2/s durante el arrastre), no en cada frame. El
  movimiento fluido viaja por Broadcast, no por esta función (research R4).

---

## `release_piece(p_piece_id uuid, p_player_id uuid, p_x real, p_y real) → release_result`

Suelta la pieza, evalúa el encaje y fusiona grupos si corresponde. Es la operación más densa de
la feature.

**Pasos, todos dentro de la misma transacción**

1. Verifica la posesión del grupo; si no la tiene, no-op.
2. Escribe la posición final absoluta del grupo.
3. Busca grupos vecinos encajables: para cada pieza del grupo, comprueba si alguna pieza adyacente
   en la cuadrícula (`row±1`, `col±1`) pertenece a otro grupo y está dentro de la **tolerancia de
   encaje** respecto de su posición relativa correcta (**FR-016**).
4. Si hay encaje: alinea el grupo entrante a la posición relativa exacta y ejecuta
   `UPDATE pieces SET group_id = <ganador> WHERE group_id = <perdedor>` (**FR-018**). La fusión se
   repite en cascada mientras siga habiendo vecinos encajables.
5. Libera el bloqueo: `captured_by = NULL, captured_at = NULL`.
6. Si tras la fusión **todas** las piezas de la sala comparten `group_id`: marca
   `rooms.status = 'completed'`, fija `completed_at` e inserta la fila en `game_history`
   (**FR-027**, **FR-028**). El `UNIQUE` sobre `game_history.room_id` hace que un doble procesado
   no duplique el registro.

**Retorno**

| Campo | Tipo | Significado |
|---|---|---|
| `merged_group_ids` | `uuid[]` | Grupos absorbidos en esta operación |
| `final_group_id` | `uuid` | Grupo resultante |
| `room_completed` | `boolean` | `true` si esta jugada completó el rompecabezas |

**Tolerancia de encaje**: valor fijo configurable, expresado como fracción del lado de la pieza
(por defecto `0.25`). Vive en una constante compartida entre la función SQL y
`lib/puzzle/matching.ts`, para que cliente y servidor coincidan en qué se considera encaje.

---

## `heartbeat(p_player_id uuid) → void`

`UPDATE room_players SET last_seen_at = now() WHERE id = p_player_id`.

Se invoca cada **10 segundos** desde el cliente. Mantiene vivos a la vez el estado "conectado"
(**FR-007**, **FR-024**) y el conteo de aforo (**FR-005**). Un intervalo de 10 s contra una
ventana de 30 s tolera dos latidos perdidos antes de dar a alguien por desconectado.
