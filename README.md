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
npm run dev        # servidor de desarrollo
npm run build      # build de producción
npm run lint       # ESLint
npm run typecheck  # tsc --noEmit
npm test           # unitarias, sin infraestructura
npm run test:db    # integración, requiere supabase start
```

`npm test` cubre la lógica crítica que exige el Principio VI: emparejamiento de piezas, fusión de
grupos, validación de alias, generación de códigos y reconciliación de estado. `npm run test:db`
cubre lo que no se puede simular sin Postgres: la atomicidad de la captura bajo concurrencia.

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

## Flujo de trabajo

Un commit por tarea de `tasks.md`, con Conventional Commits y el ID de la tarea como scope:

```text
feat(T027): implementar endpoint de creacion de sala
```

La rama `main` debe estar siempre desplegable.
