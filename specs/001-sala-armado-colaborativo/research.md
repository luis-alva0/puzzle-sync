# Phase 0 Research: Armado Colaborativo en Tiempo Real

**Feature**: 001-sala-armado-colaborativo | **Date**: 2026-08-09

Este documento resuelve las decisiones técnicas que la especificación deja abiertas y que el
input de planificación no fija explícitamente. Cada decisión se contrasta contra la
constitución, en particular el Principio I (simplicidad operativa: minimizar piezas de
infraestructura para un solo mantenedor).

---

## R1. Identidad del jugador sin cuentas, y cómo la ve Postgres

**Decisión**: Usar **Supabase Anonymous Sign-In** (`supabase.auth.signInAnonymously()`) como
mecanismo de sesión. El JWT anónimo *es* el "token de sesión" que describen los contratos de
API. La tabla `room_players` guarda el `auth.uid()` del jugador.

**Rationale**:

- El Principio II exige que el acceso a datos esté respaldado por RLS. Sin un JWT real,
  `auth.uid()` es `null` y no existe forma de escribir una política que distinga a un jugador
  de otro; RLS degenera en "todo o nada".
- Supabase Realtime Authorization (RLS sobre `realtime.messages`) **requiere** un JWT
  autenticado para restringir un canal privado a los miembros de una sala. Con la llave `anon`
  a secas, cualquiera podría suscribirse al canal de cualquier sala.
- Es invisible para el usuario: no hay pantalla de login, ni correo, ni contraseña. El Principio
  III prohíbe muros de registro, no identidad técnica. La sesión anónima se crea en segundo
  plano al entrar a la sala.
- El SDK persiste la sesión en `localStorage` automáticamente. Eso resuelve **FR-022** (reconectar
  sin reingresar alias) sin escribir código de persistencia propio.
- Cero infraestructura nueva: Auth ya forma parte de la plataforma Supabase que la constitución
  fija como backend único.

**Desviación respecto del input de planificación**: el input dice que los endpoints de crear y
unirse "devuelven un token de sesión". Con esta decisión el token no lo emite nuestro endpoint:
el cliente ya llega autenticado anónimamente y envía su JWT en la cabecera `Authorization`; los
endpoints devuelven el `player_id` y el estado de la sala. El token existe y cumple la misma
función, pero lo emite Supabase Auth. Emitir un token opaco propio obligaría a firmar JWTs a mano
para que RLS y Realtime lo entendieran, que es exactamente la pieza de infraestructura que el
Principio I manda evitar.

**Alternativas consideradas**:

| Alternativa | Por qué se descartó |
|---|---|
| Token opaco propio en cookie, todo el acceso vía `service_role` en route handlers | No habilita Realtime Authorization: el canal de la sala quedaría abierto a cualquiera con la llave `anon`. Requeriría firmar JWTs propios para cerrarlo. |
| Sin identidad: canal público por código de sala | El código de sala pasaría a ser el único secreto, y cualquiera podría emitir eventos falsos en el canal de una sala ajena. |
| Supabase Auth con email mágico | Muro de registro. Viola el Principio III de forma directa. |

**Techo conocido**: cada jugador nuevo crea una fila en `auth.users`. No hay purga (coherente con
la retención indefinida de la constitución), pero la tabla crece de forma monótona. Si algún día
molesta, la limpieza de usuarios anónimos sin `room_players` asociados es un `DELETE` puntual, no
un rediseño.

---

## R2. Liberar piezas de un jugador desconectado sin proceso en segundo plano

**Decisión**: **Bloqueos con arrendamiento (lease) y expiración perezosa**. La captura de una
pieza guarda `captured_by` y `captured_at`. Un bloqueo es válido solo si
`captured_at > now() - interval '30 seconds'`. El jugador que arrastra refresca `captured_at` con
cada actualización de posición. La expiración se evalúa **dentro de la función atómica de
captura**: si el bloqueo existente está vencido, la nueva captura lo toma.

**Rationale**:

- **FR-015** y **SC-007** exigen que ninguna pieza quede bloqueada por un ausente más de 30
  segundos. La lectura ingenua de ese requisito pide un job que detecte desconexiones y limpie.
- Un job significa cron, worker o Edge Function programada: una pieza de infraestructura más que
  operar, monitorear y depurar. El Principio I lo prohíbe salvo justificación.
- Con expiración perezosa, el bloqueo caduca solo. Nadie tiene que "darse cuenta" de que el
  jugador se fue: la próxima captura simplemente tiene éxito. El requisito se cumple con una
  condición extra en un `WHERE` que ya existía.
