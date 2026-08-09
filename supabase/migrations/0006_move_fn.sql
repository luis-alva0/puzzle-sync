-- move_piece — persiste la posición del grupo durante el arrastre y refresca el arrendamiento.
--
-- Idempotencia (FR-025): `p_x`/`p_y` son la posición ABSOLUTA de la pieza ancla, no un delta.
-- El desplazamiento del resto del grupo se deriva de esa posición absoluta, así que aplicar
-- dos veces el mismo mensaje deja el tablero exactamente igual. Es lo que hace inofensivo que
-- un reintento de red duplique una llamada.
--
-- Es un no-op silencioso si el jugador no posee el grupo con arrendamiento vigente: un cliente
-- rezagado no puede mover piezas ajenas, y tampoco tiene sentido devolverle un error por algo
-- que ya no controla.

create or replace function public.move_piece(
  p_piece_id  uuid,
  p_player_id uuid,
  p_x         real,
  p_y         real
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_group_id uuid;
  v_room_id  uuid;
  v_dx       real;
  v_dy       real;
begin
  select p.group_id, p.room_id, p_x - p.x, p_y - p.y
    into v_group_id, v_room_id, v_dx, v_dy
    from public.pieces p
   where p.id = p_piece_id
     and p.captured_by = p_player_id
     and p.captured_at > now() - public.lock_lease();

  if v_group_id is null then
    return;
  end if;

  if not exists (
    select 1
      from public.room_players rp
     where rp.id = p_player_id
       and rp.auth_user_id = (select auth.uid())
  ) then
    return;
  end if;

  update public.pieces p
     set x           = p.x + v_dx,
         y           = p.y + v_dy,
         captured_at = now(),
         updated_at  = now()
   where p.room_id  = v_room_id
     and p.group_id = v_group_id;
end;
$$;

revoke all on function public.move_piece(uuid, uuid, real, real) from public;
grant execute on function public.move_piece(uuid, uuid, real, real) to authenticated;
