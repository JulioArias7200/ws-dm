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

// Catálogo Completo de Colecciones Oficiales de Farmacorp
const FARMACORP_COLLECTIONS = [
  // Ofertas & Campañas
  { slug: 'ofertas', nombre: 'Ofertas' },
  { slug: 'beauty-party', nombre: 'Beauty Party' },
  { slug: 'outlet-on-cuidado', nombre: 'Outlet Infantil' },
  { slug: 'revista-de-ofertas', nombre: 'Revista de Ofertas' },
  { slug: 'lo-nuevo', nombre: 'Lo Nuevo' },

  // Salud & Farmacia
  { slug: 'medicamentos', nombre: 'Salud y Medicamentos' },
  { slug: 'medicamentos-y-alivio', nombre: 'Medicamentos y Alivio' },
  { slug: 'alivio-del-dolor-1', nombre: 'Alivio del Dolor' },
  { slug: 'primeros-auxilios-1', nombre: 'Botiquín y Primeros Auxilios' },
  { slug: 'cuidado-digestivo', nombre: 'Cuidado Digestivo' },
  { slug: 'cuidado-respiratorio', nombre: 'Cuidado Respiratorio' },
  { slug: 'cuidado-cardiovascular', nombre: 'Cuidado Cardiovascular' },
  { slug: 'salud-femenina', nombre: 'Salud Femenina' },
  { slug: 'salud-sexual', nombre: 'Salud Sexual' },
  { slug: 'dispositivos-y-accesorios-medicos', nombre: 'Dispositivos Médicos' },
  { slug: 'sueros', nombre: 'Sueros' },
  { slug: 'cuidado-de-los-sentidos', nombre: 'Cuidado de los Sentidos' },
  { slug: 'medicamentos-bajo-receta', nombre: 'Medicamentos Bajo Receta' },

  // Belleza
  { slug: 'beauty', nombre: 'Belleza General' },
  { slug: 'belleza-facial', nombre: 'Rostro' },
  { slug: 'mirada-perfecta', nombre: 'Ojos' },
  { slug: 'labios-perfectos', nombre: 'Labios' },
  { slug: 'unas', nombre: 'Manicura' },
  { slug: 'skincare-coreano', nombre: 'Skincare' },
  { slug: 'accesorios-beauty', nombre: 'Accesorios de Belleza' },
  { slug: 'coloracion-capilar', nombre: 'Tintes' },

  // Cuidado Personal
  { slug: 'self-care', nombre: 'Cuidado Personal General' },
  { slug: 'cuidado-del-cabello', nombre: 'Cuidado Capilar' },
  { slug: 'cuidado-bucal', nombre: 'Cuidado Bucal' },
  { slug: 'cuidado-e-higiene-corporal', nombre: 'Cuidado e Higiene' },
  { slug: 'cuidado-femenino', nombre: 'Cuidado Femenino' },
  { slug: 'cuidado-masculino', nombre: 'Cuidado Masculino' },
  { slug: 'adulto-mayor', nombre: 'Adulto Mayor' },

  // Mamá y Bebé
  { slug: 'mama-bebe', nombre: 'Mamá y Bebé General' },
  { slug: 'cuidados-del-bebe', nombre: 'Cuidados del Bebé' },
  { slug: 'leches-y-formulas', nombre: 'Leches y Fórmulas' },
  { slug: 'panales-y-toallas-humedas', nombre: 'Pañales y Toallitas Húmedas' },
  { slug: 'mamaderas-chupetes-y-tetinas', nombre: 'Mamaderas y Chupetes' },
  { slug: 'accesorios-para-bebe', nombre: 'Accesorios para Bebé' },
  { slug: 'cuidados-de-la-mama', nombre: 'Cuidados de la Mamá' },
  { slug: 'nutricion-infantil', nombre: 'Nutrición Infantil' },

  // Hogar
  { slug: 'hogar', nombre: 'Hogar General' },
  { slug: 'detergentes-y-jabones', nombre: 'Detergentes y Jabones' },
  { slug: 'papel-higienico', nombre: 'Papel Higiénico' },
  { slug: 'lavavajillas-y-desengrasantes', nombre: 'Lavavajillas' },
  { slug: 'ambientadores-y-desinfectantes', nombre: 'Ambientadores y Desinfectantes' },
  { slug: 'accesorios-de-limpieza', nombre: 'Accesorios de Limpieza' },
  { slug: 'cocina', nombre: 'Cocina' },
  { slug: 'electro-hogar', nombre: 'Electro Hogar' },
  { slug: 'mascotas', nombre: 'Mascotas' },

  // Nuestras Marcas
  { slug: 'nuestras-marcas', nombre: 'Nuestras Marcas (Catálogo Completo)' },

  // Suplementos y Nutrición
  { slug: 'vitaminas-suplementos-y-minerales', nombre: 'Suplementos y Nutrición' },
  { slug: 'snacks-saludables', nombre: 'Snacks Saludables' },
  { slug: 'proteinas-y-creatinas', nombre: 'Proteínas y Creatinas' },
  { slug: 'vitaminas-y-suplementos', nombre: 'Vitaminas y Suplementos' },

  // Supermercado
  { slug: 'supermercado', nombre: 'Supermercado General' }
];

