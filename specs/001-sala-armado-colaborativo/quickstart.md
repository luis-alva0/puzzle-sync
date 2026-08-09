# Quickstart: Armado Colaborativo en Tiempo Real

**Feature**: 001-sala-armado-colaborativo

Guía para levantar la feature y validarla de extremo a extremo. No contiene código de
implementación; los detalles de contrato están en [contracts/](./contracts/) y el esquema en
[data-model.md](./data-model.md).

---

## Prerrequisitos

- Node.js 20+
- [Supabase CLI](https://supabase.com/docs/guides/cli) (para el entorno local y las migraciones)
- Docker en ejecución (lo necesita `supabase start`)
- Un proyecto de Supabase con **Anonymous Sign-In habilitado** en Authentication → Providers

## Variables de entorno

Crear `.env.local` a partir de `.env.example`. **Nunca** commitear valores reales
(Principio II de la constitución).

| Variable | Ámbito | Uso |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Cliente y servidor | URL del proyecto |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Cliente y servidor | Sesión anónima y Realtime |
| `SUPABASE_SERVICE_ROLE_KEY` | **Solo servidor** | Route handlers |

`SUPABASE_SERVICE_ROLE_KEY` no lleva prefijo `NEXT_PUBLIC_` y no puede importarse desde ningún
archivo que acabe en el bundle del cliente. Si aparece en `lib/supabase/client.ts` o en cualquier
componente, es un incidente: rotar la llave.

## Puesta en marcha

```bash
npm install
supabase start                 # Postgres + Realtime locales
supabase db push               # aplica supabase/migrations/
npm run seed                   # inserta 2–3 rompecabezas de prueba
npm run dev
```

---

## Escenarios de validación

Cada escenario mapea a historias de usuario del [spec](./spec.md). Requieren **dos navegadores
distintos** (o una ventana normal y otra de incógnito): dos pestañas del mismo perfil comparten
`localStorage` y por tanto la misma sesión anónima, lo que hace que ambas sean el mismo jugador.

### 1. Crear sala e invitar (US1)

1. Abrir `http://localhost:3000`, elegir un rompecabezas de la semilla, escribir el alias `Luis`.
2. Copiar el enlace `/rooms/{CODE}` que aparece.
3. Abrirlo en el segundo navegador, escribir el alias `Ana`.

**Esperado**: ambos ven la lista con `Luis` y `Ana`. El código tiene 6 caracteres y ninguno es
`0`, `O`, `1`, `I` ni `L`. Ninguno de los dos tiene acciones que el otro no tenga.

**Aforo**: repetir el paso 3 en un tercer y cuarto navegador; el quinto debe recibir el mensaje de
sala llena (`ROOM_FULL`).

### 2. Captura exclusiva y movimiento en vivo (US2)

1. Arrastrar una pieza en el navegador A.

**Esperado**: en B la pieza se mueve en vivo con retardo imperceptible (**SC-001**), aparece
marcada como ocupada con el alias `Luis`, y no responde a los intentos de arrastre de B.

2. Soltarla y tomarla desde B.

**Esperado**: B la captura sin problema.

**Carrera** — verificable de forma fiable con el test de integración, no a mano:

```bash
npm run test:db -- capture-race
```

Dispara dos `capture_piece` concurrentes sobre la misma pieza y comprueba que exactamente una
tiene éxito (**FR-013**).

### 3. Encaje y grupos (US3)

1. Arrastrar una pieza junto a su vecina correcta y soltarla dentro de la tolerancia.

**Esperado**: encajan y se alinean solas, en ambas pantallas.

2. Arrastrar cualquiera de las dos.

**Esperado**: se mueven juntas como un grupo. B ve lo mismo.

3. Con el grupo capturado por A, intentar tomar la otra pieza del grupo desde B.

**Esperado**: rechazado por ocupado (**FR-020**).

### 4. Reconexión sin pérdida (US4)

1. Con ambos dentro, cortar la red del navegador B (DevTools → Network → Offline).
2. Mover varias piezas desde A, incluido un encaje.
3. Volver a poner B online.

**Esperado**: B se reconecta solo, sin recargar ni reescribir el alias, y muestra el tablero al
día en menos de 5 segundos (**SC-004**). El indicador de conexión recorre
conectado → reconectando → conectado.

**Bloqueo huérfano**: repetir dejando a B con una pieza **capturada** al cortar la red. A no puede
tomarla al instante, pero pasados 30 segundos sí (**SC-007**). No hace falta esperar a que B
vuelva.

### 5. Completado e histórico (US5)

Con un rompecabezas de la semilla de 4 piezas, conectarlas todas.

**Esperado**: ambos navegadores reciben la notificación de completado a la vez, y

```sql
select started_at, completed_at, aliases from game_history order by completed_at desc limit 1;
```

devuelve una fila con ambas marcas de tiempo en hora de Perú (**FR-028**, **FR-030**).

---

## Pruebas

```bash
npm test          # unitarias puras, sin infraestructura
npm run test:db   # integración contra Supabase local (requiere supabase start)
```

`npm test` cubre emparejamiento de piezas, fusión de grupos, validación de alias, generación de
códigos y reconciliación de estado. `npm run test:db` cubre lo que no se puede simular: la
atomicidad de `capture_piece` bajo concurrencia y la expiración del arrendamiento (research R8).

---

## Despliegue

Push a la rama principal → Railway despliega. **Las migraciones no se aplican solas.** El orden
correcto siempre es:

```bash
supabase db push        # 1. esquema en producción
git push origin main    # 2. código
```

Invertirlo deja código nuevo hablando con un esquema viejo (research R9).

---

## Fallos habituales

| Síntoma | Causa probable |
|---|---|
| `UNAUTHENTICATED` en todos los endpoints | Anonymous Sign-In deshabilitado en el proyecto Supabase |
| El canal conecta pero no llegan eventos | Falta la política RLS sobre `realtime.messages`, o `pieces` no está en la publicación `supabase_realtime` |
| Los dos navegadores actúan como el mismo jugador | Misma sesión anónima: usar perfiles distintos, no dos pestañas |
| La pieza se mueve fluido pero vuelve atrás | Broadcast llegando sin su confirmación de Postgres Changes: revisar que el RPC de movimiento se esté llamando |
| Una pieza queda bloqueada para siempre | El heartbeat de refresco del arrendamiento no se está enviando durante el arrastre |
