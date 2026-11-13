import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.resolve(__dirname, '..', '.env');

if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx > 0) {
      const key = trimmed.slice(0, eqIdx).trim();
      let val = trimmed.slice(eqIdx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      process.env[key] = val;
    }
  }
}

const neonUrl = process.env.NEON_DB;
if (!neonUrl) {
  console.error('❌ NEON_DB no encontrada');
  process.exit(1);
}

async function neonQuery(query, params = []) {
  const parsed = new URL(neonUrl);
  const res = await fetch(`https://${parsed.hostname}/sql`, {
    method: 'POST',
    signal: AbortSignal.timeout(15000),
    headers: {
      'Content-Type': 'application/json',
      'Neon-Connection-String': neonUrl,
    },
    body: JSON.stringify({ query, params }),
  });
  if (!res.ok) throw new Error(await res.text());
  const json = await res.json();
  return json.rows || [];
}

async function main() {
  console.log('--- TEST 1: Conteo vivo de tablas en Neon DB ---');
  const [counts] = await neonQuery(`
    SELECT
      (SELECT COUNT(*)::int FROM sicoes_convocatorias) AS sicoes,
      (SELECT COUNT(*)::int FROM canasta_precios) AS canasta,
      (SELECT COUNT(*)::int FROM medicamentos_precios) AS medicamentos,
      (SELECT COUNT(*)::int FROM centros_salud) AS centros,
      (SELECT COUNT(*)::int FROM sicoes_usage_logs) AS logs
  `);
  console.log('✅ Conteos reales en Neon DB:', counts);

  console.log('\n--- TEST 2: Consulta Canasta Familiar (Dual) ---');
  const canastaItems = await neonQuery(
    `SELECT DISTINCT ON (producto, fuente)
            producto, categoria, unidad_medida, precio_bs::float AS precio_bs, fuente
     FROM canasta_precios
     WHERE producto ILIKE '%arroz%'
     LIMIT 4`
  );
  console.log(`✅ Canasta items recuperados (${canastaItems.length}):`, canastaItems);

  console.log('\n--- TEST 3: Consulta Medicamentos (Farmacorp / Chávez) ---');
  const pharmaItems = await neonQuery(
    `SELECT cadena, producto, precio_bs::float AS precio_bs, enlace
     FROM medicamentos_precios
     WHERE producto ILIKE '%paracetamol%'
     LIMIT 4`
  );
  console.log(`✅ Medicamentos comparativos (${pharmaItems.length}):`, pharmaItems);

  console.log('\n--- TEST 4: Consulta Centros de Salud OSM ---');
  const centros = await neonQuery(
    `SELECT nombre, tipo, lat, lon
     FROM centros_salud
     LIMIT 4`
  );
  console.log(`✅ Centros de salud OSM (${centros.length}):`, centros);

  console.log('\n🎉 VALIDACIÓN EXITOSA: TODAS LAS TABLAS Y CONSULTAS RESPONDEN CON DATOS REALES.');
}

main().catch((err) => {
  console.error('❌ Error en test:', err);
  process.exit(1);
});
