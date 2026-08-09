-- Rompecabezas de prueba para desarrollo local.
--
-- Los identificadores son fijos para que los enlaces de prueba no cambien entre reseteos de la
-- base de datos. Las imágenes son SVG generados al vuelo (data URI): sin binarios en el
-- repositorio y sin depender de Storage para poder desarrollar.
--
-- El rompecabezas de 4 piezas existe para validar el completado sin tener que armar 100 piezas
-- a mano (escenario 5 de quickstart.md).

-- `visibility` y `source` se declaran explícitamente: sus valores por defecto (`private` y
-- `user_photo`) son falsos para la semilla, y un `db reset` la reetiquetaría mal.
-- `nominal_piece_count` se deja en NULL: ninguna de estas filas nació de elegir entre las cinco
-- opciones, y el 2x2 de 4 piezas ni siquiera es una de ellas.
insert into public.puzzles (id, image_url, grid_rows, grid_cols, visibility, source)
values
  -- 4 piezas: el mínimo para probar encaje, fusión en cascada y completado.
  (
    '11111111-1111-4111-8111-111111111111',
    'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="%236c8cff"/><stop offset="1" stop-color="%23ff6bb5"/></linearGradient></defs><rect width="200" height="200" fill="url(%23g)"/><circle cx="100" cy="100" r="60" fill="none" stroke="white" stroke-width="8"/></svg>',
    2,
    2,
    'public',
    'seed'
  ),
  -- 20 piezas: tamaño cómodo para probar el armado colaborativo de verdad.
  (
    '22222222-2222-4222-8222-222222222222',
    'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 400"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="%234ade80"/><stop offset="1" stop-color="%236c8cff"/></linearGradient></defs><rect width="500" height="400" fill="url(%23g)"/><path d="M0 300 L125 180 L250 260 L375 120 L500 220 L500 400 L0 400 Z" fill="%2311131a" opacity="0.55"/><circle cx="420" cy="80" r="42" fill="%23fbbf24"/></svg>',
    4,
    5,
    'public',
    'seed'
  ),
  -- 100 piezas: para medir rendimiento del canvas y latencia con el tablero cargado.
  (
    '33333333-3333-4333-8333-333333333333',
    'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000"><defs><radialGradient id="g"><stop offset="0" stop-color="%23fbbf24"/><stop offset="1" stop-color="%23ff6b6b"/></radialGradient></defs><rect width="1000" height="1000" fill="%2311131a"/><circle cx="500" cy="500" r="400" fill="url(%23g)"/><g stroke="white" stroke-width="3" opacity="0.35" fill="none"><circle cx="500" cy="500" r="300"/><circle cx="500" cy="500" r="200"/><circle cx="500" cy="500" r="100"/></g></svg>',
    10,
    10,
    'public',
    'seed'
  )
on conflict (id) do update
  set visibility = excluded.visibility,
      source     = excluded.source;
