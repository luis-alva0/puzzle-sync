# Implementation Plan: Interfaz del Tablero de Armado

**Branch**: `004-interfaz-tablero-armado` | **Date**: 2026-08-10 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/004-interfaz-tablero-armado/spec.md`

## Summary

Esta funcionalidad **no añade lógica de juego**. Sustituye el reparto aleatorio de piezas por una
banda perimetral sin solapes, agranda el mundo del tablero para que quepa, y añade una barra
superior. Ni la captura, ni el encaje, ni la sincronización cambian.

Al leer el código antes de planificar apareció algo que cambia el tamaño del trabajo: **buena
parte de lo que pide la especificación ya está construido**.

| Lo que pide la spec | Estado real |
|---|---|
| Siluetas con lengüetas y huecos (FR-009, FR-011, FR-012) | **Hecho** en [path.ts](../../lib/puzzle-generation/path.ts) y [edges.ts](../../lib/puzzle-generation/edges.ts) |
| Lados rectos en el contorno exterior (FR-010) | **Hecho**: `buildEdgeGrid` marca `STRAIGHT` en fila 0, fila `rows`, columna 0 y columna `cols` |
| Contorno que separa la pieza del fondo (FR-013) | **Hecho**: `context.stroke(path)` por pieza |
| Mundo lógico propio, ajeno a la ventana (FR-030) | **Hecho**: `worldWidth`/`worldHeight` en [BoardCanvas.tsx](../../components/BoardCanvas.tsx) |
| Escala uniforme por pantalla (FR-031) | **Hecho**: `scale = min(canvas.width/worldWidth, …)` |
| Redimensionar no mueve piezas (FR-033) | **Hecho**: las posiciones están en unidades de tablero |
| Cronómetro común (FR-017, FR-018) | **Sin trabajo de servidor**: `GET /state` ya devuelve `startedAt` y `serverTime` |

La US2 entera está prácticamente terminada. Lo que queda de verdad es **la US1** —el reparto sin
solapes, que hoy no existe— y **la US4**, la barra superior.

El trabajo real se concentra en tres sitios:

1. **`lib/puzzle/board-layout.ts`** (nuevo): función pura que coloca N piezas en una rejilla de
   huecos perimetrales. Es donde vive el requisito central, FR-002, y por tanto donde se prueba.
2. **`components/BoardCanvas.tsx`**: agrandar el mundo, cambiar el fondo, y **cachear los
   `Path2D`**, que hoy se reconstruyen para cada pieza en cada frame.
3. **`components/BoardToolbar.tsx`** (nuevo) y sus piezas: barra superior con conexión,
   cronómetro, imagen de referencia, pantalla completa y menú.

## Technical Context

**Language/Version**: TypeScript 5 en modo estricto, React 19, Next.js 16 (App Router)

**Primary Dependencies**: ninguna nueva. Pantalla completa con la Fullscreen API del navegador;
la barra y el menú con React y CSS. El proyecto no incorpora librerías de interfaz.

**Storage**: sin cambios de esquema. Las posiciones iniciales siguen viajando como el parámetro
`p_pieces` de `create_room`, que ya existe.

**Testing**: Vitest. El reparto es una función pura y se prueba con pruebas unitarias; el aserto
que importa es **que ningún par de piezas se solapa**, comprobado sobre las cinco cantidades
admitidas (20, 50, 100, 200, 500).

**Target Platform**: navegadores de escritorio y tableta. El teléfono queda fuera de alcance y se
detecta para avisar.

**Project Type**: aplicación web de un solo repositorio.

**Performance Goals**: 50 fps o más durante el arrastre con 150 piezas (SC-006). El caché de
`Path2D` es lo que lo hace alcanzable: hoy se instancian tantos objetos `Path2D` por segundo como
piezas × fps.

**Constraints**: el tablero completo debe caber en la ventana sin desplazamiento (FR-032), y las
posiciones deben ser idénticas para todos los jugadores (FR-006). Las dos a la vez solo se
sostienen si el tamaño del mundo se deriva de la cuadrícula y **nunca** de la ventana.

**Scale/Scope**: 4 historias, 34 requisitos. Caso peor de 500 piezas.

## Constitution Check

| Principio | Evaluación |
|---|---|
| **I. Simplicidad Operativa** | ✅ Cero infraestructura nueva, cero dependencias nuevas, cero migraciones. La pantalla completa y la detección de pantalla pequeña usan API del navegador |
| **II. Secretos Fuera del Código** | ✅ Sin variables de entorno nuevas. La imagen de referencia usa la URL firmada que `GET /state` ya devuelve |
| **III. Acceso sin Cuentas** | ✅ Sin cambios. El menú no introduce ninguna noción de cuenta |
| **IV. Resiliencia de Sesión** | ✅ Sin cambios. La disposición inicial es estado compartido persistido, así que sobrevive a reconexiones igual que hoy |
| **V. Contrato Uniforme de Errores** | ✅ No se añade ningún endpoint |
| **VI. Testing Proporcional al Riesgo** | ✅ El reparto es lógica pura de riesgo alto (FR-002) y se prueba con unitarias. **Se prueba donde la lógica vive**: no se duplica en SQL nada de esto, porque el servidor solo transporta el resultado |

**Resultado: sin violaciones.** No hay nada que registrar en Complexity Tracking.

Un matiz sobre el Principio VI que conviene dejar dicho: el dibujado en canvas **no** se puede
cubrir con unitarias sin montar un DOM falso que probaría el falso, no el canvas. La verificación
de la US2 y de la US3 es visual, y así queda declarada en [quickstart.md](./quickstart.md).

## Project Structure

### Documentation (this feature)

```
specs/004-interfaz-tablero-armado/
├── spec.md
├── plan.md               # este archivo
├── research.md           # decisiones de diseño
├── data-model.md         # entidades y estructuras
├── contracts/
│   └── board-layout.md   # contrato de la función de reparto
├── quickstart.md         # guía de validación
└── checklists/
    └── requirements.md
