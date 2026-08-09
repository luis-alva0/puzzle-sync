-- 0010: privilegios de tabla y de función que faltaban.
--
-- Las migraciones anteriores definieron políticas RLS y funciones, pero nunca concedieron
-- privilegios de tabla. Se dio por supuesto que los privilegios por defecto de Supabase incluían
-- el DML, y en esta imagen de Postgres NO: `\ddp` concede `Dxt` (TRUNCATE, REFERENCES, TRIGGER)
-- a anon, authenticated y service_role, pero ni SELECT ni INSERT/UPDATE/DELETE.
--
-- El síntoma era `permission denied for table puzzles` en todo. No es RLS —RLS filtra filas y
-- devuelve un conjunto vacío—, es el GRANT anterior a RLS. Habría fallado igual en producción.
--
-- Criterio: **el GRANT es el portero grueso, RLS es el fino.** Se concede exactamente lo que cada
-- rol ejerce, ni un privilegio más.

-- ---------------------------------------------------------------------------
-- authenticated: solo lectura, y solo donde hay una política que la respalde.
-- ---------------------------------------------------------------------------
-- Ninguna escritura pasa por aquí: las cuatro políticas son SELECT y todo cambio va por funciones
-- SECURITY DEFINER, que corren como `postgres` y no dependen de estos privilegios.
--
-- Hace falta aunque el navegador nunca llame a `.from()`: Realtime evalúa `postgres_changes` como
-- este rol, y sin SELECT sobre `pieces` y `rooms` no llegaría ninguna confirmación al tablero.
grant select on public.rooms        to authenticated;
grant select on public.room_players to authenticated;
grant select on public.pieces       to authenticated;
grant select on public.puzzles      to authenticated;

-- ---------------------------------------------------------------------------
-- anon: el catálogo público y nada más.
-- ---------------------------------------------------------------------------
-- La política de `puzzles` ya nombra a `anon`, y una política para un rol sin privilegio es letra
-- muerta. RLS la restringe a `visibility = 'public'` y `catalog_status = 'visible'`.
grant select on public.puzzles to anon;

-- ---------------------------------------------------------------------------
-- service_role: DML completo. Solo servidor.
-- ---------------------------------------------------------------------------
-- Este rol ya se salta RLS por definición, así que negarle privilegios de tabla no aportaría
-- seguridad: lo que lo contiene es que la llave nunca sale del servidor y que cada consulta
-- escribe sus propios filtros (`app/api/catalog/route.ts` es el caso claro).
grant select, insert, update, delete on public.rooms        to service_role;
grant select, insert, update, delete on public.room_players to service_role;
grant select, insert, update, delete on public.pieces       to service_role;
grant select, insert, update, delete on public.puzzles      to service_role;
grant select, insert, update, delete on public.game_history to service_role;

-- ---------------------------------------------------------------------------
-- create_room y join_room: revocadas de `public` y nunca concedidas a nadie.
-- ---------------------------------------------------------------------------
-- 0004 las revocó y 0009 volvió a revocar `create_room` tras redefinirla, pero ningún `grant`
-- siguió. Quedaron ejecutables solo por `postgres`, y las llaman las rutas de API con la llave de
-- servicio. No se conceden a `authenticated`: crear y unirse pasan por el endpoint, que es donde
-- se valida el alias y el aforo de la sala.
grant execute on function public.create_room(uuid, uuid, text, char, jsonb) to service_role;
grant execute on function public.join_room(char, uuid, text)                to service_role;

-- `heartbeat` la llama el navegador (`lib/realtime/presence.ts`) y ya la tiene concedida en 0004.
