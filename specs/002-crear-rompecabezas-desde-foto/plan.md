# Implementation Plan: Creación de un Rompecabezas a partir de una Foto

**Branch**: `002-crear-rompecabezas-desde-foto` | **Date**: 2026-08-09 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/002-crear-rompecabezas-desde-foto/spec.md`

## Summary

El jugador sube una foto, la encuadra, elige entre cinco cantidades de piezas y obtiene un enlace
único a un rompecabezas guardado de forma permanente. Sin cuenta, privado por defecto.

Tres decisiones sostienen el diseño:

1. **Las formas de las piezas se calculan en el navegador**, a partir de un generador determinista
   sembrado con el UUID del rompecabezas. El servidor almacena **una** imagen —el recorte— y cero
   imágenes por pieza. La complementariedad entre piezas vecinas se garantiza generando una
   rejilla de bordes compartidos, no una forma por pieza.
2. **El servidor no confía en el navegador para nada.** El tipo de archivo se determina por sus
   números mágicos, el tamaño por el cuerpo real recibido, y la cuadrícula la calcula el servidor.
   La validación del cliente es cortesía, no frontera.
3. **Se extiende la tabla `puzzles` que ya existe**, no se crea. 001 la dejó en forma mínima
   precisamente para esto.

Detalle y alternativas descartadas en [research.md](./research.md).

## Technical Context

**Language/Version**: TypeScript 5.x estricto, Node.js 20+ (los mismos que 001)

**Primary Dependencies**: Next.js 16, React 19, `@supabase/supabase-js`, Vitest 4, y
**`react-easy-crop`** como única incorporación — justificada en research R2 según exige el
Principio I

**Storage**: Supabase Postgres (tabla `puzzles` extendida) + bucket privado `puzzle-images`

**Testing**: Vitest. Unitarias sin infraestructura para el generador determinista, la elección de
cuadrícula y la validación de archivo; integración contra Supabase local para el flujo completo

**Target Platform**: Navegador de escritorio; la subida desde móvil debe funcionar, su
optimización no es objetivo

**Project Type**: Aplicación web de un solo repositorio, sin servidor propio

**Performance Goals**: proceso completo en < 60 s sin contar el encuadre (SC-001); generación tras
confirmar en < 15 s incluso con 500 piezas y 10 MB (SC-002)

**Constraints**: 10 MB por archivo; solo JPG y PNG; cinco cantidades fijas; ningún secreto en el
código; las mismas tres variables de entorno de 001, **ninguna nueva**

**Scale/Scope**: 2 pantallas y 2 endpoints nuevos, **5 puntos de 001 modificados**, 1 migración, 4 módulos de generación. Volumen bajo.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principio | Veredicto | Justificación |
|---|---|---|
| **I. Simplicidad Operativa** | ✅ PASS con dependencia justificada | Cero infraestructura nueva: no hay worker de procesamiento de imágenes, ni cola, ni generación de miniaturas por pieza. Se añade `react-easy-crop`, la primera dependencia de terceros del proyecto; la justificación por escrito que exige el principio está en research R2. Se extiende una tabla en vez de crear otra, y 003 se queda sin tabla propia que crear (research R7). |
| **II. Secretos Fuera del Código** | ✅ PASS | Ninguna variable de entorno nueva. La subida usa `service_role` exclusivamente desde el route handler, a través de `lib/supabase/server.ts`, que ya está aislado con `server-only`. El bucket es privado. |
| **III. Acceso sin Cuentas** | ✅ PASS | Crear un rompecabezas no requiere registro. La sesión anónima de 001 se reutiliza tal cual. La contrapartida —perder el enlace es perder el rompecabezas— se resuelve con una advertencia explícita (FR-026), no con cuentas. |
| **IV. Resiliencia de Sesión** | ✅ PASS (aplicación limitada) | No hay estado en tiempo real que perder aquí. Lo que sí aplica: una creación interrumpida no deja restos (FR-033), mediante el borrado compensatorio del objeto si falla la inserción. |
| **V. Contrato Uniforme de Errores** | ✅ PASS | Reutiliza `lib/api/errors.ts` de 001 sin cambios. Añade tres códigos nuevos a la unión —`INVALID_FILE_TYPE`, `FILE_TOO_LARGE`, `INVALID_PIECE_COUNT`— sin alterar el significado de ninguno existente. |
| **VI. Testing Proporcional al Riesgo** | ✅ PASS | Bajo la versión 1.2.0 del principio, se prueba donde la lógica vive. Aquí toda la lógica crítica vive en TypeScript —generador determinista, elección de cuadrícula, validación de archivo— así que es **unitaria y sin infraestructura**, a diferencia de 001. Solo el flujo de subida necesita integración. |
| **Git Workflow** | ✅ PASS | Un commit por tarea, Conventional Commits con el ID como scope. |
| **Restricciones Técnicas y de Datos** | ✅ PASS | Canvas 2D ya elegido en 001 y no se revisa. Retención indefinida: sin TTL ni purga. `created_at` en `timestamptz`, presentado con el helper de 001. Repositorio único. |
| **Flujo de Desarrollo y Despliegue** | ✅ PASS | Migración versionada en `supabase/migrations/`, aplicada explícitamente antes del merge. |

**Re-evaluación tras el diseño de Fase 1**: sin cambios. El diseño no introdujo servicios,
procesos ni abstracciones adicionales. La única dependencia nueva es la del recorte, y está
justificada.

## Project Structure

### Documentation (this feature)

```text
specs/002-crear-rompecabezas-desde-foto/
├── plan.md                      # Este archivo
├── spec.md                      # Especificación
├── research.md                  # Fase 0: 10 decisiones técnicas
├── data-model.md                # Fase 1: extensión de `puzzles` y bucket
├── quickstart.md                # Fase 1: puesta en marcha y validación
├── contracts/                   # Fase 1
│   ├── rest-api.md              #   POST /api/puzzles + GET /api/puzzles/[id]
│   └── piece-generation.md      #   Contrato cliente-cliente del generador
├── checklists/
│   └── requirements.md
└── tasks.md                     # Fase 2 (/speckit.tasks — no lo crea este comando)
```

### Source Code (repository root)

Solo se listan las rutas que esta feature crea o toca. El resto del árbol es de 001.

```text
app/
├── puzzles/
│   ├── create/
│   │   └── page.tsx                  # NUEVO  Pantalla de creación, 3 pasos
│   └── [id]/
│       └── page.tsx                  # NUEVO  Destino del enlace: vista previa + crear sala
├── api/
│   └── puzzles/
│       ├── route.ts                  # NUEVO  POST: valida, sube, inserta
│       └── [id]/
│           └── route.ts              # NUEVO  GET: sirve privados con service_role
├── page.tsx                          # TOCADO Acepta un puzzleId arbitrario, no solo la semilla
├── api/rooms/route.ts                 # TOCADO Quita `puzzle` de la respuesta (URL inservible)
├── api/rooms/[code]/join/route.ts     # TOCADO Idem
└── api/rooms/[code]/state/route.ts    # TOCADO Firma la URL de imagen (001)

