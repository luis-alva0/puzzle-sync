/**
 * Preferencia de sonido: activado o silenciado.
 *
 * Local a cada navegador y persistente, como el alias. No viaja al servidor ni se comparte: dos
 * jugadores de la misma sala pueden tenerla distinta.
 *
 * Se publica con un evento propio para que la barra y el tablero, que no se conocen entre sí, se
 * enteren del cambio sin tener que subir el estado hasta la página.
 */

const KEY = 'puzzlesync:sound-muted';
const EVENT = 'puzzlesync:sound-preference';

export function isSoundMuted(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(KEY) === '1';
  } catch {
    // Un navegador con el almacenamiento bloqueado no debe romper el tablero.
    return false;
  }
}

export function setSoundMuted(muted: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(KEY, muted ? '1' : '0');
  } catch {
    // Sin persistencia, la preferencia vale para esta sesión y ya.
  }
  window.dispatchEvent(new CustomEvent(EVENT, { detail: muted }));
}

/**
 * Avisa de los cambios. Devuelve la función para dejar de escuchar.
 *
 * La firma es la que espera `useSyncExternalStore`: un aviso sin argumentos, y el que escucha
 * vuelve a leer con `isSoundMuted()`. Así el componente no necesita estado propio ni un efecto
 * que lo fije al montar, que es lo que da problemas de hidratación.
 */
export function subscribeToSoundPreference(listener: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener(EVENT, listener);
  return () => window.removeEventListener(EVENT, listener);
}

/** Instantánea para el servidor: allí no hay preferencia guardada, así que el sonido está activo. */
export function soundMutedServerSnapshot(): boolean {
  return false;
}
