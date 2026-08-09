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

/**
 * Los rompecabezas de la semilla, en la misma forma que supabase/seed.sql.
 * El archivo .sql sigue siendo la fuente para `supabase db reset`; esto es la ruta para
 * sembrar un proyecto remoto sin la CLI.
 */
const seedSql = readFileSync('supabase/seed.sql', 'utf8');
const rows = [...seedSql.matchAll(/\(\s*'([0-9a-f-]{36})',\s*'([^']+)',\s*(\d+),\s*(\d+)\s*\)/g)].map(
  ([, id, imageUrl, gridRows, gridCols]) => ({
    id,
    image_url: imageUrl,
    grid_rows: Number(gridRows),
    grid_cols: Number(gridCols),
  }),
);

if (rows.length === 0) {
  console.error('No se pudo extraer ningún rompecabezas de supabase/seed.sql.');
  process.exit(1);
}

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
  console.log(`  ${row.id}  ${row.grid_rows}x${row.grid_cols}  (${row.grid_rows * row.grid_cols} piezas)`);
}