components/
├── ImageCropper.tsx                  # NUEVO  Encuadre, sobre react-easy-crop
├── PieceCountSelector.tsx            # NUEVO  Las cinco opciones + cantidad real
├── PuzzleLinkResult.tsx              # NUEVO  Enlace, copiar y advertencia (FR-026)
└── BoardCanvas.tsx                   # TOCADO Prop puzzleId + recorte por Path2D

lib/
├── puzzle-generation/
│   ├── prng.ts                       # NUEVO  splitmix32 + seedFromUuid      ← test
│   ├── edges.ts                      # NUEVO  Rejilla de bordes compartidos  ← test
│   ├── path.ts                       # NUEVO  Path2D de una pieza
│   └── grid.ts                       # NUEVO  chooseGrid                     ← test
├── storage/
│   └── upload.ts                     # NUEVO  Subida, borrado y firma de URL en Storage
├── upload/
│   └── validate.ts                   # NUEVO  Números mágicos y tamaño       ← test
└── api/errors.ts                     # TOCADO 3 códigos de error nuevos

types/
├── api.ts                            # TOCADO Contrato del endpoint + ErrorCode
└── puzzle.ts                         # NUEVO  Edge, EdgeGrid, PieceEdges

supabase/
├── migrations/
│   └── 0008_puzzles_from_photo.sql   # NUEVO  ALTER TABLE + bucket + política
└── seed.sql                          # TOCADO Declara visibility y source

