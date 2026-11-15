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

// Categorías oficiales y promociones de Farmacias Chávez
const CHAVEZ_OFFICIAL_CATEGORIES = [
  // Promociones y Campañas Especiales
  { slug: 'black-friday', id: '119', nombre: 'Black Friday' },
  { slug: 'mundo-bebe', id: '120', nombre: 'Mundo Bebé' },
  { slug: 'fluidex', id: '121', nombre: 'Fluidex' },
  { slug: 'beauty-party', id: '117', nombre: 'Beauty Party' },
  { slug: 'lunes-de-chavez', id: '118', nombre: 'Lunes de Chávez' },
  { slug: 'chavez-plus', id: '116', nombre: 'Chávez Plus' },
  { slug: 'canasta-del-ahorro-y-bienestar', id: '113', nombre: 'Canasta del Ahorro y Bienestar' },
  { slug: 'productos-garantizados', id: '115', nombre: 'Productos Garantizados' },
  { slug: 'hecho-en-bolivia', id: '123', nombre: 'Hecho en Bolivia' },

  // Categorías Troncales
  { slug: 'medicamentos', id: '109', nombre: 'Medicamentos' },
  { slug: 'belleza', id: '102', nombre: 'Belleza' },
  { slug: 'alimentos-y-bebidas', id: '101', nombre: 'Alimentos y Bebidas' },
  { slug: 'cuidado-e-higiene', id: '104', nombre: 'Cuidado e Higiene' },
  { slug: 'estacionales', id: '105', nombre: 'Estacionales' },
  { slug: 'insumos-medicos', id: '107', nombre: 'Insumos Médicos' },
  { slug: 'nutricion-saludable', id: '110', nombre: 'Nutrición Saludable' },
  { slug: 'suplementos-y-vitaminas', id: '112', nombre: 'Suplementos y Vitaminas' }
];

