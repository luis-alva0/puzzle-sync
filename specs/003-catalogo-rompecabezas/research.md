# Phase 0 Research: Catálogo de Rompecabezas Pre-creados

**Feature**: 003-catalogo-rompecabezas | **Date**: 2026-08-09

Esta feature es la que **más reutiliza y menos construye** de las tres: no crea tablas, no crea
un flujo de subida y no toca el generador de piezas. Casi todo el trabajo de investigación
consiste en comprobar que lo que ya existe sirve, y en encontrar los sitios donde no sirve.

Se encontraron cuatro.

---

## R1. La sesión vive en `localStorage`, y un middleware no puede leerla

**El problema**: el input de planificación pide proteger `app/admin` con un middleware que
verifique la sesión de Supabase Auth. Pero `lib/supabase/client.ts`, tal como lo dejó 001, usa
`persistSession: true` sobre **`localStorage`**. Un middleware de Next se ejecuta en el servidor,
antes de que exista un `window`: no puede ver `localStorage` bajo ninguna circunstancia.

**Decisión**: adoptar **`@supabase/ssr`** y mover la sesión **de administrador** a cookies. Las
sesiones anónimas de los jugadores se quedan en `localStorage`, sin tocarlas.

**Justificación de la dependencia nueva** (Principio I):

- Es el paquete oficial de Supabase para sesiones basadas en cookies con Next App Router. Hace el
  trabajo delicado: escribir la cookie con los atributos correctos, refrescar el token dentro del
  middleware y propagarlo a la respuesta.
- Escribirlo a mano significa manejar refresco de tokens y `Set-Cookie` en el borde. Es el tipo
  de código que parece funcionar hasta que un token caduca a mitad de una navegación.
- No hay alternativa dentro de la plataforma: Next no gestiona sesiones.

**Por qué NO migrar también a los jugadores**: sus sesiones son anónimas, invisibles y viven en
el navegador; nada del lado del servidor necesita verlas, porque los route handlers reciben el
JWT en la cabecera `Authorization`. Migrarlas a cookies sería tocar 001 y 002 enteras para
resolver un problema que no tienen.

**Consecuencia**: el proyecto acaba con **dos formas de sesión conviviendo**. Es deliberado y
tiene una frontera limpia: cookies solo bajo `/admin` y su middleware; `localStorage` para todo lo
demás. Registrado en Complexity Tracking.

---

## R2. El indicador de administrador no puede venir del cliente

**Decisión**: el flag de administrador vive en **`app_metadata.is_admin`** del usuario, y el
endpoint de creación lo lee **de la sesión verificada**, nunca del cuerpo de la petición.

`app_metadata` solo se puede modificar con la llave de servicio: es exactamente la propiedad que
se necesita. `user_metadata`, en cambio, lo puede escribir el propio usuario desde el cliente, y
usarlo aquí sería regalar el rol de administrador a cualquiera.

**Corrección al input de planificación**: dice que el endpoint de creación *"acepta además un
indicador interno de creación administrativa"*. Si ese indicador fuese un campo del `FormData`,
cualquier jugador podría enviarlo y marcar su rompecabezas como curado. El endpoint **ignora
cualquier campo del cliente** y deriva la condición de administrador de `app_metadata` del token.

En la práctica el endpoint no necesita ningún campo nuevo:

```text
esAdmin(sesión)  ⇒  visibility = 'public',  source = 'curated'
en caso contrario ⇒  visibility = lo que pidió el jugador,  source = 'user_photo'
```

**Techo asumido**: el rol se otorga desde el panel de Supabase o con la API de administración. No
hay pantalla para nombrar administradores, y el spec lo declara fuera de alcance.

---

## R3. La paginación por cursor necesita un desempate, y los índices de 002 no lo tienen

**El problema**: 002 creó estos índices:

```sql
create index puzzles_public_recent_idx on puzzles (created_at desc) where visibility = 'public';
create index puzzles_public_played_idx on puzzles (play_count desc) where visibility = 'public';
```

Ninguno incluye un desempate. Con scroll infinito eso produce exactamente lo que el plan de
pruebas quiere evitar: dos rompecabezas con el mismo `play_count` —o el mismo `created_at`, que
con una siembra masiva es fácil— pueden salir en orden distinto entre dos consultas, y entonces
uno aparece **duplicado** en la segunda página mientras otro se **salta**.

**Decisión**: reemplazar ambos índices por versiones con desempate por `id`, y paginar por
**keyset**, no por `OFFSET`.

```sql
create index puzzles_public_recent_idx on puzzles (created_at desc, id desc) where visibility = 'public';
create index puzzles_public_played_idx on puzzles (play_count desc, id desc) where visibility = 'public';
```

La consulta de la página siguiente compara la tupla completa:

```sql
where visibility = 'public'
  and (created_at, id) < ($cursor_created_at, $cursor_id)
order by created_at desc, id desc
limit 20
```

