-- release_piece — FORMA MÍNIMA (US2): fija la posición final y libera el bloqueo.
--
-- Satisface FR-014 (la pieza queda libre al soltarla, sin esperar a que venza el
-- arrendamiento) y FR-019 (si no encaja con nada, se queda donde la soltaron).
--
-- La detección de encaje y la fusión de grupos NO están aquí: llegan en US3, que reemplaza
-- esta función (0008_release_snapping.sql). El reparto es deliberado — sin una forma de
-- soltar, US2 no sería demostrable de forma independiente: cada pieza tomada quedaría
-- bloqueada 30 segundos.
--
-- La firma y el tipo de retorno ya son los definitivos, para que el cliente escrito en US2 no
-- tenga que cambiar cuando US3 amplíe el cuerpo.

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
  v_group_id uuid;
  v_room_id  uuid;
begin
  -- Solo puede soltar quien tiene el grupo con arrendamiento vigente.
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

  -- Posición final absoluta, con el mismo criterio idempotente que move_piece.
  perform public.move_piece(p_piece_id, p_player_id, p_x, p_y);

  update public.pieces p
     set captured_by = null,
         captured_at = null,
         updated_at  = now()
   where p.room_id  = v_room_id
     and p.group_id = v_group_id;

  return query select '{}'::uuid[], v_group_id, false;
end;
$$;

revoke all on function public.release_piece(uuid, uuid, real, real) from public;
grant execute on function public.release_piece(uuid, uuid, real, real) to authenticated;
