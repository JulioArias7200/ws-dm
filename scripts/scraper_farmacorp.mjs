/**
 * ==============================================================================
 * FARMACORP WEB SCRAPER - PLAYWRIGHT (CATÁLOGO Y PRECIOS FARMACÉUTICOS BOLIVIA)
 * ==============================================================================
 * Scraper especializado para la cadena de farmacias Farmacorp (Bolivia):
 *   - Catálogo general y colecciones (`/collections/all`, `/collections/medicamentos`)
 *   - Búsqueda directa por principio activo o fármaco (`/search?type=product&q=...`)
 *   - Paginación dinámica (hasta 685 páginas en catálogo completo)
 *
 * Características:
 *   1. Motor Chromium headless con Playwright y cabeceras de evasión pasiva.
 *   2. Extracción DOM de tarjetas `.productitem`:
 *      - Título comercial y presentación médica (mg, ml, tabletas, gotas, sobres)
 *      - Laboratorio fabricante / vendor (Inti, Bagó, Roemmers, Bayer, etc.)
 *      - Precios en Bolivianos (precio actual, precio regular y % descuento)
 *      - Enlace canónico del producto e imagen en CDN Shopify
 *   3. Normalización y deduplicación por clave única (fecha, cadena, departamento, producto).
 *   4. Respaldo local JSON (`data_scraped_farmacorp.json`).
 *   5. Sincronización idempotente en tabla `medicamentos_precios` de Neon PostgreSQL.
 *
 * Política anti-CAPTCHA:
 *   Cumplimiento estricto de las directrices: si la plataforma presenta desafíos
 *   anti-bot interactivos, el script aborta pacíficamente y conserva el estado previo.
 *
 * Uso en PowerShell (desde `ws-dm/`):
 *   node scripts/scraper_farmacorp.mjs --dry-run
 *   node scripts/scraper_farmacorp.mjs --pages=2
 *   node scripts/scraper_farmacorp.mjs --collection=medicamentos --pages=3
 *   node scripts/scraper_farmacorp.mjs --search="paracetamol"
 *   node scripts/scraper_farmacorp.mjs --search="ibuprofeno"
 *   node scripts/scraper_farmacorp.mjs --city="La Paz"
 * ==============================================================================
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const BASE_URL = 'https://farmacorp.com';
const BACKUP_JSON_PATH = path.resolve(ROOT_DIR, 'data_scraped_farmacorp.json');

// ==============================================================================
// ARGUMENTOS CLI Y CONFIGURACIÓN
// ==============================================================================

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    pages: 2,
    collection: 'all', // 'all', 'medicamentos', 'cuidado-personal', etc.
    search: '',
    city: 'La Paz',
    limit: 0,
    dryRun: false,
    headless: true,
    delayMs: 1200
  };

  for (const arg of args) {
    if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--no-headless' || arg === '--headed') options.headless = false;
    else if (arg.startsWith('--pages=')) options.pages = Math.max(1, parseInt(arg.split('=')[1], 10) || 1);
    else if (arg.startsWith('--collection=')) options.collection = arg.split('=')[1].trim();
    else if (arg.startsWith('--search=')) options.search = arg.split('=')[1].trim();
    else if (arg.startsWith('--city=')) options.city = arg.split('=')[1].trim();
    else if (arg.startsWith('--limit=')) options.limit = parseInt(arg.split('=')[1], 10) || 0;
    else if (arg.startsWith('--delay=')) options.delayMs = parseInt(arg.split('=')[1], 10) || 1200;
  }

  return options;
}

function loadEnv() {
  const envPath = path.resolve(ROOT_DIR, '.env');
  const env = {
    NEON_DB: process.env.NEON_DB || process.env.DATABASE_URL || ''
  };

  if (fs.existsSync(envPath)) {
    const raw = fs.readFileSync(envPath, 'utf-8');
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf('=');
      if (idx === -1) continue;
      const k = trimmed.slice(0, idx).trim();
      const v = trimmed.slice(idx + 1).trim().replace(/^['"]|['"]$/g, '');
      if (k === 'NEON_DB' || k === 'DATABASE_URL') env.NEON_DB = v;
    }
  }

  return env;
}

// ==============================================================================
// HELPERS DE LIMPIEZA Y PARSEO
// ==============================================================================

function parsePriceBs(rawText) {
  if (!rawText) return null;
  // Ejemplos: "Bs5,10", "Bs 12,50", "Bs. 8.00", "5,10"
  const clean = rawText
    .replace(/[^\d.,]/g, '')
    .trim();
  if (!clean) return null;

  // Convertir formato con coma decimal
  let normalized = clean;
  if (normalized.includes(',') && !normalized.includes('.')) {
    normalized = normalized.replace(',', '.');
  } else if (normalized.includes('.') && normalized.includes(',')) {
    normalized = normalized.replace(/\./g, '').replace(',', '.');
  }

  const num = parseFloat(normalized);
  return Number.isFinite(num) && num > 0 ? Number(num.toFixed(2)) : null;
}

function extractPresentation(title) {
  if (!title) return null;
  // Detectar patrones farmacéuticos: "X 20 TABLETAS", "X TABLETA", "100 MG", "JARABE X 120 ML", etc.
  const regex = /(?:x\s*(?:\d+\s*)?(?:tabletas?|comprimidos?|c[áa]psulas?|sobres?|ampollas?|unidades?|parches?)|(?:\d+(?:\.\d+)?\s*(?:mg|ml|gr|g|mcg|ui|%))(?:\s*x\s*\d+\s*(?:ml|mg|sobres?|tabletas?)?)?)/i;
  const match = title.match(regex);
  return match ? match[0].trim() : null;
}

function cleanTitle(title) {
  if (!title) return '';
  return title
    .replace(/\s+/g, ' ')
    .trim();
}

// ==============================================================================
// EXTRACCIÓN DOM CON PLAYWRIGHT
// ==============================================================================

async function extractCardsFromPage(page, contextInfo) {
  return await page.$$eval(
    '.productitem',
    (elements, ctx) => {
      const results = [];

      for (const el of elements) {
        // Título y Enlace
        const titleEl = el.querySelector('.productitem--title a') || el.querySelector('.productitem--title');
        const rawTitle = titleEl ? titleEl.textContent.trim() : '';
        if (!rawTitle) continue;

        const href = titleEl && titleEl.getAttribute('href') ? titleEl.getAttribute('href') : '';
        const fullLink = href.startsWith('http') ? href : `https://farmacorp.com${href}`;

        // Laboratorio / Fabricante
        const vendorEl = el.querySelector('.productitem--vendor');
        const vendor = vendorEl ? vendorEl.textContent.trim() : null;

        // Precio actual
        const priceMainEl = el.querySelector('.price--main .money') || el.querySelector('.price--main');
        const rawPriceMain = priceMainEl ? priceMainEl.textContent.trim() : '';

        // Precio anterior (si está en oferta)
        const priceCompareEl = el.querySelector('.price--compare-at .money') || el.querySelector('.price--compare-at');
        const rawPriceCompare = priceCompareEl ? priceCompareEl.textContent.trim() : '';

        // Imagen del producto
        const imgEl = el.querySelector('figure.productitem--image img') || el.querySelector('img');
        let imgSrc = imgEl ? (imgEl.getAttribute('src') || imgEl.getAttribute('data-src') || '') : '';
        if (imgSrc.startsWith('//')) imgSrc = `https:${imgSrc}`;

        results.push({
          rawTitle,
          vendor,
          rawPriceMain,
          rawPriceCompare,
          fullLink,
          imgSrc,
          collection: ctx.collection,
          city: ctx.city
        });
      }

      return results;
    },
    contextInfo
  );
}

// ==============================================================================
// NAVEGACIÓN Y EXTRACCIÓN MULTI-PÁGINA
// ==============================================================================

async function scrapeFarmacorp(browser, options) {
  const page = await browser.newPage({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 800 }
  });

  const allItems = [];
  const todayStr = new Date().toISOString().split('T')[0];

  try {
    if (options.search) {
      // Modo búsqueda específica
      const searchUrl = `${BASE_URL}/search?type=product&q=${encodeURIComponent(options.search)}`;
      console.log(`🌐 Buscando término '${options.search}' en Farmacorp...`);
      console.log(`   URL: ${searchUrl}`);

      const res = await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 35000 });
      if (!res || res.status() >= 400) {
        console.warn(`  ⚠️ Respuesta HTTP ${res ? res.status() : 'error'} en búsqueda.`);
      }

      await page.waitForTimeout(1500);

      // Si hay CAPTCHA o bloqueo
      const pageText = await page.textContent('body');
      if (pageText.includes('Attention Required') || pageText.includes('Cloudflare') || pageText.includes('challenge')) {
        console.warn('  ⚠️ Bloqueo detectado. Abortando extracción según política anti-CAPTCHA.');
        return [];
      }

      const cards = await extractCardsFromPage(page, { collection: 'busqueda', city: options.city });
      console.log(`  ↳ Extraídos ${cards.length} productos coincidentes.`);
      allItems.push(...cards);
    } else {
      // Modo colección paginada
      const col = options.collection || 'all';
      console.log(`🌐 Scrapeando colección Farmacorp '${col}' (Páginas solicitadas: ${options.pages})...`);

      for (let p = 1; p <= options.pages; p++) {
        const pageUrl = `${BASE_URL}/collections/${col}?page=${p}&grid_list=grid-view`;
        console.log(`  ↳ Cargando Página ${p}/${options.pages}: ${pageUrl}`);

        const res = await page.goto(pageUrl, { waitUntil: 'domcontentloaded', timeout: 35000 });
        if (!res || res.status() >= 400) {
          console.warn(`  ⚠️ HTTP ${res ? res.status() : 'error'} en página ${p}.`);
          break;
        }

        await page.waitForTimeout(options.delayMs);

        // Validar anti-bot
        const bodyContent = await page.textContent('body');
        if (bodyContent.includes('Cloudflare') || bodyContent.includes('Attention Required')) {
          console.warn('  ⚠️ Desafío anti-bot detectado. Deteniendo paginación pasivamente.');
          break;
        }

        const cards = await extractCardsFromPage(page, { collection: col, city: options.city });
        console.log(`    ✓ ${cards.length} productos detectados en página ${p}`);

        if (cards.length === 0) {
          console.log('    ℹ️ No hay más productos en la colección.');
          break;
        }

        allItems.push(...cards);

        // Si se alcanzó el límite general
        if (options.limit > 0 && allItems.length >= options.limit) {
          console.log(`  ℹ️ Límite de ${options.limit} ítems alcanzado.`);
          break;
        }
      }
    }
  } finally {
    await page.close();
  }

  // ==============================================================================
  // NORMALIZACIÓN DE DATOS
  // ==============================================================================
  const normalizedMap = new Map();

  for (const raw of allItems) {
    const title = cleanTitle(raw.rawTitle);
    const precio = parsePriceBs(raw.rawPriceMain);
    if (!title || precio === null) continue;

    const precioAnterior = parsePriceBs(raw.rawPriceCompare);
    let descuentoPct = null;
    if (precioAnterior && precioAnterior > precio) {
      descuentoPct = Number((((precioAnterior - precio) / precioAnterior) * 100).toFixed(1));
    }

    const presentacion = extractPresentation(title);
    const key = `${todayStr}|Farmacorp|${options.city}|${title.toUpperCase()}`;

    normalizedMap.set(key, {
      fecha: todayStr,
      departamento: options.city,
      cadena: 'Farmacorp',
      producto: title,
      laboratorio: raw.vendor || 'No especificado',
      categoria: raw.collection === 'all' ? 'Farmacia General' : raw.collection,
      presentacion: presentacion || 'Unidad',
      precio_bs: precio,
      precio_anterior_bs: precioAnterior,
      descuento_pct: descuentoPct,
      enlace: raw.fullLink,
      imagen: raw.imgSrc || null,
      disponible: true
    });
  }

  return Array.from(normalizedMap.values());
}

// ==============================================================================
// PERSISTENCIA Y SINCRONIZACIÓN EN NEON POSTGRESQL
// ==============================================================================

async function neonQuery(neonUrl, query, params = []) {
  const u = new URL(neonUrl);
  const endpoint = `https://${u.host}/sql`;

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Neon-Connection-String': neonUrl
    },
    body: JSON.stringify({ query, params })
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Neon SQL HTTP ${res.status}: ${txt}`);
  }

  return await res.json();
}

async function syncToNeon(neonUrl, records) {
  console.log(`\n🗄️ Verificando e insertando ${records.length} medicamentos en tabla medicamentos_precios...`);

  // Asegurar tabla DDL
  const ddlStatements = [
    `CREATE TABLE IF NOT EXISTS medicamentos_precios (
      id SERIAL PRIMARY KEY,
      fecha DATE NOT NULL,
      departamento VARCHAR(50) NOT NULL,
      cadena VARCHAR(100) NOT NULL,
      producto VARCHAR(255) NOT NULL,
      laboratorio VARCHAR(120),
      categoria VARCHAR(100),
      presentacion VARCHAR(120),
      precio_bs NUMERIC(10, 2) NOT NULL,
      precio_anterior_bs NUMERIC(10, 2),
      descuento_pct NUMERIC(5, 2),
      enlace TEXT,
      imagen TEXT,
      disponible BOOLEAN DEFAULT TRUE,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT med_precios_uniq UNIQUE (fecha, cadena, departamento, producto)
    )`,
    `CREATE INDEX IF NOT EXISTS med_cadena_depto_idx ON medicamentos_precios (cadena, departamento, fecha DESC)`,
    `CREATE INDEX IF NOT EXISTS med_producto_idx ON medicamentos_precios (producto)`
  ];

  for (const stmt of ddlStatements) {
    try {
      await neonQuery(neonUrl, stmt);
    } catch (e) {
      // Ignorar si ya existe
    }
  }

  const upsertSql = `
    INSERT INTO medicamentos_precios (
      fecha, departamento, cadena, producto, laboratorio, categoria, presentacion,
      precio_bs, precio_anterior_bs, descuento_pct, enlace, imagen, disponible, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW())
    ON CONFLICT (fecha, cadena, departamento, producto)
    DO UPDATE SET
      laboratorio = EXCLUDED.laboratorio,
      categoria = EXCLUDED.categoria,
      presentacion = EXCLUDED.presentacion,
      precio_bs = EXCLUDED.precio_bs,
      precio_anterior_bs = EXCLUDED.precio_anterior_bs,
      descuento_pct = EXCLUDED.descuento_pct,
      enlace = EXCLUDED.enlace,
      imagen = EXCLUDED.imagen,
      disponible = EXCLUDED.disponible,
      updated_at = NOW();
  `;

  let inserted = 0;
  for (const r of records) {
    try {
      await neonQuery(neonUrl, upsertSql, [
        r.fecha,
        r.departamento,
        r.cadena,
        r.producto,
        r.laboratorio,
        r.categoria,
        r.presentacion,
        r.precio_bs,
        r.precio_anterior_bs,
        r.descuento_pct,
        r.enlace,
        r.imagen,
        r.disponible
      ]);
      inserted++;
    } catch (err) {
      console.warn(`  ⚠️ Error en upsert de '${r.producto}': ${err.message}`);
    }
  }

  console.log(`✅ ${inserted}/${records.length} medicamentos de Farmacorp sincronizados en Neon PostgreSQL.`);

  // Consulta resumen de totales
  try {
    const stats = await neonQuery(
      neonUrl,
      `SELECT cadena, departamento, COUNT(*)::int as total, MIN(precio_bs) as min_bs, MAX(precio_bs) as max_bs, ROUND(AVG(precio_bs), 2) as avg_bs
       FROM medicamentos_precios
       WHERE cadena = 'Farmacorp'
       GROUP BY cadena, departamento;`
    );
    if (stats.rows && stats.rows.length > 0) {
      console.log('\n📊 Resumen de Precios Farmacorp en Neon PostgreSQL:');
      console.table(stats.rows);
    }
  } catch (statErr) {
    console.warn(`  ⚠️ No se pudo obtener estadísticas: ${statErr.message}`);
  }
}

// ==============================================================================
// EJECUCIÓN PRINCIPAL
// ==============================================================================

async function main() {
  const options = parseArgs();
  const env = loadEnv();
  const todayStr = new Date().toISOString().split('T')[0];

  console.log('==================================================================');
  console.log('💊 FARMACORP WEB SCRAPER - PLAYWRIGHT (PRECIOS FARMACÉUTICOS)');
  console.log(`   Modo: ${options.search ? 'Búsqueda ("' + options.search + '")' : 'Colección ("' + options.collection + '")'}`);
  console.log(`   Páginas: ${options.pages} | Ciudad: ${options.city} | Dry-run: ${options.dryRun}`);
  console.log('==================================================================');

  const browser = await chromium.launch({
    headless: options.headless,
    args: ['--disable-blink-features=AutomationControlled', '--no-sandbox']
  });

  try {
    const records = await scrapeFarmacorp(browser, options);
    console.log(`\n📦 Total de productos extraídos y normalizados: ${records.length}`);

    if (records.length === 0) {
      console.log('⚠️ No se extrajeron registros. Verifica la conexión o los parámetros.');
      return;
    }

    // Muestra de datos extraídos
    console.log('\n🔎 Muestra de 5 productos extraídos:');
    console.table(
      records.slice(0, 5).map((r) => ({
        producto: r.producto.slice(0, 32),
        laboratorio: r.laboratorio.slice(0, 16),
        precio_bs: r.precio_bs,
        presentacion: r.presentacion.slice(0, 18),
        oferta: r.descuento_pct ? `${r.descuento_pct}%` : 'No'
      }))
    );

    // Respaldo local JSON
    fs.writeFileSync(BACKUP_JSON_PATH, JSON.stringify(records, null, 2), 'utf-8');
    console.log(`💾 Respaldo JSON guardado en: ${BACKUP_JSON_PATH}`);

    // Persistencia en Neon
    if (options.dryRun) {
      console.log('🔒 Modo --dry-run activo. No se realizaron cambios en Neon PostgreSQL.');
    } else if (!env.NEON_DB) {
      console.warn('⚠️ No se encontró NEON_DB ni DATABASE_URL en variables de entorno.');
    } else {
      await syncToNeon(env.NEON_DB, records);
    }
  } catch (err) {
    console.error('❌ Error fatal en ejecución de scraper Farmacorp:', err);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

main();
