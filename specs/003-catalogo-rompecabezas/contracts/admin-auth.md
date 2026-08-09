# Contract: Autenticación de administrador

**Feature**: 003-catalogo-rompecabezas | `middleware.ts`, `app/admin/`

Es la **única** identidad con inicio de sesión real del producto. Los jugadores siguen sin cuenta
(Principio III): la administración no es funcionalidad de juego.

---

## Dónde vive el rol

En **`app_metadata.is_admin`** del usuario de Supabase Auth.

```json
{ "app_metadata": { "is_admin": true } }
```

**Por qué `app_metadata` y no `user_metadata`**: `user_metadata` lo puede escribir el propio
usuario desde el cliente con una llamada del SDK. Guardar ahí el rol sería regalarlo. `app_metadata`
solo se modifica con la llave de servicio, y por eso sirve.

**Cómo se otorga**: desde el panel de Supabase o con la API de administración. No hay pantalla
para nombrar administradores, y el spec lo declara fuera de alcance.

---

## Sesión en cookie, no en `localStorage`

El middleware corre en el servidor y **no puede ver `localStorage`** (research R1). La sesión de
administrador usa `@supabase/ssr` y vive en cookies.

**Convivencia deliberada**:

| Quién | Dónde vive la sesión | Quién la lee |
|---|---|---|
| Jugador (anónima) | `localStorage` | El navegador, y los route handlers vía cabecera `Authorization` |
| Administrador | Cookie | El middleware y los route handlers de administración |

La frontera es la ruta: cookies bajo `/admin` y sus endpoints; `localStorage` para todo lo demás.
No se migran las sesiones de jugador, que funcionan y nada del servidor necesita ver.

---

## `middleware.ts`

```ts
export const config = { matcher: ['/admin/:path*'] };
```

Solo intercepta `/admin`. El resto de la aplicación no paga nada por esto.

**Comportamiento**

1. Refresca la sesión desde la cookie con `@supabase/ssr`. Es obligatorio hacerlo aquí: si el
   token caducó, hay que renovarlo y **propagar la cookie a la respuesta**, o la siguiente
   navegación volvería a fallar.
2. Sin sesión → redirección a `/admin/login`.
3. Con sesión pero `app_metadata.is_admin !== true` → redirección a `/`.
4. Administrador → continúa.

**Se redirige, no se responde 403**: es una navegación de página, no una llamada de API, y una
página en blanco con un código de error no le dice nada a nadie. Los **endpoints** sí devuelven
`FORBIDDEN`, que es lo que un cliente puede interpretar.

**No se filtra la existencia de `/admin`** (FR-022): un visitante sin sesión acaba en el login,
igual que si la ruta no existiera para él, y ninguna pantalla del producto enlaza a `/admin`.

---

## El middleware no es la única defensa

Un middleware protege **rutas**, no datos. Los route handlers de administración
—`POST /api/puzzles/[id]/retire`, y la rama de administrador de `POST /api/puzzles`— **vuelven a
comprobar** `app_metadata.is_admin` por su cuenta.

No es redundancia por gusto: el `matcher` es una lista, y una lista se puede quedar corta al
añadir una ruta. Si eso pasa, la comprobación del handler es lo que evita que un endpoint de
administración quede abierto.

---

## `app/admin/login`

Formulario de email y contraseña contra Supabase Auth. Es la única pantalla de login del producto.

**Usa el cliente de navegador con cookies** (`createBrowserClient` de `@supabase/ssr`), **no**
`getSupabaseBrowserClient()` de 001. Si usara ese, la sesión acabaría en `localStorage`: el login
parecería correcto, no daría ningún error, y `/admin` seguiría redirigiendo porque el middleware
no vería nada. Es el fallo más difícil de diagnosticar de esta feature, precisamente porque nada
falla de forma visible.

`[auth.email] enable_signup = false` en `supabase/config.toml` sigue en `false`: se puede iniciar
sesión, no registrarse. Las cuentas se crean fuera de la aplicación.

**Qué NO hace**: no ofrece registro, ni recuperación de contraseña, ni enlace mágico. Para un
conjunto pequeño y fijo de cuentas gestionadas a mano, cada una de esas pantallas sería superficie
sin uso.

---

## Verificación

| Caso | Esperado |
|---|---|
| Sin sesión → `/admin` | Redirección a `/admin/login` |
| Sesión sin `is_admin` → `/admin` | Redirección a `/` |
| Administrador → `/admin` | Entra |
| Sesión caducada con refresh válido | Se renueva sola y entra, sin volver al login |
| Sin sesión → `POST /api/puzzles/[id]/retire` | `401 UNAUTHENTICATED` |
| Sesión sin `is_admin` → mismo endpoint | `403 FORBIDDEN` |
| `user_metadata.is_admin = true` puesto desde el cliente | **Ignorado**: solo cuenta `app_metadata` |

La última fila es la que conviene probar de verdad: es el ataque obvio, y su rechazo es lo que
hace que el resto del contrato valga algo.