// Lista ampliada y exhaustiva de medicamentos y categorías esenciales de la canasta médica boliviana
const ESSENTIAL_MEDICINES = [
  // Analgésicos y Antiinflamatorios
  'paracetamol', 'ibuprofeno', 'aspirina', 'diclofenaco', 'ketorolaco', 'naproxeno', 'tramadol', 'meloxicam', 'clonixinato',
  // Antibióticos y Antivirales
  'amoxicilina', 'azitromicina', 'ciprofloxacina', 'cefalexina', 'penicilina', 'aciclovir', 'cotrimoxazol',
  // Respiratorio y Antigripales
  'antigripal', 'ambroxol', 'loratadina', 'clorfenamina', 'salbutamol', 'jarabe', 'tos', 'fluticasona',
  // Gastrointestinales y Antiácidos
  'omeprazol', 'antiacido', 'bismuto', 'domperidona', 'metoclopramida', 'probioticos', 'suero', 'ranitidina',
  // Cardiovasculares y Metabólicos
  'losartan', 'enalapril', 'metformina', 'glibenclamida', 'amlodipina', 'atorvastatina', 'hidroclorotiazida',
  // Botiquín, Dermatología y Cuidado
  'alcohol', 'crema', 'gasa', 'venda', 'algodon', 'povidona', 'bloqueador solar', 'panales', 'complejo b', 'vitamina c', 'calcio', 'zinc'
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
    categories: false,
    category: '', // '102', 'belleza', '109', '119', etc.
    pages: 0, // 0 = autodetección de todas las páginas de la categoría
    exhaustive: false,
    details: false,
    city: 'La Paz',
    limit: 0,
    dryRun: false,
    headless: true,
    delayMs: 2000
  };

  for (const arg of args) {
    if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--no-headless' || arg === '--headed') options.headless = false;
    else if (arg === '--essentials') options.essentials = true;
    else if (arg === '--categories' || arg === '--all-categories') options.categories = true;
    else if (arg === '--exhaustive' || arg === '--all') {
      options.exhaustive = true;
      options.essentials = true;
      options.categories = true;
    }
    else if (arg === '--details' || arg === '--with-details') options.details = true;
    else if (arg.startsWith('--search=')) options.search = arg.split('=')[1].trim();
    else if (arg.startsWith('--category=')) options.category = arg.split('=')[1].trim();
    else if (arg.startsWith('--pages=')) options.pages = parseInt(arg.split('=')[1], 10) || 0;
    else if (arg.startsWith('--city=')) options.city = arg.split('=')[1].trim();
    else if (arg.startsWith('--limit=')) options.limit = parseInt(arg.split('=')[1], 10) || 0;
    else if (arg.startsWith('--delay=')) options.delayMs = parseInt(arg.split('=')[1], 10) || 2000;
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
  if (normalized.includes(',') && normalized.includes('.')) {
    if (normalized.indexOf(',') < normalized.indexOf('.')) {
      normalized = normalized.replace(/,/g, ''); // "1,099.00" -> "1099.00"
    } else {
      normalized = normalized.replace(/\./g, '').replace(',', '.'); // "1.099,00" -> "1099.00"
    }
  } else if (normalized.includes(',')) {
    const parts = normalized.split(',');
    if (parts.length === 2 && parts[1].length === 3 && parts[0].length >= 1) {
      normalized = normalized.replace(',', '');
    } else {
      normalized = normalized.replace(',', '.');
    }
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
  const targets = [];

  // Agregar categorías oficiales o categoría específica
  if (options.category) {
    const targetCat = CHAVEZ_OFFICIAL_CATEGORIES.find(
      (c) => c.slug.toLowerCase() === options.category.toLowerCase() || c.id === options.category
    );
    if (targetCat) {
      targets.push({
        type: 'categoria',
        name: targetCat.nombre,
        slug: targetCat.slug,
        id: targetCat.id,
        url: `${BASE_URL}/ca/${targetCat.slug}/${targetCat.id}`,
        categoriaNombre: targetCat.nombre
      });
    } else {
      const cleanSlug = options.category.replace(/[^a-zA-Z0-9_-]/g, '');
      targets.push({
        type: 'categoria',
        name: cleanSlug,
        slug: cleanSlug,
        id: cleanSlug,
        url: `${BASE_URL}/ca/${cleanSlug}/${cleanSlug}`,
        categoriaNombre: cleanSlug
      });
    }
  } else if (options.categories || options.exhaustive) {
    for (const cat of CHAVEZ_OFFICIAL_CATEGORIES) {
      targets.push({
        type: 'categoria',
        name: cat.nombre,
        slug: cat.slug,
        id: cat.id,
        url: `${BASE_URL}/ca/${cat.slug}/${cat.id}`,
        categoriaNombre: cat.nombre
      });
    }
  }

  // Agregar términos de búsqueda de fármacos (si no se pidió solo una categoría)
  if (!options.category || options.search) {
    const searchTerms = options.search
      ? [options.search]
      : options.essentials || options.exhaustive
      ? ESSENTIAL_MEDICINES
      : options.category ? [] : ['paracetamol', 'ibuprofeno'];

    for (const term of searchTerms) {
      targets.push({
        type: 'busqueda',
        name: term,
        url: `${BASE_URL}/search?name=${encodeURIComponent(term)}`,
        categoriaNombre: 'Fármacos'
      });
    }
  }

  const todayStr = new Date().toISOString().split('T')[0];
  let lastReportTime = 0;

  try {
    for (let i = 0; i < targets.length; i++) {
      if (options.limit > 0 && allItems.length >= options.limit) break;
      const tgt = targets[i];

      try {
        if (tgt.type === 'categoria') {
          // 1. Obtener primera página y detectar total de páginas en ant-pagination
          const firstPageUrl = `${BASE_URL}/ca/${tgt.slug}/${tgt.id}?currentPage=1`;
          const res = await page.goto(firstPageUrl, { waitUntil: 'domcontentloaded', timeout: 35000 });
          if (!res || res.status() >= 400) {
            console.warn(`  ⚠️ Respuesta HTTP ${res ? res.status() : 'error'} para categoría '${tgt.name}'.`);
            continue;
          }

          await page.waitForSelector('a[href^="/p/"]', { timeout: 8000 }).catch(() => null);

          // Detectar total de páginas desde el componente Simple Pagination (< [ 1 ] / 19 >)
          const pagerText = await page.$eval(
            '.ant-pagination-simple-pager, ul.ant-pagination',
            (el) => el.textContent || ''
          ).catch(() => '');
          const match = pagerText.match(/\/\s*(\d+)/);
          let totalPages = match ? parseInt(match[1], 10) : 1;
          if (options.pages > 0) {
            totalPages = Math.min(totalPages, options.pages);
          }

          console.log(`\n📑 [PAGINACIÓN CHÁVEZ]: Categoría '${tgt.name}' -> ${totalPages} página(s) totales.`);

          for (let p = 1; p <= totalPages; p++) {
            if (options.limit > 0 && allItems.length >= options.limit) break;
            const currentUrl = `${BASE_URL}/ca/${tgt.slug}/${tgt.id}?currentPage=${p}`;

            if (p > 1) {
              await page.goto(currentUrl, { waitUntil: 'domcontentloaded', timeout: 35000 });
              await page.waitForSelector('a[href^="/p/"]', { timeout: 8000 }).catch(() => null);
            }

            // Scroll progresivo para hidratar tarjetas
            for (let s = 0; s < 3; s++) {
              await page.evaluate(() => window.scrollBy(0, 800));
              await page.waitForTimeout(400);
            }

            const cards = await extractCardsFromChavezPage(page, { searchTerm: tgt.name, city: options.city });
            allItems.push(...cards);

            console.log(`📄 [PÁGINAS PROCESADAS]: ${tgt.name} (Pág. ${p}/${totalPages}) -> ${cards.length} detectados (Acumulado: ${allItems.length})`);
            if (cards.length === 0) break;
            await page.waitForTimeout(options.delayMs);
          }
        } else {
          // Búsqueda simple
          const pageUrl = tgt.url;
          const res = await page.goto(pageUrl, { waitUntil: 'domcontentloaded', timeout: 35000 });
          if (!res || res.status() >= 400) {
            console.warn(`  ⚠️ Respuesta HTTP ${res ? res.status() : 'error'} para '${tgt.name}'.`);
            continue;
          }

          await page.waitForSelector('a[href^="/p/"]', { timeout: 8000 }).catch(() => null);

          for (let s = 0; s < 3; s++) {
            await page.evaluate(() => window.scrollBy(0, 800));
            await page.waitForTimeout(600);
          }

          const cards = await extractCardsFromChavezPage(page, { searchTerm: tgt.name, city: options.city });
          allItems.push(...cards);

          console.log(`\n📄 [PÁGINAS PROCESADAS]: BÚSQUEDA: ${tgt.name} (${i + 1}/${targets.length}) -> ${pageUrl}`);
          console.log(`🔍 [PRODUCTOS ANALIZADOS]: ${cards.length} detectados (Acumulado: ${allItems.length})`);
          await page.waitForTimeout(options.delayMs);
        }
      } catch (err) {
        console.warn(`  ⚠️ Error al procesar ${tgt.name}: ${err.message}`);
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
      enlace = COALESCE(EXCLUDED.enlace, medicamentos_precios.enlace),
      imagen = CASE
        WHEN medicamentos_precios.imagen LIKE 'farmacias/%' THEN medicamentos_precios.imagen
        ELSE COALESCE(EXCLUDED.imagen, medicamentos_precios.imagen)
      END,
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

      // Sincronización en catálogo maestro e histórico time-series
      try {
        const skuId = `chavez-${r.producto.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 80)}`;
        await neonQuery(neonUrl, `
          INSERT INTO catalogo_productos_master (
            sku_id, producto, cadena, departamento, categoria, laboratorio, presentacion, enlace_canonica, imagen, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
          ON CONFLICT (sku_id) DO UPDATE SET
            producto = EXCLUDED.producto,
            categoria = EXCLUDED.categoria,
            laboratorio = EXCLUDED.laboratorio,
            presentacion = EXCLUDED.presentacion,
            enlace_canonica = COALESCE(EXCLUDED.enlace_canonica, catalogo_productos_master.enlace_canonica),
            imagen = COALESCE(EXCLUDED.imagen, catalogo_productos_master.imagen),
            updated_at = NOW();
        `, [skuId, r.producto, r.cadena, r.departamento, r.categoria, r.laboratorio, r.presentacion, r.enlace, r.imagen]);

        await neonQuery(neonUrl, `
          INSERT INTO precios_historico (
            sku_id, fecha, precio_actual_bs, precio_anterior_bs, descuento_pct, delta_precio_bs, delta_porcentaje, disponible
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          ON CONFLICT (sku_id, fecha) DO UPDATE SET
            precio_actual_bs = EXCLUDED.precio_actual_bs,
            precio_anterior_bs = EXCLUDED.precio_anterior_bs,
            descuento_pct = EXCLUDED.descuento_pct,
            delta_precio_bs = EXCLUDED.delta_precio_bs,
            delta_porcentaje = EXCLUDED.delta_porcentaje,
            disponible = EXCLUDED.disponible;
        `, [
          skuId,
          r.fecha,
          r.precio_bs,
          r.precio_anterior_bs,
          r.descuento_pct,
          r.precio_anterior_bs ? Number((r.precio_bs - r.precio_anterior_bs).toFixed(2)) : 0,
          r.descuento_pct ? -Math.abs(r.descuento_pct) : 0,
          r.disponible
        ]);
      } catch {
        // Ignorar si las tablas aún no están migradas
      }
    } catch (err) {
      console.warn(`  ⚠️ Error en upsert de '${r.producto}': ${err.message}`);
    }
  }

  console.log(`\n✅ [PROCESO REALIZADO CORRECTAMENTE]: ${inserted}/${records.length} medicamentos de Farmacias Chávez sincronizados en Neon PostgreSQL.`);

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
// TELEMETRÍA Y CONTROL DE TIEMPOS DE RENDIMIENTO
// ==============================================================================

function formatDuration(ms) {
  const totalSec = ms / 1000;
  const mins = Math.floor(totalSec / 60);
  const secs = (totalSec % 60).toFixed(1);
  if (mins === 0) return `${secs} segundos`;
  return `${mins} min ${secs} seg (${totalSec.toFixed(1)} s)`;
}

function printTelemetryBanner({ title, startTime, endTime, totalItems, extraInfo = [] }) {
  const durationMs = endTime - startTime;
  const durationStr = formatDuration(durationMs);
  const durationSec = durationMs / 1000;
  const speed = totalItems > 0 && durationSec > 0 ? (totalItems / durationSec).toFixed(2) : '0.00';

  const startStr = new Date(startTime).toLocaleTimeString('es-BO', { hour12: false });
  const endStr = new Date(endTime).toLocaleTimeString('es-BO', { hour12: false });

  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log(`║      ⏱️ TELEMETRÍA Y TIEMPO DE RENDIMIENTO - ${title.padEnd(16)} ║`);
  console.log('╠════════════════════════════════════════════════════════════════╣');
  console.log(`║  🕒 Hora de Inicio:        ${startStr.padEnd(35)} ║`);
  console.log(`║  🏁 Hora de Finalización:  ${endStr.padEnd(35)} ║`);
  console.log(`║  ⏳ Tiempo Total:          ${durationStr.padEnd(35)} ║`);
  console.log(`║  📦 Total Productos:       ${(totalItems + ' productos').padEnd(35)} ║`);
  console.log(`║  ⚡ Velocidad Promedio:    ${(speed + ' productos / segundo').padEnd(35)} ║`);
  for (const info of extraInfo) {
    console.log(`║  📌 ${info.padEnd(58)} ║`);
  }
  console.log('╚════════════════════════════════════════════════════════════════╝\n');
}

// ==============================================================================
// EJECUCIÓN PRINCIPAL
// ==============================================================================

async function main() {
  const startTime = Date.now();
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

    const endTime = Date.now();
    printTelemetryBanner({
      title: 'FARMACIAS CHÁVEZ',
      startTime,
      endTime,
      totalItems: records.length,
      extraInfo: [
        `Modo: ${options.search ? 'Búsqueda ("' + options.search + '")' : options.essentials ? 'Esenciales + Promociones' : 'Básico'}`,
        `Respaldo JSON: ${BACKUP_JSON_PATH}`,
        `Base de Datos Neon: ${options.dryRun ? 'No (dry-run)' : 'Sincronizado con Triggers'}`
      ]
    });
  } catch (err) {
    console.error('❌ Error fatal en ejecución de scraper Farmacias Chávez:', err);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

main();
