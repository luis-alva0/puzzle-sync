import 'server-only';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Cliente de servidor, con la llave de rol de servicio. Evita RLS por completo.
 *
 * `import 'server-only'` al principio del archivo NO es decorativo: hace que cualquier import
 * accidental desde un componente de cliente rompa el build en lugar de filtrar la llave al
 * bundle. En un repositorio público esa filtración es irreversible (Principio II).
 *
 * Este módulo solo puede importarse desde route handlers y componentes de servidor.
 */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

let serviceClient: SupabaseClient | null = null;

export function getSupabaseServiceClient(): SupabaseClient {
  if (!url || !serviceRoleKey) {
    throw new Error(
      'Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en el entorno del servidor.',
    );
  }
  if (!serviceClient) {
    serviceClient = createClient(url, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return serviceClient;
}

/**
 * Extrae y verifica el JWT de la cabecera `Authorization` de una petición.
 *
 * Devuelve el `auth.uid()` del jugador, o `null` si no hay token o no es válido. La
 * verificación la hace Supabase Auth contra su propia firma; no se confía en nada que venga
 * del cliente sin comprobar.
 */
export async function getAuthUserId(request: Request): Promise<string | null> {
  const header = request.headers.get('authorization');
  if (!header?.startsWith('Bearer ')) return null;

  const token = header.slice('Bearer '.length).trim();
  if (!token) return null;

  const { data, error } = await getSupabaseServiceClient().auth.getUser(token);
  if (error || !data.user) return null;

  return data.user.id;
}
