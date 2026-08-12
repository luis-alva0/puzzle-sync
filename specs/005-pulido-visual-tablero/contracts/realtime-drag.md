# Contrato: mensaje de arrastre en tiempo real

**Feature**: 005-pulido-visual-tablero | **Módulo**: `types/realtime.ts`, canal `room:{id}`

Este contrato existe porque el mensaje actual **admite dos lecturas**, y emisor y receptor
eligieron cada uno la suya. Es la causa del bug del arrastre de grupos.

---

## El formato actual y su defecto

```
PieceDragPayload {
  groupId   string
  x, y      número     ← ¿posición de QUÉ pieza?
  playerId  string
}
```

Nada en el mensaje dice a qué pieza corresponde `(x, y)`. Las dos partes lo resolvieron por su
cuenta y no coincidieron:

| Quién | Qué entiende por `(x, y)` |
|---|---|
| `Board.tsx` (emisor) | La posición de la **pieza agarrada** |
| `boardSync.ts` (receptor) | La posición del **ancla** del grupo, la de menor fila y columna |

Coinciden solo si agarras el ancla. En cualquier otro caso el bloque se dibuja desplazado
`(agarrada − ancla)`, y al confirmar el servidor vuelve a su sitio: el salto que se reporta.

---

## El formato nuevo

```
PieceDragPayload {
  groupId   string
  dx, dy    número     desplazamiento respecto de la posición CONFIRMADA de cada pieza
  playerId  string
}
```

**Garantías**

1. **Una sola lectura posible.** Un desplazamiento no necesita saber de qué pieza habla.
2. El receptor pinta cada pieza del grupo en `confirmada + (dx, dy)`. Nada más.
3. **No se acumula.** El emisor recalcula `dx` y `dy` en cada movimiento a partir de la posición
   confirmada de la pieza agarrada, que no cambia mientras dura el arrastre. Un arrastre largo no
   acumula error.
4. `dx = 0, dy = 0` es válido y significa «el grupo está donde el servidor cree».
5. `PieceDropPayload` no cambia.

**Efecto en el código**: la búsqueda del ancla desaparece de `renderPieces`. El arreglo **quita**
código.

---

## Es un cambio incompatible

Un cliente con el formato viejo y otro con el nuevo en la misma sala se entenderían mal: el viejo
leería un desplazamiento pequeño como una posición absoluta cerca del origen y mandaría el bloque
a la esquina.

**Hoy el coste es cero**: no hay nada desplegado y todos los clientes se cargan de la misma
versión al abrir la página. Queda escrito porque **en cuanto haya usuarios dejará de serlo**, y
entonces un cambio así necesitará convivencia de versiones o una ventana de despliegue.

No se añade número de versión al mensaje. Sería infraestructura para un problema que hoy no
existe, y el Principio I la desaconseja; cuando exista, este documento explica por qué hizo falta.

---

## Cómo se prueba

Unitarias en `tests/unit/boardSync.test.ts`. La reconciliación es lógica pura y crítica —el
Principio VI la nombra— así que se prueba donde vive.

**La prueba que importa es la que hoy fallaría**:

```
grupo de tres piezas en fila
arrastrar agarrando la pieza del MEDIO
afirmar que las tres se desplazan lo mismo
afirmar que la del medio queda exactamente donde el puntero la dejó
```

Con el formato viejo, esa prueba pasa solo si se agarra la primera pieza. Es exactamente la
distinción que el código no hacía.

Se prueban además: que el desplazamiento se aplica a todas las piezas del grupo y a ninguna de
otro; que un mensaje sobre un grupo desconocido se ignora; y que al descartar el provisional las
piezas vuelven a su posición confirmada.
