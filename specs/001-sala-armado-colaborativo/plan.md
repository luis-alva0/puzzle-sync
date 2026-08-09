# Implementation Plan: Armado Colaborativo en Tiempo Real dentro de una Sala

**Branch**: `001-sala-armado-colaborativo` | **Date**: 2026-08-09 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-sala-armado-colaborativo/spec.md`

## Summary

Sala de armado colaborativo para hasta 4 jugadores simultáneos, sin cuentas, con captura
exclusiva de piezas, encaje automático en grupos, reconexión sin pérdida de progreso y registro
de la partida al completarse.

El enfoque técnico se apoya en tres decisiones que sostienen el resto del diseño:

1. **Sesión anónima de Supabase Auth** como identidad del jugador. Invisible para el usuario, pero
   da un `auth.uid()` real, que es lo único que permite escribir políticas RLS con sentido y
   cerrar el canal de Realtime a los miembros de la sala.
2. **Bloqueos con arrendamiento de 30 segundos y expiración perezosa.** Elimina por completo la
   necesidad de un proceso en segundo plano que detecte desconexiones y libere piezas huérfanas.
3. **Separación entre pista visual y hecho confirmado.** El arrastre viaja por Broadcast sin
   autoridad; toda mutación real pasa por funciones atómicas de Postgres y se confirma por
   Postgres Changes. Un mensaje perdido o duplicado no puede corromper el tablero.

Detalle y alternativas descartadas en [research.md](./research.md).

## Technical Context

**Language/Version**: TypeScript 5.x en modo estricto, Node.js 20+

**Primary Dependencies**: Next.js 16 (App Router), React 19, `@supabase/supabase-js`, Vitest 4

> Nota de implementación: el plan original fijaba Next.js 15 y Vitest 2. Al instalar, ambas
> versiones arrastraban vulnerabilidades conocidas — Vitest 2 vía `esbuild`, y Next 15 vía
> `postcss` y `sharp` (CVEs de libvips, relevantes porque el producto procesará fotos subidas
> por usuarios). Con cero código escrito el coste de migración era nulo, así que se adoptaron
> Next 16 y Vitest 4. `npm audit` reporta 0 vulnerabilidades.

**Storage**: Supabase Postgres. Imágenes de rompecabezas en Supabase Storage.

**Testing**: Vitest para lógica pura (`npm test`, sin infraestructura). Pruebas de integración
contra Supabase local para todo lo que vive en Postgres —concurrencia de la captura y algoritmo
de emparejamiento— con `npm run test:db`.

**Target Platform**: Navegador de escritorio con puntero. Aplicación desplegada en Railway.

**Project Type**: Aplicación web de un solo repositorio, sin servidor propio (Supabase como
backend gestionado).

**Performance Goals**: 60 fps en el arrastre local; broadcast de posición a 20 Hz; latencia
percibida entre jugadores < 1 s (SC-001); tablero al día en < 5 s tras reconectar (SC-004);
primera pantalla del tablero en < 2 s.

**Constraints**: Sin procesos en segundo plano ni infraestructura fuera de Supabase y Railway.
Ningún secreto en el código. `SUPABASE_SERVICE_ROLE_KEY` exclusivamente en el servidor. Todos los
timestamps presentados en `America/Lima` (UTC-5) sin lógica de horario de verano.

**Scale/Scope**: 4 jugadores concurrentes por sala; hasta 500 piezas por rompecabezas; volumen de
salas simultáneas bajo (producto de un solo mantenedor). ~5 pantallas, 3 endpoints REST, 6
funciones de base de datos.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principio | Veredicto | Justificación |
|---|---|---|
| **I. Simplicidad Operativa** | ✅ PASS | Cero infraestructura nueva: no hay cron, worker, cola ni cache. Los bloqueos vencen solos (research R2), lo que elimina el único proceso en segundo plano que el diseño ingenuo habría exigido. Repositorio único y plano. Sin dependencias más allá del SDK de Supabase y Vitest. |
| **II. Secretos Fuera del Código** | ✅ PASS | Tres variables de entorno, `.env.example` sin valores, `.env*` en `.gitignore`. `SUPABASE_SERVICE_ROLE_KEY` sin prefijo `NEXT_PUBLIC_` y aislada en `lib/supabase/server.ts`. RLS habilitada en todas las tablas con denegación por defecto: la protección no descansa en que una llave sea difícil de adivinar. |
| **III. Acceso sin Cuentas** | ✅ PASS | Ninguna pantalla de registro ni login. El jugador crea o entra a una sala y escribe un alias. La sesión anónima se establece en segundo plano y el usuario nunca la ve. El alias no otorga permisos ni se reserva (FR-004). |
| **IV. Resiliencia de Sesión** | ✅ PASS | Postgres es el estado autoritativo; el cliente es réplica descartable. Reconexión automática vía SDK + reemplazo completo del estado con `GET /state`. Todas las escrituras son posiciones absolutas, nunca deltas ⇒ idempotentes. Indicador de conexión visible. |
| **V. Contrato Uniforme de Errores** | ✅ PASS | Un único helper en `lib/api/errors.ts` produce `{ error: { code, message } }`. Códigos como constantes en `types/api.ts`. El cliente conmuta sobre `code`, nunca sobre `message`. Ningún error expone trazas ni secretos. |
| **VI. Testing Proporcional al Riesgo** | ✅ PASS | Las dos áreas que el principio nombra están cubiertas, cada una donde vive: la sincronización en `npm test` (lógica pura, sin infraestructura) y el emparejamiento en `npm run test:db` (vive en `release_piece`, en Postgres). El principio se enmendó a la versión 1.2.0 para prohibir explícitamente duplicar una regla solo para poder probarla sin infraestructura, que es lo que la primera implementación había hecho. Ver Complexity Tracking. |
| **Git Workflow** | ✅ PASS | Aplica en la fase de tareas: un commit por tarea de `tasks.md`, Conventional Commits con el ID como scope. |
| **Restricciones Técnicas y de Datos** | ✅ PASS | Canvas 2D elegido y documentado una sola vez (research R3). Retención indefinida: sin TTL, y el histórico protegido con `ON DELETE RESTRICT`. Timestamps `timestamptz` presentados con offset fijo `-05:00`. |
| **Flujo de Desarrollo y Despliegue** | ✅ PASS | Railway despliega con cada push a la principal. Migraciones versionadas en `supabase/migrations/` y aplicadas explícitamente antes del merge (research R9). |

**Re-evaluación tras el diseño de Fase 1**: sin cambios. El diseño no introdujo dependencias,
servicios ni abstracciones adicionales. La única desviación respecto del input de planificación
—quién emite el token de sesión— reduce infraestructura en lugar de añadirla, y está documentada
en research R1.

## Project Structure

### Documentation (this feature)

```text
specs/001-sala-armado-colaborativo/
├── plan.md                      # Este archivo
├── spec.md                      # Especificación
├── research.md                  # Fase 0: 10 decisiones técnicas
├── data-model.md                # Fase 1: esquema, RLS, trazabilidad
├── quickstart.md                # Fase 1: puesta en marcha y validación E2E
├── contracts/                   # Fase 1
│   ├── rest-api.md              #   3 endpoints + formato de error
│   ├── db-functions.md          #   4 funciones SECURITY DEFINER
│   └── realtime-channel.md      #   Broadcast, Postgres Changes, Presence
├── checklists/
│   └── requirements.md
└── tasks.md                     # Fase 2 (/speckit.tasks — no lo crea este comando)
```

### Source Code (repository root)

```text
app/
├── api/
│   └── rooms/
│       ├── route.ts                  # POST  crear sala
│       └── [code]/
│           ├── join/route.ts         # POST  unirse
│           └── state/route.ts        # GET   estado completo del tablero
├── rooms/
│   └── [code]/
│       └── page.tsx                  # Pantalla de la sala
├── layout.tsx
└── page.tsx                          # Inicio: elegir rompecabezas / entrar por código