**Por qué keyset y no `OFFSET`**: con `OFFSET`, insertar un rompecabezas mientras alguien navega
desplaza toda la lista y el jugador ve una fila repetida. Con keyset el cursor apunta a una fila
concreta, y lo que se inserte por encima simplemente no aparece hasta recargar. Además `OFFSET`
degrada al alejarse del principio, y keyset no.

---

## R4. Nadie incrementa `play_count`

**El problema**: 002 creó la columna con valor `0` y dejó escrito que el incremento era tarea de
003. Pero el incremento ocurre al **crear una sala**, que es código de 001: la función
`create_room` en `0004_room_functions.sql`, que hoy no la menciona.

**Decisión**: una migración de 003 redefine `create_room` para incrementar `play_count` del
rompecabezas dentro de la misma transacción que crea la sala.

Se cuenta al **crear la sala**, no al completar la partida (Assumption del spec): una partida
abandonada también señala interés, y esperar al final subestimaría los rompecabezas difíciles.

**Consecuencia**: 003 modifica una función de 001. Es el mismo patrón que ya ocurrió en 002, y
como allí, lo importante es que esté declarado y no descubierto a mitad de la implementación.

---

## R5. La retirada necesita una columna, aunque no una tabla

**El problema**: el input dice que el modelo de datos *"no requiere tablas nuevas"* y es cierto,
pero FR-026 a FR-032 del spec exigen que el administrador pueda **retirar** una entrada del
catálogo, y eso no se puede expresar con las columnas actuales:

- `visibility = 'private'` no vale: cambiaría la decisión que el jugador tomó al crear y que el
  spec declara inmutable (FR-029c de 002).
- Borrar la fila no vale: FR-030 exige que el enlace del creador siga funcionando.

**Decisión**: añadir `catalog_status text not null default 'visible'`, con
`check (catalog_status in ('visible', 'retired'))`.

```text
aparece en el catálogo  ⟺  visibility = 'public'  ∧  catalog_status = 'visible'
```

Retirar no toca `visibility`, no borra la fila y no invalida el enlace: exactamente lo que piden
FR-028, FR-030 y FR-031.

**Nota**: el data-model de 003 preveía una entidad `Entrada de catálogo` con tabla propia. Con
`visibility`, `play_count` y `source` ya en `puzzles` (research R7 de 002), esa entidad se reduce
a esta única columna más una vista filtrada. Es la simplificación que 002 anticipó.

---

## R6. Reutilización del flujo de subida en la pantalla de administración

**Decisión**: `app/admin` monta los **mismos componentes** que `app/puzzles/create`
—`ImageCropper` y `PieceCountSelector`— y llama al **mismo endpoint**. Lo único que cambia es que
no se muestra el interruptor de visibilidad.

**Por qué no se envía `isPublic: true` desde la pantalla de administración**: sería confiar en el
cliente para algo que el servidor puede determinar solo. El endpoint ya sabe si quien llama es
administrador (research R2) y fuerza `public` por su cuenta. Ocultar el interruptor es cosmética;
la garantía está en el servidor.

**Lo que NO se reutiliza**: nada del flujo de sala. La pantalla de administración crea
rompecabezas, no partidas.

---

## R7. Scroll infinito sin biblioteca

**Decisión**: `IntersectionObserver` sobre un elemento centinela al final de la lista.

Es API nativa del navegador, son unas quince líneas dentro de un `useEffect`, y no necesita
medir alturas ni escuchar `scroll`. Cualquier biblioteca de scroll infinito haría esto mismo
envuelto en más superficie.

**Alternativa considerada**: virtualización de la lista. Se descarta por ahora: el catálogo carga
de 20 en 20 y tendría que crecer a miles de tarjetas visibles a la vez para que el DOM importara.
Si llega ese día, la mejora es aditiva y no cambia el contrato de paginación.

---

## R8. Estrategia de pruebas

Bajo el Principio VI en su versión 1.2.0, se prueba donde la lógica vive.

1. **Unitarias, sin infraestructura** (`npm test`):
   - `lib/catalog/cursor.ts` — codificar y descodificar el cursor, y que un cursor corrupto se
     rechace en lugar de producir una consulta rara.
   - `lib/catalog/ordering.ts` — construcción de la comparación de tupla para cada ordenamiento.
2. **Integración contra Supabase local** (`npm run test:db`):
   - Paginación sobre un conjunto con **empates deliberados** en `play_count` y `created_at`:
     recorrer todas las páginas debe devolver cada rompecabezas exactamente una vez.
   - Un rompecabezas creado como administrador queda `public` + `curated`, sin excepción.
   - Un rompecabezas retirado desaparece del listado y su enlace sigue funcionando.
   - `create_room` incrementa `play_count`.
3. **Middleware** (`npm run test:db`, o manual): las redirecciones de `/admin` para no
   autenticado, autenticado sin flag, y administrador. Es lógica de servidor con sesión real, no
   simulable en un test unitario sin falsear justamente lo que se quiere verificar.

---

## R9. Variables de entorno

**Ninguna nueva.** Las tres de siempre. El administrador es una fila en `auth.users`, no un
secreto en el entorno.
