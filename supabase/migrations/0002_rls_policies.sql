-- Row Level Security para PuzzleSync.
--
-- Principio II de la constitución: la protección de datos NO puede descansar en que una llave
-- sea difícil de adivinar. RLS habilitada en todas las tablas, denegación por defecto.
--
-- Modelo: el cliente solo LEE, y solo lo de su propia sala. Toda escritura pasa por route
-- handlers con service_role (que evita RLS) o por funciones SECURITY DEFINER. No se crea
-- ninguna política de INSERT, UPDATE o DELETE para anon/authenticated: su ausencia es la
-- denegación.

alter table public.puzzles      enable row level security;
alter table public.rooms        enable row level security;
alter table public.room_players enable row level security;
alter table public.pieces       enable row level security;
alter table public.game_history enable row level security;

-- ---------------------------------------------------------------------------
-- puzzles — lectura pública. Son datos de catálogo, sin información personal.
-- ---------------------------------------------------------------------------
create policy "puzzles legibles por cualquiera"
  on public.puzzles for select
  to anon, authenticated
  using (true);

-- ---------------------------------------------------------------------------
-- rooms — solo los miembros ven su sala.
-- ---------------------------------------------------------------------------
create policy "rooms legible por sus miembros"
  on public.rooms for select
  to authenticated
  using (public.is_room_member(id));

-- ---------------------------------------------------------------------------
-- room_players — un jugador ve a los demás de su sala, y a nadie más.
-- ---------------------------------------------------------------------------
create policy "room_players legible por miembros de la sala"
  on public.room_players for select
  to authenticated
  using (public.is_room_member(room_id));

-- ---------------------------------------------------------------------------
-- pieces — lectura para miembros. Habilita que el cliente reciba Postgres Changes.
-- ---------------------------------------------------------------------------
create policy "pieces legible por miembros de la sala"
  on public.pieces for select
  to authenticated
  using (public.is_room_member(room_id));

-- ---------------------------------------------------------------------------
-- game_history — sin acceso desde el cliente en esta feature.
-- La lectura del histórico es otra funcionalidad. Sin políticas = sin acceso.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- Realtime Authorization.
--
-- Sin esto, cualquiera con la llave anon podría suscribirse al canal de cualquier sala y
-- escuchar (o falsificar) el movimiento de piezas ajenas. El canal se llama `room:{code}`.
-- ---------------------------------------------------------------------------
create policy "canal de sala legible por sus miembros"
  on realtime.messages for select
  to authenticated
  using (
    exists (
      select 1
        from public.rooms r
        join public.room_players rp on rp.room_id = r.id
       where rp.auth_user_id = (select auth.uid())
         and realtime.topic() = 'room:' || r.code
    )
  );

create policy "canal de sala escribible por sus miembros"
  on realtime.messages for insert
  to authenticated
  with check (
    exists (
      select 1
        from public.rooms r
        join public.room_players rp on rp.room_id = r.id
       where rp.auth_user_id = (select auth.uid())
         and realtime.topic() = 'room:' || r.code
    )
  );

-- ---------------------------------------------------------------------------
-- Permisos de ejecución de los helpers.
-- ---------------------------------------------------------------------------
revoke all on function public.is_room_member(uuid)        from public;
revoke all on function public.connected_player_count(uuid) from public;
revoke all on function public.lock_lease()                 from public;

grant execute on function public.is_room_member(uuid)         to authenticated;
grant execute on function public.connected_player_count(uuid) to authenticated, anon;
grant execute on function public.lock_lease()                 to authenticated, anon;
