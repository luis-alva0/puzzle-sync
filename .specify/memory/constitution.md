<!--
SYNC IMPACT REPORT
==================
Version change: 1.0.0 → 1.1.0
Bump rationale: MINOR. Se añade una nueva sección de gobernanza ("Git Workflow") con reglas
obligatorias de commit por tarea. Ningún principio existente fue modificado ni eliminado.

Principios modificados: ninguno.

Secciones añadidas:
- Git Workflow (commit atómico por tarea de tasks.md, Conventional Commits con ID de tarea)

Secciones eliminadas: ninguna.

Follow-up TODOs: ninguno.

--- Historial ---
1.0.0 (2026-08-09): Ratificación inicial. Principios I-VI, Restricciones Técnicas y de Datos,
Flujo de Desarrollo y Despliegue, Governance.
-->

# PuzzleSync Constitution

PuzzleSync es una aplicación web para armar rompecabezas de forma colaborativa y en tiempo
real, principalmente en grupos de 2 personas. Permite crear rompecabezas a partir de fotos o
elegir entre rompecabezas pre-creados, y conserva un histórico permanente de los rompecabezas
armados. Esta constitución define las reglas no negociables que gobiernan su desarrollo.

## Core Principles

### I. Simplicidad Operativa (NO NEGOCIABLE)

El proyecto es desarrollado y mantenido por una sola persona. Toda decisión técnica DEBE
minimizar la cantidad de piezas de infraestructura que se operan por separado.

- El sistema DEBE apoyarse en servicios gestionados (Supabase, Railway) en lugar de
  infraestructura autoadministrada. No se introducen servidores propios, colas, caches
  externos ni workers dedicados.
- El repositorio DEBE permanecer único y plano. No se adopta estructura de monorepo,
  paquetes internos publicados ni división cliente/servidor en repos separados, porque
  Supabase actúa como backend gestionado.
- Cualquier dependencia o servicio nuevo DEBE justificarse por escrito en el plan de la
  feature, indicando por qué la plataforma existente no lo cubre.
- Ante dos soluciones que resuelven el mismo problema, se ELIGE la que deja menos superficie
  que mantener, incluso si es menos general.

**Rationale**: Un solo mantenedor no puede absorber el costo continuo de operar múltiples
sistemas. La complejidad no pagada hoy se cobra en incidentes mañana.

### II. Secretos Fuera del Código (NO NEGOCIABLE)

El repositorio es público. Ninguna credencial, llave de servicio, token o cadena de conexión
puede quedar escrita en el código fuente bajo ninguna circunstancia.

- Toda credencial DEBE leerse exclusivamente de variables de entorno.
- La llave `service_role` de Supabase y cualquier secreto equivalente NUNCA se exponen al
  cliente. Solo valores explícitamente públicos (URL del proyecto y llave `anon`) pueden
  usar el prefijo `NEXT_PUBLIC_`.
- El repositorio DEBE incluir un `.env.example` con los nombres de todas las variables
  requeridas y sin valores reales. Los archivos `.env*` con valores reales DEBEN estar en
  `.gitignore`.
- La protección de datos NO puede descansar en que una llave sea difícil de adivinar. El
  acceso a datos DEBE estar respaldado por Row Level Security en Postgres.
- Un secreto filtrado a la historia de Git se trata como incidente: se rota la llave antes
  de cualquier otro trabajo.

**Rationale**: En un repo público, un secreto commiteado es un secreto comprometido de forma
inmediata e irreversible. No hay remediación posterior que lo deshaga.

### III. Acceso sin Cuentas: Salas y Alias

Los usuarios NO requieren cuenta, registro ni login tradicional para jugar.

- El flujo de entrada DEBE ser: crear una sala u unirse a una sala existente mediante su
  identificador o enlace.
- Dentro de la sala, cada participante se identifica mediante un alias por sesión, cuyo
  único propósito es diferenciar a los jugadores entre sí.
