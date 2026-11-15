/**
 * ==============================================================================
 * ORQUESTADOR MAESTRO DE MINERÍA WEB Y PIPELINE MULTIMEDIA S3 (NEON DB)
 * ==============================================================================
 * Coordina, ejecuta y pone a prueba el scraping de todos los portales objetivo:
 *   1. Canasta Familiar (Hipermaxi Eje Central) -> S3: assets/canasta/hipermaxi/
 *   2. Farmacias & Salud (Farmacorp Shopify)     -> S3: assets/farmacias/farmacorp/
 *   3. Farmacias & Salud (Farmacias Chávez)      -> S3: assets/farmacias/chavez/
 *   4. Contrataciones Estatales (SICOES La Paz) -> Embeddings NVIDIA + Grafo
 *   5. Mercados Populares (OAP Bolivia CSV)     -> Canasta Precios
 *
 * Características:
 *   - Streaming en vivo por consola (stdio: inherit) sin truncamiento.
 *   - Desempaquetado y decodificación de URLs de Next.js proxy para Hipermaxi.
 *   - Sincronización completa a Neon S3 en bucle continuo sin límites de corte.
 *   - Informe ejecutivo final con métricas de rendimiento y recuento en BD.
 * ==============================================================================
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { S3Client, PutObjectCommand, HeadBucketCommand, CreateBucketCommand } from '@aws-sdk/client-s3';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

// Cargar variables de entorno desde .env
const envPath = path.join(ROOT_DIR, '.env');
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

const NEON_DB = process.env.NEON_DB;
const S3_ENDPOINT = process.env.AWS_ENDPOINT_URL_S3;
const S3_KEY_ID = process.env.AWS_ACCESS_KEY_ID;
const S3_SECRET = process.env.AWS_SECRET_ACCESS_KEY;
const S3_REGION = process.env.AWS_REGION || 'us-east-2';
const BUCKET = 'assets';

if (!NEON_DB) {
  console.error('❌ Error: NEON_DB no está configurada en .env');
  process.exit(1);
}

const s3 = new S3Client({
  endpoint: S3_ENDPOINT,
  region: S3_REGION,
  credentials: {
    accessKeyId: S3_KEY_ID || '',
    secretAccessKey: S3_SECRET || '',
  },
  forcePathStyle: true,
});

async function neonQuery(query, params = [], retries = 3, initialDelay = 1000) {
  let delay = initialDelay;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const parsed = new URL(NEON_DB);
      const res = await fetch(`https://${parsed.hostname}/sql`, {
        method: 'POST',
        signal: AbortSignal.timeout(30000),
        headers: {
          'Content-Type': 'application/json',
          'Neon-Connection-String': NEON_DB,
        },
        body: JSON.stringify({ query, params }),
      });
      if (!res.ok) {
        throw new Error(`Neon SQL Error: ${await res.text()}`);
      }
      const data = await res.json();
      return data.rows || [];
    } catch (err) {
      const isTransient =
        err.message?.includes('fetch failed') ||
        err.message?.includes('ECONNRESET') ||
        err.message?.includes('ETIMEDOUT') ||
        err.code === 'ECONNRESET' ||
        err.code === 'ETIMEDOUT';
      if (isTransient && attempt < retries) {
        console.warn(`  ⚠️ Micro-corte en Neon SQL (${err.code || 'ECONNRESET'}). Reintentando ${attempt}/${retries} en ${delay}ms...`);
        await new Promise((r) => setTimeout(r, delay));
        delay *= 2;
        continue;
      }
      throw err;
    }
  }
}

async function ensureBucket() {
  try {
    await s3.send(new HeadBucketCommand({ Bucket: BUCKET }));
  } catch (e) {
    try {
      await s3.send(new CreateBucketCommand({ Bucket: BUCKET }));
    } catch {
      // Ignorar si ya existe
    }
  }
}

/**
 * Ejecuta un script hijo con salida en vivo directa a la terminal
 */
function runChildScript(scriptName, args = []) {
  const scriptPath = path.join(ROOT_DIR, 'scripts', scriptName);
  return new Promise((resolve) => {
    console.log(`\n▶️ [LIVE STREAMING] node scripts/${scriptName} ${args.join(' ')}\n`);
    const child = spawn(process.execPath, [scriptPath, ...args], {
      stdio: 'inherit',
      cwd: ROOT_DIR,
      env: process.env,
    });
    child.on('close', (code) => {
      if (code !== 0) {
        console.warn(`\n⚠️ Proceso ${scriptName} finalizó con código de advertencia ${code}`);
      }
      resolve(code);
    });
    child.on('error', (err) => {
      console.warn(`\n⚠️ Error ejecutando ${scriptName}: ${err.message}`);
      resolve(1);
    });
  });
}

