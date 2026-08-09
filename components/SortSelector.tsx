'use client';

import type { SortOrder } from '@/types/catalog';

/**
 * Selector de ordenamiento del catálogo (FR-008, FR-009).
 *
 * Exactamente dos opciones, `recent` por defecto. No hay orden personalizado ni por relevancia:
 * el spec fija estas dos y ninguna más.
 */

const OPTIONS: { value: SortOrder; label: string }[] = [
  { value: 'recent', label: 'Más recientes' },
  { value: 'played', label: 'Más jugados' },
];

interface SortSelectorProps {
  value: SortOrder;
  onChange: (value: SortOrder) => void;
  disabled?: boolean;
}

export function SortSelector({ value, onChange, disabled = false }: SortSelectorProps) {
  return (
    <div role="radiogroup" aria-label="Ordenar el catálogo" style={{ display: 'flex', gap: '0.5rem' }}>
      {OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          disabled={disabled}
          onClick={() => onChange(option.value)}
          style={{ borderColor: value === option.value ? 'var(--accent)' : 'var(--border)' }}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
