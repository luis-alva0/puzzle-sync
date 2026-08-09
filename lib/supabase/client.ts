'use client';

import { createClient, type SupabaseClient, type Session } from '@supabase/supabase-js';

/**
 * Cliente de navegador. Usa exclusivamente la llave anónima, que es pública por diseño:
 * lo que protege los datos es RLS, no el secreto de esta llave (Principio II).
 *
 * La identidad del jugador se apoya en sesiones anónimas de Supabase Auth (research R1).
 * Es invisible para el usuario: no hay pantalla de login, ni correo, ni contraseña. Lo que
 * aporta es un `auth.uid()` real, sin el cual RLS no puede distinguir a un jugador de otro
 * y el canal privado de la sala no se puede restringir a sus miembros.
 */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

let browserClient: SupabaseClient | null = null;

export function getSupabaseBrowserClient(): SupabaseClient {
  // La comprobación va aquí y no en la evaluación del módulo: lanzar al importar rompe el
  // prerender de Next durante el build, cuando las variables aún no están en el entorno.
  if (!url || !anonKey) {
    throw new Error(
      'Faltan NEXT_PUBLIC_SUPABASE_URL o NEXT_PUBLIC_SUPABASE_ANON_KEY. ' +
        'Copiar .env.example a .env.local y rellenarlas.',
    );
  }

  if (!browserClient) {
    browserClient = createClient(url, anonKey, {
      auth: {
        // El SDK persiste la sesión en localStorage. Eso es lo que permite reconectar sin
        // volver a pedir el alias (FR-022), sin escribir código de persistencia propio.
        persistSession: true,
        autoRefreshToken: true,
      },
    });
  }
  return browserClient;
}

/**
 * Garantiza que existe una sesión anónima y la devuelve.
 *
 * Idempotente: si ya hay sesión persistida en el navegador, la reutiliza. Es lo que hace que
 * un jugador que recarga o reconecta siga siendo el mismo jugador para la base de datos.
 */
export async function ensureAnonymousSession(): Promise<Session> {
  const supabase = getSupabaseBrowserClient();

  const { data: existing } = await supabase.auth.getSession();
  if (existing.session) return existing.session;

  const { data, error } = await supabase.auth.signInAnonymously();
  if (error || !data.session) {
    throw new Error(
      `No se pudo establecer la sesión anónima: ${error?.message ?? 'sin sesión devuelta'}. ` +
        'Comprobar que Anonymous Sign-In está habilitado en Authentication → Providers.',
    );
  }
  return data.session;
}

/** Token de acceso para enviar en la cabecera `Authorization` a los route handlers. */
export async function getAccessToken(): Promise<string> {
  const session = await ensureAnonymousSession();
  return session.access_token;
}
