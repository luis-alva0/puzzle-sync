-- Publicación de Realtime.
--
-- `pieces` y `rooms` son la fuente autoritativa de cambios en vivo (research R4):
--   - pieces → capturas concedidas, posiciones finales, fusiones de grupo, liberaciones
--   - rooms  → transición de status a 'completed' (FR-027)
--
-- El movimiento fluido durante el arrastre NO pasa por aquí: viaja por Broadcast, que no
-- toca la base de datos.

alter publication supabase_realtime add table public.pieces;
alter publication supabase_realtime add table public.rooms;

-- REPLICA IDENTITY FULL para que los eventos de UPDATE incluyan el estado previo además del
-- nuevo. El cliente lo necesita para saber si un cambio liberó una pieza que él tenía.
alter table public.pieces replica identity full;
alter table public.rooms  replica identity full;