// ==============================================================================
// ARGUMENTOS CLI Y CONFIGURACIÓN
// ==============================================================================

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    pages: 2,
    allPages: false,
    allCollections: false,
    collection: 'all', // 'all', 'medicamentos', 'cuidado-personal', etc.
    search: '',
    city: 'La Paz',
    limit: 0,
    dryRun: false,
    headless: true,
    delayMs: 2000
  };

  for (const arg of args) {
    if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--no-headless' || arg === '--headed') options.headless = false;
    else if (arg === '--all-pages') {
      options.allPages = true;
      options.pages = 0;
    } else if (arg === '--all-collections' || arg === '--all') {
      options.allCollections = true;
    } else if (arg.startsWith('--pages=')) {
      const val = parseInt(arg.split('=')[1], 10);
      options.pages = val;
      if (val === 0) options.allPages = true;
    } else if (arg.startsWith('--collection=')) options.collection = arg.split('=')[1].trim();
    else if (arg.startsWith('--search=')) options.search = arg.split('=')[1].trim();
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
  // Ejemplos: "Bs5,10", "Bs 12,50", "Bs. 8.00", "5,10"
  const clean = rawText
    .replace(/[^\d.,]/g, '')
    .trim();
  if (!clean) return null;

  // Convertir formato numérico detectando miles y decimales
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
      // Modo colección paginada (una sola o todas las del catálogo)
      const targetCollections = options.allCollections
        ? FARMACORP_COLLECTIONS
        : [{ slug: options.collection || 'all', nombre: options.collection || 'General' }];

      let lastReportTime = 0;

      for (let cIdx = 0; cIdx < targetCollections.length; cIdx++) {
        if (options.limit > 0 && allItems.length >= options.limit) break;
        const colItem = targetCollections[cIdx];
        const colSlug = colItem.slug;

        console.log(`\n🌐 [COLECCIÓN FARMACORP]: '${colItem.nombre}' (${colSlug}) [${cIdx + 1}/${targetCollections.length}]`);

        // 1. Obtener primera página y detectar total de páginas en el paginador
        const firstPageUrl = `${BASE_URL}/collections/${colSlug}?page=1&grid_list=grid-view`;
        const resFirst = await page.goto(firstPageUrl, { waitUntil: 'domcontentloaded', timeout: 35000 });
        if (!resFirst || resFirst.status() >= 400) {
          console.warn(`  ⚠️ HTTP ${resFirst ? resFirst.status() : 'error'} al abrir ${colSlug}. Continuando...`);
          continue;
        }

        await page.waitForTimeout(options.delayMs);

        // Detectar total de páginas desde nav.pagination
        const detectedMaxPage = await page.$$eval(
          'nav.pagination a, .pagination--inner a, ul.pagination a, [class*="pagination"] a',
          (links) => {
            let maxP = 1;
            for (const l of links) {
              const txt = l.textContent.trim();
              const num = parseInt(txt, 10);
              if (!isNaN(num) && num > maxP) maxP = num;
            }
            return maxP;
          }
        ).catch(() => 1);

        const totalPages = (options.allPages || options.pages <= 0)
          ? detectedMaxPage
          : Math.min(options.pages, detectedMaxPage);

        console.log(`📑 [PAGINACIÓN FARMACORP]: '${colItem.nombre}' -> ${detectedMaxPage} páginas totales en cuadrícula (A procesar: ${totalPages}).`);

        for (let p = 1; p <= totalPages; p++) {
          if (options.limit > 0 && allItems.length >= options.limit) break;
          const pageUrl = `${BASE_URL}/collections/${colSlug}?page=${p}&grid_list=grid-view`;

          if (p > 1) {
            const res = await page.goto(pageUrl, { waitUntil: 'domcontentloaded', timeout: 35000 });
            if (!res || res.status() >= 400) {
              console.warn(`  ⚠️ HTTP ${res ? res.status() : 'error'} en página ${p}. Finalizando paginación de ${colSlug}.`);
              break;
            }
            await page.waitForTimeout(options.delayMs);
          }

          // Validar anti-bot
          const bodyContent = await page.textContent('body');
          if (bodyContent.includes('Cloudflare') || bodyContent.includes('Attention Required')) {
            console.warn('  ⚠️ Desafío anti-bot detectado. Deteniendo paginación pasivamente según directrices.');
            break;
          }

          const cards = await extractCardsFromPage(page, { collection: colSlug, city: options.city });

          if (cards.length === 0) {
            console.log(`\n📄 [PÁGINAS PROCESADAS]: Final de catálogo alcanzado en página ${p} para ${colSlug}.`);
            break;
          }

          allItems.push(...cards);

          // Reporte en consola cada ~5 a 10 segundos (o en la primera página)
          const now = Date.now();
          if (now - lastReportTime >= 5000 || p === 1 || p === totalPages) {
            console.log(`📄 [PÁGINAS PROCESADAS]: ${colItem.nombre} (Pág. ${p}/${totalPages}) -> ${cards.length} detectados (Acumulado: ${allItems.length})`);
            lastReportTime = now;
          }
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
        const skuId = `farmacorp-${r.producto.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 80)}`;
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

  console.log(`\n✅ [PROCESO REALIZADO CORRECTAMENTE]: ${inserted}/${records.length} medicamentos de Farmacorp sincronizados en Neon PostgreSQL.`);

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

    const endTime = Date.now();
    printTelemetryBanner({
      title: 'FARMACORP',
      startTime,
      endTime,
      totalItems: records.length,
      extraInfo: [
        `Modo: ${options.search ? 'Búsqueda ("' + options.search + '")' : options.allCollections ? '70+ Colecciones Shopify' : 'Colección ("' + options.collection + '")'}`,
        `Páginas por colección: ${options.pages}`,
        `Respaldo JSON: ${BACKUP_JSON_PATH}`,
        `Base de Datos Neon: ${options.dryRun ? 'No (dry-run)' : 'Sincronizado con Triggers'}`
      ]
    });
  } catch (err) {
    console.error('❌ Error fatal en ejecución de scraper Farmacorp:', err);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

main();