- El alias NO es una identidad persistente ni un mecanismo de autorización: no otorga
  permisos, no se reserva y no se verifica.
- Ninguna funcionalidad de juego puede quedar detrás de un muro de registro.
- No se solicitan ni almacenan datos personales identificables de los participantes.

**Rationale**: La fricción de registro mata una experiencia pensada para dos personas que
quieren jugar en el momento. Menos identidad también es menos dato sensible que custodiar.

### IV. Resiliencia de Sesión y Progreso Irrompible

Una desconexión no puede costar progreso.

- Cuando un jugador pierde conexión a mitad de un rompecabezas, el cliente DEBE reconectarse
  automáticamente, sin requerir acción manual ni recarga de página.
- Al reconectar, el sistema DEBE recuperar el estado completo del tablero desde el servidor,
  no desde memoria local, y reconciliar los movimientos ocurridos durante la ausencia.
- El estado autoritativo del tablero vive en Postgres. El estado en el cliente es una réplica
  descartable; cualquier divergencia se resuelve a favor del servidor.
- Los movimientos de piezas DEBEN persistirse de forma que un corte en cualquier punto deje
  el tablero en un estado válido. La aplicación repetida de un mismo movimiento no puede
  corromper el tablero.
- La interfaz DEBE indicar de forma visible el estado de conexión (conectado, reconectando,
  desconectado).

**Rationale**: El valor de la aplicación es el progreso compartido acumulado. Perderlo por un
corte de red es el peor fallo posible del producto.

### V. Contrato Uniforme de Errores

Toda respuesta de error de la API DEBE tener el mismo formato en todo el sistema.

- Todo error DEBE devolver, como mínimo, un código de error estable y legible por máquina y
  un mensaje descriptivo para humanos.
- El código de error es parte del contrato público: se puede añadir uno nuevo, pero cambiar
  o eliminar el significado de uno existente es un cambio incompatible.
- Los mensajes de error NUNCA incluyen secretos, cadenas de conexión, ni trazas internas
  crudas.
- Los fallos DEBEN devolver el error estandarizado. No se permite responder `200` con un
  cuerpo vacío, ni tragar una excepción en silencio, ni devolver el error crudo de Supabase
  sin normalizar.
- El cliente DEBE mostrar errores basándose en el código, no en el texto del mensaje.

**Rationale**: Un formato único hace que el manejo de errores se escriba una sola vez en el
cliente, y hace que un fallo en producción sea diagnosticable a partir del código.

### VI. Testing Proporcional al Riesgo

El rigor de testing es moderado y se concentra donde un error es caro.

- Las pruebas unitarias son OBLIGATORIAS para la lógica crítica: el algoritmo de
  emparejamiento y encaje de piezas, y la lógica de sincronización y reconciliación de estado
  en tiempo real.
- Todo bug corregido en esas áreas DEBE dejar una prueba que falle sin el arreglo.
- NO se exige cobertura total, TDD estricto, ni pruebas para UI, estilos, wrappers triviales
  o código de andamiaje.
- Las pruebas DEBEN correr sin infraestructura externa: la lógica crítica se mantiene en
  funciones puras, separada del acceso a Supabase.

**Rationale**: Un mantenedor único tiene un presupuesto de tiempo finito. Se gasta en las dos
partes donde un error silencioso arruina la partida, no en perseguir un número de cobertura.

## Restricciones Técnicas y de Datos

**Stack obligatorio**:

- Frontend: Next.js con TypeScript. TypeScript en modo estricto; `any` requiere justificación
  en el propio código.
- Renderizado del tablero: Canvas o SVG. La elección se documenta una vez en el plan y se
  mantiene consistente en toda la aplicación.
- Backend: Supabase como plataforma única, proveyendo base de datos Postgres, tiempo real,
  autenticación y almacenamiento de fotos. No se añade otro proveedor para funciones que
  Supabase ya cubre.
- Repositorio: único, sin monorepo ni servidor propio.

**Datos**:

