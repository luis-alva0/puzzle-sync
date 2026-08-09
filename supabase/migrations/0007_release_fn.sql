-- release_piece — soltar una pieza: posición final, encaje, fusión en cascada, liberación del
-- bloqueo y detección de completado.
--
-- Cubre FR-014 (liberar al soltar), FR-016 (encaje automático), FR-018 (fusión de grupos),
-- FR-019 (sin encaje, la pieza se queda donde la soltaron), FR-027 y FR-028 (completado e
-- histórico).
--
-- El completado se resuelve aquí y no en un disparador aparte porque debe ocurrir en la MISMA
-- transacción que la última fusión: si la sala se marcase como completada después, existiría
-- un instante en el que el rompecabezas está armado y el histórico no lo refleja, y un fallo
-- justo ahí lo perdería. La restricción UNIQUE sobre game_history.room_id, con ON CONFLICT DO
-- NOTHING, hace la escritura idempotente.
--
-- Esta función es la ÚNICA implementación del algoritmo de emparejamiento. No existe una copia
-- en TypeScript: una segunda implementación de la misma regla se desincroniza en cuanto se
-- toca una de las dos, y probar la copia no dice nada sobre la que se ejecuta. Su cobertura
-- está en tests/integration/merge-race.test.ts.

-- Constantes de geometría, alineadas con lib/puzzle/geometry.ts.
create or replace function public.piece_size()
returns real language sql immutable parallel safe as $$ select 100.0::real $$;

create or replace function public.snap_tolerance()
returns real language sql immutable parallel safe as $$ select 25.0::real $$;

comment on function public.snap_tolerance() is
  'Tolerancia de encaje en unidades de tablero. Debe coincidir con SNAP_TOLERANCE en '
  'lib/puzzle/geometry.ts (PIECE_SIZE * SNAP_TOLERANCE_FRACTION).';

create or replace function public.release_piece(
  p_piece_id  uuid,
  p_player_id uuid,
  p_x         real,
  p_y         real
)
returns table (merged_group_ids uuid[], final_group_id uuid, room_completed boolean)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_group_id   uuid;
  v_room_id    uuid;
  v_merged     uuid[] := '{}';
  v_target     uuid;
  v_dx         real;
  v_dy         real;
  v_iteration  integer := 0;
  v_groups     integer;
  v_completed  boolean := false;
  v_room       public.rooms%rowtype;
begin
  select p.group_id, p.room_id
    into v_group_id, v_room_id
    from public.pieces p
   where p.id = p_piece_id
     and p.captured_by = p_player_id
     and p.captured_at > now() - public.lock_lease();

  if v_group_id is null then
    return query select '{}'::uuid[], null::uuid, false;
    return;
  end if;

  if not exists (
    select 1
      from public.room_players rp
     where rp.id = p_player_id
       and rp.auth_user_id = (select auth.uid())
  ) then
    return query select '{}'::uuid[], null::uuid, false;
    return;
  end if;

  -- 1. Posición final absoluta del grupo.
  perform public.move_piece(p_piece_id, p_player_id, p_x, p_y);

  -- 2. Encaje en cascada.
  loop
    v_iteration := v_iteration + 1;
    exit when v_iteration > 64;

    select a.group_id,
           (a.x + (m.grid_col - a.grid_col) * public.piece_size()) - m.x,
           (a.y + (m.grid_row - a.grid_row) * public.piece_size()) - m.y
      into v_target, v_dx, v_dy
      from public.pieces m
      join public.pieces a
        on a.room_id = m.room_id
       and a.group_id <> m.group_id
       and abs(a.grid_row - m.grid_row) + abs(a.grid_col - m.grid_col) = 1
     where m.room_id  = v_room_id
       and m.group_id = v_group_id
       and abs((a.x + (m.grid_col - a.grid_col) * public.piece_size()) - m.x)
             <= public.snap_tolerance()
       and abs((a.y + (m.grid_row - a.grid_row) * public.piece_size()) - m.y)
             <= public.snap_tolerance()
     order by
       (((a.x + (m.grid_col - a.grid_col) * public.piece_size()) - m.x) *
        ((a.x + (m.grid_col - a.grid_col) * public.piece_size()) - m.x)) +
       (((a.y + (m.grid_row - a.grid_row) * public.piece_size()) - m.y) *
        ((a.y + (m.grid_row - a.grid_row) * public.piece_size()) - m.y)) asc,
       a.id asc
     limit 1;

    exit when not found;

    update public.pieces p
       set x          = p.x + v_dx,
           y          = p.y + v_dy,
           group_id   = v_target,
           updated_at = now()
     where p.room_id  = v_room_id
       and p.group_id = v_group_id;

    v_merged   := v_merged || v_group_id;
    v_group_id := v_target;
  end loop;

  -- 3. Liberar el bloqueo.
  update public.pieces p
     set captured_by = null,
         captured_at = null,
         updated_at  = now()
   where p.room_id  = v_room_id
     and p.group_id = v_group_id;

  -- 4. ¿Quedó todo en un único grupo? Entonces el rompecabezas está completo.
  select count(distinct group_id) into v_groups
    from public.pieces
   where room_id = v_room_id;

  if v_groups = 1 then
    select * into v_room from public.rooms where id = v_room_id;

    -- Solo la primera vez: `completed` es un estado terminal.
    if v_room.status <> 'completed' then
      update public.rooms
         set status       = 'completed',
             completed_at = now()
       where id = v_room_id;

      insert into public.game_history (room_id, puzzle_id, aliases, started_at, completed_at)
      select v_room_id,
             v_room.puzzle_id,
             coalesce(array_agg(rp.alias order by rp.joined_at), '{}'),
             v_room.started_at,
             now()
        from public.room_players rp
       where rp.room_id = v_room_id
      on conflict (room_id) do nothing;

      v_completed := true;
    end if;
  end if;

  return query select v_merged, v_group_id, v_completed;
end;
$$;

revoke all on function public.release_piece(uuid, uuid, real, real) from public;
revoke all on function public.piece_size()     from public;
revoke all on function public.snap_tolerance() from public;

grant execute on function public.release_piece(uuid, uuid, real, real) to authenticated;
grant execute on function public.piece_size()     to authenticated, anon;
grant execute on function public.snap_tolerance() to authenticated, anon;
