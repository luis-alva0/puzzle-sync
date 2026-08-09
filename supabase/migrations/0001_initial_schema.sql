-- Esquema inicial de PuzzleSync — feature 001, armado colaborativo en tiempo real.
-- Ver specs/001-sala-armado-colaborativo/data-model.md
--
-- Nota sobre nombres: `row`, `rows` y `cols` son palabras reservadas en PostgreSQL, así que
-- las columnas de la cuadrícula usan el prefijo `grid_` en lugar de necesitar comillas en cada
-- consulta.

-- ---------------------------------------------------------------------------
-- Constante compartida: duración del arrendamiento de un bloqueo de pieza.
-- Vive en una función para que el valor exista en un solo sitio (research R2).
-- ---------------------------------------------------------------------------
create or replace function public.lock_lease()
returns interval
language sql
immutable
parallel safe
as $$ select interval '30 seconds' $$;

comment on function public.lock_lease() is
  'Duración del arrendamiento de la captura de una pieza. Pasado este tiempo sin refresco, '
  'el bloqueo se considera vencido y otro jugador puede capturar la pieza. Evita necesitar '
  'un proceso en segundo plano que libere bloqueos huérfanos (FR-015, SC-007).';

-- ---------------------------------------------------------------------------
-- puzzles
-- Forma mínima. Las features 002 y 003 la extenderán (recorte, visibilidad, contador).
-- ---------------------------------------------------------------------------
create table public.puzzles (
  id          uuid primary key default gen_random_uuid(),
  image_url   text        not null,
  grid_rows   smallint    not null check (grid_rows > 0),
  grid_cols   smallint    not null check (grid_cols > 0),
  piece_count smallint    not null generated always as (grid_rows * grid_cols) stored,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- rooms
-- ---------------------------------------------------------------------------
create table public.rooms (
  id           uuid        primary key default gen_random_uuid(),
  code         char(6)     not null unique,
  puzzle_id    uuid        not null references public.puzzles (id),
  max_players  smallint    not null default 4 check (max_players between 1 and 4),
  status       text        not null default 'in_progress'
                           check (status in ('in_progress', 'completed')),
  started_at   timestamptz not null default now(),
  completed_at timestamptz,

  -- Una sala completada siempre tiene marca de finalización, y viceversa.
  constraint rooms_completed_at_matches_status check (
    (status = 'completed' and completed_at is not null) or
    (status = 'in_progress' and completed_at is null)
  ),

  -- Alfabeto sin caracteres ambiguos, para poder dictar el código de palabra.
  constraint rooms_code_alphabet check (code ~ '^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$')
);

-- ---------------------------------------------------------------------------
-- room_players
-- El estado conectado/desconectado es DERIVADO de last_seen_at, no una columna.
-- ---------------------------------------------------------------------------
create table public.room_players (
  id           uuid        primary key default gen_random_uuid(),
  room_id      uuid        not null references public.rooms (id) on delete cascade,
  auth_user_id uuid        not null references auth.users (id) on delete cascade,
  alias        text        not null check (length(btrim(alias)) between 2 and 20),
  last_seen_at timestamptz not null default now(),
  joined_at    timestamptz not null default now(),

  -- Un jugador ocupa una sola plaza por sala. Es lo que hace que reconectar reutilice
  -- la fila en lugar de crear una nueva (FR-022).
  constraint room_players_unique_per_room unique (room_id, auth_user_id)
);

create index room_players_room_last_seen_idx
  on public.room_players (room_id, last_seen_at desc);

-- ---------------------------------------------------------------------------
-- pieces
-- ---------------------------------------------------------------------------
create table public.pieces (
  id          uuid        primary key default gen_random_uuid(),
  room_id     uuid        not null references public.rooms (id) on delete cascade,
  grid_row    smallint    not null,
  grid_col    smallint    not null,
  x           real        not null,
  y           real        not null,
  group_id    uuid        not null,
  captured_by uuid        references public.room_players (id) on delete set null,
  captured_at timestamptz,
  updated_at  timestamptz not null default now(),

  constraint pieces_unique_cell unique (room_id, grid_row, grid_col),

  -- captured_by y captured_at existen o no existen juntos. Nunca uno sin el otro.
  constraint pieces_capture_pair check (
    (captured_by is null and captured_at is null) or
    (captured_by is not null and captured_at is not null)
  )
);

create index pieces_room_group_idx on public.pieces (room_id, group_id);
create index pieces_room_idx       on public.pieces (room_id);

-- ---------------------------------------------------------------------------
-- game_history
-- Retención indefinida (FR-029). La FK a rooms es RESTRICT a propósito: borrar una sala
-- no puede llevarse su histórico por delante.
-- ---------------------------------------------------------------------------
create table public.game_history (
  id           uuid        primary key default gen_random_uuid(),
  room_id      uuid        not null unique references public.rooms (id) on delete restrict,
  puzzle_id    uuid        not null references public.puzzles (id) on delete restrict,
  aliases      text[]      not null,
  started_at   timestamptz not null,
  completed_at timestamptz not null,

  constraint game_history_ends_after_start check (completed_at >= started_at)
);

create index game_history_completed_at_idx on public.game_history (completed_at desc);

-- ---------------------------------------------------------------------------
-- Helpers de estado derivado. Se usan en políticas RLS y en las funciones de negocio.
-- ---------------------------------------------------------------------------

-- ¿Es el usuario autenticado miembro de esta sala?
create or replace function public.is_room_member(p_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
      from public.room_players rp
     where rp.room_id = p_room_id
       and rp.auth_user_id = (select auth.uid())
  )
$$;

-- Jugadores conectados en una sala: los que han latido dentro de la ventana del arrendamiento.
create or replace function public.connected_player_count(p_room_id uuid)
returns integer
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select count(*)::integer
    from public.room_players rp
   where rp.room_id = p_room_id
     and rp.last_seen_at > now() - public.lock_lease()
$$;