- Retención: el histórico de rompecabezas armados se conserva de forma INDEFINIDA. No se
  implementa política de purga, expiración ni limpieza automática de datos. Cualquier borrado
  es explícito y solicitado por el usuario.
- Zona horaria: todos los timestamps del sistema se presentan en hora local de Perú
  (`America/Lima`, UTC-5). Perú no aplica horario de verano, por lo que el desfase es fijo y
  el código NO debe implementar lógica de cambio estacional. Las columnas usan `timestamptz`
  y el formateo aplica el offset fijo `-05:00`.
- Fotos subidas por usuarios: se almacenan en Supabase Storage con políticas de acceso
  explícitas. Nunca en el repositorio.

## Flujo de Desarrollo y Despliegue

- El despliegue a producción es automático mediante integración continua en Railway: cada
  push a la rama principal despliega.
- Consecuencia directa: **la rama principal DEBE estar siempre desplegable**. El trabajo en
  curso vive en ramas y entra por merge, no con commits rotos en la principal.
- Antes de mergear a la rama principal DEBEN pasar: build de producción sin errores, chequeo
  de tipos de TypeScript, y las pruebas unitarias de la lógica crítica.
- La configuración por entorno se hace mediante variables de entorno en Railway y Supabase,
  nunca mediante archivos de configuración commiteados.
- Las migraciones de base de datos se versionan en el repositorio y se aplican de forma
  explícita. Ningún cambio de esquema se hace solo desde la consola de Supabase.

## Git Workflow

El historial de Git es el registro de ejecución del plan. Un commit corresponde a una tarea.

- Al completar cada tarea individual de `tasks.md`, y ANTES de comenzar la siguiente, se DEBE
  ejecutar `git add` sobre los archivos de esa tarea y `git commit`.
- No se agrupan varias tareas en un solo commit, ni se deja una tarea a medio commitear.
- El mensaje de commit DEBE seguir Conventional Commits e incluir el ID de la tarea como
  scope: `<tipo>(<ID-tarea>): <descripción en imperativo>`.
  - Ejemplo: `feat(T012): implementar validacion de formulario de login`
- Tipos permitidos: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `style`, `perf`.
- La descripción va en imperativo y en minúscula, sin punto final.
- Un commit NUNCA incluye archivos con secretos ni valores de variables de entorno reales
  (ver Principio II).
- Si una tarea deja el build o los tipos rotos, se corrige dentro de esa misma tarea antes de
  commitear. La rama principal se mantiene siempre desplegable.

**Rationale**: Un commit por tarea hace que el avance sea auditable contra `tasks.md` y que
revertir un paso concreto sea trivial, sin arrastrar trabajo no relacionado.

## Governance

Esta constitución tiene precedencia sobre cualquier otra práctica, preferencia de estilo o
convención adoptada en el proyecto. Ante un conflicto, gana la constitución.

**Enmiendas**:

- Toda enmienda DEBE hacerse mediante una modificación de este archivo, con el Sync Impact
  Report actualizado en la cabecera.
- Una enmienda DEBE indicar qué principio cambia, por qué, y qué trabajo existente queda
  fuera de cumplimiento.
- Los principios marcados NO NEGOCIABLE no se relajan mediante excepción puntual: se enmiendan
  o se respetan.

**Versionado** (semántico):

- MAJOR: eliminación o redefinición incompatible de un principio o regla de gobernanza.
- MINOR: nuevo principio o sección, o expansión material de una guía existente.
- PATCH: aclaraciones, redacción, correcciones sin cambio semántico.

**Cumplimiento**:

- Todo plan de feature y toda revisión de cambios DEBE verificar el cumplimiento de estos
  principios.
- Toda complejidad añadida DEBE justificarse contra el Principio I. Sin justificación, se
  elimina.
- Una violación detectada en producción se trata como defecto y se corrige o se documenta
  explícitamente como deuda con su plan de remediación.

**Version**: 1.1.0 | **Ratified**: 2026-08-09 | **Last Amended**: 2026-08-09
