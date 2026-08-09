'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { createAdminBrowserClient } from '@/lib/supabase/admin-session';

/**
 * Único login del producto. Los jugadores no tienen cuenta (Principio III).
 *
 * Usa `createAdminBrowserClient`, **no** `getSupabaseBrowserClient()` de 001: aquel guarda la
 * sesión en `localStorage`, y el middleware corre en el servidor y no puede verla. El login
 * parecería correcto, no daría ningún error, y `/admin` seguiría redirigiendo. Es el fallo más
 * difícil de diagnosticar de esta feature, precisamente porque nada falla de forma visible.
 *
 * Sin registro, sin recuperación de contraseña y sin enlace mágico: las cuentas de administrador
 * se crean fuera de la aplicación, y cada una de esas pantallas sería superficie sin uso.
 */

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    const { error: signInError } = await createAdminBrowserClient().auth.signInWithPassword({
      email,
      password,
    });

    if (signInError) {
      // Mismo mensaje para credenciales erróneas y para cuenta inexistente: distinguirlos
      // permitiría enumerar qué correos tienen cuenta.
      setError('No pudimos iniciar sesión con esos datos.');
      setBusy(false);
      return;
    }

    // `refresh` antes de navegar para que el middleware vea la cookie recién escrita.
    router.refresh();
    router.replace('/admin');
  }

  return (
    <main style={{ maxWidth: 420, margin: '0 auto', padding: '4rem 1.25rem' }}>
      <section className="card">
        <h1 style={{ marginTop: 0, fontSize: '1.2rem' }}>Administración</h1>

        <form onSubmit={handleSubmit} style={{ display: 'grid', gap: '0.9rem' }}>
          <div>
            <label htmlFor="email" style={{ display: 'block', fontWeight: 600, marginBottom: '0.35rem' }}>
              Correo
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="username"
              required
              disabled={busy}
              style={{ width: '100%' }}
            />
          </div>

          <div>
            <label
              htmlFor="password"
              style={{ display: 'block', fontWeight: 600, marginBottom: '0.35rem' }}
            >
              Contraseña
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              required
              disabled={busy}
              style={{ width: '100%' }}
            />
          </div>

          {error && (
            <p className="error" role="alert" style={{ margin: 0 }}>
              {error}
            </p>
          )}

          <button type="submit" className="primary" disabled={busy}>
            {busy ? 'Entrando…' : 'Entrar'}
          </button>
        </form>
      </section>
    </main>
  );
}
