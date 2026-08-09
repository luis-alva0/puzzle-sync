# PuzzleSync

Aplicación web para armar rompecabezas de forma colaborativa y en tiempo real, principalmente
en grupos de 2 personas. Sin cuentas: se crea o se entra a una sala y se juega.

- **Constitución del proyecto**: [.specify/memory/constitution.md](.specify/memory/constitution.md)
- **Feature en curso**: [001 — Armado colaborativo en tiempo real](specs/001-sala-armado-colaborativo/spec.md)

## Stack

| Capa | Tecnología |
|---|---|
| Frontend | Next.js 16 (App Router), React 19, TypeScript estricto |
| Tablero | Canvas 2D |
| Backend | Supabase gestionado: Postgres, Realtime, Auth, Storage |
| Pruebas | Vitest |
| Despliegue | Railway (push a `main`) |

No hay servidor propio ni monorepo: Supabase actúa como backend gestionado.

## Puesta en marcha

Requiere Node.js 20+, la [CLI de Supabase](https://supabase.com/docs/guides/cli) y Docker en
ejecución.

```bash
npm install
cp .env.example .env.local     # rellenar con los valores del proyecto Supabase
supabase start                 # Postgres + Realtime locales
supabase db push               # aplica supabase/migrations/
npm run seed                   # rompecabezas de prueba
npm run dev
```

En el proyecto de Supabase hay que habilitar **Anonymous Sign-In** en Authentication →
Providers. Sin eso, todos los endpoints responden `UNAUTHENTICATED`: la identidad del jugador se
apoya en sesiones anónimas.

## Variables de entorno

| Variable | Ámbito | Uso |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Cliente y servidor | URL del proyecto |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Cliente y servidor | Sesión anónima y Realtime |
| `SUPABASE_SERVICE_ROLE_KEY` | **Solo servidor** | Route handlers |

El repositorio es público. Ninguna credencial se escribe en el código: se leen exclusivamente de
variables de entorno, y `.env*` está en `.gitignore` salvo `.env.example`.

`SUPABASE_SERVICE_ROLE_KEY` no lleva prefijo `NEXT_PUBLIC_` y solo se importa desde
`lib/supabase/server.ts`, que declara `import 'server-only'`. Si aparece en el bundle del
cliente, es un incidente: **rotar la llave** antes de cualquier otra cosa.

## Comandos

```bash
npm run dev            # servidor de desarrollo
npm run build          # build de producción
npm run lint           # ESLint
npm run typecheck      # tsc --noEmit
npm test               # unitarias, sin infraestructura
npm run test:db        # integración, requiere `supabase start` y una base recién reseteada
npm run check:secrets  # verifica que no haya credenciales en el bundle (tras build)
```

Antes de mergear a `main`:

```bash
npm run lint && npm run typecheck && npm test && npm run build && npm run check:secrets
```

`npm test` cubre la lógica crítica que exige el Principio VI: emparejamiento de piezas, fusión de
grupos, validación de alias, generación de códigos y reconciliación de estado. `npm run test:db`
cubre lo que no se puede simular sin Postgres: la atomicidad de la captura bajo concurrencia.

`npm run test:db` espera un catálogo limpio. Las pruebas de paginación siembran 50 rompecabezas y
recorren como mucho 20 páginas; con cientos acumulados de corridas anteriores nunca llegan a sus
propias filas y fallan sin que nada esté roto. Ante un fallo raro ahí, `supabase db reset` primero.

## Despliegue

Railway despliega automáticamente con cada push a `main`.

**Las migraciones no se aplican solas.** El orden correcto siempre es:

```bash
supabase db push        # 1. esquema en producción
git push origin main    # 2. código
```

Invertirlo deja código nuevo hablando con un esquema viejo.

Las tres variables de entorno se declaran en el proyecto de Railway (Settings → Variables).
Railway detecta Next.js automáticamente; no hace falta Dockerfile ni configuración de build.

## Trampas conocidas

Cosas que ya rompieron algo una vez en este proyecto. Se anotan aquí porque el coste de leerlas
es menor que el de volver a tropezar, y porque una lección aprendida en una feature no llega sola
a la siguiente.

| Trampa | Síntoma | Qué hacer |
|---|---|---|
| `useSearchParams` sin `<Suspense>` | `npm run build` falla en el prerender con *"should be wrapped in a suspense boundary"* | Envolver el contenido que lo usa, como hace `app/page.tsx` |
| Lanzar en la evaluación de un módulo de cliente | El build falla al prerenderizar, no al ejecutar | Diferir la comprobación al primer uso, como hace `lib/supabase/client.ts` |
| Consultar con `service_role` y confiar en RLS | Se filtran filas que la política habría bloqueado | Con `service_role` la política **no se aplica**: el filtro va en la consulta |
| Devolver una URL de Storage sin firmar | La imagen no carga y el tablero sale en blanco | El bucket no tiene política de lectura: todo pasa por `signPuzzleImageUrl` |
| Guardar el rol en `user_metadata` | Cualquiera se hace administrador desde la consola del navegador | El rol vive en `app_metadata`, que solo escribe la llave de servicio |
| Mutar una ref durante el render | ESLint lo rechaza con `react-hooks/refs` | Copiar a la ref dentro de un efecto |
| Reimplementar en TypeScript lógica que vive en SQL | Las pruebas pasan sobre una copia que nadie ejecuta | Prohibido por el Principio VI: se prueba donde la lógica vive |
| Copiar `piece_count` a `nominal_piece_count` | La migración aborta contra su propio `CHECK` | La semilla tiene un rompecabezas de 4 piezas, que no es una de las cinco opciones |
| Dar por hechos los privilegios por defecto de Supabase | `permission denied for table X` en todo, con RLS aparentemente bien | No es RLS, es el `grant` anterior a ella. Los privilegios por defecto de esta imagen **no** incluyen DML: ver `0010_grants.sql` |
| `revoke ... from public` sin el `grant` que le sigue | La función queda ejecutable solo por `postgres` | Toda revocación necesita su concesión explícita al rol que la llama |
| `lateral (select gen_random_uuid())` sin referenciar la fila | La subconsulta no está correlacionada: Postgres la evalúa **una vez** y todas las filas salen con el mismo UUID | CTE `as materialized`, como en `0011_fix_create_room_piece_ids.sql` |
| Una columna de `returns table` con el mismo nombre que una columna de la tabla | `42702 column reference "x" is ambiguous` | Cualificar la columna (`rp.room_id`), no usar `#variable_conflict` |
| `[auth.email] enable_signup = false` | `422 Email logins are disabled`: nadie puede iniciar sesión con contraseña, tampoco el administrador | No cierra el registro, apaga el proveedor entero |

## Flujo de trabajo

Un commit por tarea de `tasks.md`, con Conventional Commits y el ID de la tarea como scope:

```text
feat(T027): implementar endpoint de creacion de sala
```

La rama `main` debe estar siempre desplegable.
