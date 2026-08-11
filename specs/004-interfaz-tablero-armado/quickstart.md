# Quickstart: Interfaz del Tablero de Armado

**Feature**: 004-interfaz-tablero-armado | **Date**: 2026-08-10

## Prerrequisitos

Los mismos de las features anteriores, ya montados:

```bash
supabase start          # Postgres local con las 12 migraciones
npm run dev             # aplicación en localhost:3000
```

**Ninguna variable de entorno nueva.** Ninguna migración nueva. Si la aplicación ya arrancaba,
arranca igual.

Conviene partir de una base limpia para que el catálogo no arrastre restos:

```bash
supabase db reset
```

---

## Escenarios de validación

Esta funcionalidad es **visual**: casi todo lo que hay que comprobar se ve o no se ve. Lo único
verificable sin mirar es el reparto, y para eso están las unitarias.

### 0. El reparto, sin abrir el navegador (US1)

```bash
npm test -- board-layout
```

**Esperado**: en verde. La prueba que importa recorre todos los pares de piezas en las cinco
cantidades admitidas y afirma que **ninguna caja envolvente se corta con otra**. Si esta prueba
pasa, FR-002 se cumple para cualquier rompecabezas; si falla, no hay nada que mirar en pantalla.

### 1. La banda perimetral (US1)

Crear una sala con un rompecabezas de **104 piezas** y abrirla.

**Esperado**:

- Las piezas forman una banda alrededor del borde y **el centro está despejado**.
- **Ninguna pieza tapa ni parcialmente a otra.** Es lo primero que hay que mirar y lo que hoy
  falla.
- La banda es más gruesa a izquierda y derecha que arriba y abajo. No es un defecto: es la
  consecuencia de meter un hueco apaisado en un tablero apaisado (research R3).
- Ninguna pieza está girada.
- Piezas contiguas en la imagen **no** están contiguas en la banda: el rompecabezas no aparece
  medio ordenado.

Repetir con **150 piezas**: la banda se hace más densa, el centro sigue libre.

Repetir con **500 piezas**: las piezas quedan de unos 31 px. Es pequeño y está aceptado (A-009);
lo que hay que confirmar es que **siguen sin solaparse** y que se ven enteras.

### 2. Todos ven lo mismo (US1, FR-006)

Abrir la misma sala en dos navegadores distintos.

**Esperado**: disposición idéntica. **Con una ventana de cada tamaño**, para que se note lo que
importa: las piezas están en las mismas posiciones relativas, y lo único que cambia es cuán grande
se dibuja todo.

Después, **redimensionar una de las ventanas**. El tablero se reescala, y ninguna pieza se mueve
respecto de las demás. Comprobarlo contra el árbitro:

```bash
curl -s -H "Authorization: Bearer $JWT" \
  http://localhost:3000/api/rooms/$CODE/state | jq '.pieces[0]'
```

Las coordenadas antes y después de redimensionar deben ser **exactamente iguales** (SC-010). Si
cambian, el tamaño de la ventana se ha colado en el cálculo de una posición, que es el fallo que
esta funcionalidad tiene que evitar.

### 3. La forma de las piezas (US2)

Mirar de cerca cualquier pieza.

**Esperado**: lengüetas redondeadas y huecos, contorno que la separa del fondo, y **las piezas del
borde exterior con el lado de fuera recto**. Las cuatro esquinas tienen dos lados rectos.

Encajar dos piezas vecinas: la lengüeta de una ocupa el hueco de la otra, sin espacio ni
superposición.

*Casi todo esto ya funcionaba antes de esta funcionalidad; se comprueba para confirmar que el
cambio de reparto no lo ha roto.*

### 4. La imagen de referencia (US3)

Posar el ratón sobre el icono de imagen de la barra.

**Esperado**: la fotografía completa aparece en el área central, del tamaño del rompecabezas
armado, en menos de 300 ms (SC-004). Al retirar el ratón, desaparece.

**Las dos comprobaciones que de verdad importan**:

1. Con piezas ya colocadas en el centro, mostrar la referencia: las piezas se ven **por encima**
   de la imagen, no tapadas (research R7).
2. Mientras la imagen está visible, que **otro jugador mueva una pieza**. El movimiento debe
   llegar y aplicarse: la ayuda es local y no interrumpe la partida (FR-024).

En un dispositivo táctil, tocar el icono muestra la imagen y volver a tocar la oculta.

### 5. La barra superior (US4)

