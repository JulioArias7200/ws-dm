/**
 * ==============================================================================
 * FARMACIAS CHÁVEZ WEB SCRAPER - PLAYWRIGHT (PRECIOS Y CATÁLOGO BOLIVIA)
 * ==============================================================================
 * Scraper especializado para la cadena nacional Farmacias Chávez:
 *   - Portal oficial: `https://www.farmaciaschavez.com.bo` (Next.js + Instaleap)
 *   - Búsqueda directa instantánea (`/search?name=...`)
 *   - Cobertura de fármacos esenciales de la canasta farmacéutica boliviana:
 *     (Paracetamol, Ibuprofeno, Amoxicilina, Aspirina, Omeprazol, Antigripales, etc.)
 *
 * Características:
 *   1. Motor Chromium headless con Playwright y cabeceras de evasión pasiva.
 *   2. Extracción DOM precisa:
 *      - Nombre comercial y descripción médica (`h3.prod__name`)
 *      - Precio actual en Bolivianos (`p.base__price`, ej. `Bs 16,1` -> 16.10)
 *      - Precio regular / descuentos si aplica
 *      - Enlace canónico (`/p/...`) e imagen oficial en CDN de Farmacias Chávez
 *   3. Normalización y deduplicación por clave única (fecha, cadena, departamento, producto).
 *   4. Respaldo local JSON (`data_scraped_chavez.json`).
 *   5. Sincronización idempotente en tabla `medicamentos_precios` de Neon PostgreSQL.
 *
 * Política anti-CAPTCHA:
 *   Cumplimiento estricto: sin intentos de resolución de retos ni bypasses forzados.
 *
 * Uso en PowerShell (desde `ws-dm/`):
 *   node scripts/scraper_chavez.mjs --dry-run
 *   node scripts/scraper_chavez.mjs --search="paracetamol"
 *   node scripts/scraper_chavez.mjs --search="ibuprofeno"
 *   node scripts/scraper_chavez.mjs --essentials
 *   node scripts/scraper_chavez.mjs --city="La Paz"
 * ==============================================================================
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const BASE_URL = 'https://www.farmaciaschavez.com.bo';
const BACKUP_JSON_PATH = path.resolve(ROOT_DIR, 'data_scraped_chavez.json');

// Lista de medicamentos y categorías esenciales de la canasta médica boliviana
const ESSENTIAL_MEDICINES = [
  'paracetamol',
  'ibuprofeno',
  'crema',
  'aspirina',
  'amoxicilina',
  'omeprazol',
  'losartan',
  'antigripal',
  'azitromicina',
  'complejo b',
  'alcohol'
];

// Diccionario exhaustivo de laboratorios y marcas farmacéuticas presentes en Bolivia
const KNOWN_LABS = [
  // Bolivianos y Regionales
  'INTI', 'BAGÓ', 'BAGO', 'ALFA', 'COFAR', 'TERBOL', 'CRESPAL', 'VITA', 'IFA', 'DELTA',
  'LECAR', 'PORTUGAL', 'SIGMA', 'BRESKOT', 'GENEX', 'MEDIFARMA', 'ALCOS', 'SAE', 'LABOVITA',
  // Regionales e Internacionales
  'SESDERMA', 'NIVEA', 'ROEMMERS', 'BAYER', 'GADOR', 'TECNOFARMA', 'LCH', 'CHILE',
  'SAVAL', 'EUROFARMA', 'ABBOTT', 'PFIZER', 'NOVARTIS', 'SANOFI', 'GSK', 'MERCK',
  'ISDIN', 'EUCERIN', 'CETAPHIL', 'MEGALABS', 'ANDROMACO', 'BIODERMA', 'FRESH',
  'BEIERSDORF', 'SANCOR', 'NUTRICIA', 'JOHNSON', 'COLGATE'
];

const ACTIVE_PRINCIPLES = new Set([
  'PARACETAMOL', 'IBUPROFENO', 'AMOXICILINA', 'ASPIRINA', 'OMEPRAZOL',
  'LOSARTAN', 'AZITROMICINA', 'DICLOFENACO', 'TRAMADOL', 'HIOSCINA',
  'KETOROLACO', 'COMPLEJO B', 'ALCOHOL', 'METFORMINA', 'ATENOLOL',
  'CLOTRIMAZOL', 'BETAMETASONA', 'GENTAMICINA', 'ISOCONAZOL', 'NEOMICINA',
  'NIFUROXAZIDA', 'CODEINA', 'DIGOXINA', 'POVIDONA'
]);

// ==============================================================================
// ARGUMENTOS CLI Y CONFIGURACIÓN
// ==============================================================================

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    search: '',
    essentials: false,
    details: false,
    city: 'La Paz',
    limit: 0,
    dryRun: false,
    headless: true,
    delayMs: 1500
  };

  for (const arg of args) {
    if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--no-headless' || arg === '--headed') options.headless = false;
    else if (arg === '--essentials') options.essentials = true;
    else if (arg === '--details' || arg === '--with-details') options.details = true;
    else if (arg.startsWith('--search=')) options.search = arg.split('=')[1].trim();
    else if (arg.startsWith('--city=')) options.city = arg.split('=')[1].trim();
    else if (arg.startsWith('--limit=')) options.limit = parseInt(arg.split('=')[1], 10) || 0;
    else if (arg.startsWith('--delay=')) options.delayMs = parseInt(arg.split('=')[1], 10) || 1500;
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
  // Ejemplos: "Bs 16,1", "Bs 47,4", "Bs 8", "Bs 115,78"
  const clean = rawText
    .replace(/[^\d.,]/g, '')
    .trim();
  if (!clean) return null;

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
  if (!title) return 'Unidad';
  const regex = /(?:x\s*(?:\d+\s*)?(?:tabletas?|comprimidos?|c[áa]psulas?|sobres?|ampollas?|unidades?|parches?)|(?:\d+(?:\.\d+)?\s*(?:mg|ml|gr|g|mcg|ui|%))(?:\s*x\s*\d+\s*(?:ml|mg|sobres?|tabletas?)?)?)/i;
  const match = title.match(regex);
  return match ? match[0].trim() : 'Unidad';
}

function extractLaboratorio(title, description = '') {
  if (!title) return 'Genérico';
  const combined = `${title} ${description}`.trim();
  const upper = combined.toUpperCase();

  // 1. Coincidencia con catálogo de laboratorios conocidos
  for (const lab of KNOWN_LABS) {
    const regex = new RegExp(`\\b${lab}\\b`, 'i');
    if (regex.test(upper)) {
      return lab;
    }
  }

  // 2. Patrones explícitos en la descripción: "Laboratorio: ...", "Marca: ..."
  const labPattern = /(?:laboratorios?|lab\.?|marca|fabricado por)\s*[:\-]?\s*([A-Za-zÁ-Úá-ú0-9]+)/i;
  const matchDesc = combined.match(labPattern);
  if (matchDesc) return matchDesc[1].toUpperCase();

  const forms = [
    'CREMA', 'JARABE', 'TABLETAS', 'TABLETA', 'COMPRIMIDOS', 'COMPRIMIDO',
    'SOLUCION', 'SOLUCIÓN', 'GOTAS', 'SUSPENSION', 'SUSPENSIÓN', 'GEL',
    'SOBRE', 'SOBRES', 'PARCHE', 'PARCHES', 'UNIDAD', 'UNIDADES', 'PALETA',
    'INFANTIL', 'ADULTO', 'PEDIATRICO', 'PEDIÁTRICO', 'INYECTABLE', 'AMPOLLA', 'AMPOLLAS'
  ];
  const units = ['MG', 'ML', 'GR', 'G', 'MCG', 'UI', '%', 'CM', 'L'];

  const tokens = title.trim().split(/\s+/);
  const firstWord = tokens[0].toUpperCase();

  // 3. Si comienza con Principio Activo conocido
  if (ACTIVE_PRINCIPLES.has(firstWord)) {
    for (const t of tokens.slice(1)) {
      const up = t.toUpperCase();
      if (KNOWN_LABS.includes(up)) return up;
    }
    return 'Genérico';
  }

  // 4. Patrón antes de presentación: "... Alfa X 15 Gr" -> Alfa
  const matchX = title.match(/(?:^|\s)([A-Za-zÁ-Úá-ú0-9]+)\s+x\s+\d+/i);
  if (matchX) {
    const cand = matchX[1].toUpperCase();
    if (!forms.includes(cand) && !ACTIVE_PRINCIPLES.has(cand) && !units.includes(cand) && !/^\d+$/.test(cand)) {
      return matchX[1];
    }
  }

  // 5. Marca comercial al inicio del título si no es principio activo ni forma ni unidad
  if (!forms.includes(firstWord) && !ACTIVE_PRINCIPLES.has(firstWord) && !units.includes(firstWord) && !/^\d+$/.test(firstWord)) {
    return tokens[0];
  }

  return 'Genérico';
}

function cleanTitle(title) {
  if (!title) return '';
  return title
    .replace(/\s+/g, ' ')
    .replace(/\.\.\.$/, '')
    .trim();
}

// ==============================================================================
// EXTRACCIÓN DOM CON PLAYWRIGHT
// ==============================================================================

async function extractCardsFromChavezPage(page, contextInfo) {
  return await page.$$eval(
    'a[href^="/p/"]',
    (elements, ctx) => {
      const results = [];

      for (const el of elements) {
        const href = el.getAttribute('href') || '';
        if (!href) continue;
        const fullLink = href.startsWith('http') ? href : `https://www.farmaciaschavez.com.bo${href}`;

        // Nombre del producto
        const nameEl = el.querySelector('[class*="prod__name"]') || el.querySelector('h3') || el.querySelector('h2');
        const rawTitle = nameEl ? nameEl.textContent.trim() : '';
        if (!rawTitle) continue;

        // Precio actual
        const priceEl = el.querySelector('[class*="base__price"]') || el.querySelector('p');
        const rawPrice = priceEl ? priceEl.textContent.trim() : '';

        // Precio regular / anterior si existe
        const oldPriceEl = el.querySelector('[class*="old__price"]') || el.querySelector('[class*="strike"]');
        const rawOldPrice = oldPriceEl ? oldPriceEl.textContent.trim() : '';

        // Descuento en etiqueta (ej. "Ahorra 10%")
        const discountEl = el.querySelector('[class*="discount"]') || el.querySelector('[class*="tag"]');
        const rawDiscount = discountEl ? discountEl.textContent.trim() : '';

        // Imagen oficial del producto
        const imgEl = el.querySelector('img');
        const imgSrc = imgEl ? (imgEl.getAttribute('src') || '') : '';

        results.push({
          rawTitle,
          rawPrice,
          rawOldPrice,
          rawDiscount,
          fullLink,
          imgSrc,
          searchTerm: ctx.searchTerm,
          city: ctx.city
        });
      }

      return results;
    },
    contextInfo
  );
}

// ==============================================================================
// NAVEGACIÓN Y EXTRACCIÓN
// ==============================================================================

async function scrapeChavez(browser, options) {
  const page = await browser.newPage({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 800 }
  });

  const allItems = [];
  const searchTerms = options.search
    ? [options.search]
    : options.essentials
    ? ESSENTIAL_MEDICINES
    : ['paracetamol', 'ibuprofeno'];

  const todayStr = new Date().toISOString().split('T')[0];

  try {
    for (const term of searchTerms) {
      const searchUrl = `${BASE_URL}/search?name=${encodeURIComponent(term)}`;
      console.log(`🌐 Buscando fármaco '${term}' en Farmacias Chávez...`);
      console.log(`   URL: ${searchUrl}`);

      const res = await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 35000 });
      if (!res || res.status() >= 400) {
        console.warn(`  ⚠️ Respuesta HTTP ${res ? res.status() : 'error'} para '${term}'.`);
        continue;
      }

      // Esperar a que el cliente Next.js / Instaleap hidrate las tarjetas de producto
      try {
        await page.waitForSelector('a[href^="/p/"]', { timeout: 8000 });
      } catch (e) {
        // Fallback: esperar un momento por si no hay productos
        await page.waitForTimeout(2500);
      }

      // Verificación de bloqueo anti-bot
      const bodyText = await page.textContent('body');
      if (bodyText.includes('Attention Required') || bodyText.includes('Cloudflare') || bodyText.includes('challenge')) {
        console.warn('  ⚠️ Bloqueo anti-bot detectado. Abortando búsqueda según política anti-CAPTCHA.');
        break;
      }

      const cards = await extractCardsFromChavezPage(page, { searchTerm: term, city: options.city });
      console.log(`  ↳ Extraídos ${cards.length} productos coincidentes para '${term}'.`);
      allItems.push(...cards);

      if (options.limit > 0 && allItems.length >= options.limit) {
        console.log(`  ℹ️ Límite general de ${options.limit} alcanzado.`);
        break;
      }
    }

    // Extracción profunda opcional de descripciones médicas (/p/...)
    if (options.details && allItems.length > 0) {
      console.log(`\n🔍 Extrayendo descripción y ficha técnica para ${allItems.length} productos...`);
      for (let i = 0; i < allItems.length; i++) {
        const it = allItems[i];
        if (!it.fullLink) continue;
        try {
          await page.goto(it.fullLink, { waitUntil: 'domcontentloaded', timeout: 25000 });
          await page.waitForTimeout(800);
          const desc = await page.$eval('[data-testid="description-content"]', el => el.textContent?.trim() || '').catch(() => '');
          if (desc) {
            it.description = desc;
          }
        } catch {
          // continuar con el siguiente
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
    const precio = parsePriceBs(raw.rawPrice);
    if (!title || precio === null) continue;

    const precioAnterior = parsePriceBs(raw.rawOldPrice);
    let descuentoPct = null;

    if (raw.rawDiscount && raw.rawDiscount.includes('%')) {
      const m = raw.rawDiscount.match(/(\d+(?:\.\d+)?)%/);
      if (m) descuentoPct = parseFloat(m[1]);
    } else if (precioAnterior && precioAnterior > precio) {
      descuentoPct = Number((((precioAnterior - precio) / precioAnterior) * 100).toFixed(1));
    }

    const presentacion = extractPresentation(title);
    const laboratorio = extractLaboratorio(title, raw.description || '');
    const key = `${todayStr}|Farmacias Chavez|${options.city}|${title.toUpperCase()}`;

    normalizedMap.set(key, {
      fecha: todayStr,
      departamento: options.city,
      cadena: 'Farmacias Chavez',
      producto: title,
      laboratorio,
      categoria: 'Medicamentos',
      presentacion,
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

  console.log(`✅ ${inserted}/${records.length} medicamentos de Farmacias Chávez sincronizados en Neon PostgreSQL.`);

  // Consulta resumen de totales
  try {
    const stats = await neonQuery(
      neonUrl,
      `SELECT cadena, departamento, COUNT(*)::int as total, MIN(precio_bs) as min_bs, MAX(precio_bs) as max_bs, ROUND(AVG(precio_bs), 2) as avg_bs
       FROM medicamentos_precios
       WHERE cadena = 'Farmacias Chavez'
       GROUP BY cadena, departamento;`
    );
    if (stats.rows && stats.rows.length > 0) {
      console.log('\n📊 Resumen de Precios Farmacias Chávez en Neon PostgreSQL:');
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
  console.log('💊 FARMACIAS CHÁVEZ WEB SCRAPER - PLAYWRIGHT (PRECIOS Y CATÁLOGO)');
  console.log(`   Modo: ${options.search ? 'Búsqueda ("' + options.search + '")' : options.essentials ? 'Esenciales' : 'Básico'}`);
  console.log(`   Ciudad: ${options.city} | Dry-run: ${options.dryRun} | Fecha: ${todayStr}`);
  console.log('==================================================================');

  const browser = await chromium.launch({
    headless: options.headless,
    args: ['--disable-blink-features=AutomationControlled', '--no-sandbox']
  });

  try {
    const records = await scrapeChavez(browser, options);
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
    console.error('❌ Error fatal en ejecución de scraper Farmacias Chávez:', err);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

main();
