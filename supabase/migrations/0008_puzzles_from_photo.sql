-- Extensión de `puzzles` para la creación desde foto (feature 002).
--
-- NO crea la tabla: la creó 0001_initial_schema.sql en forma mínima, precisamente para que esta
-- feature la extendiera. Recrearla rompería la clave foránea desde `rooms` y borraría las salas
-- en curso.
--
-- Orden obligatorio: ALTER TABLE → UPDATE de la semilla → índices → bucket → política.

-- ---------------------------------------------------------------------------
-- Columnas nuevas.
-- ---------------------------------------------------------------------------
alter table public.puzzles
  -- La opción que eligió el jugador. NULL = la fila no nació de elegir entre las cinco opciones,
  -- que es el caso de la semilla y de los curados de 003.
  --
  -- Admite NULL a propósito: la semilla de 001 incluye un rompecabezas de 2x2 = 4 piezas, y 4 no
  -- es una de las cinco opciones. Copiar `piece_count` aquí abortaría esta misma migración contra
  -- su propio CHECK. Ese rompecabezas es el que 001 usa para validar el completado sin armar 100
  -- piezas a mano, así que no se puede sustituir por uno de 20 para encajar en la restricción.
  add column if not exists nominal_piece_count smallint,
  add column if not exists visibility          text        not null default 'private',
  add column if not exists storage_path        text,
  add column if not exists play_count          integer     not null default 0,
  add column if not exists source              text        not null default 'user_photo';

alter table public.puzzles
  drop constraint if exists puzzles_nominal_piece_count_valid,
  drop constraint if exists puzzles_visibility_valid,
  drop constraint if exists puzzles_source_valid,
  drop constraint if exists puzzles_play_count_non_negative;

alter table public.puzzles
  add constraint puzzles_nominal_piece_count_valid check (
    nominal_piece_count is null or nominal_piece_count in (20, 50, 100, 200, 500)
  ),
  add constraint puzzles_visibility_valid check (visibility in ('private', 'public')),
  add constraint puzzles_source_valid      check (source in ('seed', 'user_photo', 'curated')),
  add constraint puzzles_play_count_non_negative check (play_count >= 0);

comment on column public.puzzles.nominal_piece_count is
  'Opción elegida por el jugador (20/50/100/200/500). NULL cuando la fila no nació de una '
  'elección: semilla y contenido curado. La cantidad real está en piece_count y puede diferir.';

comment on column public.puzzles.storage_path is
  'Ruta del objeto en el bucket puzzle-images. NULL cuando la imagen no está en Storage, como '
  'en la semilla, que usa data: URI en image_url.';

-- ---------------------------------------------------------------------------
-- Filas existentes de la semilla de 001.
-- Deben actualizarse antes de que nadie asuma los valores por defecto: `visibility` habría
-- quedado en 'private' y `source` en 'user_photo', que es falso para las tres.
-- ---------------------------------------------------------------------------
update public.puzzles
   set visibility          = 'public',
       source              = 'seed',
       nominal_piece_count = null,
       storage_path        = null
 where source = 'user_photo'
   and storage_path is null
   and image_url like 'data:%';

-- ---------------------------------------------------------------------------
-- Índices para el catálogo (feature 003). Nacen aquí porque las columnas nacen aquí.
-- ---------------------------------------------------------------------------
create index if not exists puzzles_public_recent_idx
  on public.puzzles (created_at desc)
  where visibility = 'public';

create index if not exists puzzles_public_played_idx
  on public.puzzles (play_count desc)
  where visibility = 'public';

-- ---------------------------------------------------------------------------
-- Bucket de imágenes.
--
-- Privado de extremo a extremo y SIN POLÍTICA DE LECTURA. No es una omisión: todo acceso pasa
-- por una URL firmada que emite el servidor en cada lectura (research R5). Añadir aquí una
-- política de lectura reabriría el acceso directo a las fotos personales.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'puzzle-images',
  'puzzle-images',
  false,
  10485760,                                   -- 10 MB, alineado con FR-005
  array['image/jpeg', 'image/png']
)
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ---------------------------------------------------------------------------
-- Restringir la lectura de `puzzles`.
--
-- 001 dejó una política que permitía leer toda la tabla, correcta cuando solo contenía
-- rompecabezas de prueba. Con fotos personales dentro, permitiría enumerar los privados: el UUID
-- protege el enlace, no la tabla.
--
-- Los privados se sirven por GET /api/puzzles/[id], que usa service_role y comprueba el UUID de
-- la ruta.
-- ---------------------------------------------------------------------------
drop policy if exists "puzzles legibles por cualquiera" on public.puzzles;

create policy "puzzles publicos legibles por cualquiera"
  on public.puzzles for select
  to anon, authenticated
  using (visibility = 'public');