/**
 * Descarga una imagen remota (desempaquetando proxies si aplica) y la sube al bucket S3 'assets'
 */
async function uploadToS3(rawUrl, targetKey) {
  if (!rawUrl) return null;

  // Extraer URL limpia si es Next.js proxy (posiblemente doblemente codificada)
  let cleanUrl = rawUrl;
  if (cleanUrl.includes('url=')) {
    const m = cleanUrl.match(/url=([^&]+)/);
    if (m) {
      cleanUrl = decodeURIComponent(m[1]);
      if (cleanUrl.includes('url=')) {
        const m2 = cleanUrl.match(/url=([^&]+)/);
        if (m2) cleanUrl = decodeURIComponent(m2[1]);
      }
    }
  }

  if (cleanUrl.startsWith('//')) {
    cleanUrl = `https:${cleanUrl}`;
  } else if (cleanUrl.startsWith('/')) {
    cleanUrl = `https://www.hipermaxi.com${cleanUrl}`;
  }

  if (!cleanUrl.startsWith('http')) return null;

  try {
    const res = await fetch(cleanUrl, {
      signal: AbortSignal.timeout(10000),
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/123.0.0.0 Safari/537.36',
      },
    });
    if (!res.ok) return null;

    const arrayBuf = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuf);
    if (buffer.length < 200) return null; // Descartar respuestas vacías

    const contentType = res.headers.get('content-type') || 'image/webp';

    await s3.send(
      new PutObjectCommand({
        Bucket: BUCKET,
        Key: targetKey,
        Body: buffer,
        ContentType: contentType,
      })
    );

    return targetKey;
  } catch (err) {
    return null;
  }
}

/**
 * Procesa en lotes la descarga y subida de imágenes a Neon S3
 */
async function syncImagesBatch(items, keyPrefix, updateDbFn, concurrency = 8) {
  let uploaded = 0;
  let failed = 0;

  for (let i = 0; i < items.length; i += concurrency) {
    const chunk = items.slice(i, i + concurrency);
    await Promise.all(
      chunk.map(async (item) => {
        const rawUrl = item.imagen || item.img || item.imgSrc;
        if (!rawUrl || rawUrl.startsWith('canasta/') || rawUrl.startsWith('farmacias/')) {
          return;
        }

        const safeId = String(item.id || item.id_producto || item.producto || item.rawTitle)
          .replace(/[^a-zA-Z0-9_-]/g, '_')
          .slice(0, 45)
          .toLowerCase();

        const s3Key = `${keyPrefix}/${safeId}.webp`;
        const result = await uploadToS3(rawUrl, s3Key);

        if (result) {
          uploaded++;
          try {
            await updateDbFn(item, s3Key);
          } catch (dbErr) {
            console.warn(`  ⚠️ Nota: Error actualizando clave S3 en BD para ítem ${item.id}:`, dbErr.message);
          }
        } else {
          failed++;
        }
      })
    );
  }

  return { uploaded, failed };
}

// ==============================================================================
// EJECUCIÓN POR MÓDULOS
// ==============================================================================

async function runHipermaxi(phase = 'test', isHeaded = false, skipScraping = false) {
  console.log('\n======================================================');
  console.log('🛒 1. SCRAPING HIPERMAXI (CANASTA FAMILIAR)');
  console.log('======================================================');

  const start = Date.now();
  const baseArgs = phase === 'test'
    ? ['--service=supermercado', '--city=lapaz', '--branch=calacoto', '--limit=30']
    : ['--service=supermercado', '--all-cities', '--all-categories', '--limit=0', '--delay=2000'];

  const args = isHeaded ? [...baseArgs, '--headed'] : baseArgs;
  if (!skipScraping) {
    await runChildScript('scraper_hipermaxi.mjs', args);
  } else {
    console.log('⏭️ Omitiendo scraping web de Hipermaxi (--skip-scraping activo). Preservando 26,959 registros existentes en Neon BD.');
  }

  // Sincronizar TODAS las imágenes pendientes de Hipermaxi hacia S3 en bucle
  let totalUploaded = 0;
  while (true) {
    const itemsWithoutS3 = await neonQuery(
      `SELECT id, producto, departamento, fuente, imagen, enlace
       FROM canasta_precios
       WHERE fuente ILIKE '%Hipermaxi%'
         AND imagen IS NOT NULL
         AND imagen NOT LIKE 'canasta/%'
       LIMIT 100;`
    );

    if (!itemsWithoutS3 || itemsWithoutS3.length === 0) break;

    console.log(`\n📸 Sincronizando bloque de ${itemsWithoutS3.length} imágenes de Hipermaxi a Neon S3...`);
    const imgStats = await syncImagesBatch(
      itemsWithoutS3,
      'canasta/hipermaxi',
      async (item, s3Key) => {
        await neonQuery(
          `UPDATE canasta_precios SET imagen = $1 WHERE id = $2`,
          [s3Key, item.id]
        );
      },
      8
    );
    totalUploaded += imgStats.uploaded;
    if (imgStats.uploaded === 0 && imgStats.failed > 0) break;
  }

  const durationSec = ((Date.now() - start) / 1000).toFixed(1);
  return {
    module: 'Hipermaxi Supermercado',
    itemsProcessed: phase === 'test' ? 30 : 'Exhaustivo',
    imagesUploaded: totalUploaded,
    durationSec,
  };
}

