# Contract: Canal de Realtime

**Feature**: 001-sala-armado-colaborativo

**Nombre del canal**: `room:{roomCode}` — uno por sala.

**Autorización**: canal privado. La suscripción exige un JWT autenticado y una política RLS sobre
`realtime.messages` que solo admite a quien tenga fila en `room_players` de esa sala (research
R1). Sin esto, cualquiera con la llave `anon` podría escuchar la sala de otros.

---

## Broadcast — posición durante el arrastre

**Evento**: `piece_drag`

```json
{ "groupId": "aa01…", "x": 320.5, "y": 118.0, "playerId": "3b1e…" }
```

- Emitido con throttle de **50 ms** (~20/s) mientras el jugador arrastra.
- **No tiene autoridad.** Es una pista visual para que los demás vean el movimiento fluido
  (**FR-011**). Perderlo, recibirlo dos veces o desordenado es inofensivo: la siguiente
  confirmación autoritativa corrige la pantalla.
- El receptor ignora los eventos cuyo `playerId` sea el suyo.
- 20 Hz da movimiento continuo con holgura frente al umbral de 1 s de **SC-001**.

**Evento**: `piece_drop`

```json
{ "groupId": "aa01…", "playerId": "3b1e…" }
```

Aviso inmediato de que el arrastre terminó, para que los demás dejen de interpolar sin esperar al
evento de Postgres. Tampoco tiene autoridad.

---

## Postgres Changes — hechos confirmados

**Tabla**: `pieces`, filtrada por `room_id=eq.{roomId}`, eventos `UPDATE`.

Es la fuente autoritativa de cambios en vivo: capturas concedidas, posiciones finales, fusiones de
grupo y liberaciones. El cliente aplica siempre estos eventos por encima de lo que dijera el
broadcast.

**Tabla**: `rooms`, filtrada por `id=eq.{roomId}`, evento `UPDATE`.

Sirve para detectar `status → 'completed'` y notificar el completado a todos los conectados
(**FR-027**).

---

## Presence — lista de participantes

**Estado publicado por cada cliente**:

```json
{ "playerId": "3b1e…", "alias": "Luis" }
```

Alimenta únicamente la lista de participantes en pantalla (**FR-007**) y el indicador de conexión
(**FR-024**). **No es fuente de verdad de nada**: el aforo y el estado conectado/desconectado se
derivan de `room_players.last_seen_at` en el servidor (research R2). Presence puede mentir si un
cliente muere sin enviar `leave`; `last_seen_at` no.

---

## Reconexión

El cliente de Supabase reintenta la suscripción solo. La secuencia al recuperar la conexión es:

1. El canal se resuscribe.
2. El cliente llama a `GET /api/rooms/[code]/state` y **reemplaza** su estado local completo.
3. Reanuda el heartbeat.

El paso 2 es obligatorio: durante la desconexión se perdieron eventos de Postgres Changes y no hay
forma de reproducirlos. Reemplazar el estado entero es más simple y más correcto que intentar
reconciliar un diff, y es lo que satisface **FR-023** y **SC-004**.

---

## Resumen de autoridad

| Canal | Autoridad | Si falla |
|---|---|---|
| Broadcast `piece_drag` / `piece_drop` | Ninguna | El movimiento se ve a saltos; el estado sigue correcto |
| Postgres Changes | **Autoritativa** | El tablero se desactualiza hasta el siguiente `GET /state` |
| Presence | Ninguna | La lista de participantes se desactualiza; el aforo sigue correcto |
| `GET /state` | **Autoritativa y definitiva** | El jugador no puede entrar ni reconectar |
