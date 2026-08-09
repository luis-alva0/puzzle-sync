import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  adminClient,
  cleanupRoom,
  hasSupabase,
  setupRoom,
  skipReason,
  type TestRoom,
} from './helpers';
import { PIECE_SIZE, SNAP_TOLERANCE } from '@/lib/puzzle/geometry';

/**
 * Emparejamiento de piezas y fusión de grupos (FR-016, FR-018, FR-019).
 *
 * Estas pruebas cubren el algoritmo de emparejamiento **donde de verdad se ejecuta**: la
 * función `release_piece` en Postgres. No existe una implementación en TypeScript que probar
 * aparte; hubo una y se eliminó, porque mantener dos copias de la misma regla garantiza que se
 * desincronicen y probar la copia no dice nada sobre la que corre en producción.
 *
 * Requieren Supabase local. Es la consecuencia asumida de que la lógica viva en la base de
 * datos, registrada en Complexity Tracking del plan.
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

describe.skipIf(!hasSupabase)('emparejamiento de piezas (FR-016)', () => {
  let admin: SupabaseClient;
  let room: TestRoom;

  beforeAll(() => {
    admin = adminClient();
  });

  afterEach(async () => {
    if (room) await cleanupRoom(admin, room);
  });

  /** Coloca dos piezas vecinas y suelta la segunda con la desviación indicada. */
  async function dropWithOffset(offset: number) {
    room = await setupRoom(admin, { gridRows: 1, gridCols: 2, playerCount: 1 });
    const player = room.players[0]!;

    const { data: pieces } = await admin
      .from('pieces')
      .select('id, grid_col')
      .eq('room_id', room.roomId)
      .order('grid_col');
    const left = pieces!.find((p) => p.grid_col === 0)!;
    const right = pieces!.find((p) => p.grid_col === 1)!;

    await admin.from('pieces').update({ x: 0, y: 0 }).eq('id', left.id);

    await player.client
      .rpc('capture_piece', { p_piece_id: right.id, p_player_id: player.id })
      .single<CaptureResult>();
    await player.client
      .rpc('release_piece', {
        p_piece_id: right.id,
        p_player_id: player.id,
        p_x: PIECE_SIZE + offset,
        p_y: 0,
      })
      .single<ReleaseResult>();

    const { data: after } = await admin
      .from('pieces')
      .select('id, x, group_id')
      .eq('room_id', room.roomId);
    return {
      left: after!.find((p) => p.id === left.id)!,
      right: after!.find((p) => p.id === right.id)!,
    };
  }

  it('encaja justo dentro de la tolerancia y alinea a la posición exacta', async () => {
    const { left, right } = await dropWithOffset(SNAP_TOLERANCE - 1);
    expect(right.group_id).toBe(left.group_id);
    expect(right.x).toBeCloseTo(PIECE_SIZE, 1);
  });

  it('NO encaja justo fuera de la tolerancia y respeta la posición soltada', async () => {
    const offset = SNAP_TOLERANCE + 5;
    const { left, right } = await dropWithOffset(offset);
    expect(right.group_id).not.toBe(left.group_id);
    expect(right.x).toBeCloseTo(PIECE_SIZE + offset, 1);
  });

  it('NO encaja con piezas no adyacentes en la cuadrícula', async () => {
    room = await setupRoom(admin, { gridRows: 1, gridCols: 3, playerCount: 1 });
    const player = room.players[0]!;

    const { data: pieces } = await admin
      .from('pieces')
      .select('id, grid_col')
      .eq('room_id', room.roomId)
      .order('grid_col');
    const first = pieces!.find((p) => p.grid_col === 0)!;
    const third = pieces!.find((p) => p.grid_col === 2)!;

    await admin.from('pieces').update({ x: 0, y: 0 }).eq('id', first.id);

    await player.client
      .rpc('capture_piece', { p_piece_id: third.id, p_player_id: player.id })
      .single<CaptureResult>();
    // Se suelta pegada a (0,0), pero (0,0) y (0,2) no son vecinas: no deben conectarse.
    await player.client
      .rpc('release_piece', {
        p_piece_id: third.id,
        p_player_id: player.id,
        p_x: PIECE_SIZE,
        p_y: 0,
      })
      .single<ReleaseResult>();

    const { data: after } = await admin
      .from('pieces')
      .select('id, group_id')
      .eq('room_id', room.roomId);
    expect(after!.find((p) => p.id === third.id)!.group_id).not.toBe(
      after!.find((p) => p.id === first.id)!.group_id,
    );
  });

  it('NO encaja en diagonal', async () => {
    room = await setupRoom(admin, { gridRows: 2, gridCols: 2, playerCount: 1 });
    const player = room.players[0]!;

    const { data: pieces } = await admin
      .from('pieces')
      .select('id, grid_row, grid_col')
      .eq('room_id', room.roomId);
    const topLeft = pieces!.find((p) => p.grid_row === 0 && p.grid_col === 0)!;
    const bottomRight = pieces!.find((p) => p.grid_row === 1 && p.grid_col === 1)!;

    // Las otras dos se apartan para que solo quede la relación diagonal.
    for (const p of pieces!.filter((x) => x.id !== topLeft.id && x.id !== bottomRight.id)) {
      await admin.from('pieces').update({ x: 9_000, y: 9_000 }).eq('id', p.id);
    }
    await admin.from('pieces').update({ x: 0, y: 0 }).eq('id', topLeft.id);

    await player.client
      .rpc('capture_piece', { p_piece_id: bottomRight.id, p_player_id: player.id })
      .single<CaptureResult>();
    await player.client
      .rpc('release_piece', {
        p_piece_id: bottomRight.id,
        p_player_id: player.id,
        p_x: PIECE_SIZE,
        p_y: PIECE_SIZE,
      })
      .single<ReleaseResult>();

    const { data: after } = await admin
      .from('pieces')
      .select('id, group_id')
      .eq('room_id', room.roomId);
    expect(after!.find((p) => p.id === bottomRight.id)!.group_id).not.toBe(
      after!.find((p) => p.id === topLeft.id)!.group_id,
    );
  });

  it('fusiona en cascada al caer en un hueco entre dos grupos (FR-018)', async () => {
    room = await setupRoom(admin, { gridRows: 2, gridCols: 2, playerCount: 1 });
    const player = room.players[0]!;

    const { data: pieces } = await admin
      .from('pieces')
      .select('id, grid_row, grid_col')
      .eq('room_id', room.roomId);
    const at = (r: number, c: number) => pieces!.find((p) => p.grid_row === r && p.grid_col === c)!;

    // Tres piezas colocadas en su sitio; la cuarta cae en el hueco y debe unir con dos vecinas.
    await admin.from('pieces').update({ x: 0, y: 0 }).eq('id', at(0, 0).id);
    await admin.from('pieces').update({ x: PIECE_SIZE, y: 0 }).eq('id', at(0, 1).id);
    await admin.from('pieces').update({ x: 0, y: PIECE_SIZE }).eq('id', at(1, 0).id);

    await player.client
      .rpc('capture_piece', { p_piece_id: at(1, 1).id, p_player_id: player.id })
      .single<CaptureResult>();
    const release = await player.client
      .rpc('release_piece', {
        p_piece_id: at(1, 1).id,
        p_player_id: player.id,
        p_x: PIECE_SIZE + 3,
        p_y: PIECE_SIZE - 3,
      })
      .single<ReleaseResult>();

    const { data: after } = await admin
      .from('pieces')
      .select('group_id')
      .eq('room_id', room.roomId);

    // Las cuatro acabaron en un único grupo, y eso completó el rompecabezas.
    expect(new Set(after!.map((p) => p.group_id)).size).toBe(1);
    expect(release.data?.room_completed).toBe(true);
  });

  it('completar registra la partida en el histórico una sola vez (FR-028)', async () => {
    room = await setupRoom(admin, { gridRows: 1, gridCols: 2, playerCount: 1 });
    const player = room.players[0]!;

    const { data: pieces } = await admin
      .from('pieces')
      .select('id, grid_col')
      .eq('room_id', room.roomId)
      .order('grid_col');
    const left = pieces!.find((p) => p.grid_col === 0)!;
    const right = pieces!.find((p) => p.grid_col === 1)!;

    await admin.from('pieces').update({ x: 0, y: 0 }).eq('id', left.id);
    await player.client
      .rpc('capture_piece', { p_piece_id: right.id, p_player_id: player.id })
      .single<CaptureResult>();
    await player.client
      .rpc('release_piece', {
        p_piece_id: right.id,
        p_player_id: player.id,
        p_x: PIECE_SIZE,
        p_y: 0,
      })
      .single<ReleaseResult>();

    const { data: history } = await admin
      .from('game_history')
      .select('room_id, started_at, completed_at, aliases')
      .eq('room_id', room.roomId);

    expect(history).toHaveLength(1);
    expect(history![0]!.started_at).toBeTruthy();
    expect(history![0]!.completed_at).toBeTruthy();
    expect(history![0]!.aliases).toContain('jugador-1');

    // Soltar de nuevo no duplica el registro: el UNIQUE + ON CONFLICT lo hacen idempotente.
    await player.client
      .rpc('capture_piece', { p_piece_id: right.id, p_player_id: player.id })
      .single<CaptureResult>();
    await player.client
      .rpc('release_piece', {
        p_piece_id: right.id,
        p_player_id: player.id,
        p_x: PIECE_SIZE,
        p_y: 0,
      })
      .single<ReleaseResult>();

    const { data: again } = await admin
      .from('game_history')
      .select('room_id')
      .eq('room_id', room.roomId);
    expect(again).toHaveLength(1);
  });
});

if (!hasSupabase) {
  describe('release_piece', () => {
    it.skip(`omitido: ${skipReason}`, () => {});
  });
}