```

### Source Code (repository root)

```
lib/puzzle/
├── geometry.ts           # MODIFICADO: boardSize(), scatterPieces() pasa a delegar
└── board-layout.ts       # NUEVO: rejilla de huecos perimetrales, función pura

lib/format/
└── duration.ts           # NUEVO: formatear el tiempo transcurrido como m:ss

components/
├── BoardCanvas.tsx       # MODIFICADO: mundo mayor, fondo neutro, caché de Path2D
├── Board.tsx             # MODIFICADO: monta la barra, calcula el desfase de reloj
├── BoardToolbar.tsx      # NUEVO: barra superior
├── ElapsedTime.tsx       # NUEVO: cronómetro
├── ReferenceImage.tsx    # NUEVO: imagen de ayuda al posar el ratón
├── BoardMenu.tsx         # NUEVO: menú desplegable
├── ConnectionStatus.tsx  # MODIFICADO: se integra en la barra sin duplicarse
└── PlayerList.tsx        # MODIFICADO: pasa a vivir dentro del menú

app/rooms/[code]/
└── page.tsx              # MODIFICADO: aviso de pantalla pequeña, contenedor a pantalla completa

tests/unit/
├── board-layout.test.ts  # NUEVO: el aserto de no solape, y la cobertura de la banda
└── duration.test.ts      # NUEVO
```

**Structure Decision**: se mantiene la estructura del App Router ya establecida. El reparto vive
en `lib/puzzle/` junto a la geometría que ya existe, porque comparte `PIECE_SIZE` y la noción de
unidades de tablero, y porque el servidor lo importa desde `app/api/rooms/route.ts`.

## Complexity Tracking

Sin violaciones que justificar.

Merece registrarse, en cambio, **una simplificación deliberada**: el reparto coloca cada pieza en
un hueco de una rejilla regular con una pequeña sacudida aleatoria, en lugar de un empaquetado
libre. Un empaquetado libre aprovecharía mejor el espacio y se parecería algo más a la referencia,
pero exige detección de colisiones entre siluetas irregulares y no garantiza terminar. La rejilla
de huecos garantiza FR-002 por construcción: **dos piezas nunca se solapan porque nunca comparten
hueco**. El coste es un tablero algo más grande de lo estrictamente necesario.