tests/
├── unit/                             # prng, edges, grid, validate
└── integration/                      # create-puzzle
```

**Structure Decision**: se respeta literalmente la estructura del input de planificación —pantalla
en `app/puzzles/create`, endpoint en `app/api/puzzles`, generación en `lib/puzzle-generation`,
Storage en `lib/storage`, componentes en `components`— y se añade `lib/upload/validate.ts`
separado del route handler.

Esa separación no es adorno: la validación de archivo es lógica crítica que el Principio VI obliga
a probar, y solo es unitaria si vive fuera del handler. Dentro, probarla exigiría montar una
petición HTTP.

## Complexity Tracking

> Se registran las desviaciones que exigen justificación explícita.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| Primera dependencia de terceros del proyecto: `react-easy-crop` | El recorte con encuadre necesita arrastre, zoom con rueda y con pinza, y marco redimensionable, traducido a coordenadas de la imagen original. La plataforma no ofrece control de recorte alguno | Escribirlo a mano son cientos de líneas de manejo de punteros, y el gesto de pinza en táctil es el tipo de código que parece terminado sin estarlo. `cropperjs` es más grande e imperativo. Prescindir del recorte contradice una historia de usuario completa (US2) |
| 002 crea columnas (`play_count`, `visibility`, `source`) que solo consume 003 | Nacen del mismo `ALTER TABLE` que las que 002 sí usa. Partirlas en dos migraciones para respetar la frontera entre features significaría tocar la misma tabla dos veces sin ganar nada | La alternativa, que 003 cree una tabla `catalog_entries` aparte, añade una tabla, una FK y un JOIN a cada listado, para datos que son atributos del propio rompecabezas (research R7) |
| La detección de qué pieza está bajo el puntero sigue usando la caja envolvente, aunque las lengüetas sobresalgan | Con 500 piezas, `isPointInPath` por pieza en cada movimiento de puntero son 500 comprobaciones por evento | Se asume que un clic en la zona de solape entre dos lengüetas puede elegir la vecina. Si molesta en la práctica, la mejora es filtrar por caja y afinar con `isPointInPath` solo sobre esos pocos candidatos (research R8) |

## Pendientes conocidos

- **`nominal_piece_count` admite NULL a propósito.** La semilla de 001 incluye un rompecabezas de
  4 piezas —el que usa para validar el completado— y 4 no es una de las cinco opciones. Con la
  columna `NOT NULL` copiando `piece_count`, la migración abortaría contra su propio `CHECK`. NULL
  significa "no se creó eligiendo entre las cinco opciones", que es la verdad para la semilla y
  para los curados de 003.
- **El bucket es privado sin excepción y toda URL de imagen se firma al servir** (research R5).
  Consecuencia que atraviesa features: `GET /api/rooms/[code]/state`, que es de 001, devuelve hoy
  `puzzles.image_url` en crudo y debe firmarla. Sin ese cambio, 002 rompe 001 para cualquier
  rompecabezas creado desde foto: el tablero saldría en blanco. Lo permanente que promete FR-023
  es el enlace `/puzzles/{uuid}`, no la dirección del objeto en Storage.
- **El enlace necesita destino, y eso toca 001**: el `POST` devuelve `/puzzles/{uuid}`, así que
  esa ruta tiene que existir, y desde ella se crea la sala. Como la migración restringe la lectura
  de `puzzles` a los públicos, los privados se sirven por `GET /api/puzzles/[id]` con
  `service_role`. Además, `app/page.tsx` de 001 tiene la semilla en duro y debe aceptar un
  `puzzleId` cualquiera; sin ese cambio, un rompecabezas creado no se puede jugar.
- **Impacto en 001, ya implementada**: `components/BoardCanvas.tsx` pinta hoy cada pieza como un
  rectángulo con `drawImage`. Las formas irregulares obligan a recortar con `Path2D` y a pintar
  una región mayor que la celda, porque las lengüetas sobresalen (research R8). Es la única parte
  de 001 que esta feature modifica, y las piezas de la semilla seguirán viéndose correctamente
  porque el perímetro de la rejilla es recto.
- **Nota para 003**: su data-model preveía una entidad `Entrada de catálogo` con tabla propia.
  Con `visibility`, `play_count` y `source` en `puzzles`, esa entidad pasa a ser una vista
  filtrada. Su plan debe consumir estas columnas y añadir solo `catalog_status` para la retirada,
  en lugar de crear una tabla.
- **Privacidad de la tabla `puzzles`**: 001 dejó una política de lectura pública sobre toda la
  tabla, correcta cuando solo contenía rompecabezas de prueba. Con fotos personales, esa política
  permitiría enumerar los privados. La migración de esta feature la restringe a
  `visibility = 'public'` y sirve los privados por el route handler. Es un cambio a una política
  de 001 que conviene revisar al implementar.
