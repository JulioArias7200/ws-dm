import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const envPath = path.resolve(ROOT_DIR, '.env');
const schemaPath = path.resolve(ROOT_DIR, 'db', 'schema.sql');
const backfillPath = path.resolve(ROOT_DIR, 'db', 'backfill.sql');

if (!fs.existsSync(envPath)) {
  console.error('❌ Archivo .env no encontrado en', envPath);
  process.exit(1);
}

const envContent = fs.readFileSync(envPath, 'utf-8');
let neonUrl = '';
for (const line of envContent.split(/\r?\n/)) {
  const trimmed = line.trim();
  if (trimmed.startsWith('#') || !trimmed) continue;
  const eqIdx = trimmed.indexOf('=');
  if (eqIdx > 0) {
    const k = trimmed.slice(0, eqIdx).trim();
    let v = trimmed.slice(eqIdx + 1).trim().replace(/^['"]|['"]$/g, '');
    if (k === 'NEON_DB' || k === 'DATABASE_URL') {
      neonUrl = v;
    }
  }
}

if (!neonUrl) {
  console.error('❌ No se encontró variable NEON_DB o DATABASE_URL en .env');
  process.exit(1);
}

const u = new URL(neonUrl);
const endpoint = `https://${u.host}/sql`;

console.log('🌐 Conectando a Neon PostgreSQL...');
console.log(`   Host: ${u.host}`);
console.log(`   Aplicando DDL desde: ${schemaPath}`);

// Función robusta para extraer sentencias respetando $$...$$
function splitStatements(sql) {
  // Limpiar comentarios de una sola línea fuera de dollar quotes
  const lines = sql.split(/\r?\n/).map(line => {
    const commentIdx = line.indexOf('--');
    if (commentIdx >= 0) {
      return line.substring(0, commentIdx);
    }
    return line;
  });

  const text = lines.join('\n');
  const statements = [];
  let current = '';
  let inDollarQuote = false;

  for (let i = 0; i < text.length; i++) {
    if (text.substr(i, 2) === '$$') {
      inDollarQuote = !inDollarQuote;
      current += '$$';
      i++; // saltar segundo $
      continue;
    }

    const char = text[i];
    if (char === ';' && !inDollarQuote) {
      const trimmed = current.trim();
      if (trimmed.length > 0) {
        statements.push(trimmed);
      }
      current = '';
    } else {
      current += char;
    }
  }

  const lastTrimmed = current.trim();
  if (lastTrimmed.length > 0) {
    statements.push(lastTrimmed);
  }

  return statements;
}

async function runQuery(query) {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Neon-Connection-String': neonUrl
    },
    body: JSON.stringify({ query })
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`HTTP ${res.status}: ${errText}`);
  }
  return await res.json();
}

try {
  // 1. Limpieza de tabla plana previa para permitir creación de tabla particionada
  console.log('🧹 Preparando transición a tabla particionada...');
  try {
    await runQuery('DROP TABLE IF EXISTS precios_historico CASCADE;');
    console.log('   ✅ Tabla previa no particionada limpiada exitosamente.');
  } catch (dropErr) {
    console.warn('   ⚠️ Nota en drop:', dropErr.message);
  }

  // 2. Ejecutar sentencias de schema.sql
  const rawSql = fs.readFileSync(schemaPath, 'utf-8');
  const statements = splitStatements(rawSql);
  console.log(`\n📦 Sentencias DDL a ejecutar: ${statements.length}\n`);

  let executedCount = 0;
  for (const stmt of statements) {
    const firstLine = stmt.split('\n')[0].substring(0, 65);
    process.stdout.write(`⏳ Ejecutando: ${firstLine}... `);
    try {
      await runQuery(stmt);
      console.log('✅ OK');
      executedCount++;
    } catch (stmtErr) {
      console.log('❌ ERROR');
      console.error(`   Detalle: ${stmtErr.message}`);
      if (stmt.toLowerCase().includes('create extension')) {
        console.warn('   ⚠️ Advertencia en extensión (se continúa)...');
      } else {
        throw stmtErr;
      }
    }
  }

  console.log(`\n🎉 ${executedCount} sentencias DDL ejecutadas exitosamente.`);

  // 3. Ejecutar Backfill retroactivo si existe
  if (fs.existsSync(backfillPath)) {
    console.log('\n🚀 Iniciando migración retroactiva (Backfill in-engine)...');
    const rawBackfill = fs.readFileSync(backfillPath, 'utf-8');
    const backfillStatements = splitStatements(rawBackfill);
    
    for (const bStmt of backfillStatements) {
      const bFirstLine = bStmt.split('\n')[0].substring(0, 65);
      process.stdout.write(`⏳ Backfill: ${bFirstLine}... `);
      await runQuery(bStmt);
      console.log('✅ OK');
    }
    console.log('✅ Backfill retroactivo completado exitosamente.');
  }

  // 4. Auditoría final de recuento
  console.log('\n🔍 Verificando estado final en Neon PostgreSQL...');
  const countStats = await runQuery(`
    SELECT 'catalogo_productos_master' as tabla, count(*)::int as filas FROM catalogo_productos_master
    UNION ALL
    SELECT 'precios_historico', count(*)::int FROM precios_historico
    UNION ALL
    SELECT 'medicamentos_precios', count(*)::int FROM medicamentos_precios
    UNION ALL
    SELECT 'canasta_precios', count(*)::int FROM canasta_precios;
  `);

  console.log('\n📊 Métricas de Tablas en Neon PostgreSQL tras migración:');
  console.table(countStats.rows);

} catch (err) {
  console.error('\n❌ Error crítico durante la migración:', err.message);
  process.exit(1);
}
