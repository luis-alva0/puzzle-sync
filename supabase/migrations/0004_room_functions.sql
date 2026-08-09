-- Funciones de sala (US1): latido, creación y unión.
--
-- Las tres van juntas porque crear una sala debe ser ATÓMICO: sala, piezas y jugador creador
-- se insertan en una sola transacción o no se inserta nada. Una sala a medio crear —con
-- piezas pero sin jugador, o al revés— sería un estado imposible de recuperar.
--
-- Todas son SECURITY DEFINER con search_path fijado: el cliente no tiene permiso de escritura
-- directa sobre ninguna tabla (ver 0002_rls_policies.sql).

-- ---------------------------------------------------------------------------
-- heartbeat — refresca la presencia del jugador.
--
-- Sostiene a la vez el estado conectado/desconectado (FR-007, FR-024) y el conteo de aforo
-- (FR-005). Se invoca cada 10 s contra una ventana de 30 s, así que tolera dos latidos
-- perdidos antes de dar a alguien por desconectado.
-- ---------------------------------------------------------------------------
create or replace function public.heartbeat(p_player_id uuid)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  update public.room_players
     set last_seen_at = now()
   where id = p_player_id
     and auth_user_id = (select auth.uid());
$$;

-- ---------------------------------------------------------------------------
-- create_room — crea la sala, materializa sus piezas y registra al creador.
--
-- Las posiciones iniciales llegan como jsonb desde la aplicación, calculadas por
-- lib/puzzle/geometry.ts. Se hace así para que la dispersión viva en un solo sitio —código
-- TypeScript puro y testeable— en lugar de duplicarla en PL/pgSQL.
--
-- El creador NO recibe ningún permiso especial (FR-004): su fila en room_players es idéntica
-- a la de cualquier otro jugador.
-- ---------------------------------------------------------------------------
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

  -- group_id = id: cada pieza empieza siendo su propio grupo de un solo elemento.
  insert into public.pieces (id, room_id, grid_row, grid_col, x, y, group_id)
  select
    piece_id,
    v_room_id,
    (item ->> 'gridRow')::smallint,
    (item ->> 'gridCol')::smallint,
    (item ->> 'x')::real,
    (item ->> 'y')::real,
    piece_id
  from jsonb_array_elements(p_pieces) as item,
       lateral (select gen_random_uuid() as piece_id) as generated;

  insert into public.room_players (room_id, auth_user_id, alias)
  values (v_room_id, p_auth_user_id, btrim(p_alias))
  returning id into v_player_id;

  return query select v_room_id, v_player_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- join_room — une a un jugador, o lo reconecta si ya tenía plaza.
--
-- La reconexión (FR-022) NO aplica el aforo: si el jugador ya tiene fila en esta sala, su
-- plaza es suya y vuelve aunque la sala figure llena. Sin esta excepción, alguien que pierde
-- la conexión podría quedar fuera de su propia partida mientras su plaza sigue contando.
--
-- Devuelve un estado en lugar de lanzar excepciones: la sala llena o inexistente son
-- resultados esperados, no errores, y el route handler los traduce al formato uniforme.
-- ---------------------------------------------------------------------------
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
  select id into v_player_id
    from public.room_players
   where room_id = v_room.id
     and auth_user_id = p_auth_user_id;

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

-- ---------------------------------------------------------------------------
-- Permisos. El cliente solo puede llamar a heartbeat; crear y unirse pasan por los route
-- handlers, que usan service_role.
-- ---------------------------------------------------------------------------
revoke all on function public.heartbeat(uuid)                                    from public;
revoke all on function public.create_room(uuid, uuid, text, char, jsonb)         from public;
revoke all on function public.join_room(char, uuid, text)                        from public;

grant execute on function public.heartbeat(uuid) to authenticated;
