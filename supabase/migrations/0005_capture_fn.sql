-- capture_piece — captura exclusiva de una pieza y todo su grupo (FR-010, FR-013, FR-020).
--
-- DESVIACIÓN DOCUMENTADA respecto de research R5:
--
-- R5 proponía resolver la carrera con un único UPDATE condicional, apoyándose en que un
-- UPDATE es atómico. Eso es cierto cuando el predicado mira columnas de la PROPIA fila que se
-- actualiza: bajo READ COMMITTED, la segunda transacción reevalúa el WHERE contra la versión
-- nueva de la fila (EvalPlanQual) y falla correctamente.
--
-- Aquí el predicado es un NOT EXISTS sobre el conjunto del grupo, no sobre la fila. La
-- reevaluación de subconsultas en EvalPlanQual usa el snapshot original, de modo que dos
-- capturas simultáneas sobre un grupo de varias piezas podrían ambas ver el grupo libre.
--
-- Se bloquea explícitamente el grupo con SELECT ... FOR UPDATE antes de comprobar nada. La
-- segunda transacción espera ahí y, al continuar, lee la versión ya confirmada. La contención
-- es por grupo —unas pocas filas— así que el coste es despreciable frente a la garantía.

create or replace function public.capture_piece(
  p_piece_id  uuid,
  p_player_id uuid
)
returns table (success boolean, held_by_alias text, piece_ids uuid[])
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_group_id uuid;
  v_room_id  uuid;
  v_ids      uuid[];
  v_holder   text;
begin
  select group_id, room_id
    into v_group_id, v_room_id
    from public.pieces
   where id = p_piece_id;

  if v_group_id is null then
    raise exception 'La pieza % no existe', p_piece_id using errcode = 'P0002';
  end if;

  -- El jugador debe pertenecer a la sala Y ser quien dice ser. Sin esto, cualquiera con un
  -- room_players.id ajeno podría capturar en su nombre.
  if not exists (
    select 1
      from public.room_players rp
     where rp.id = p_player_id
       and rp.room_id = v_room_id
       and rp.auth_user_id = (select auth.uid())
  ) then
    return query select false, null::text, '{}'::uuid[];
    return;
  end if;

  -- Serializa a los competidores por el mismo grupo. Ver la nota de cabecera.
  perform 1
     from public.pieces
    where room_id = v_room_id
      and group_id = v_group_id
    for update;

  -- ¿Lo tiene otro jugador con arrendamiento vigente? Un arrendamiento vencido no cuenta:
  -- así se libera solo la pieza de quien se desconectó, sin proceso de limpieza (FR-015).
  select rp.alias
    into v_holder
    from public.pieces p
    join public.room_players rp on rp.id = p.captured_by
   where p.room_id = v_room_id
     and p.group_id = v_group_id
     and p.captured_by is not null
     and p.captured_by <> p_player_id
     and p.captured_at > now() - public.lock_lease()
   limit 1;

  if v_holder is not null then
    return query select false, v_holder, '{}'::uuid[];
    return;
  end if;

  -- Recapturar algo que ya se posee es idempotente: solo refresca el arrendamiento.
  with updated as (
    update public.pieces p
       set captured_by = p_player_id,
           captured_at = now(),
           updated_at  = now()
     where p.room_id  = v_room_id
       and p.group_id = v_group_id
    returning p.id
  )
  select array_agg(id) into v_ids from updated;

  return query select true, null::text, coalesce(v_ids, '{}'::uuid[]);
end;
$$;

revoke all on function public.capture_piece(uuid, uuid) from public;
grant execute on function public.capture_piece(uuid, uuid) to authenticated;