- El mismo mecanismo resuelve el conteo de conectados para el límite de 4 (**FR-005**): un jugador
  está conectado si `last_seen_at > now() - interval '30 seconds'`, refrescado por heartbeat. Sin
  job de limpieza de jugadores fantasma.

**Alternativas consideradas**:

| Alternativa | Por qué se descartó |
|---|---|
| Realtime Presence + el cliente que detecta el `leave` llama a un RPC de limpieza | Depende de que quede al menos un cliente conectado. Si los dos jugadores caen a la vez, el bloqueo queda huérfano indefinidamente. |
| `pg_cron` cada 30 s liberando bloqueos vencidos | Infraestructura extra para un problema que la expiración perezosa resuelve gratis. |
| Webhook de desconexión de Realtime | Añade un endpoint que hay que asegurar y que puede perderse; el estado quedaría inconsistente sin recuperación. |

**Nota de implementación**: Presence se sigue usando, pero solo para pintar la lista de
participantes en vivo (**FR-007**, **FR-024**). No es la fuente de verdad de nada.

---

## R3. Canvas o SVG para el tablero

**Decisión**: **Canvas 2D**, un único elemento `<canvas>` con repintado por `requestAnimationFrame`.

**Rationale**: La constitución obliga a elegir uno y documentarlo una sola vez. El caso peor de la
especificación 002 es de 500 piezas. Con SVG eso son 500 nodos del DOM cuyos `transform` cambian
en cada frame durante un arrastre; el coste de layout y repaint del navegador lo hace inviable a
60 fps. Canvas repinta una escena completa por frame con coste predecible e independiente del
número de nodos del DOM.

**Coste asumido**: Canvas no da accesibilidad por sí solo (no hay árbol de accesibilidad). Se
compensa con controles de teclado y etiquetas ARIA sobre los controles de la sala, no sobre las
piezas. El armado con puntero ya está declarado como el modo soportado en el spec.

**Alternativas consideradas**: SVG (descartado por rendimiento a 500 piezas); WebGL (descartado
por complejidad desproporcionada: 500 sprites no lo justifican).

---

## R4. Qué viaja por Realtime y qué viaja por la base de datos

**Decisión**: **Dos canales de información con autoridad distinta.**

| Tipo de evento | Transporte | Autoridad |
|---|---|---|
| Posición durante el arrastre | Realtime **Broadcast**, throttle 50 ms (~20/s) | Ninguna. Es una pista visual efímera. |
| Captura de pieza | RPC `capture_piece` (función atómica) | **Autoritativa.** |
| Soltar pieza / encaje / fusión de grupos | RPC `release_piece` | **Autoritativa.** |
| Confirmación de cambios autoritativos | Realtime **Postgres Changes** sobre `pieces` | **Autoritativa.** |
| Estado completo al entrar o reconectar | `GET /api/rooms/[code]/state` | **Autoritativa.** |

**Rationale**:

- **SC-001** pide latencia percibida < 1 s. Broadcast a 20 Hz da sensación de movimiento continuo
  muy por debajo de ese umbral, sin escribir en la base de datos 20 veces por segundo por jugador.
- Separar "pista visual" de "hecho confirmado" es lo que hace que un mensaje de broadcast perdido,
  duplicado o falsificado sea inofensivo: el siguiente evento de Postgres Changes corrige la
  pantalla. Esto es lo que satisface **FR-025** (idempotencia) sin lógica de deduplicación.
- Todas las mutaciones autoritativas son **absolutas, no incrementales** (se escribe la posición
  final, nunca un delta). Aplicar dos veces el mismo movimiento produce el mismo estado.

---

## R5. Resolución de la carrera de captura

**Decisión**: Función de Postgres `capture_piece(p_piece_id, p_player_id)` con `UPDATE ...
WHERE (captured_by IS NULL OR captured_at < now() - interval '30 seconds') RETURNING`.

