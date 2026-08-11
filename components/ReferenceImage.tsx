'use client';

import { useEffect, useState } from 'react';

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
  /** URL firmada de la imagen del rompecabezas, o cadena vacía si aún no se conoce. */
  imageUrl: string;
}

export function ReferenceImage({ visible, onVisibleChange, imageUrl }: ReferenceImageProps) {
  // Que la URL exista no significa que la imagen cargue. Se guarda **cuál** falló, no un booleano,
  // para que cambiar de rompecabezas reinicie el estado sin tocarlo dentro del efecto.
  const [failedUrl, setFailedUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!imageUrl) return;
    const probe = new Image();
    probe.onerror = () => setFailedUrl(imageUrl);
    probe.src = imageUrl;
    return () => {
      probe.onerror = null;
    };
  }, [imageUrl]);

  const available = Boolean(imageUrl) && failedUrl !== imageUrl;

  return (
    <button
      type="button"
      disabled={!available}
      aria-pressed={visible}
      aria-label={
        available
          ? 'Ver la imagen completa del rompecabezas'
          : 'La imagen de referencia no está disponible'
      }
      title={available ? 'Ver la imagen completa' : 'No se pudo cargar la imagen'}
      style={{ padding: '0.35rem 0.6rem', lineHeight: 1, opacity: visible ? 1 : 0.85 }}
      // Con ratón manda el hover (FR-021, FR-022); `pointerType` deja fuera el táctil, así que el
      // clic solo llega de un dedo o del teclado y ahí alterna (FR-023).
      onPointerEnter={(event) => event.pointerType !== 'touch' && onVisibleChange(true)}
      onPointerLeave={(event) => event.pointerType !== 'touch' && onVisibleChange(false)}
      onClick={() => onVisibleChange(!visible)}
    >
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
    </button>
  );
}
