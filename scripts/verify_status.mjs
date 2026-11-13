import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

function loadEnv() {
  const envPath = path.resolve(ROOT_DIR, '.env');
  let dbUrl = process.env.DATABASE_URL || process.env.NEON_DB || '';
  if (fs.existsSync(envPath)) {
    const raw = fs.readFileSync(envPath, 'utf-8');
    for (const line of raw.split(/\r?\n/)) {
      const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
      if (!match) continue;
      const k = match[1];
      let v = (match[2] || '').trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      if (k === 'DATABASE_URL' || k === 'NEON_DB') dbUrl = v;
    }
  }
  return dbUrl;
}

const dbUrl = loadEnv();
if (!dbUrl) {
  console.error("No DATABASE_URL found");
  process.exit(1);
}

const host = new URL(dbUrl).hostname;

async function query(sql) {
  const res = await fetch(`https://${host}/sql`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Neon-Connection-String": dbUrl
    },
    body: JSON.stringify({ query: sql })
  });
  const data = await res.json();
  return data.rows;
}

async function run() {
  console.log("=== ESTADO GENERAL DE LA BASE DE DATOS NEON POSTGRESQL ===");
  console.log("\n1. SICOES Convocatorias:");
  console.table(await query("SELECT estado, COUNT(*) as c FROM sicoes_convocatorias GROUP BY estado ORDER BY estado;"));
  
  console.log("\n2. Canasta Familiar Precios:");
  console.table(await query("SELECT fuente, departamento, COUNT(*) as c FROM canasta_precios GROUP BY fuente, departamento ORDER BY fuente, departamento;"));
  
  console.log("\n3. Centros de Salud (OSM):");
  console.table(await query("SELECT tipo, departamento, COUNT(*) as c FROM centros_salud GROUP BY tipo, departamento ORDER BY tipo, departamento;"));
  
  console.log("\n4. Medicamentos Precios (Farmacorp & Farmacias Chávez):");
  console.table(await query("SELECT cadena, departamento, COUNT(*) as c FROM medicamentos_precios GROUP BY cadena, departamento ORDER BY cadena, departamento;"));

  console.log("\n5. Muestra de Laboratorios extraídos en Farmacias Chávez:");
  console.table(await query("SELECT producto, laboratorio, precio_bs FROM medicamentos_precios WHERE cadena = 'Farmacias Chávez' AND laboratorio IS NOT NULL LIMIT 10;"));
}

run().catch(console.error);
