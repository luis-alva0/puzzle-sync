# Data Model: Interfaz del Tablero de Armado

**Feature**: 004-interfaz-tablero-armado | **Date**: 2026-08-10

**Esta funcionalidad no cambia el esquema de la base de datos.** No hay migraciones, no hay tablas
ni columnas nuevas, y ninguna función de Postgres se toca. Lo que sigue describe estructuras que
viven en memoria y el único dato persistido que cambia de significado.

---

## Lo que ya existe y se sigue usando

| Dato | Dónde vive | Qué cambia |
|---|---|---|
| `pieces.x`, `pieces.y` | Postgres, tabla `pieces` | **Nada estructural.** Siguen siendo unidades de tablero. Lo que cambia es cómo se calculan los valores iniciales |
| `rooms.started_at` | Postgres | Nada. Pasa a alimentar el cronómetro |
| `startedAt`, `serverTime` | Respuesta de `GET /api/rooms/[code]/state` | Nada. Ya se devuelven; hasta ahora nadie los usaba para esto |
| Rejilla de bordes | Memoria del navegador, derivada del UUID | Nada. Se le añade un caché de rutas al lado |

El único efecto sobre datos persistidos es **qué valores** toman `x` e `y` al crear la sala. El
tipo, el rango y el significado son los mismos, así que las salas creadas antes y después conviven
sin distinción posible a nivel de esquema.

---

## Estructuras nuevas, todas en memoria

### `BoardSize` — el tamaño del mundo

```
BoardSize {
  width       número   ancho del tablero en unidades de tablero
  height      número   alto del tablero
  holeX       número   esquina superior izquierda del área de armado
  holeY       número
  holeWidth   número   ancho del área central libre
  holeHeight  número   alto del área central libre
}
```

Se deriva **únicamente** de `gridRows`, `gridCols` y las constantes de geometría. Nunca del tamaño
de ninguna ventana: es la condición que hace compatibles FR-006 y FR-031.

**Reglas de validación**:

- `holeWidth ≥ gridCols × PIECE_SIZE` y `holeHeight ≥ gridRows × PIECE_SIZE` (FR-003).
- `holeWidth / holeHeight` respeta la proporción del rompecabezas (FR-003).
- El área de banda, `width × height − holeWidth × holeHeight`, tiene huecos suficientes para todas
  las piezas (FR-007).
- La proporción `width / height` se aproxima a 16:10 (research R3).

**Es la única fuente de verdad del tamaño del tablero.** Hoy `BoardCanvas` calcula el suyo por su
cuenta (`solvedWidth + PIECE_SIZE × 4`) y el reparto calcula otro distinto. Que ambos consulten la
misma función es lo que evita que las piezas caigan fuera de lo que se dibuja.

---

### `Slot` — un hueco de la rejilla

```
Slot {
  x   número   esquina superior izquierda del hueco, en unidades de tablero
  y   número
}
```

Los huecos se generan recorriendo el tablero con el paso de la rejilla y descartando los que caen
dentro del área central. Un hueco alberga **exactamente una pieza**, y de ahí sale la garantía de
FR-002.

**Reglas de validación**:

- Dos huecos distintos nunca se solapan.
- Ningún hueco invade el área central.
- La cantidad de huecos es mayor o igual que la cantidad de piezas.

---

### `ScatteredPiece` — sin cambios de forma

```
ScatteredPiece {
  gridRow  número   fila correcta en la cuadrícula
  gridCol  número   columna correcta
  x        número   posición inicial en el tablero
  y        número
}
```

Ya existe en [geometry.ts](../../lib/puzzle/geometry.ts) y **su forma no cambia**: es lo que viaja
como `p_pieces` a `create_room`. Lo que cambia es cómo se eligen `x` e `y`.

**Reglas de validación** (las que se prueban):

- Ninguna pieza se solapa con otra, considerando la caja envolvente con lengüetas (FR-002).
- Ninguna pieza empieza dentro del área central de armado (FR-001).
- Ninguna pieza empieza en su posición correcta ni dentro de la tolerancia de encaje respecto de
  ella. **Esta regla ya existe hoy** y hay que conservarla: un rompecabezas que arranca
  parcialmente resuelto es un fallo visible.
- Hay exactamente `gridRows × gridCols` piezas, y cada celda aparece una sola vez.
- Con la misma semilla, el resultado es idéntico (research R4).

---

### `ToolbarState` — estado local de la barra

```
ToolbarState {
  clockOffsetMs      número     serverTime − Date.now() en el momento de la respuesta
  showReference      booleano   la imagen de ayuda está visible
  menuOpen           booleano
  isFullscreen       booleano   espejo de document.fullscreenElement, no estado propio
}
```

**Todo es local a cada pantalla y nada se comparte ni se persiste.** Es lo que hace que mostrar la
imagen de referencia no afecte a los demás jugadores (FR-024).

`isFullscreen` se refresca desde el evento `fullscreenchange` en lugar de fijarse al pulsar el
botón: si el navegador deniega la petición o el usuario sale con Escape, el botón sigue diciendo
la verdad (research R8).

---

## Transiciones de estado

El cronómetro es lo único con transiciones que merezca dibujarse:

```
        sala creada                    última pieza encajada
             │                                   │
             ▼                                   ▼
     ┌───────────────┐                   ┌───────────────┐
     │   contando    │ ────────────────► │   detenido    │
     └───────────────┘                   └───────────────┘
             │  ▲                                 │
   pérdida de│  │reconexión                       │ el valor mostrado
    conexión │  │                                 │ pasa a ser el final
             ▼  │                                 ▼
     ┌───────────────┐                     completed_at − started_at
     │ sigue contando│
     └───────────────┘
```

Perder la conexión **no detiene el cronómetro**: cuenta desde `startedAt`, que es un dato del
servidor, así que al reconectar el valor ya es el correcto sin necesidad de recuperar nada. Es una
consecuencia agradable de derivarlo en lugar de acumularlo.

Al completarse, el valor se congela en `completedAt − startedAt` (FR-019). Ambas marcas están ya
en la respuesta de estado y en la tabla `game_history`.
