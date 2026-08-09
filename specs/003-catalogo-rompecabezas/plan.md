# Implementation Plan: Catálogo de Rompecabezas Pre-creados

**Branch**: `003-catalogo-rompecabezas` | **Date**: 2026-08-09 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/003-catalogo-rompecabezas/spec.md`

## Summary

Un catálogo público donde curados y publicados por jugadores aparecen mezclados, con dos
ordenamientos y scroll infinito, más una pantalla de administración protegida para cargar
contenido curado.

Es la feature que **más reutiliza y menos construye**: no crea tablas, no crea un flujo de subida
y no toca el generador de piezas. Casi todo el diseño consistió en comprobar que lo hecho en 001 y
002 sirve, y en encontrar los cuatro sitios donde no sirve:

1. **La sesión vive en `localStorage`, y un middleware no puede leerla.** La sesión de
   administrador pasa a cookie con `@supabase/ssr`; las de jugador se quedan como están.
2. **Los índices de 002 no tienen desempate.** Sin él, el scroll infinito produce duplicados y
   saltos — exactamente lo que el plan de pruebas quiere evitar. Se reemplazan con `id` como
   segunda clave y se pagina por keyset.
3. **Nadie incrementa `play_count`.** El incremento ocurre al crear una sala, que es código de
   001: hay que redefinir `create_room`.
4. **La retirada necesita una columna.** No una tabla, pero `visibility` no sirve para esto sin
   romper una garantía de 002.

Detalle y alternativas descartadas en [research.md](./research.md).

## Technical Context

**Language/Version**: TypeScript 5.x estricto, Node.js 20+

**Primary Dependencies**: Next.js 16, React 19, `@supabase/supabase-js`, `react-easy-crop`,
Vitest 4, y **`@supabase/ssr`** como única incorporación — justificada en research R1

**Storage**: Supabase Postgres. Ninguna tabla nueva; una columna, dos índices reemplazados y una
función redefinida

**Testing**: Vitest. Unitarias sin infraestructura para el cursor y el ordenamiento; integración
contra Supabase local para la paginación con empates, el forzado de visibilidad y el middleware

**Target Platform**: Navegador de escritorio; catálogo utilizable en móvil

**Project Type**: Aplicación web de un solo repositorio, sin servidor propio

**Performance Goals**: primera pantalla del catálogo < 2 s (SC-002), y que se mantenga con 500
rompecabezas (SC-003); de abrir el catálogo a rompecabezas listo para sala < 30 s (SC-001)

**Constraints**: las mismas tres variables de entorno, **ninguna nueva**. Ningún secreto en el
código. El rol de administrador solo se otorga desde el servidor

**Scale/Scope**: 2 pantallas nuevas, 2 endpoints nuevos, 2 modificados, 1 middleware, 1 migración

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principio | Veredicto | Justificación |
|---|---|---|
| **I. Simplicidad Operativa** | ✅ PASS con dependencia justificada | Cero infraestructura nueva. Ninguna tabla: la "entrada de catálogo" del spec se reduce a una columna y una vista filtrada, gracias a que 002 puso `visibility`, `play_count` y `source` en `puzzles`. Se añade `@supabase/ssr`, justificada por escrito en research R1. Scroll infinito con `IntersectionObserver` nativo, sin biblioteca. |
| **II. Secretos Fuera del Código** | ✅ PASS | Ninguna variable nueva. El rol de administrador vive en `app_metadata`, que solo se modifica con la llave de servicio; `user_metadata` se descarta explícitamente porque lo escribe el cliente. RLS restringida para excluir los retirados. |
| **III. Acceso sin Cuentas** | ✅ PASS | Explorar y seleccionar del catálogo no requiere cuenta. El login existe **solo** para administración, que no es funcionalidad de juego, y el `matcher` del middleware lo confina a `/admin`. |
| **IV. Resiliencia de Sesión** | ✅ PASS (aplicación limitada) | No hay estado en tiempo real aquí. Lo que aplica: el cursor es opaco y verificable, y un cursor corrupto produce un error claro en lugar de una consulta silenciosamente incorrecta. |
| **V. Contrato Uniforme de Errores** | ✅ PASS | Reutiliza `lib/api/errors.ts`. Añade `FORBIDDEN` e `INVALID_CURSOR` sin alterar el significado de ninguno existente. |
| **VI. Testing Proporcional al Riesgo** | ✅ PASS | Se prueba donde la lógica vive: cursor y ordenamiento son TypeScript puro y van a unitarias; la paginación con empates y el middleware necesitan Postgres y sesión real, y van a integración. Ninguna implementación sombra. |
| **Git Workflow** | ✅ PASS | Un commit por tarea, Conventional Commits con el ID como scope. |
| **Restricciones Técnicas y de Datos** | ✅ PASS | Sin purga: retirar no borra nada. `created_at` presentado con el helper de 001. Repositorio único. |
| **Flujo de Desarrollo y Despliegue** | ✅ PASS | Migración versionada, aplicada explícitamente antes del merge. |

**Re-evaluación tras el diseño de Fase 1**: sin cambios. La dependencia nueva resuelve una
imposibilidad técnica —un middleware no puede leer `localStorage`—, no una preferencia.

## Project Structure

### Documentation (this feature)

```text
specs/003-catalogo-rompecabezas/
├── plan.md                      # Este archivo
├── spec.md                      # Especificación
├── research.md                  # Fase 0: 9 decisiones técnicas
├── data-model.md                # Fase 1: una columna, dos índices, una función
├── quickstart.md                # Fase 1: puesta en marcha y validación
├── contracts/                   # Fase 1
│   ├── rest-api.md              #   GET /api/catalog, retirada, y el cambio en POST /api/puzzles
│   └── admin-auth.md            #   Middleware, app_metadata y sesión en cookie
├── checklists/
│   └── requirements.md
└── tasks.md                     # Fase 2 (/speckit.tasks — no lo crea este comando)
```

### Source Code (repository root)

Solo lo que esta feature crea o toca.

```text
middleware.ts                         # NUEVO  Protege /admin. Raíz del repo, obligatorio