components/
├── Board.tsx                         # Orquesta canvas + entrada de puntero
├── BoardCanvas.tsx                   # Render Canvas 2D, bucle de rAF
├── PlayerList.tsx                    # Participantes y su estado (FR-007)
├── ConnectionStatus.tsx              # conectado / reconectando / desconectado (FR-024)
├── AliasForm.tsx                     # Alias al crear o unirse
└── CompletionBanner.tsx              # Aviso de rompecabezas completado (FR-027)

lib/
├── supabase/
│   ├── client.ts                     # Navegador: anon key + sesión anónima
│   └── server.ts                     # Route handlers: service_role (SOLO servidor)
├── realtime/
│   ├── channel.ts                    # Suscripción, broadcast, postgres_changes
│   ├── presence.ts                   # Presence + heartbeat cada 10 s
│   └── boardSync.ts                  # Precedencia confirmado/provisional  ← test
├── puzzle/
│   └── geometry.ts                   # Cuadrícula, posiciones, tolerancia
├── rooms/
│   ├── code.ts                       # Generación de código de 6 chars     ← test
│   └── alias.ts                      # Validación 2–20 caracteres          ← test
├── format/
│   └── datetime.ts                   # Formateo a hora de Perú, offset -05:00
└── api/
    └── errors.ts                     # { error: { code, message } }

