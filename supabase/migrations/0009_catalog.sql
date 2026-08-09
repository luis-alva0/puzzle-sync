-- Catálogo de rompecabezas (feature 003).
--
-- NO crea ninguna tabla. Añade una columna, reemplaza dos índices de 002, redefine una función
-- de 001 y restringe una política.
--
-- Orden obligatorio: la columna primero, porque los índices la referencian en su predicado.

-- ---------------------------------------------------------------------------
-- catalog_status — retirada reactiva por el administrador (FR-028).
--
-- Hace falta una columna propia porque las alternativas rompen garantías anteriores:
--   - poner visibility = 'private' cambiaría la decisión que el jugador tomó al crear, y 002
--     la declara inmutable (FR-029c);
--   - borrar la fila rompería el enlace del creador, que FR-030 exige que siga funcionando.
-- ---------------------------------------------------------------------------
alter table public.puzzles
  add column if not exists catalog_status text not null default 'visible';

alter table public.puzzles
  drop constraint if exists puzzles_catalog_status_valid;

alter table public.puzzles
  add constraint puzzles_catalog_status_valid check (catalog_status in ('visible', 'retired'));

comment on column public.puzzles.catalog_status is
  'visible | retired. Retirar saca la entrada del catálogo sin tocar visibility, sin borrar la '
  'fila y sin invalidar el enlace del creador.';

-- ---------------------------------------------------------------------------
-- Índices: se reemplazan los de 002, que no tenían desempate.
--
-- Sin `id` como segunda clave, dos filas con el mismo play_count —y con play_count = 0 en casi
-- todo el catálogo, eso es lo normal— pueden salir en orden distinto entre dos consultas. Con
-- paginación por keyset eso produce filas duplicadas en una página y ausentes en otra.
--
-- El predicado incluye `source <> 'seed'` para cubrir exactamente lo que consulta el listado:
-- la semilla es `public` desde 002, pero es andamiaje con data: URI, no contenido.
-- ---------------------------------------------------------------------------
drop index if exists puzzles_public_recent_idx;
drop index if exists puzzles_public_played_idx;

create index puzzles_public_recent_idx
  on public.puzzles (created_at desc, id desc)
  where visibility = 'public' and catalog_status = 'visible' and source <> 'seed';

create index puzzles_public_played_idx
  on public.puzzles (play_count desc, id desc)
  where visibility = 'public' and catalog_status = 'visible' and source <> 'seed';

-- ---------------------------------------------------------------------------
-- create_room — se redefine para incrementar el contador de partidas (FR-013).
--
-- Es una función de la feature 001. El incremento va DENTRO de la misma transacción que crea la
-- sala: con un disparador aparte existiría un instante en el que la sala existe y el contador no
-- lo refleja.
--
-- Se cuenta al crear la sala y no al completar la partida: una partida abandonada también señala
-- interés, y esperar al final subestimaría los rompecabezas difíciles.
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

  -- Feature 003: el contador de partidas del catálogo (FR-013).
  update public.puzzles
     set play_count = play_count + 1
   where id = p_puzzle_id;

  return query select v_room_id, v_player_id;
end;
$$;

revoke all on function public.create_room(uuid, uuid, text, char, jsonb) from public;

-- ---------------------------------------------------------------------------
-- Política de lectura: un rompecabezas retirado deja de ser legible desde el cliente.
--
-- Sigue siendo accesible por su enlace, porque GET /api/puzzles/[id] usa service_role y no pasa
-- por la política. Es la misma asimetría que 002 introdujo para los privados.
-- ---------------------------------------------------------------------------
drop policy if exists "puzzles publicos legibles por cualquiera" on public.puzzles;

create policy "puzzles publicos y visibles legibles por cualquiera"
  on public.puzzles for select
  to anon, authenticated
  using (visibility = 'public' and catalog_status = 'visible');