app/
├── catalog/
│   └── page.tsx                      # NUEVO  Listado con scroll infinito y dos ordenamientos
├── admin/
│   ├── page.tsx                      # NUEVO  Carga de contenido curado
│   └── login/page.tsx                # NUEVO  Único login del producto
├── api/
│   ├── catalog/route.ts              # NUEVO  GET listado paginado por keyset
│   └── puzzles/
│       ├── route.ts                  # TOCADO Fuerza público y curado si es administrador
│       └── [id]/retire/route.ts      # NUEVO  POST retirada
└── page.tsx                          # TOCADO Enlace al catálogo

components/
├── CatalogGrid.tsx                   # NUEVO  Tarjetas + centinela de IntersectionObserver
├── CatalogCard.tsx                   # NUEVO  Imagen, piezas y veces jugado
├── SortSelector.tsx                  # NUEVO  Recientes / más jugados
├── ImageCropper.tsx                  # REUSA  Sin cambios
└── PieceCountSelector.tsx            # REUSA  Sin cambios

lib/
├── catalog/
│   ├── cursor.ts                     # NUEVO  Codificar y descodificar el cursor     ← test
│   └── ordering.ts                   # NUEVO  Comparación de tupla por ordenamiento  ← test
├── supabase/
│   └── admin-session.ts              # NUEVO  Cliente con cookies, sobre @supabase/ssr
└── api/errors.ts                     # TOCADO 2 códigos nuevos

types/
├── api.ts                            # TOCADO Contratos del catálogo
└── catalog.ts                        # NUEVO  CatalogItem, SortOrder, Cursor

supabase/
└── migrations/
    └── 0009_catalog.sql              # NUEVO  catalog_status, índices, create_room, RLS
```

**Structure Decision**: se respeta la estructura del input —catálogo en `app/catalog`,
administración en `app/admin`— y se reutilizan sin modificar `ImageCropper` y
`PieceCountSelector`, que es lo que hace que la pantalla de administración sea pequeña.

`lib/catalog/` separa cursor y ordenamiento del route handler por el mismo motivo que 002 separó
la validación de archivo: es lógica crítica, y solo es unitariamente testeable si vive fuera del
handler.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| Segunda forma de sesión: cookies para administración, `localStorage` para jugadores | Un middleware corre en el servidor y **no puede leer `localStorage`**. Sin cookies no hay forma de proteger `/admin` antes de renderizar | Migrar también a los jugadores obligaría a tocar 001 y 002 enteras para resolver un problema que no tienen: sus sesiones son anónimas y nada del servidor necesita verlas, porque los route handlers reciben el JWT en la cabecera. La frontera queda limpia y declarada: cookies solo bajo `/admin` |
| `@supabase/ssr`, segunda dependencia de terceros del proyecto | Sesión en cookie con Next App Router: escribir la cookie con los atributos correctos, refrescar el token dentro del middleware y propagarlo a la respuesta | Escribirlo a mano es manejo de refresco y `Set-Cookie` en el borde — el tipo de código que parece funcionar hasta que un token caduca a mitad de una navegación. La plataforma no gestiona sesiones |
| 003 redefine `create_room`, que es de 001 | El contador de partidas se incrementa al crear una sala, y esa función es donde ocurre | Un disparador sobre `rooms` dejaría un instante en el que la sala existe y el contador no lo refleja, y añade un mecanismo más que recordar al depurar. Redefinir la función lo mantiene en la misma transacción |
| Comprobación de administrador duplicada: en el middleware y en cada handler | El middleware protege **rutas**, y su `matcher` es una lista que se puede quedar corta al añadir un endpoint | Confiar solo en el middleware significa que olvidar una ruta en el `matcher` deja un endpoint de administración abierto, sin ningún síntoma |

## Pendientes conocidos

- **Esta feature toca 001 y 002 en cuatro puntos**: `create_room` (contador), los dos índices de
  002 (desempate), la política RLS de `puzzles` (excluir retirados) y `POST /api/puzzles` (forzar
  público para administradores). Ninguno es opcional.
- **El input pedía un "indicador interno de creación administrativa" como campo del endpoint.** No
  se implementa así: sería un campo que cualquier jugador podría enviar para marcar su
  rompecabezas como curado. La condición de administrador se deriva del token (research R2). Es la
  desviación más importante respecto del input y conviene confirmarla.
- **El listado consulta con `service_role`, no con la llave anónima**, porque firmar las
  miniaturas ya exige servidor. Consecuencia: la política RLS **no** protege ese camino, y el
  filtro `visibility = 'public' and catalog_status = 'visible' and source <> 'seed'` va escrito en
  la consulta. Olvidarlo listaría privados y retirados.
- **Las tres filas de la semilla se excluyen del catálogo** por `source <> 'seed'`. Son `public`
  desde la migración de 002, pero son andamiaje con `data:` URI, no contenido.
- **La moderación sigue siendo reactiva y sin canal de reporte**, tal como quedó en la
  clarificación del spec. Esta feature construye la retirada; detectar qué retirar sigue
  dependiendo de que el administrador mire el catálogo por su cuenta.
- **Sin Docker no se puede validar nada de esto de extremo a extremo**, igual que en 001 y 002:
  la paginación con empates, el middleware y el forzado de visibilidad necesitan Postgres y
  sesiones reales.
