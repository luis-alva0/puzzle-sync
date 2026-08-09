#!/usr/bin/env node
/**
 * Aplica supabase/seed.sql contra el proyecto configurado en el entorno.
 *
 * Se ejecuta con `npm run seed`. Lee las credenciales de .env.local; nunca las lleva escritas
 * (Principio II de la constitución).
 *
 * Usa la API REST de Supabase en lugar de una conexión directa a Postgres para no añadir una
 * dependencia de cliente de base de datos que solo serviría para esto.
 */

import { readFileSync, existsSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

function loadEnvLocal() {
  if (!existsSync('.env.local')) return;
  for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key]) continue;
    process.env[key] = rawValue.replace(/^["']|["']$/g, '');
  }
}

loadEnvLocal();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceRoleKey) {
  console.error(
    'Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY.\n' +
      'Copiar .env.example a .env.local y rellenarlas antes de sembrar.',
  );
  process.exit(1);
}

// Los mismos rompecabezas que supabase/seed.sql, que sigue siendo la ruta para
// `supabase db reset`. Esto es la ruta para sembrar un proyecto remoto sin la CLI.
//
// `visibility` y `source` van explícitos: sus valores por defecto en la tabla (`private` y
// `user_photo`) son falsos para la semilla. `nominal_piece_count` se omite y queda NULL, que es
// lo correcto: ninguna nació de elegir entre las cinco opciones.
const SVG = (body) => `data:image/svg+xml;utf8,${body}`;

const rows = [
  {
    id: '11111111-1111-4111-8111-111111111111',
    image_url: SVG(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><rect width="200" height="200" fill="%236c8cff"/><circle cx="100" cy="100" r="60" fill="none" stroke="white" stroke-width="8"/></svg>',
    ),
    grid_rows: 2,
    grid_cols: 2,
    visibility: 'public',
    source: 'seed',
  },
  {
    id: '22222222-2222-4222-8222-222222222222',
    image_url: SVG(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 400"><rect width="500" height="400" fill="%234ade80"/><circle cx="420" cy="80" r="42" fill="%23fbbf24"/></svg>',
    ),
    grid_rows: 4,
    grid_cols: 5,
    visibility: 'public',
    source: 'seed',
  },
  {
    id: '33333333-3333-4333-8333-333333333333',
    image_url: SVG(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000"><rect width="1000" height="1000" fill="%2311131a"/><circle cx="500" cy="500" r="400" fill="%23ff6b6b"/></svg>',
    ),
    grid_rows: 10,
    grid_cols: 10,
    visibility: 'public',
    source: 'seed',
  },
];

const supabase = createClient(url, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { error } = await supabase.from('puzzles').upsert(rows, { onConflict: 'id' });

if (error) {
  console.error(`Falló la siembra: ${error.message}`);
  process.exit(1);
}

console.log(`Sembrados ${rows.length} rompecabezas:`);
for (const row of rows) {
  console.log(
    `  ${row.id}  ${row.grid_rows}x${row.grid_cols}  (${row.grid_rows * row.grid_cols} piezas)`,
  );
}
