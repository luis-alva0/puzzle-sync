import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  adminClient,
  cleanupRoom,
  expireLease,
  hasSupabase,
  setupRoom,
  skipReason,
  type TestRoom,
} from './helpers';

/**
 * Expiración del arrendamiento de un bloqueo (FR-015, SC-007).
 *
 * Es el mecanismo que sustituye a un proceso en segundo plano de limpieza (research R2): en
 * lugar de detectar la desconexión y liberar, el bloqueo simplemente caduca. Verificarlo
 * requiere Postgres porque la caducidad se evalúa con `now()` dentro de la función.
 */

interface CaptureResult {
  success: boolean;
  held_by_alias: string | null;
}

describe.skipIf(!hasSupabase)('expiración del arrendamiento', () => {
  let admin: SupabaseClient;
  let room: TestRoom;

  beforeAll(() => {
    admin = adminClient();
  });

  afterEach(async () => {
    if (room) await cleanupRoom(admin, room);
  });

  it('un bloqueo vigente sigue impidiendo la captura ajena', async () => {
    room = await setupRoom(admin, { playerCount: 2 });
    const [playerA, playerB] = room.players;
    const pieceId = room.pieceIds[0]!;

    await playerA!.client
      .rpc('capture_piece', { p_piece_id: pieceId, p_player_id: playerA!.id })
      .single<CaptureResult>();

    const denied = await playerB!.client
      .rpc('capture_piece', { p_piece_id: pieceId, p_player_id: playerB!.id })
      .single<CaptureResult>();

    expect(denied.data?.success).toBe(false);
  });

  it('un bloqueo vencido es tomado por otro jugador sin proceso de limpieza', async () => {
    room = await setupRoom(admin, { playerCount: 2 });
    const [playerA, playerB] = room.players;
    const pieceId = room.pieceIds[0]!;

    await playerA!.client
      .rpc('capture_piece', { p_piece_id: pieceId, p_player_id: playerA!.id })
      .single<CaptureResult>();

    // Simula que playerA perdió la conexión hace dos minutos sin soltar la pieza.
    await expireLease(admin, pieceId);

    const granted = await playerB!.client
      .rpc('capture_piece', { p_piece_id: pieceId, p_player_id: playerB!.id })
      .single<CaptureResult>();

    expect(granted.data?.success).toBe(true);

    const { data: piece } = await admin
      .from('pieces')
      .select('captured_by')
      .eq('id', pieceId)
      .single();
    expect(piece!.captured_by).toBe(playerB!.id);
  });

  it('mover refresca el arrendamiento y evita que caduque mientras se arrastra', async () => {
    room = await setupRoom(admin, { playerCount: 2 });
    const [playerA, playerB] = room.players;
    const pieceId = room.pieceIds[0]!;

    await playerA!.client
      .rpc('capture_piece', { p_piece_id: pieceId, p_player_id: playerA!.id })
      .single<CaptureResult>();

    await expireLease(admin, pieceId);

    // Un movimiento de quien la tiene NO puede revivir un arrendamiento ya vencido: si pudiera,
    // un cliente zombi recuperaría el control de una pieza que otros ya dan por libre.
    await playerA!.client.rpc('move_piece', {
      p_piece_id: pieceId,
      p_player_id: playerA!.id,
      p_x: 10,
      p_y: 10,
    });

    const granted = await playerB!.client
      .rpc('capture_piece', { p_piece_id: pieceId, p_player_id: playerB!.id })
      .single<CaptureResult>();

    expect(granted.data?.success).toBe(true);
  });

  it('el arrendamiento vencido no deja piezas bloqueadas para siempre (SC-007)', async () => {
    room = await setupRoom(admin, { gridRows: 2, gridCols: 2, playerCount: 2 });
    const [playerA, playerB] = room.players;

    for (const pieceId of room.pieceIds) {
      await playerA!.client
        .rpc('capture_piece', { p_piece_id: pieceId, p_player_id: playerA!.id })
        .single<CaptureResult>();
      await expireLease(admin, pieceId);
    }

    // Con todas vencidas, el otro jugador puede tomarlas todas.
    for (const pieceId of room.pieceIds) {
      const granted = await playerB!.client
        .rpc('capture_piece', { p_piece_id: pieceId, p_player_id: playerB!.id })
        .single<CaptureResult>();
      expect(granted.data?.success, `pieza ${pieceId}`).toBe(true);
    }
  });
});

if (!hasSupabase) {
  describe('expiración del arrendamiento', () => {
    it.skip(`omitido: ${skipReason}`, () => {});
  });
}
