import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { adminClient, cleanupRoom, hasSupabase, setupRoom, skipReason, type TestRoom } from './helpers';
import { PIECE_SIZE } from '@/lib/puzzle/geometry';

/**
 * Fusión concurrente de grupos vecinos (edge case del spec: "dos piezas soltadas casi al mismo
 * tiempo en la misma zona de encaje").
 *
 * Lo que se verifica no es quién gana, sino que el resultado sea DETERMINISTA y coherente:
 * ninguna pieza duplicada, ningún grupo huérfano y el mismo tablero para todos (SC-008).
 */

interface CaptureResult {
  success: boolean;
}

interface ReleaseResult {
  merged_group_ids: string[];
  final_group_id: string | null;
  room_completed: boolean;
}

describe.skipIf(!hasSupabase)('release_piece bajo fusión concurrente', () => {
  let admin: SupabaseClient;
  let room: TestRoom;

  beforeAll(() => {
    admin = adminClient();
  });

  afterEach(async () => {
    if (room) await cleanupRoom(admin, room);
  });

  it('dos encajes simultáneos sobre el mismo vecino dejan un tablero coherente', async () => {
    // Cuadrícula 1x3: la pieza central queda quieta y las de los extremos se sueltan a la vez
    // contra ella.
    room = await setupRoom(admin, { gridRows: 1, gridCols: 3, playerCount: 2 });
    const [playerA, playerB] = room.players;

    const { data: pieces } = await admin
      .from('pieces')
      .select('id, grid_col, x, y')
      .eq('room_id', room.roomId)
      .order('grid_col');

    const left = pieces!.find((p) => p.grid_col === 0)!;
    const middle = pieces!.find((p) => p.grid_col === 1)!;
    const right = pieces!.find((p) => p.grid_col === 2)!;

    // La del medio se fija en un punto conocido.
    await admin.from('pieces').update({ x: 0, y: 0 }).eq('id', middle.id);

    await playerA!.client
      .rpc('capture_piece', { p_piece_id: left.id, p_player_id: playerA!.id })
      .single<CaptureResult>();
    await playerB!.client
      .rpc('capture_piece', { p_piece_id: right.id, p_player_id: playerB!.id })
      .single<CaptureResult>();

    // Ambas se sueltan exactamente en su posición de encaje, a la vez.
    const [releaseA, releaseB] = await Promise.all([
      playerA!.client
        .rpc('release_piece', {
          p_piece_id: left.id,
          p_player_id: playerA!.id,
          p_x: -PIECE_SIZE,
          p_y: 0,
        })
        .single<ReleaseResult>(),
      playerB!.client
        .rpc('release_piece', {
          p_piece_id: right.id,
          p_player_id: playerB!.id,
          p_x: PIECE_SIZE,
          p_y: 0,
        })
        .single<ReleaseResult>(),
    ]);

    expect(releaseA.error).toBeNull();
    expect(releaseB.error).toBeNull();

    const { data: after } = await admin
      .from('pieces')
      .select('id, grid_col, x, y, group_id, captured_by')
      .eq('room_id', room.roomId)
      .order('grid_col');

    // Ninguna pieza se perdió ni se duplicó.
    expect(after).toHaveLength(3);
    expect(new Set(after!.map((p) => p.id)).size).toBe(3);

    // Ningún bloqueo quedó colgando.
    expect(after!.every((p) => p.captured_by === null)).toBe(true);

    // Las tres acabaron en el mismo grupo: los dos encajes eran válidos.
    expect(new Set(after!.map((p) => p.group_id)).size).toBe(1);

    // Y las posiciones relativas son exactamente las correctas.
    const byCol = new Map(after!.map((p) => [p.grid_col, p]));
    expect(byCol.get(1)!.x - byCol.get(0)!.x).toBeCloseTo(PIECE_SIZE, 1);
    expect(byCol.get(2)!.x - byCol.get(1)!.x).toBeCloseTo(PIECE_SIZE, 1);
  });

  it('soltar sin encaje deja la pieza donde la soltaron (FR-019)', async () => {
    room = await setupRoom(admin, { gridRows: 2, gridCols: 2, playerCount: 1 });
    const player = room.players[0]!;
    const pieceId = room.pieceIds[0]!;

    await player.client
      .rpc('capture_piece', { p_piece_id: pieceId, p_player_id: player.id })
      .single<CaptureResult>();

    const farX = 5_000;
    const farY = 4_000;
    await player.client
      .rpc('release_piece', {
        p_piece_id: pieceId,
        p_player_id: player.id,
        p_x: farX,
        p_y: farY,
      })
      .single<ReleaseResult>();

    const { data: piece } = await admin
      .from('pieces')
      .select('x, y, group_id, captured_by')
      .eq('id', pieceId)
      .single();

    expect(piece!.x).toBeCloseTo(farX, 1);
    expect(piece!.y).toBeCloseTo(farY, 1);
    expect(piece!.captured_by).toBeNull();
    // Sigue sola en su grupo: no se fusionó con nada.
    expect(piece!.group_id).toBeTruthy();
  });
});

if (!hasSupabase) {
  describe('release_piece', () => {
    it.skip(`omitido: ${skipReason}`, () => {});
  });
}
