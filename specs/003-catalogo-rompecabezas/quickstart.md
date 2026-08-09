# Quickstart: Catálogo de Rompecabezas Pre-creados

**Feature**: 003-catalogo-rompecabezas

---

## Prerrequisitos

Los de 001 y 002, funcionando. Adicional:

```bash
npm install @supabase/ssr
supabase db push          # aplica 0009_catalog.sql
```

**Crear la cuenta de administrador** — no hay pantalla para esto, y es deliberado:

```bash
# Crear el usuario
supabase auth admin create-user --email admin@ejemplo.com --password '…'

# Darle el rol. Tiene que ser app_metadata: user_metadata lo puede escribir el propio
# usuario desde el cliente, y usarlo aquí sería regalar el rol de administrador.
curl -X PUT "$SUPABASE_URL/auth/v1/admin/users/$USER_ID" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"app_metadata": {"is_admin": true}}'
```

Ninguna variable de entorno nueva.

---

## Escenarios de validación

### 1. Explorar y elegir (US1)

Abrir `/catalog` con al menos un rompecabezas público.

**Esperado**: tarjetas con imagen, cantidad de piezas y veces jugado. Curados y publicados por
jugadores **mezclados y sin distintivo**. Tocar uno lleva al detalle, y de ahí a crear sala.

**Comprobación que importa**: abrir las herramientas de red y mirar la respuesta de
`GET /api/catalog`. **No debe contener `source` ni `visibility`.** Si vinieran, alguien podría
pintar la distinción que FR-003 prohíbe; no mandarlos es lo que lo hace imposible.

### 2. Scroll infinito sin duplicados ni saltos (US2) — el escenario crítico

Sembrar **50 rompecabezas públicos con el mismo `play_count`**, que es el caso realista: casi
todos valen `0`.

```sql
insert into puzzles (image_url, grid_rows, grid_cols, visibility, source, play_count)
select 'data:image/svg+xml;utf8,<svg/>', 4, 5, 'public', 'user_photo', 0
from generate_series(1, 50);
```

Ordenar por **más jugados** y bajar hasta el final recogiendo los identificadores.

**Esperado**: 50 identificadores distintos. Ni uno repetido, ni uno ausente.

Es la prueba que justifica los índices con desempate por `id`. Sin él, con 50 empates a `0`,
Postgres puede devolver las filas en orden distinto entre consultas y el scroll produce
duplicados y saltos.

Repetir ordenando por **más recientes**, con `created_at` idéntico en varias filas.

### 3. La ruta de administración está cerrada (US3)

| Prueba | Esperado |
|---|---|
| `/admin` sin sesión | Redirección a `/admin/login` |
| `/admin` con sesión de jugador anónimo | Redirección a `/` |
| `/admin` con administrador | Entra |
| Recorrer la aplicación sin sesión | Ningún enlace ni pista de que `/admin` existe |

**La prueba que de verdad importa**: poner el flag en el sitio equivocado desde el navegador.

```js
await supabase.auth.updateUser({ data: { is_admin: true } }); // escribe user_metadata
```

Luego ir a `/admin`. **Debe seguir redirigiendo.** Solo cuenta `app_metadata`, que el cliente no
puede tocar. Si esto deja pasar, el rol de administrador está a un `fetch` de distancia para
cualquiera.

Y contra el endpoint, saltándose el middleware:

```bash
curl -X POST "http://localhost:3000/api/puzzles/$ID/retire" -H "Authorization: Bearer $JWT_JUGADOR"
```

Debe responder `403 FORBIDDEN`. El middleware protege rutas; los handlers se protegen solos.

### 4. Lo creado desde administración es siempre público

Subir una foto desde `/admin`.

**Esperado**: no aparece ningún interruptor de visibilidad, y en la base de datos:

```sql
select visibility, source from puzzles order by created_at desc limit 1;
-- public | curated
```

Y la versión maliciosa: un **jugador normal** enviando el campo a mano.

```bash
curl -X POST http://localhost:3000/api/puzzles \
  -H "Authorization: Bearer $JWT_JUGADOR" \
  -F "image=@foto.jpg" -F "nominalPieceCount=100" -F "isAdminUpload=true"
```

**Esperado**: `source = 'user_photo'`. El campo se ignora: la condición de administrador sale del
token, no del cuerpo (research R2).

### 5. Retirada sin daños colaterales

Con un rompecabezas público, **crear una sala con él**, y luego retirarlo desde administración.

**Esperado**: desaparece del catálogo; su enlace `/puzzles/{id}` **sigue funcionando**; y la sala
en curso continúa sin enterarse (FR-030, FR-031). Las tres cosas a la vez, porque retirar no toca
`visibility`, no borra la fila y no borra el objeto de Storage.

### 6. El contador de partidas sube

Anotar `play_count`, crear una sala con ese rompecabezas, volver a mirar.

**Esperado**: `play_count + 1`, y ordenando por más jugados sube de posición. Se cuenta al crear
la sala, no al completar la partida.

---

## Pruebas

```bash
npm test          # unitarias: cursor, ordenamiento
npm run test:db   # integración: paginación con empates, admin fuerza público, retirada, contador
```

---

## Fallos habituales

| Síntoma | Causa probable |
|---|---|
| El scroll repite o se salta rompecabezas | Falta el desempate por `id`, en el índice o en la consulta |
| `/admin` deja pasar a cualquiera | Se está leyendo `user_metadata` en vez de `app_metadata` |
| El middleware pide login en cada navegación | No se está propagando la cookie refrescada a la respuesta |
| El middleware no se ejecuta | El `matcher` no cubre la ruta, o el archivo no está en la raíz |
| Las miniaturas salen rotas | No se están firmando las URL: el bucket no tiene política de lectura |
| Un rompecabezas retirado sigue en el listado | Falta `catalog_status` en la consulta o en la política RLS |
| `play_count` siempre a 0 | `create_room` no se redefinió (migración de 003) |
| Cambiar de ordenamiento rompe la lista | El cursor lleva el `sort` dentro: al cambiarlo hay que empezar de cero |
