import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

/**
 * Dos proyectos separados a propósito (research R8):
 *
 * - `unit`        corre sin infraestructura. Es el ciclo de desarrollo y lo que exige el
 *                 Principio VI de la constitución. `npm test`.
 * - `integration` requiere Supabase local (`supabase start`). Verifica lo que no se puede
 *                 simular: la atomicidad de las funciones de Postgres bajo concurrencia.
 *                 `npm run test:db`.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('.', import.meta.url)),
    },
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          include: ['tests/unit/**/*.test.ts'],
          environment: 'node',
        },
      },
      {
        extends: true,
        test: {
          name: 'integration',
          include: ['tests/integration/**/*.test.ts'],
          environment: 'node',
          testTimeout: 20_000,
        },
      },
    ],
  },
});
