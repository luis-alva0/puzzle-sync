-- 0011: cada pieza necesita su propio UUID.
--
-- `create_room` generaba los identificadores así:
--
--   from jsonb_array_elements(p_pieces) as item,
--        lateral (select gen_random_uuid() as piece_id) as generated
--
-- El `lateral` no referencia a `item`, así que la subconsulta NO está correlacionada y Postgres
-- la evalúa **una sola vez**: las N piezas salían con el mismo UUID. La segunda fila violaba
-- `pieces_pkey` y la función abortaba entera.
--
-- Consecuencia: ninguna sala podía crearse. No es un caso límite, es el camino principal de la
-- feature 001, y no se detectó porque las pruebas de integración nunca llegaron a ejecutarse
-- contra una base de datos.
--
-- La corrección usa un CTE `as materialized`. El `materialized` no es decorativo: sin él el
-- planificador puede aplanar la subconsulta y volver a evaluar `gen_random_uuid()` en cada
-- referencia, con lo que `id` y `group_id` de una misma fila saldrían distintos. Materializar lo
-- fija: una evaluación por fila, y el mismo valor en las dos columnas.
--
-- Se mantiene todo lo demás de 0009, incluido el incremento de `play_count` (FR-013 de 003).

create or replace function public.create_room(
  p_puzzle_id    uuid,
  p_auth_user_id uuid,
  p_alias        text,
  p_code         char(6),
  p_pieces       jsonb
)
returns table (room_id uuid, player_id uuid)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_room_id   uuid;
  v_player_id uuid;
begin
  insert into public.rooms (code, puzzle_id)
  values (p_code, p_puzzle_id)
  returning id into v_room_id;

  with scattered as materialized (
    select gen_random_uuid() as piece_id, item
    from jsonb_array_elements(p_pieces) as item
  )
  insert into public.pieces (id, room_id, grid_row, grid_col, x, y, group_id)
  select
    piece_id,
    v_room_id,
    (item ->> 'gridRow')::smallint,
    (item ->> 'gridCol')::smallint,
    (item ->> 'x')::real,
    (item ->> 'y')::real,
    piece_id                      -- cada pieza arranca sola en su propio grupo
  from scattered;

  insert into public.room_players (room_id, auth_user_id, alias)
  values (v_room_id, p_auth_user_id, btrim(p_alias))
  returning id into v_player_id;

  -- Feature 003: el contador de partidas del catálogo (FR-013).
  update public.puzzles
     set play_count = play_count + 1
   where id = p_puzzle_id;

  return query select v_room_id, v_player_id;
end;
$$;

revoke all     on function public.create_room(uuid, uuid, text, char, jsonb) from public;
grant  execute on function public.create_room(uuid, uuid, text, char, jsonb) to service_role;