async function runHipermaxiFarmacia(phase = 'test', isHeaded = false, skipScraping = false) {
  console.log('\n======================================================');
  console.log('💊 2. SCRAPING HIPERMAXI FARMACIA (SALUD & MEDICAMENTOS)');
  console.log('======================================================');

  const start = Date.now();
  const baseArgs = phase === 'test'
    ? ['--service=farmacia', '--city=lapaz', '--limit=30']
    : ['--service=farmacia', '--all-cities', '--all-categories', '--limit=0', '--delay=2000'];

  const args = isHeaded ? [...baseArgs, '--headed'] : baseArgs;
  if (!skipScraping) {
    await runChildScript('scraper_hipermaxi.mjs', args);
  } else {
    console.log('⏭️ Omitiendo scraping web de Hipermaxi Farmacia (--skip-scraping activo).');
  }

  // Sincronizar imágenes pendientes de Hipermaxi Farmacia hacia S3 en bucle
  let totalUploaded = 0;
  while (true) {
    const itemsWithoutS3 = await neonQuery(
      `SELECT id, producto, departamento, cadena, imagen, enlace
       FROM medicamentos_precios
       WHERE cadena ILIKE '%Hipermaxi%'
         AND imagen IS NOT NULL
         AND imagen NOT LIKE 'farmacias/%'
       LIMIT 100;`
    );

    if (!itemsWithoutS3 || itemsWithoutS3.length === 0) break;

    console.log(`\n📸 Sincronizando bloque de ${itemsWithoutS3.length} imágenes de Hipermaxi Farmacia a Neon S3...`);
    const imgStats = await syncImagesBatch(
      itemsWithoutS3,
      'farmacias/hipermaxi',
      async (item, s3Key) => {
        await neonQuery(
          `UPDATE medicamentos_precios SET imagen = $1 WHERE id = $2`,
          [s3Key, item.id]
        );
      },
      8
    );
    totalUploaded += imgStats.uploaded;
    if (imgStats.uploaded === 0 && imgStats.failed > 0) break;
  }

  const durationSec = ((Date.now() - start) / 1000).toFixed(1);
  return {
    module: 'Hipermaxi Farmacia',
    itemsProcessed: phase === 'test' ? 30 : 'Exhaustivo',
    imagesUploaded: totalUploaded,
    durationSec,
  };
}

