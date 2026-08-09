import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { adminClient, cleanupRoom, hasSupabase, setupRoom, skipReason, type TestRoom } from './helpers';
import { generateRoomCode } from '@/lib/rooms/code';
import { scatterPieces } from '@/lib/puzzle/geometry';

/**
 * El contador de partidas (FR-013 de 003).
 *
 * Se incrementa al **crear la sala**, dentro de la misma transacción: con un disparador aparte
 * existiría un instante en el que la sala existe y el contador no lo refleja.
 *
 * Verifica el cambio que 003 hace sobre `create_room`, que es una función de la feature 001.
 */

describe.skipIf(!hasSupabase)('play_count', () => {
  let admin: SupabaseClient;
  const rooms: TestRoom[] = [];

  beforeAll(() => {
    admin = adminClient();
  });

  afterEach(async () => {
    for (const room of rooms.splice(0)) await cleanupRoom(admin, room);
  });

  async function playCountOf(puzzleId: string): Promise<number> {
    const { data } = await admin.from('puzzles').select('play_count').eq('id', puzzleId).single();
    return data!.play_count as number;
  }

  it('crear una sala incrementa el contador del rompecabezas', async () => {
    const room = await setupRoom(admin, { playerCount: 1 });
    rooms.push(room);

    // `setupRoom` crea la sala con `create_room`, así que el contador ya debería estar a 1.
    expect(await playCountOf(room.puzzleId)).toBe(1);
  });

  it('cada sala suma uno: dos salas sobre el mismo rompecabezas dan dos', async () => {
    const first = await setupRoom(admin, { playerCount: 1 });
    rooms.push(first);

    // Segunda sala sobre el MISMO rompecabezas.
    const { error } = await admin.rpc('create_room', {
      p_puzzle_id: first.puzzleId,
      p_auth_user_id: first.players[0]!.authUserId,
      p_alias: 'segundo',
      p_code: generateRoomCode(),
      p_pieces: scatterPieces(2, 2, 7),
    });
    expect(error).toBeNull();

    expect(await playCountOf(first.puzzleId)).toBe(2);
  });

  it('el contador arranca en cero', async () => {
    const { data, error } = await admin
      .from('puzzles')
      .insert({ image_url: 'data:image/svg+xml;utf8,<svg/>', grid_rows: 2, grid_cols: 2 })
      .select('id, play_count')
      .single();
    if (error) throw error;

    expect(data.play_count).toBe(0);
    await admin.from('puzzles').delete().eq('id', data.id);
  });
});

if (!hasSupabase) {
  describe('play_count', () => {
    it.skip(`omitido: ${skipReason}`, () => {});
  });
}