| Elemento | Esperado |
|---|---|
| Estado de conexión | Dice **conectado**. Con DevTools → Network → Offline pasa a **reconectando** y vuelve al restablecer |
| Tiempo transcurrido | Avanza segundo a segundo |
| Pantalla completa | El tablero ocupa la pantalla; el botón permite volver. **Salir con Escape también deja el botón correcto** |
| Icono de imagen | Escenario 4 |
| Menú | Se despliega, y se cierra al elegir una opción o al pulsar fuera |

**El cronómetro compartido (FR-018)** es lo que hay que comprobar con cuidado, porque es donde una
implementación descuidada falla: abrir la sala en un segundo navegador **cinco minutos después**
de crearla. Los dos deben mostrar prácticamente el mismo valor —el que lleva la partida, no el que
lleva cada jugador— con menos de 1 segundo de diferencia (SC-005).

Para forzarlo sin esperar cinco minutos, adelantar `started_at` en la base de datos:

```sql
update rooms set started_at = now() - interval '5 minutes' where code = 'XXXXXX';
```

Y una prueba que cuesta poco y descubre relojes mal derivados: **cambiar la hora del sistema** del
segundo navegador. El cronómetro debe seguir mostrando lo mismo, porque se corrige contra el
servidor (research R6).

Al completar el rompecabezas, el cronómetro **se detiene** (FR-019).

### 6. Pantallas pequeñas (FR-034)

Estrechar la ventana por debajo de 1024 px.

**Esperado**: aparece el aviso de que la experiencia está pensada para escritorio o tableta. **No
bloquea**: quien insista puede seguir usando el tablero (A-008).

### 7. Las dos métricas de usabilidad (SC-002, SC-007)

Son las únicas comprobaciones que **necesitan a otra persona**, y por eso es fácil que se queden
sin hacer. Cuestan cinco minutos entre las dos.

**SC-007 — primera impresión.** Sentar delante del tablero a alguien que no haya visto la
aplicación, con un rompecabezas de 104 piezas ya cargado, y preguntarle sin dar ninguna pista:
*"¿dónde están las piezas y dónde se arma?"*.

**Esperado**: lo acierta a la primera y sin dudar. Si titubea, el problema no es que la persona
no entienda: es que el área central no se lee como el sitio donde armar, y hay que darle una
señal visual más clara.

**SC-002 — encontrar una pieza.** Con el mismo rompecabezas de 104 piezas, señalar una zona de
la imagen de referencia —"la ventana del tejado", "la puerta roja"— y cronometrar cuánto tarda
en localizar esa pieza en la banda, **sin mover ninguna**.

**Esperado**: menos de 15 segundos. Es la métrica que justifica la funcionalidad entera: con el
reparto anterior, que solapa piezas, la tarea es directamente imposible sin apartar las de
encima.

### 8. Rendimiento (SC-006)

Con **150 piezas**, abrir DevTools → Performance, grabar mientras se arrastra una pieza varios
segundos.

**Esperado**: **50 fps o más** sostenidos.

Este es el escenario con más probabilidades de fallar, y ya se sabe por dónde: hoy se construye un
`Path2D` por pieza y por frame. Si el rendimiento no llega, lo primero que hay que confirmar es
que el caché de rutas de research R5 está en su sitio y no se está reconstruyendo al cambiar una
prop.

---

## Pruebas

```bash
npm test                # unitarias, incluidas board-layout y duration
npm run test:db         # integración; esta funcionalidad no añade ninguna
npm run lint
npm run typecheck
npm run build
```

Las de integración no cambian, pero **deben seguir pasando**: tres de ellas construyen salas con
el reparto, así que son la red que avisa si la sustitución de `scatterPieces` rompe la creación de
salas.

---

## Fallos habituales

| Síntoma | Causa probable |
|---|---|
| Piezas fuera de la vista, o mucho espacio vacío alrededor | El canvas y el reparto no están usando el mismo `boardSize()` |
| Las piezas se mueven al redimensionar | El tamaño de la ventana se ha colado en el cálculo de una posición. Rompe FR-006 |
| El rompecabezas aparece medio ordenado en la banda | Falta la permutación de research R4 |
| Lengüetas que invaden la pieza vecina | El paso de la rejilla se calculó con `PIECE_SIZE` en vez de con la caja envolvente |
| Arrastre a tirones con 150 piezas | El caché de `Path2D` se está invalidando en cada render |
| Dos jugadores con cronómetros distintos | Se está contando desde que cada uno entró, no desde `startedAt` |
| El botón de pantalla completa se queda al revés | Se está guardando el estado al pulsar en lugar de escuchar `fullscreenchange` |
