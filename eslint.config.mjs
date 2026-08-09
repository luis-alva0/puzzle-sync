import coreWebVitals from 'eslint-config-next/core-web-vitals';
import typescriptConfig from 'eslint-config-next/typescript';

const config = [
  {
    ignores: [
      'node_modules/**',
      '.next/**',
      'out/**',
      'build/**',
      'dist/**',
      'coverage/**',
      'next-env.d.ts',
      // Lo genera `supabase start`; ya está fuera de git y trae código minificado.
      'supabase/.temp/**',
    ],
  },
  ...coreWebVitals,
  ...typescriptConfig,
  {
    rules: {
      // TypeScript en modo estricto: `any` requiere justificación explícita, no descuido.
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
];

export default config;
