import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { layoutPieces } from '@/lib/puzzle/board-layout';
import { generateRoomCode } from '@/lib/rooms/code';

/**
 * Utilidades para las pruebas de integración contra Supabase local.
 *
 * Estas pruebas verifican lo único que no se puede simular sin Postgres: la atomicidad de las
 * funciones bajo concurrencia (research R8). Requieren `supabase start`.
 *
 * Las credenciales se leen del entorno, nunca van escritas (Principio II). Si faltan, las
 * suites se saltan con un mensaje claro en lugar de fallar de forma confusa.
 */

export const TEST_URL = process.env.SUPABASE_TEST_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
export const TEST_ANON_KEY =
  process.env.SUPABASE_TEST_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
export const TEST_SERVICE_KEY =
  process.env.SUPABASE_TEST_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;

export const hasSupabase = Boolean(TEST_URL && TEST_ANON_KEY && TEST_SERVICE_KEY);

export const skipReason =
  'Requiere Supabase local. Ejecuta `supabase start` y exporta SUPABASE_TEST_URL, ' +
  'SUPABASE_TEST_ANON_KEY y SUPABASE_TEST_SERVICE_ROLE_KEY.';

/** Cliente con llave de servicio: evita RLS. Para montar y limpiar el escenario. */
export function adminClient(): SupabaseClient {
  if (!hasSupabase) throw new Error(skipReason);
  return createClient(TEST_URL!, TEST_SERVICE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export interface TestPlayer {
  /** `room_players.id`, el que reciben las funciones como `p_player_id`. */
  id: string;
  /** `auth.users.id`, lo que ven las funciones en `auth.uid()`. */
  authUserId: string;
  /** Cliente autenticado como este jugador. Las RPC deben llamarse desde aquí. */
  client: SupabaseClient;
}

export interface TestRoom {
  roomId: string;
  code: string;
  puzzleId: string;
  players: TestPlayer[];
  pieceIds: string[];
}

/**
 * Crea un cliente con su propia sesión anónima real.
 *
 * Es la única forma de que `auth.uid()` tenga un valor válido dentro de las funciones
 * SECURITY DEFINER, que es precisamente lo que hay que ejercitar: llamarlas con la llave de
 * servicio saltaría la comprobación de identidad y el test no probaría nada.
 */
async function anonymousClient(): Promise<{ client: SupabaseClient; authUserId: string }> {
  const client = createClient(TEST_URL!, TEST_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.signInAnonymously();
  if (error || !data.user) {
    throw new Error(
      `No se pudo crear la sesión anónima de prueba: ${error?.message ?? 'sin usuario'}. ` +
        'Comprobar enable_anonymous_sign_ins en supabase/config.toml.',
    );
  }
  return { client, authUserId: data.user.id };
}

/** Monta una sala con su rompecabezas, sus piezas y `playerCount` jugadores autenticados. */
export async function setupRoom(
  admin: SupabaseClient,
  { gridRows = 2, gridCols = 2, playerCount = 2 } = {},
): Promise<TestRoom> {
  const { data: puzzle, error: puzzleError } = await admin
    .from('puzzles')
    .insert({
      image_url: 'data:image/svg+xml;utf8,<svg/>',
      grid_rows: gridRows,
      grid_cols: gridCols,
    })
    .select('id')
    .single();
  if (puzzleError) throw puzzleError;

  const sessions = await Promise.all(Array.from({ length: playerCount }, () => anonymousClient()));

  const code = generateRoomCode();
  const { data: created, error: createError } = await admin
    .rpc('create_room', {
      p_puzzle_id: puzzle.id,
      p_auth_user_id: sessions[0]!.authUserId,
      p_alias: 'jugador-1',
      p_code: code,
      p_pieces: layoutPieces(gridRows, gridCols, 42),
    })
    .single<{ room_id: string; player_id: string }>();
  if (createError) throw createError;

  const players: TestPlayer[] = [
    { id: created.player_id, authUserId: sessions[0]!.authUserId, client: sessions[0]!.client },
  ];

  for (let i = 1; i < playerCount; i++) {
    const session = sessions[i]!;
    const { data: player, error } = await admin
      .from('room_players')
      .insert({
        room_id: created.room_id,
        auth_user_id: session.authUserId,
        alias: `jugador-${i + 1}`,
      })
      .select('id')
      .single();
    if (error) throw error;
    players.push({ id: player.id, authUserId: session.authUserId, client: session.client });
  }

  const { data: pieceRows, error: piecesError } = await admin
    .from('pieces')
    .select('id')
    .eq('room_id', created.room_id)
    .order('grid_row')
    .order('grid_col');
  if (piecesError) throw piecesError;

  return {
    roomId: created.room_id,
    code,
    puzzleId: puzzle.id,
    players,
    pieceIds: pieceRows.map((row) => row.id),
  };
}

/** Borra todo lo creado por una prueba, incluidos los usuarios anónimos. */
export async function cleanupRoom(admin: SupabaseClient, room: TestRoom): Promise<void> {
  await admin.from('rooms').delete().eq('id', room.roomId);
  await admin.from('puzzles').delete().eq('id', room.puzzleId);
  for (const player of room.players) {
    await admin.auth.admin.deleteUser(player.authUserId);
  }
}

/** Fuerza el vencimiento del arrendamiento de una pieza, sin esperar 30 segundos reales. */
export async function expireLease(admin: SupabaseClient, pieceId: string): Promise<void> {
  const { error } = await admin
    .from('pieces')
    .update({ captured_at: new Date(Date.now() - 120_000).toISOString() })
    .eq('id', pieceId);
  if (error) throw error;
}
