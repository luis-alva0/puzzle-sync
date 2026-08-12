/**
 * El clic que confirma un encaje.
 *
 * **Sintetizado, sin archivo.** El repositorio es público y un audio arrastra su licencia y su
 * procedencia; el Principio I pide no añadir piezas que mantener; y sin recurso que precargar, el
 * sonido llega al instante en lugar de depender de que la descarga haya terminado.
 *
 * Suena a clic seco, no a chasquido de cartón. Es el precio de no traer un archivo, y está
 * aceptado. Cambiarlo por uno real más adelante es sustituir esta función, no rediseñar nada.
 */

/** Separación mínima entre sonidos. Con dos jugadores encajando a la vez, evita la matraca. */
export const MIN_GAP_MS = 150;

/** Duración del clic. Cuarenta milisegundos: se oye y no se arrastra. */
const DURATION_S = 0.04;

let context: AudioContext | null = null;
let lastPlayedAt = 0;

/**
 * Crea el contexto de audio, o lo reutiliza.
 *
 * **Se crea en el primer encaje, no al montar el tablero.** Los navegadores suspenden los
 * contextos creados sin interacción previa del usuario, y crear uno que quizá no se use es gasto
 * por si acaso. Cuando llega el primer encaje ya hubo un arrastre, así que hay interacción.
 */
function audioContext(): AudioContext | null {
  if (context) return context;
  if (typeof window === 'undefined') return null;

  const Ctor = window.AudioContext ?? (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;

  context = new Ctor();
  return context;
}

/** Ruido blanco corto, la materia prima del clic. */
function noiseBuffer(ctx: AudioContext): AudioBuffer {
  const frames = Math.floor(ctx.sampleRate * DURATION_S);
  const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < frames; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}

/**
 * Reproduce el clic, si toca.
 *
 * Devuelve `true` si sonó y `false` si se descartó por el limitador o porque el navegador no deja.
 * **Nunca lanza**: un fallo de audio no puede impedir que dos piezas encajen.
 *
 * `now` se puede inyectar para poder probar el limitador sin esperar.
 */
export function playSnapClick(options: { muted?: boolean; now?: number } = {}): boolean {
  const { muted = false, now = Date.now() } = options;
  if (muted) return false;

  // Limitador: varios encajes en el mismo instante suenan una vez.
  if (now - lastPlayedAt < MIN_GAP_MS) return false;

  try {
    const ctx = audioContext();
    if (!ctx) return false;
    void ctx.resume?.();

    const source = ctx.createBufferSource();
    source.buffer = noiseBuffer(ctx);

    // Paso banda alto: el ruido crudo suena a estática; filtrado, a golpe seco de plástico.
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 2_200;
    filter.Q.value = 1.1;

    // Envolvente: ataque instantáneo y caída exponencial. Es lo que lo hace un clic y no un siseo.
    const gain = ctx.createGain();
    const start = ctx.currentTime;
    gain.gain.setValueAtTime(0.28, start);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + DURATION_S);

    source.connect(filter).connect(gain).connect(ctx.destination);
    source.start(start);
    source.stop(start + DURATION_S);

    lastPlayedAt = now;
    return true;
  } catch {
    // El navegador puede negarse a reproducir. El encaje ya ocurrió: no hay nada que deshacer.
    return false;
  }
}

/** Reinicia el limitador. Solo para pruebas. */
export function resetClickLimiter(): void {
  lastPlayedAt = 0;
}
