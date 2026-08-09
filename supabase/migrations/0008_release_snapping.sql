-- release_piece — versión completa (US3): posición final, encaje, fusión en cascada y
-- liberación del bloqueo. Reemplaza la forma mínima de 0007_release_fn.sql.
--
-- Implementa FR-016 (encaje automático), FR-018 (fusión de grupos) y FR-019 (si no encaja,
-- la pieza se queda donde la soltaron).
--
-- La geometría replica lib/puzzle/matching.ts. Ambos DEBEN coincidir: si el cliente considera
-- que dos piezas encajan y el servidor no, el jugador ve la pieza saltar de vuelta.

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
  v_group_id  uuid;
  v_room_id   uuid;
  v_merged    uuid[] := '{}';
  v_target    uuid;
  v_dx        real;
  v_dy        real;
  v_iteration integer := 0;
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

  -- 1. Posición final absoluta del grupo (idempotente, igual que move_piece).
  perform public.move_piece(p_piece_id, p_player_id, p_x, p_y);

  -- 2. Encaje en cascada: al unir dos grupos, el resultado puede tocar a un tercero.
  --    El tope de iteraciones evita que un estado inconsistente cuelgue la transacción.
  loop
    v_iteration := v_iteration + 1;
    exit when v_iteration > 64;

    -- Mejor candidato: vecino ortogonal de otro grupo, dentro de la tolerancia. Se ordena por
    -- distancia y se desempata por id para que el resultado sea DETERMINISTA: dos clientes
    -- que provoquen la misma fusión deben obtener exactamente el mismo tablero (SC-008).
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

    -- Alinea el grupo entrante y lo absorbe. Las piezas del grupo destino no se mueven: el
    -- que ya estaba colocado se queda donde está, y se ajusta el recién soltado.
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

  -- 3. Liberar el bloqueo. Si no hubo encaje, la pieza queda donde la soltaron (FR-019).
  update public.pieces p
     set captured_by = null,
         captured_at = null,
         updated_at  = now()
   where p.room_id  = v_room_id
     and p.group_id = v_group_id;

  return query select v_merged, v_group_id, false;
end;
$$;

revoke all on function public.release_piece(uuid, uuid, real, real) from public;
revoke all on function public.piece_size()     from public;
revoke all on function public.snap_tolerance() from public;

grant execute on function public.release_piece(uuid, uuid, real, real) to authenticated;
grant execute on function public.piece_size()     to authenticated, anon;
grant execute on function public.snap_tolerance() to authenticated, anon;
