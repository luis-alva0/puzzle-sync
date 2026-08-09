#!/usr/bin/env node
/**
 * Verifica que ninguna credencial de servidor acabe en el bundle del cliente (T067).
 *
 * El Principio II de la constitución es no negociable y el repositorio es público: una
 * service_role filtrada al bundle es irreversible. Este chequeo se ejecuta tras `npm run build`
 * y falla con código distinto de cero, para poder encadenarlo en cualquier verificación previa
 * al merge.
 */
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const CLIENT_DIR = '.next/static';

if (!existsSync(CLIENT_DIR)) {
  console.error(`No existe ${CLIENT_DIR}. Ejecuta \`npm run build\` primero.`);
  process.exit(1);
}

function walk(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const findings = [];
for (const file of walk(CLIENT_DIR)) {
  const content = readFileSync(file, 'utf8');

  if (content.includes('SUPABASE_SERVICE_ROLE_KEY')) {
    findings.push(`${file}: menciona SUPABASE_SERVICE_ROLE_KEY`);
  }
  // El valor real, si está en el entorno de build: lo que de verdad importa no filtrar.
  if (serviceRoleKey && serviceRoleKey.length > 20 && content.includes(serviceRoleKey)) {
    findings.push(`${file}: CONTIENE EL VALOR de la service_role`);
  }
}

if (findings.length > 0) {
  console.error('FUGA DE CREDENCIALES EN EL BUNDLE DEL CLIENTE:\n');
  for (const finding of findings) console.error(`  ${finding}`);
  console.error(
    '\nRotar la llave de inmediato: en un repositorio público la filtración es irreversible.',
  );
  process.exit(1);
}

console.log('OK: ninguna credencial de servidor en el bundle del cliente.');
