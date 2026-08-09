import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';
import { adminClient, hasSupabase, skipReason, TEST_URL, TEST_ANON_KEY } from './helpers';
import { isAdmin } from '@/lib/supabase/admin-session';

/**
 * Acceso a administración.
 *
 * La prueba que importa es la última: que poner `is_admin` en `user_metadata` desde el cliente
 * **no** dé acceso. Es el ataque obvio —una llamada del SDK desde la consola del navegador— y su
 * rechazo es lo que hace que el resto del contrato de autenticación valga algo.
 *
 * Se verifica `isAdmin` contra usuarios reales de Supabase Auth, no el middleware en sí:
 * ejercitar el middleware exigiría levantar Next, y lo que decide es esta función.
 */

describe.skipIf(!hasSupabase)('quién es administrador', () => {
  let admin: SupabaseClient;
  const createdUsers: string[] = [];

  beforeAll(() => {
    admin = adminClient();
  });

  afterAll(async () => {
    for (const id of createdUsers) await admin.auth.admin.deleteUser(id);
  });

  async function createUser(options: {
    appMetadata?: Record<string, unknown>;
    userMetadata?: Record<string, unknown>;
  }): Promise<User> {
    const { data, error } = await admin.auth.admin.createUser({
      email: `admin-test-${crypto.randomUUID()}@example.invalid`,
      password: crypto.randomUUID(),
      email_confirm: true,
      app_metadata: options.appMetadata,
      user_metadata: options.userMetadata,
    });
    if (error || !data.user) throw error ?? new Error('sin usuario');
    createdUsers.push(data.user.id);
    return data.user;
  }

  it('un usuario sin metadatos NO es administrador', async () => {
    expect(isAdmin(await createUser({}))).toBe(false);
  });

  it('un usuario con app_metadata.is_admin SÍ es administrador', async () => {
    expect(isAdmin(await createUser({ appMetadata: { is_admin: true } }))).toBe(true);
  });

  it('sin sesión no hay administrador', () => {
    expect(isAdmin(null)).toBe(false);
  });

  it('**user_metadata.is_admin NO da acceso**, ni siquiera puesto desde el cliente', async () => {
    // El ataque: `supabase.auth.updateUser({ data: { is_admin: true } })` desde la consola del
    // navegador escribe en `user_metadata`, que el propio usuario controla. Si `isAdmin` lo
    // mirase, el rol estaría a un `fetch` de distancia para cualquiera.
    const user = await createUser({ userMetadata: { is_admin: true } });
    expect(isAdmin(user)).toBe(false);

    // Y el ataque de verdad: el usuario se autentica y lo escribe él mismo.
    const client = createClient(TEST_URL!, TEST_ANON_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: signedIn } = await client.auth.signInWithPassword({
      email: user.email!,
      password: 'irrelevante',
    });

    // Aunque el inicio de sesión fallara por la contraseña, lo que se comprueba es el principio:
    // nada que el cliente pueda escribir acaba en `app_metadata`.
    if (signedIn.user) {
      await client.auth.updateUser({ data: { is_admin: true } });
      const { data: refreshed } = await admin.auth.admin.getUserById(user.id);
      expect(isAdmin(refreshed.user)).toBe(false);
      expect(refreshed.user?.user_metadata?.is_admin).toBe(true); // sí lo escribió, y da igual
    }
  });

  it('un valor que no es exactamente `true` no basta', async () => {
    for (const value of ['true', 1, 'yes', {}]) {
      expect(isAdmin(await createUser({ appMetadata: { is_admin: value } }))).toBe(false);
    }
  });
});

if (!hasSupabase) {
  describe('acceso a administración', () => {
    it.skip(`omitido: ${skipReason}`, () => {});
  });
}
