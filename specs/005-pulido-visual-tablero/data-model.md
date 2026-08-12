# Data Model: Pulido Visual del Tablero

**Feature**: 005-pulido-visual-tablero | **Date**: 2026-08-11

**Sin cambios en la base de datos.** Ni migraciones, ni tablas, ni columnas, ni funciones de
Postgres. Lo que cambia son estructuras en memoria y un mensaje del canal de tiempo real.

---

## Lo que no cambia

| Dato | Dónde vive | Nota |
|---|---|---|
| `pieces.x`, `pieces.y` | Postgres | Siguen en unidades de tablero. Cambia **cómo se calculan** los valores iniciales, no lo que significan |
| `pieces.group_id` | Postgres | El dibujado por grupo lo lee más que antes, pero no lo altera |
| `pieces.captured_by` | Postgres | Sigue decidiendo el halo, ahora del grupo |
| Funciones de encaje | Postgres | `release_piece` no se toca: la tolerancia y la regla de unión son las mismas |

---

## Estructuras nuevas o modificadas

### `TabProfile` — el perfil de una lengüeta *(nuevo)*

```
TabProfile {
  id       número    0..3, cuál de los cuatro perfiles del catálogo
  points   lista     puntos de control normalizados del contorno,
                     en coordenadas (a lo largo del borde, perpendicular)
}
```

Es un **catálogo fijo de cuatro**, no un dato que se genere ni se guarde. Cada perfil describe
medio recorrido: cuello, cabeza y vuelta.

**Reglas de validación**:

- El ancho del cuello es menor que el de la cabeza (FR-009). Es lo que distingue una lengüeta de
  una joroba y lo único que hay que comprobar de cada perfil.
- El perfil empieza y acaba sobre la línea del borde: la lengüeta sobresale, el resto del lado es
  recto.
- La profundidad no supera `tabOverflow`, que es el margen que el dibujado reserva alrededor de la
  celda.

### `Edge` — con perfil en vez de números sueltos *(modificado)*

```
Edge {
  straight   booleano   los bordes del perímetro exterior
  sign       -1 | 0 | 1 hacia qué lado sobresale
  offset     número     desplazamiento del centro a lo largo del borde
  profile    número     ANTES: `size`, la anchura. AHORA: cuál de los cuatro perfiles
}
```

**Reglas de validación**:

- Un borde interior tiene siempre `sign` distinto de cero y un `profile` válido.
- Los bordes del perímetro exterior siguen siendo rectos (FR-012).
- **La complementariedad sigue siendo estructural**: el borde es un solo objeto que leen las dos
  piezas vecinas desde lados opuestos, así que comparten perfil por construcción y no por
  coincidencia. Es la propiedad que hace que cambiar de perfiles sea seguro.

### `PieceExtent` — cuánto ocupa de verdad una pieza *(nuevo)*

```
PieceExtent {
  width    número   100, 124 o 148 según cuántas lengüetas salen a los lados
  height   número   igual, en vertical
  insetX   número   cuánto se desplaza la celda dentro de su hueco
  insetY   número
}
```

Se deriva de los cuatro bordes de la pieza. Es **el dato que la rejilla uniforme no tenía**, y por
eso reservaba siempre el peor caso.

**Reglas de validación**:

- `width` y `height` valen 100 más 24 por cada lado con lengüeta saliente.
- Los desplazamientos colocan la celda de forma que la caja envolvente empiece en el origen del
  hueco: sin ellos, las piezas de la primera fila asomarían fuera del tablero.

### `BoardSize` — sin contadores de rejilla *(modificado)*

```
BoardSize {
  width, height              tamaño total del tablero
  holeX, holeY               esquina del área central
  holeWidth, holeHeight      tamaño del área central
}
```

Pierde `slotCols`, `slotRows`, `holeSlotCols` y `holeSlotRows`: eran detalles de la rejilla que ya
no existe. El tamaño del tablero pasa a **derivarse del empaquetado** —se colocan las piezas y se
mide lo que ocupan— en vez de calcularse por adelantado.

Es un cambio de dirección: antes el tablero decidía dónde caben las piezas; ahora las piezas
deciden cuánto mide el tablero.

### `PieceDragPayload` — desplazamiento en vez de posición *(modificado, incompatible)*

```
PieceDragPayload {
  groupId    string
  dx, dy     número    ANTES: `x`, `y`, posición absoluta de… nadie sabía de qué pieza
  playerId   string
}
```

El detalle del cambio y su incompatibilidad están en
[contracts/realtime-drag.md](./contracts/realtime-drag.md).

### `SoundPreference` — activado o silenciado *(nuevo)*

```
SoundPreference {
  muted   booleano
}
```

Local a cada navegador y persistente, como el alias. No viaja al servidor ni se comparte: dos
jugadores de la misma sala pueden tenerla distinta.

---

## Transiciones de estado

Lo único con transiciones que merezca dibujarse es el desplazamiento provisional de un grupo, que
es donde vivía el defecto:

```
   sin arrastre
        │
        │ pointerdown sobre una pieza libre
        ▼
   arrastrando ──── pointermove ────► se recalcula dx, dy desde la posición
        │                             CONFIRMADA de la pieza agarrada
        │                             (no se acumula: se recalcula entero)
        │ pointerup
        ▼
   soltado ──── release_piece confirma ────► se descarta el provisional
                                             del grupo y de los fusionados
```

Que `dx` y `dy` se **recalculen** en cada movimiento en vez de acumularse es lo que impide que el
error se vaya sumando durante un arrastre largo. El origen es siempre la posición confirmada, que
no se mueve mientras dura el arrastre.

Al confirmarse una fusión, el provisional del grupo arrastrado **y el de los grupos absorbidos**
se descartan a la vez: si quedara alguno, sus piezas se dibujarían desplazadas respecto del bloque
al que acaban de unirse.