types/
├── board.ts                          # Piece, PieceGroup, BoardState
├── api.ts                            # Requests, responses, ErrorCode
└── realtime.ts                       # Payloads de broadcast y presence

supabase/
├── migrations/                       # Esquema versionado
└── seed.sql                          # Rompecabezas de prueba

tests/
├── unit/                             # Vitest, sin infraestructura (npm test)
└── integration/                      # Contra Supabase local (npm run test:db)
```

**Structure Decision**: App Router de Next.js en la raíz del repositorio, sin carpeta `src/` y sin
separación frontend/backend, porque Supabase actúa como backend gestionado y los route handlers
son la única capa de servidor. La estructura sigue literalmente la indicada en el input de
planificación: API en `app/api/rooms`, pantalla de sala en `app/rooms/[code]`, componentes en
`components/`, helpers de Supabase y Realtime en `lib/`, tipos compartidos en `types/`.

La subdivisión de `lib/` aísla en módulos de funciones **puras** la lógica crítica que sí vive en
TypeScript —`alias`, `code`, `boardSync`— separándola del acceso a Supabase, y eso es lo que
permite que `npm test` corra sin infraestructura.

El emparejamiento y la fusión de grupos **no** están aquí: viven en `release_piece`, en Postgres.
Hubo una implementación paralela en TypeScript y se eliminó. La aplicación nunca la llamaba, así
que era una segunda copia de la misma regla que se desincronizaría en cuanto se tocara una de las
dos, y probarla no decía nada sobre la que se ejecuta. Su cobertura está en
`tests/integration/merge-race.test.ts`.

## Complexity Tracking

> Se registra la única desviación respecto de la constitución.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| El emparejamiento de piezas y la carrera de captura solo se pueden probar con un Postgres real (`supabase start`), pese a que el Principio VI pide pruebas unitarias sin infraestructura externa | Ambas son propiedades del motor de base de datos: la atomicidad de `capture_piece` bajo concurrencia, y el algoritmo de encaje que vive en `release_piece`. No existe forma de verificarlas sin ese motor | La alternativa que se intentó primero —reimplementar el emparejamiento en TypeScript para poder probarlo sin infraestructura— se descartó y se eliminó del repositorio: creaba dos copias de la misma regla, garantizaba que se desincronizaran, y sus pruebas en verde no decían nada sobre el SQL que realmente corre. Verificar la copia es peor que no verificar: es confianza falsa. Se mitiga separando comandos: `npm test` sin infraestructura para el ciclo de desarrollo, `npm run test:db` antes de mergear cambios a funciones SQL |

## Pendientes conocidos

- **Dependencia de datos**: esta feature crea la tabla `puzzles` en su forma mínima y una semilla,
  porque las especificaciones 002 y 003 aún no existen (research R7). 002 la extenderá con
  recorte y visibilidad; 003 con el contador de partidas. No la reemplazarán.
- **Longitud del alias**: resuelto. El spec fija ahora 2–20 caracteres tras recortar espacios
  (FR-002), alineado con el input de planificación y con `lib/rooms/alias.ts`. Ya no hay dos
  fuentes de verdad.
- **`release_piece` en una sola migración**: durante la implementación se crearon tres versiones
  sucesivas (mínima en US2, con encaje en US3, con completado en US5). Como ninguna llegó a
  aplicarse a una base de datos, se colapsaron en `0007_release_fn.sql`. Las migraciones pasan de
  9 a 7.
