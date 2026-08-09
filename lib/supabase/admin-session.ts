import { createBrowserClient, createServerClient } from '@supabase/ssr';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import type { SupabaseClient, User } from '@supabase/supabase-js';

/**
 * Sesión de administrador, en **cookie**.
 *
 * Los jugadores siguen con sesión anónima en `localStorage` (`lib/supabase/client.ts`). Aquí hace
 * falta cookie por un motivo técnico y no por preferencia: el middleware corre en el servidor y
 * **no puede leer `localStorage`** (research R1).
 *
 * La frontera es la ruta: cookies bajo `/admin` y sus endpoints, `localStorage` para todo lo
 * demás. No se migran las sesiones de jugador, que funcionan y nada del servidor necesita ver.
 *
 * Tres variantes, porque cada contexto lee y escribe cookies de forma distinta.
 */

function requireEnv(): { url: string; anonKey: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error('Faltan NEXT_PUBLIC_SUPABASE_URL o NEXT_PUBLIC_SUPABASE_ANON_KEY.');
  }
  return { url, anonKey };
}

/**
 * Variante de **navegador**, para `app/admin/login`.
 *
 * Es la que hay que usar al iniciar sesión, **no** `getSupabaseBrowserClient()` de 001. Con
 * aquella la sesión iría a `localStorage`, el login parecería correcto, no daría ningún error, y
 * `/admin` seguiría redirigiendo porque el middleware no vería nada. Es el fallo más difícil de
 * diagnosticar de esta feature, precisamente porque nada falla de forma visible.
 */
export function createAdminBrowserClient(): SupabaseClient {
  const { url, anonKey } = requireEnv();
  return createBrowserClient(url, anonKey);
}

/**
 * Variante de **middleware**.
 *
 * Devuelve el cliente y la respuesta que hay que propagar. Escribir la cookie renovada en esa
 * respuesta es obligatorio: si el token caducó y no se propaga, la siguiente navegación vuelve a
 * fallar y el administrador acaba en un bucle de login.
 */
export function createMiddlewareClient(request: NextRequest): {
  supabase: SupabaseClient;
  response: NextResponse;
} {
  const { url, anonKey } = requireEnv();
  let response = NextResponse.next({ request });

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookies) => {
        for (const { name, value } of cookies) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookies) response.cookies.set(name, value, options);
      },
    },
  });

  return { supabase, response };
}

/**
 * Variante de **route handler**.
 *
 * Solo lee: un endpoint no renueva la sesión, y escribir cookies desde aquí complicaría la
 * respuesta sin ganar nada. Si el token caducó, la operación se rechaza y el middleware la
 * renovará en la siguiente navegación.
 */
function createRouteHandlerClient(request: Request): SupabaseClient {
  const { url, anonKey } = requireEnv();
  const header = request.headers.get('cookie') ?? '';

  return createServerClient(url, anonKey, {
    cookies: {
      getAll: () =>
        header
          .split(';')
          .map((part) => part.trim())
          .filter(Boolean)
          .map((part) => {
            const index = part.indexOf('=');
            return {
              name: part.slice(0, index),
              value: decodeURIComponent(part.slice(index + 1)),
            };
          }),
      setAll: () => {
        // Un route handler no renueva la sesión. Ver la nota de arriba.
      },
    },
  });
}

/** ¿Este usuario es administrador? */
export function isAdmin(user: User | null): boolean {
  // **`app_metadata`, nunca `user_metadata`.** `user_metadata` lo puede escribir el propio
  // usuario desde el cliente con una llamada del SDK: guardar ahí el rol sería regalarlo a
  // cualquiera con la consola del navegador abierta.
  return user?.app_metadata?.is_admin === true;
}

export type AdminCheck =
  | { readonly ok: true; readonly user: User }
  | { readonly ok: false; readonly reason: 'unauthenticated' | 'forbidden' };

/**
 * Comprobación de administrador para un route handler.
 *
 * Se llama desde **cada** endpoint de administración, no solo desde el middleware. No es
 * redundancia por gusto: el `matcher` del middleware es una lista, y una lista se puede quedar
 * corta al añadir una ruta. Esta comprobación es lo que evita que ese olvido deje un endpoint
 * abierto.
 */
export async function requireAdmin(request: Request): Promise<AdminCheck> {
  const { data, error } = await createRouteHandlerClient(request).auth.getUser();

  if (error || !data.user) return { ok: false, reason: 'unauthenticated' };
  if (!isAdmin(data.user)) return { ok: false, reason: 'forbidden' };

  return { ok: true, user: data.user };
}
