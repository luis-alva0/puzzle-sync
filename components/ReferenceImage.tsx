'use client';

import { useState } from 'react';

/**
 * Icono que muestra la imagen completa como ayuda para armar (FR-021 a FR-024).
 *
 * Este componente **solo decide cuándo**; el dibujado lo hace `BoardCanvas`, que ya tiene la
 * imagen cargada, la escala y el rectángulo del área central. Pasar un booleano evita exportar la
 * escala fuera del canvas y mantenerla sincronizada en cada redimensionado (research R7).
 *
 * Mostrarla no envía nada por el canal: es una ayuda local y los demás jugadores no se enteran
 * (FR-024).
 */

interface ReferenceImageProps {
  visible: boolean;
  onVisibleChange: (visible: boolean) => void;
  /** `false` si la imagen del rompecabezas no cargó: el icono lo dice en vez de mostrar un hueco. */
  available: boolean;
}

export function ReferenceImage({ visible, onVisibleChange, available }: ReferenceImageProps) {
  // En táctil no hay «posar el ratón»: el toque alterna (FR-023). Se distingue del ratón por el
  // tipo de puntero del propio evento, no por el ancho de la ventana.
  const [touchLatched, setTouchLatched] = useState(false);

  if (!available) {
    return (
      <span
        role="img"
        aria-label="La imagen de referencia no está disponible"
        title="No se pudo cargar la imagen del rompecabezas"
        style={{ opacity: 0.4, padding: '0.35rem 0.6rem', lineHeight: 1 }}
      >
        <ImageIcon />
      </span>
    );
  }

  return (
    <button
      type="button"
      aria-pressed={visible}
      aria-label="Ver la imagen completa del rompecabezas"
      title="Ver la imagen completa"
      style={{ padding: '0.35rem 0.6rem', lineHeight: 1, opacity: visible ? 1 : 0.85 }}
      onPointerEnter={(event) => {
        if (event.pointerType !== 'touch') onVisibleChange(true);
      }}
      onPointerLeave={(event) => {
        if (event.pointerType !== 'touch' && !touchLatched) onVisibleChange(false);
      }}
      onClick={(event) => {
        // El clic solo manda en táctil y con teclado; con ratón ya lo resuelve el hover.
        if (event.detail === 0 || touchLatched || !visible) {
          const next = !visible;
          setTouchLatched(next);
          onVisibleChange(next);
        }
      }}
      onBlur={() => {
        if (touchLatched) return;
        onVisibleChange(false);
      }}
    >
      <ImageIcon />
    </button>
  );
}

/** Marco con una montaña, el icono habitual de «imagen». En SVG para no añadir dependencias. */
function ImageIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <rect
        x="2.5"
        y="4"
        width="15"
        height="12"
        rx="1.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <circle cx="7" cy="8" r="1.3" fill="currentColor" />
      <path
        d="M4 14l3.5-4 2.5 3 2-2.5L16 14"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}
