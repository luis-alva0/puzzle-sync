import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { createMiddlewareClient, isAdmin } from '@/lib/supabase/admin-session';

/**
 * Protege `/admin`.
 *
 * Solo intercepta esa rama: el resto de la aplicación no paga nada por esto, y los jugadores
 * siguen sin cuenta (Principio III).
 *
 * **No es la única defensa.** Un middleware protege rutas, no datos, y su `matcher` es una lista
 * que se puede quedar corta al añadir un endpoint. Los route handlers de administración vuelven
 * a comprobar el rol por su cuenta con `requireAdmin`.
 */

export const config = {
  matcher: ['/admin/:path*'],
};

export async function middleware(request: NextRequest) {
  // El login es la única ruta bajo /admin que tiene que ser accesible sin sesión.
  if (request.nextUrl.pathname.startsWith('/admin/login')) {
    return NextResponse.next();
  }

  const { supabase, response } = createMiddlewareClient(request);

  // `getUser` valida el token contra Supabase y, de paso, lo renueva si hacía falta. La cookie
  // renovada viaja en `response`: si no se propaga, la siguiente navegación vuelve a fallar y el
  // administrador acaba en un bucle de login.
  const { data } = await supabase.auth.getUser();

  if (!data.user) {
    return NextResponse.redirect(new URL('/admin/login', request.url));
  }

  // `app_metadata`, nunca `user_metadata`: esta línea es lo único que separa al administrador de
  // cualquiera con la consola del navegador abierta.
  if (!isAdmin(data.user)) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  // Se redirige y no se responde 403 porque esto es una navegación de página: un código de error
  // sobre una pantalla en blanco no le dice nada a nadie. Los endpoints sí devuelven FORBIDDEN.
  return response;
}
