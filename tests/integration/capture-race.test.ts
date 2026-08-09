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
 * Carrera de captura (FR-013, SC-003).
 *
 * Esta es la prueba que justifica la excepción al Principio VI registrada en Complexity
 * Tracking: la atomicidad de `capture_piece` es una propiedad del motor de Postgres. Simularla
 * con dobles verificaría el simulacro, no la garantía, y daría verde precisamente sobre la
 * condición que puede romper el producto.
 */

interface CaptureResult {
  success: boolean;
  held_by_alias: string | null;
  piece_ids: string[];
}

describe.skipIf(!hasSupabase)('capture_piece bajo concurrencia', () => {
  let admin: SupabaseClient;
  let room: TestRoom;

  beforeAll(() => {
    admin = adminClient();
  });

  afterEach(async () => {
    if (room) await cleanupRoom(admin, room);
  });

  it('con dos capturas simultáneas sobre la misma pieza, exactamente una gana', async () => {
    room = await setupRoom(admin, { gridRows: 2, gridCols: 2, playerCount: 2 });
    const [playerA, playerB] = room.players;
    const pieceId = room.pieceIds[0]!;

    // Se lanzan sin await intermedio: ambas peticiones salen antes de que ninguna vuelva.
    const [resultA, resultB] = await Promise.all([
      playerA!.client
        .rpc('capture_piece', { p_piece_id: pieceId, p_player_id: playerA!.id })
        .single<CaptureResult>(),
      playerB!.client
        .rpc('capture_piece', { p_piece_id: pieceId, p_player_id: playerB!.id })
        .single<CaptureResult>(),
    ]);

    expect(resultA.error).toBeNull();
    expect(resultB.error).toBeNull();

    const winners = [resultA.data, resultB.data].filter((r) => r?.success);
    expect(winners).toHaveLength(1);

    const loser = [resultA.data, resultB.data].find((r) => !r?.success);
    expect(loser?.held_by_alias).toBeTruthy();

    // Y la base de datos coincide con lo que se le dijo a cada jugador.
    const { data: piece } = await admin
      .from('pieces')
      .select('captured_by')
      .eq('id', pieceId)
      .single();
    expect(piece!.captured_by).toBe(winners[0]!.piece_ids.length > 0 ? piece!.captured_by : null);
    expect([playerA!.id, playerB!.id]).toContain(piece!.captured_by);
  });

  it('repetir la carrera 20 veces nunca produce dos ganadores', async () => {
    room = await setupRoom(admin, { gridRows: 5, gridCols: 4, playerCount: 2 });
    const [playerA, playerB] = room.players;

    for (const pieceId of room.pieceIds.slice(0, 20)) {
      const [a, b] = await Promise.all([
        playerA!.client
          .rpc('capture_piece', { p_piece_id: pieceId, p_player_id: playerA!.id })
          .single<CaptureResult>(),
        playerB!.client
          .rpc('capture_piece', { p_piece_id: pieceId, p_player_id: playerB!.id })
          .single<CaptureResult>(),
      ]);
      const winners = [a.data, b.data].filter((r) => r?.success);
      expect(winners, `pieza ${pieceId}`).toHaveLength(1);
    }
  });

  it('la segunda captura es rechazada con el alias de quien la tiene', async () => {
    room = await setupRoom(admin, { playerCount: 2 });
    const [playerA, playerB] = room.players;
    const pieceId = room.pieceIds[0]!;

    const first = await playerA!.client
      .rpc('capture_piece', { p_piece_id: pieceId, p_player_id: playerA!.id })
      .single<CaptureResult>();
    expect(first.data?.success).toBe(true);

    const second = await playerB!.client
      .rpc('capture_piece', { p_piece_id: pieceId, p_player_id: playerB!.id })
      .single<CaptureResult>();
    expect(second.data?.success).toBe(false);
    expect(second.data?.held_by_alias).toBe('jugador-1');
  });

  it('recapturar lo que ya se posee es idempotente', async () => {
    room = await setupRoom(admin, { playerCount: 1 });
    const player = room.players[0]!;
    const pieceId = room.pieceIds[0]!;

    const first = await player.client
      .rpc('capture_piece', { p_piece_id: pieceId, p_player_id: player.id })
      .single<CaptureResult>();
    const second = await player.client
      .rpc('capture_piece', { p_piece_id: pieceId, p_player_id: player.id })
      .single<CaptureResult>();

    expect(first.data?.success).toBe(true);
    expect(second.data?.success).toBe(true);
  });

  it('un jugador ajeno a la sala no puede capturar', async () => {
    room = await setupRoom(admin, { playerCount: 2 });
    const [playerA, playerB] = room.players;
    const pieceId = room.pieceIds[0]!;

    // playerB usa el id de playerA: la función debe cotejar auth.uid() y rechazarlo.
    const result = await playerB!.client
      .rpc('capture_piece', { p_piece_id: pieceId, p_player_id: playerA!.id })
      .single<CaptureResult>();

    expect(result.data?.success).toBe(false);
  });
});

describe.skipIf(!hasSupabase)('capture_piece sobre grupos', () => {
  let admin: SupabaseClient;
  let room: TestRoom;

  beforeAll(() => {
    admin = adminClient();
  });

  afterEach(async () => {
    if (room) await cleanupRoom(admin, room);
  });

  it('capturar una pieza captura todo su grupo (FR-020)', async () => {
    room = await setupRoom(admin, { gridRows: 2, gridCols: 2, playerCount: 2 });
    const [playerA, playerB] = room.players;
    const [first, second] = room.pieceIds;

    // Se fusionan dos piezas a mano para tener un grupo de dos sin depender de release_piece.
    const { data: firstPiece } = await admin
      .from('pieces')
      .select('group_id')
      .eq('id', first!)
      .single();
    await admin.from('pieces').update({ group_id: firstPiece!.group_id }).eq('id', second!);

    const captured = await playerA!.client
      .rpc('capture_piece', { p_piece_id: first!, p_player_id: playerA!.id })
      .single<CaptureResult>();
    expect(captured.data?.piece_ids).toHaveLength(2);

    // La otra pieza del grupo también queda bloqueada para el resto.
    const denied = await playerB!.client
      .rpc('capture_piece', { p_piece_id: second!, p_player_id: playerB!.id })
      .single<CaptureResult>();
    expect(denied.data?.success).toBe(false);
  });
});

describe.skipIf(!hasSupabase)('expiración del arrendamiento (FR-015, SC-007)', () => {
  let admin: SupabaseClient;
  let room: TestRoom;

  beforeAll(() => {
    admin = adminClient();
  });

  afterEach(async () => {
    if (room) await cleanupRoom(admin, room);
  });

  it('una captura vencida es tomada por otro jugador', async () => {
    room = await setupRoom(admin, { playerCount: 2 });
    const [playerA, playerB] = room.players;
    const pieceId = room.pieceIds[0]!;

    await playerA!.client
      .rpc('capture_piece', { p_piece_id: pieceId, p_player_id: playerA!.id })
      .single<CaptureResult>();

    // Simula que playerA se desconectó hace dos minutos sin soltar la pieza.
    await expireLease(admin, pieceId);

    const result = await playerB!.client
      .rpc('capture_piece', { p_piece_id: pieceId, p_player_id: playerB!.id })
      .single<CaptureResult>();

    expect(result.data?.success).toBe(true);
  });
});

if (!hasSupabase) {
  describe('capture_piece', () => {
    it.skip(`omitido: ${skipReason}`, () => {});
  });
}