**Rationale**: Un único `UPDATE` condicional en Postgres es atómico por definición. El primer
`UPDATE` que llega toma la fila; el segundo encuentra `captured_by` ya puesto y su `WHERE` no
casa, devolviendo cero filas → captura denegada. Esto satisface **FR-013** ("gana quien llegó
primero al servidor") sin bloqueos explícitos, sin `SELECT FOR UPDATE` y sin nivel de aislamiento
serializable.

La captura de un **grupo** aplica el mismo `UPDATE` a todas las piezas del grupo en una sola
sentencia, y solo tiene éxito si ninguna pieza del grupo está capturada (**FR-020**). La
atomicidad de la sentencia garantiza que no puede quedarse a medias.

**Alternativas consideradas**: bloqueo optimista con columna `version` (más código, mismo
resultado); advisory locks (estado fuera de las tablas, se pierde al reconectar).

---

## R6. Representación de grupos de piezas conectadas

**Decisión**: Columna `group_id uuid` en `pieces`. Una pieza suelta tiene su propio `group_id`
(igual a su `id`). Fusionar dos grupos es
`UPDATE pieces SET group_id = $ganador WHERE group_id = $perdedor`.

**Rationale**: Es la representación más simple que cumple **FR-017** y **FR-018**. Mover un grupo
es un `UPDATE ... WHERE group_id = $x`; consultar un grupo es un índice sobre `group_id`.

`ponytail:` la fusión es O(n) sobre las piezas del grupo perdedor, y en el caso peor la última
fusión de un rompecabezas de 500 piezas toca ~500 filas. A ese tamaño es irrelevante. Si algún día
hay rompecabezas de miles de piezas, la ruta de mejora es union-find con compresión de caminos en
una tabla aparte; no antes.

---

## R7. Origen del rompecabezas mientras 002 y 003 no existen

**Decisión**: Crear en esta feature la tabla `puzzles` en su forma mínima
(`id`, `image_url`, `rows`, `cols`, `piece_count`) más un script de semilla con 2–3 rompecabezas
de prueba. Las especificaciones 002 y 003 **extenderán** esta tabla (recorte, visibilidad,
contador de partidas), no la reemplazarán.

**Rationale**: El spec 001 asume que el rompecabezas ya existe, pero 002 y 003 no están
implementadas. Sin una tabla `puzzles` y datos de prueba, esta feature no es ejecutable ni
demostrable de forma independiente. La forma mínima evita adelantar decisiones que pertenecen a
002.

---

## R8. Estrategia de pruebas y su tensión con la constitución

**Decisión**: Dos niveles separados.

1. **Unitarias puras con Vitest**, sin infraestructura, ejecutadas por `npm test`:
   - `lib/puzzle/matching.ts` — detección de emparejamiento entre piezas adyacentes.
   - `lib/puzzle/groups.ts` — unión y fusión de grupos.
   - `lib/rooms/alias.ts` — validación de longitud 2–20.
   - `lib/rooms/code.ts` — alfabeto, longitud y ausencia de caracteres ambiguos.
   - `lib/realtime/reconcile.ts` — reconciliación del estado del tablero al reconectar.
2. **Integración contra Supabase local** (`supabase start`), ejecutada por `npm run test:db`,
   fuera del ciclo por defecto:
   - Carrera de captura: dos llamadas concurrentes a `capture_piece` sobre la misma pieza; se
     verifica que exactamente una tiene éxito.
   - Expiración del arrendamiento: captura vencida tomada por otro jugador.

**Tensión declarada**: el Principio VI dice que las pruebas deben correr sin infraestructura
externa. La atomicidad de una función de Postgres no es verificable sin Postgres: no hay forma de
simularla en un test puro, y es precisamente la pieza que el Principio VI nombra como lógica
crítica. Separar los dos comandos mantiene el ciclo rápido de desarrollo libre de infraestructura
y deja la verificación real de la concurrencia donde puede ocurrir. Registrado en Complexity
Tracking del plan.

---

## R9. Despliegue y migraciones

**Decisión**: Railway despliega la aplicación Next.js con cada push a la rama principal. Las
migraciones de Supabase se versionan en `supabase/migrations/` y se aplican **manualmente** con
`supabase db push` antes de mergear un cambio de esquema.

**Rationale**: La constitución exige migraciones versionadas y aplicadas de forma explícita, y
prohíbe cambiar el esquema desde la consola de Supabase. Encadenar `supabase db push` al deploy de
Railway sería un paso automático que puede fallar a mitad y dejar el esquema y el código
desalineados sin nadie mirando. Con un solo mantenedor, aplicar la migración a mano y luego
mergear es más seguro y no cuesta nada.

**Consecuencia operativa a recordar**: un push a la rama principal despliega código, **no**
esquema. El orden correcto siempre es: migración primero, merge después.

---

## R10. Formato uniforme de errores

**Decisión**: Un helper único en `lib/api/errors.ts` que devuelve
`{ error: { code: string, message: string } }` con el código HTTP correspondiente. Los códigos son
constantes exportadas desde `types/api.ts`.

Códigos de esta feature: `ROOM_NOT_FOUND`, `ROOM_FULL`, `INVALID_ALIAS`, `PIECE_LOCKED`,
`PUZZLE_NOT_FOUND`, `UNAUTHENTICATED`, `INTERNAL_ERROR`.

**Rationale**: Principio V. Un solo lugar que construye errores es la única forma barata de que el
formato no se desvíe. El cliente conmuta sobre `code`, nunca sobre `message`.
