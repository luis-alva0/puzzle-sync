-- 0012: `room_id` era ambiguo dentro de join_room.
--
-- `returns table (..., room_id uuid, ...)` declara `room_id` como variable de salida de la
-- función. En el cuerpo había una consulta sin cualificar:
--
--   select id into v_player_id from public.room_players
--    where room_id = v_room.id;
--
-- Ahí `room_id` puede ser la variable de salida o la columna de `room_players`, y PL/pgSQL se
-- niega a adivinar: error 42702, `column reference "room_id" is ambiguous`.
--
-- Consecuencia: ningún jugador podía unirse a una sala salvo el creador. La ruta devolvía 500 en
-- cuanto alguien abría el enlace de invitación, que es el camino principal de la feature 001.
--
-- La corrección cualifica la columna. No se usa `#variable_conflict use_column` porque resolvería
-- este caso escondiendo los siguientes: cualificar deja el conflicto imposible de reintroducir sin
-- verlo.

create or replace function public.join_room(
  p_code         char(6),
  p_auth_user_id uuid,
  p_alias        text
)
returns table (
  found       boolean,
  full_room   boolean,
  reconnected boolean,
  room_id     uuid,
  player_id   uuid,
  puzzle_id   uuid
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_room      public.rooms%rowtype;
  v_player_id uuid;
  v_connected integer;
begin
  select * into v_room from public.rooms where code = p_code;

  if not found then
    return query select false, false, false, null::uuid, null::uuid, null::uuid;
    return;
  end if;

  -- ¿Ya tenía plaza en esta sala? Entonces es una reconexión.
  -- `room_players.room_id` cualificado: sin el prefijo colisiona con la salida `room_id`.
  select rp.id into v_player_id
    from public.room_players rp
   where rp.room_id = v_room.id
     and rp.auth_user_id = p_auth_user_id;

  if v_player_id is not null then
    update public.room_players
       set last_seen_at = now(),
           alias        = btrim(p_alias)
     where id = v_player_id;

    return query select true, false, true, v_room.id, v_player_id, v_room.puzzle_id;
    return;
  end if;

  -- Jugador nuevo: aquí sí se aplica el aforo, contando solo a los conectados.
  v_connected := public.connected_player_count(v_room.id);

  if v_connected >= v_room.max_players then
    return query select true, true, false, v_room.id, null::uuid, v_room.puzzle_id;
    return;
  end if;

  insert into public.room_players (room_id, auth_user_id, alias)
  values (v_room.id, p_auth_user_id, btrim(p_alias))
  returning id into v_player_id;

  return query select true, false, false, v_room.id, v_player_id, v_room.puzzle_id;
end;
$$;

revoke all     on function public.join_room(char, uuid, text) from public;
grant  execute on function public.join_room(char, uuid, text) to service_role;