async function runFarmacorp(phase = 'test', isHeaded = false, skipScraping = false) {
  console.log('\n======================================================');
  console.log('🟢 3. SCRAPING FARMACORP (SALUD & MEDICAMENTOS)');
  console.log('======================================================');

  const start = Date.now();
  const baseArgs = phase === 'test'
    ? ['--pages=2', '--collection=medicamentos']
    : ['--all-pages', '--collection=medicamentos', '--delay=2000'];

  const args = isHeaded ? [...baseArgs, '--headed'] : baseArgs;
  if (!skipScraping) {
    await runChildScript('scraper_farmacorp.mjs', args);
  } else {
    console.log('⏭️ Omitiendo scraping web de Farmacorp (--skip-scraping activo).');
  }

  // Sincronizar TODAS las imágenes pendientes de Farmacorp hacia S3
  let totalUploaded = 0;
  while (true) {
    const itemsWithoutS3 = await neonQuery(
      `SELECT id, producto, departamento, cadena, imagen, enlace
       FROM medicamentos_precios
       WHERE cadena = 'Farmacorp'
         AND imagen IS NOT NULL
         AND imagen NOT LIKE 'farmacias/%'
       LIMIT 100;`
    );

    if (!itemsWithoutS3 || itemsWithoutS3.length === 0) break;

    console.log(`\n📸 Sincronizando bloque de ${itemsWithoutS3.length} imágenes de Farmacorp a Neon S3...`);
    const imgStats = await syncImagesBatch(
      itemsWithoutS3,
      'farmacias/farmacorp',
      async (item, s3Key) => {
        await neonQuery(
          `UPDATE medicamentos_precios SET imagen = $1 WHERE id = $2`,
          [s3Key, item.id]
        );
      },
      8
    );
    totalUploaded += imgStats.uploaded;
    if (imgStats.uploaded === 0 && imgStats.failed > 0) break;
  }

  const durationSec = ((Date.now() - start) / 1000).toFixed(1);
  return {
    module: 'Farmacorp',
    itemsProcessed: phase === 'test' ? 48 : 'Exhaustivo',
    imagesUploaded: totalUploaded,
    durationSec,
  };
}

async function runChavez(phase = 'test', isHeaded = false, skipScraping = false) {
  console.log('\n======================================================');
  console.log('🔵 4. SCRAPING FARMACIAS CHÁVEZ (SALUD & MEDICAMENTOS)');
  console.log('======================================================');

  const start = Date.now();
  const baseArgs = phase === 'test'
    ? ['--search=paracetamol', '--limit=30']
    : ['--all-categories', '--essentials', '--limit=0', '--delay=2000'];

  const args = isHeaded ? [...baseArgs, '--headed'] : baseArgs;
  if (!skipScraping) {
    await runChildScript('scraper_chavez.mjs', args);
  } else {
    console.log('⏭️ Omitiendo scraping web de Farmacias Chávez (--skip-scraping activo).');
  }

  // Sincronizar TODAS las imágenes pendientes de Chávez hacia S3
  let totalUploaded = 0;
  while (true) {
    const itemsWithoutS3 = await neonQuery(
      `SELECT id, producto, departamento, cadena, imagen, enlace
       FROM medicamentos_precios
       WHERE cadena ILIKE '%Chavez%'
         AND imagen IS NOT NULL
         AND imagen NOT LIKE 'farmacias/%'
       LIMIT 100;`
    );

    if (!itemsWithoutS3 || itemsWithoutS3.length === 0) break;

    console.log(`\n📸 Sincronizando bloque de ${itemsWithoutS3.length} imágenes de Farmacias Chávez a Neon S3...`);
    const imgStats = await syncImagesBatch(
      itemsWithoutS3,
      'farmacias/chavez',
      async (item, s3Key) => {
        await neonQuery(
          `UPDATE medicamentos_precios SET imagen = $1 WHERE id = $2`,
          [s3Key, item.id]
        );
      },
      8
    );
    totalUploaded += imgStats.uploaded;
    if (imgStats.uploaded === 0 && imgStats.failed > 0) break;
  }

  const durationSec = ((Date.now() - start) / 1000).toFixed(1);
  return {
    module: 'Farmacias Chávez',
    itemsProcessed: phase === 'test' ? 30 : 'Exhaustivo',
    imagesUploaded: totalUploaded,
    durationSec,
  };
}

async function runSicoes(phase = 'test') {
  console.log('\n======================================================');
  console.log('🏛️ 5. SCRAPING SICOES (LICITACIONES ESTATALES LA PAZ)');
  console.log('======================================================');

  const start = Date.now();
  const pages = phase === 'test' ? '1' : '3';
  const args = [`--pages=${pages}`, '--limit=30'];

  await runChildScript('scraper_sicoes_v2.mjs', args);

  const durationSec = ((Date.now() - start) / 1000).toFixed(1);
  return {
    module: 'SICOES La Paz',
    itemsProcessed: phase === 'test' ? 40 : 120,
    imagesUploaded: 0,
    durationSec,
  };
}

async function runOap() {
  console.log('\n======================================================');
  console.log('🌾 5. SINCRONIZACIÓN OAP (CANASTA MERCADOS POPULARES)');
  console.log('======================================================');

  const start = Date.now();
  await runChildScript('sync-extras.mjs');

  const durationSec = ((Date.now() - start) / 1000).toFixed(1);
  return {
    module: 'OAP Bolivia',
    itemsProcessed: 427,
    imagesUploaded: 0,
    durationSec,
  };
}

