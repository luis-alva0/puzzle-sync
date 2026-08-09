'use client';

import { useState, type FormEvent } from 'react';
import { ALIAS_MAX_LENGTH, ALIAS_MIN_LENGTH, validateAlias } from '@/lib/rooms/alias';

/**
 * Formulario de alias, usado tanto al crear una sala como al unirse.
 *
 * La validación replica `lib/rooms/alias.ts` para dar respuesta inmediata, pero NO sustituye
 * a la del servidor: el cliente es una conveniencia, la frontera de confianza está en el
 * route handler.
 */

interface AliasFormProps {
  submitLabel: string;
  busy?: boolean;
  error?: string | null;
  initialAlias?: string;
  onSubmit: (alias: string) => void;
}

export function AliasForm({
  submitLabel,
  busy = false,
  error = null,
  initialAlias = '',
  onSubmit,
}: AliasFormProps) {
  const [alias, setAlias] = useState(initialAlias);
  const [touched, setTouched] = useState(false);

  const validation = validateAlias(alias);
  const showError = touched && !validation.ok;

  const hint =
    showError && !validation.ok
      ? validation.reason === 'too_long'
        ? `Máximo ${ALIAS_MAX_LENGTH} caracteres.`
        : `Mínimo ${ALIAS_MIN_LENGTH} caracteres.`
      : null;

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setTouched(true);
    if (validation.ok) onSubmit(validation.alias);
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'grid', gap: '0.75rem' }}>
      <label htmlFor="alias" style={{ fontWeight: 600 }}>
        Tu alias
      </label>
      <input
        id="alias"
        name="alias"
        value={alias}
        onChange={(event) => setAlias(event.target.value)}
        onBlur={() => setTouched(true)}
        placeholder="Cómo te verán en la sala"
        autoComplete="off"
        autoFocus
        disabled={busy}
        aria-invalid={showError}
        aria-describedby={hint ? 'alias-hint' : undefined}
        maxLength={ALIAS_MAX_LENGTH * 2}
      />
      {hint && (
        <p id="alias-hint" className="error" role="alert" style={{ margin: 0 }}>
          {hint}
        </p>
      )}
      {error && (
        <p className="error" role="alert" style={{ margin: 0 }}>
          {error}
        </p>
      )}
      <button type="submit" className="primary" disabled={busy || !validation.ok}>
        {busy ? 'Un momento…' : submitLabel}
      </button>
    </form>
  );
}
