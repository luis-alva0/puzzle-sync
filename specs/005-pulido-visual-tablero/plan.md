# Implementation Plan: Pulido Visual del Tablero

**Branch**: `005-pulido-visual-tablero` | **Date**: 2026-08-11 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/005-pulido-visual-tablero/spec.md`

## Summary

Seis defectos visuales, y al diseñarlos aparece que **cuatro de ellos son el mismo problema**: el
tablero se dibuja pieza a pieza cuando debería dibujarse **grupo a grupo**.

| Historia | Qué pide | Por qué la resuelve dibujar por grupo |
|---|---|---|
| US1 | Sin costuras entre piezas unidas | Un grupo dibujado con un solo recorte no tiene bordes interiores que puedan dejar costura |
| US4 | Relieve del contorno **del grupo** | El contorno del grupo solo existe si se dibuja el grupo |
| US4 | Sombra que no se repita por pieza | Idem |
| Q2 | Halo de captura alrededor del grupo | Idem |

Ese es el eje del plan. Lo demás son piezas independientes: el arreglo del arrastre, los perfiles
de lengüeta, el sonido y las proporciones de la ventana.

**Las dos causas que la especificación dejó pendientes quedan resueltas aquí**: el arrastre en
[research.md](./research.md) R1 —confirmada en el código— y las costuras en R2, con una hipótesis
y, más importante, con un diseño que las elimina **sea cual sea la causa**.

## Technical Context

**Language/Version**: TypeScript 5 estricto, React 19, Next.js 16 (App Router)

**Primary Dependencies**: ninguna nueva. El sonido se sintetiza con la Web Audio API del
navegador, que no exige archivo ni librería (A-002).

**Storage**: sin cambios de esquema, sin migraciones. Las posiciones iniciales siguen viajando
como `p_pieces` de `create_room`; solo cambia cómo se calculan.

**Testing**: Vitest. El empaquetado por filas es lógica pura y de riesgo alto —de él depende
FR-030, que ninguna pieza se solape— así que lleva unitarias con el mismo aserto exhaustivo que la
feature 004. El dibujado en canvas sigue sin llevarlas: se verifica mirando.

**Target Platform**: navegadores de escritorio y tableta.

**Performance Goals**: 50 fps arrastrando un grupo de 20 piezas en un rompecabezas de 150
(SC-007). Dibujar por grupo **reduce** el trabajo respecto de hoy: menos recortes y menos
`drawImage`, no más.

**Constraints**: FR-030 —ninguna pieza se solapa— se mantiene aunque desaparezca la rejilla que lo
garantizaba. El empaquetado nuevo lo consigue por construcción y sin bucles que puedan no terminar.

**Scale/Scope**: 6 historias, 40 requisitos. Caso peor de 500 piezas.

## Constitution Check

| Principio | Evaluación |
|---|---|
| **I. Simplicidad Operativa** | ✅ Cero dependencias, cero infraestructura, cero migraciones. El sonido sintetizado evita un archivo que licenciar y servir; dibujar por grupo **quita** código en lugar de añadirlo |
| **II. Secretos Fuera del Código** | ✅ Sin variables de entorno nuevas |
| **III. Acceso sin Cuentas** | ✅ Sin cambios |
| **IV. Resiliencia de Sesión** | ⚠️ Se toca la reconciliación de estado en tiempo real, que es donde vive esta garantía. Ver la nota de abajo |
| **V. Contrato Uniforme de Errores** | ✅ Sin endpoints nuevos |
| **VI. Testing Proporcional al Riesgo** | ✅ El empaquetado y la reconciliación son lógica crítica y pura: unitarias. **Se prueba donde la lógica vive** |

**Sin violaciones**, pero con una advertencia sobre el Principio IV que conviene tener delante.

El arreglo del arrastre cambia `PieceDragPayload`, que es un mensaje del canal de tiempo real. Es
un **cambio incompatible del formato**: un cliente viejo y uno nuevo en la misma sala se
entenderían mal. No hay nada desplegado, así que el coste real es cero, pero queda dicho en
[contracts/realtime-drag.md](./contracts/realtime-drag.md) porque en cuanto haya usuarios dejará
de serlo.

## Project Structure

### Documentation (this feature)

```
specs/005-pulido-visual-tablero/
├── spec.md
├── plan.md                    # este archivo
├── research.md                # las dos causas y las decisiones de dibujado
├── data-model.md
├── contracts/
│   ├── band-packing.md        # el empaquetado que sustituye a la rejilla
│   └── realtime-drag.md       # el cambio incompatible del mensaje de arrastre
├── quickstart.md
└── checklists/requirements.md
```

### Source Code (repository root)

```
lib/puzzle/
├── board-layout.ts            # REESCRITO: empaquetado por filas en vez de rejilla de huecos
└── geometry.ts                # sin cambios

lib/puzzle-generation/
├── tab-profiles.ts            # NUEVO: los perfiles de lengüeta con cuello y cabeza
├── edges.ts                   # MODIFICADO: cada borde elige un perfil, no unos números sueltos
├── path.ts                    # REESCRITO: traza el perfil elegido; añade el trazado de un grupo
└── prng.ts                    # sin cambios

lib/realtime/
├── boardSync.ts               # MODIFICADO: el desplazamiento provisional pasa a ser un delta
└── channel.ts                 # MODIFICADO: nuevo formato de PieceDragPayload

lib/audio/
└── click.ts                   # NUEVO: el clic sintetizado y su limitador

components/
├── BoardCanvas.tsx            # MODIFICADO: dibuja por grupo, con relieve, halo y referencia
├── Board.tsx                  # MODIFICADO: envía delta; dispara el sonido al encajar
├── BoardToolbar.tsx           # MODIFICADO: franja delgada teñida del tablero
├── BoardMenu.tsx              # MODIFICADO: interruptor de sonido
└── ...

app/rooms/[code]/page.tsx      # MODIFICADO: sin marco; el tablero llega a los bordes

types/realtime.ts              # MODIFICADO: PieceDragPayload
types/puzzle.ts                # MODIFICADO: Edge pasa a referenciar un perfil

tests/unit/
├── board-layout.test.ts       # REESCRITO: mismas garantías, empaquetado nuevo
├── boardSync.test.ts          # MODIFICADO: el delta, y el caso que hoy falla
├── tab-profiles.test.ts       # NUEVO: complementariedad de cada perfil
└── audio-click.test.ts        # NUEVO: el limitador de repetición
```

**Structure Decision**: se mantiene la estructura del App Router. La única carpeta nueva es
`lib/audio/`, y existe para que el limitador de repetición —que es lógica probable— no acabe
dentro de un componente.

## Complexity Tracking

Sin violaciones que justificar. Dos decisiones merecen quedar registradas:

**Se reescribe `board-layout.ts` un día después de escribirlo.** La rejilla de huecos uniforme
cumplía su promesa —no solape por construcción— pero al precio de que el paso lo fijara siempre la
pieza más ancha posible. El empaquetado por filas conserva la promesa y quita el precio. No es que
la rejilla estuviera mal: es que resolvía el problema sin conocer un dato —hacia dónde apunta cada
lengüeta— que ahora sí está disponible.

**Dibujar por grupo es más código en el trazado y menos en el bucle de pintado.** Hay que construir
el contorno de un grupo uniendo los de sus piezas, que no es trivial. A cambio desaparecen tres
tratamientos especiales —costuras, relieve por pieza, halo por pieza— y el bucle hace menos
trabajo por frame. El saldo en líneas está cerca de cero; el saldo en casos especiales es
claramente favorable.
