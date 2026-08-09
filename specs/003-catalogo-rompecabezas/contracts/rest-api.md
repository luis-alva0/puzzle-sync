# Contract: REST API

**Feature**: 003-catalogo-rompecabezas

Un endpoint nuevo, uno modificado y uno reutilizado sin tocar. Mismo formato uniforme de error de
001 (`lib/api/errors.ts`).

| Endpoint | Estado |
|---|---|
| `GET /api/catalog` | **Nuevo** — listado paginado |
| `POST /api/puzzles/[id]/retire` | **Nuevo** — retirada por el administrador |
| `POST /api/puzzles` | **Modificado** — fuerza público y curado si quien llama es administrador |
| `GET /api/puzzles/[id]` | Sin cambios. Sirve también los retirados, por su enlace |

Códigos de error nuevos:

| `code` | HTTP | Cuándo |
|---|---|---|
| `FORBIDDEN` | 403 | Autenticado pero sin `app_metadata.is_admin` |
| `INVALID_CURSOR` | 400 | El cursor no se puede descodificar o no corresponde al orden pedido |

---

## `GET /api/catalog`

**Query**

| Parámetro | Valores | Notas |
|---|---|---|
| `sort` | `recent` (defecto) \| `played` | FR-008, FR-009 |
| `cursor` | opaco | Ausente en la primera página |

**Response `200`**

```json
{
  "items": [
    {
      "puzzleId": "0f9c…",
      "imageUrl": "https://…?token=…",
      "pieceCount": 100,
      "gridRows": 10,
      "gridCols": 10,
      "playCount": 37,
      "createdAt": "2026-08-09T14:32:10.000-05:00"
    }
  ],
  "nextCursor": "eyJrIjoicmVjZW50Iiw…",
  "hasMore": true
}
```

**No se devuelve `source` ni `visibility`.** FR-003 exige que curados y publicados por jugadores
aparezcan mezclados **sin distinción visual de origen**, y la forma robusta de garantizarlo es no
mandar el dato: una interfaz no puede pintar lo que no recibe.

**Quién consulta**: `service_role`, desde el route handler. No es una elección de comodidad —
`signPuzzleImageUrl` ya exige servidor porque el bucket no tiene política de lectura— pero sí
tiene una consecuencia que hay que tener presente:

> **La RLS no se aplica.** El filtro de visibilidad va **en la consulta**, escrito a mano, y es
> obligatorio. Olvidarlo hace que el catálogo liste rompecabezas privados y retirados, que es
> exactamente lo que la política existe para impedir. La política sigue estando —protege al
> cliente anónimo— pero aquí no interviene.

**Comportamiento**

1. `sort` fuera del conjunto → se trata como `recent`, sin error: es un parámetro de presentación.
2. Sin `cursor`, primera página. Con `cursor`, se descodifica → `INVALID_CURSOR` si falla.
3. El `sort` codificado dentro del cursor debe coincidir con el `sort` de la query. Si el jugador
   cambia de ordenamiento a media lista, el cursor viejo no sirve → `INVALID_CURSOR`, y el cliente
   empieza de nuevo.
4. Consulta **keyset**, nunca `OFFSET`:

```sql
-- sort=recent
where visibility = 'public'
  and catalog_status = 'visible'
  and source <> 'seed'
  and (created_at, id) < ($cursorCreatedAt, $cursorId)
order by created_at desc, id desc
limit 21
```

**`source <> 'seed'`**: las tres filas de la semilla son `public` desde la migración de 002, pero
no son contenido — son andamiaje de desarrollo con `data:` URI. FR-002 define el catálogo como
curados más publicados por jugadores, y la semilla no es ninguna de las dos cosas. Se excluye en
la consulta y en el predicado de los índices, para que sigan cubriéndola exactamente.

5. Se piden **21** para saber si hay más sin una consulta de conteo aparte. Se devuelven 20 y el
   21.º solo sirve para poner `hasMore`.
6. `nextCursor` sale de la **última fila devuelta**. Es `null` cuando `hasMore` es `false`.
7. Cada `imageUrl` se firma con `signPuzzleImageUrl` (research R5 de 002): el bucket no tiene
   política de lectura, así que sin firmar ninguna miniatura sería alcanzable.

**El cursor es opaco pero no secreto**: es un base64 de `{ sort, createdAt | playCount, id }`. No
lleva nada sensible y no autoriza nada; se codifica para que el cliente no dependa de su forma.

**Catálogo vacío**: `items: []`, `hasMore: false`. El mensaje explicativo lo pone la interfaz
(FR-006).

---

## `POST /api/puzzles/[id]/retire`

Retirada reactiva (FR-028). Solo administradores.

**Response `200`**: `{ "puzzleId": "…", "catalogStatus": "retired" }`

**Comportamiento**

1. Sin sesión → `UNAUTHENTICATED`. Con sesión pero sin `app_metadata.is_admin` → `FORBIDDEN`.
2. `update puzzles set catalog_status = 'retired' where id = $id`.
3. **No** toca `visibility`, **no** borra la fila y **no** borra el objeto de Storage: el enlace
   del creador sigue funcionando (FR-030) y las salas en curso no se enteran (FR-031).
4. Idempotente: retirar algo ya retirado devuelve `200`.

---

## `POST /api/puzzles` — modificación

El endpoint de 002, con un solo cambio: **si quien llama es administrador, la visibilidad se
fuerza a `public` y el origen a `curated`**.

```text
esAdmin(sesión)  ⇒  visibility = 'public',  source = 'curated'   (se ignora `isPublic`)
si no            ⇒  visibility = isPublic ? 'public' : 'private', source = 'user_photo'
```

> **Corrección al input de planificación.** El input describe *"un indicador interno de creación
> administrativa"* que el endpoint aceptaría. **No existe tal campo.** Si fuese un campo del
> `FormData`, cualquier jugador podría enviarlo y marcar su rompecabezas como curado. La condición
> de administrador se deriva de `app_metadata` del token verificado y de ninguna otra cosa
> (research R2).
>
> La pantalla de administración no envía nada especial: oculta el interruptor de visibilidad
> porque no tiene sentido mostrarlo, pero la garantía está en el servidor, no en que la interfaz
> no pregunte.

**Las validaciones no cambian**: tipo por números mágicos, 10 MB y las cinco cantidades se
aplican igual a un jugador que a un administrador (FR-024 del spec). Un administrador no es un
usuario de confianza para el validador de archivos.

---

## `GET /api/puzzles/[id]` — añade `catalogStatus`

Sigue sirviendo cualquier rompecabezas por su UUID, **incluidos los retirados y los privados**,
porque usa `service_role` y no pasa por la política RLS. Es lo que hace que retirar del catálogo
no rompa el enlace del creador.

**Cambio de 003**: la respuesta incluye `"catalogStatus": "visible" | "retired"`.

Sin ese campo, un jugador que tuviera abierta la pantalla de un rompecabezas retirado no tendría
forma de enterarse (FR-036). El acceso **no** se bloquea —el enlace sigue siendo válido— pero la
pantalla puede avisar de que ya no está en el catálogo.