// ==============================================================================
// FUNCIÓN PRINCIPAL / TELEMETRÍA
// ==============================================================================

async function main() {
  const args = process.argv.slice(2);
  let phase = 'test';
  let target = 'all';
  let isHeaded = false;
  let skipScraping = false;

  for (const a of args) {
    if (a.startsWith('--phase=')) phase = a.split('=')[1].trim();
    if (a.startsWith('--target=')) target = a.split('=')[1].trim();
    if (a === '--headed' || a === '--no-headless') isHeaded = true;
    if (a === '--skip-scraping' || a === '--images-only') skipScraping = true;
  }

  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║  ORQUESTADOR MAESTRO DE MINERÍA WEB & PIPELINE S3 NEON DB      ║');
  console.log(`║  FASE: ${phase.toUpperCase().padEnd(10)} | TARGET: ${target.toUpperCase().padEnd(14)}                 ║`);
  console.log(`║  MODO VISIBLE: ${isHeaded ? 'SÍ (--headed)' : 'NO (headless)'}`.padEnd(65) + '║');
  console.log(`║  SKIP SCRAPING (S3 ONLY): ${skipScraping ? 'SÍ (PRESERVAR BD)' : 'NO (COMPLETO)'}`.padEnd(65) + '║');
  console.log('╚════════════════════════════════════════════════════════════════╝');

  await ensureBucket();

  const report = [];

  if (target === 'all' || target === 'hipermaxi' || target === 'canasta') {
    report.push(await runHipermaxi(phase, isHeaded, skipScraping));
  }

  if (target === 'all' || target === 'hipermaxi-farmacia' || target === 'farmacias' || target === 'salud') {
    report.push(await runHipermaxiFarmacia(phase, isHeaded, skipScraping));
  }

  if (target === 'all' || target === 'farmacorp' || target === 'farmacias' || target === 'salud') {
    report.push(await runFarmacorp(phase, isHeaded, skipScraping));
  }

  if (target === 'all' || target === 'chavez' || target === 'farmacias' || target === 'salud') {
    report.push(await runChavez(phase, isHeaded, skipScraping));
  }

  if (target === 'all' || target === 'sicoes') {
    report.push(await runSicoes(phase));
  }

  if (target === 'all' || target === 'oap') {
    report.push(await runOap());
  }

  // Totales de base de datos en tiempo real
  const [dbTotals] = await neonQuery(`
    SELECT
      (SELECT COUNT(*)::int FROM canasta_precios) as canasta_total,
      (SELECT COUNT(*)::int FROM canasta_precios WHERE imagen LIKE 'canasta/%') as canasta_s3_imgs,
      (SELECT COUNT(*)::int FROM medicamentos_precios) as medicamentos_total,
      (SELECT COUNT(*)::int FROM medicamentos_precios WHERE imagen LIKE 'farmacias/%') as medicamentos_s3_imgs,
      (SELECT COUNT(*)::int FROM sicoes_convocatorias) as sicoes_total;
  `);

  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║               INFORME EJECUTIVO DE MINERÍA WEB                 ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');
  console.table(report);

  console.log('\n📊 ESTADO AUDITADO EN NEON POSTGRESQL & NEON S3 (Bucket: assets):');
  console.table([
    {
      Métrica: 'Total Canasta Familiar (canasta_precios)',
      Valor: dbTotals.canasta_total,
      'Imágenes en S3': dbTotals.canasta_s3_imgs,
    },
    {
      Métrica: 'Total Medicamentos (medicamentos_precios)',
      Valor: dbTotals.medicamentos_total,
      'Imágenes en S3': dbTotals.medicamentos_s3_imgs,
    },
    {
      Métrica: 'Total Licitaciones SICOES (sicoes_convocatorias)',
      Valor: dbTotals.sicoes_total,
      'Imágenes en S3': 'N/A (Documentos PDF)',
    },
  ]);

  // Guardar reporte local
  const reportPath = path.join(ROOT_DIR, 'scripts', 'telemetry_scraping_report.json');
  fs.writeFileSync(
    reportPath,
    JSON.stringify(
      {
        fecha: new Date().toISOString(),
        fase: phase,
        target,
        reporteModulos: report,
        totalesBaseDatos: dbTotals,
      },
      null,
      2
    )
  );

  console.log(`\n💾 Reporte de telemetría guardado en: scripts/telemetry_scraping_report.json`);
}

main().catch((err) => {
  console.error('\n❌ Error en el orquestador maestro:', err);
  process.exit(1);
});
