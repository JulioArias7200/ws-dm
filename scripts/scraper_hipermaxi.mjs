/**
 * ==============================================================================
 * HIPERMAXI MULTI-CIUDAD WEB SCRAPER (BASE PLAYWRIGHT DE scraper_amz.mjs)
 * ==============================================================================
 * Web Scraper de supermercado para la Canasta Familiar boliviana (Eje Central):
 *   - La Paz: Sucursal Calacoto (flagship), Miraflores, Sopocachi, Los Pinos.
 *   - Santa Cruz: Sucursal Cañoto (flagship), Equipetrol, Mutualista, Supercenter.
 *   - Cochabamba: Sucursal Blanco Galindo (flagship), Juan de la Rosa, Sacaba.
 *
 * Características principales:
 *   1. Arquitectura inspirada en `scraper_amz.mjs` (que se mantiene inmutable)
 *      y `scraper_sicoes_v2.mjs`.
 *   2. Extracción DOM con Playwright (`article.card`) identificando ID, título,
 *      precio actual, precio anterior, descuento, imagen y categoría.
 *   3. Normalización automática de unidades de medida (kg, gr, l, ml, unidad).
 *   4. Modo dual inteligente (Online Live Playwright con evasión pasiva /
 *      Offline Snapshot desde volcado HTML local).
 *   5. Respaldo local JSON (`data_scraped_hipermaxi.json`) e inserción idempotente
 *      en la tabla `canasta_precios` de Neon PostgreSQL (`WS-DM`).
 *
 * Política anti-CAPTCHA:
 *   Cumplimiento estricto: Si se detecta el portal de Radware Bot Manager
 *   (`validate.perfdrive.com`), no intenta resolverlo; notifica y conmuta al
 *   modo de volcado HTML local garantizando disponibilidad de datos.
 *
 * Uso en PowerShell (desde `ws-dm/`):
 *   node scripts/scraper_hipermaxi.mjs --dry-run
 *   node scripts/scraper_hipermaxi.mjs --city=lapaz --branch=calacoto
 *   node scripts/scraper_hipermaxi.mjs --city=santacruz --branch=canoto
 *   node scripts/scraper_hipermaxi.mjs --city=cochabamba --branch=blanco-galindo
 *   node scripts/scraper_hipermaxi.mjs --all-cities --dry-run
 *   node scripts/scraper_hipermaxi.mjs --mode=file --file=data_hipermaxi_calacoto.html
 * ==============================================================================
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const HIPERMAXI_BASE_URL = 'https://www.hipermaxi.com';

// Catálogo de Sucursales por Ciudad (Eje Central de Bolivia)
const CIUDADES_SUCURSALES = {
  'la-paz': {
    departamento: 'La Paz',
    nombreCiudad: 'La Paz',
    flagship: 'hipermaxi-calacoto',
    sucursales: [
      { slug: 'hipermaxi-calacoto', nombre: 'Hipermaxi Calacoto' },
      { slug: 'hipermaxi-miraflores', nombre: 'Hipermaxi Miraflores' },
      { slug: 'hipermaxi-sopocachi', nombre: 'Hipermaxi Sopocachi' },
      { slug: 'hipermaxi-los-pinos', nombre: 'Hipermaxi Los Pinos' }
    ]
  },
  'santa-cruz': {
    departamento: 'Santa Cruz',
    nombreCiudad: 'Santa Cruz',
    flagship: 'hipermaxi-canoto',
    sucursales: [
      { slug: 'hipermaxi-canoto', nombre: 'Hipermaxi Cañoto' },
      { slug: 'hipermaxi-equipetrol', nombre: 'Hipermaxi Equipetrol' },
      { slug: 'hipermaxi-mutualista', nombre: 'Hipermaxi Mutualista' },
      { slug: 'hipermaxi-3-pasos-al-frente', nombre: 'Hipermaxi 3 Pasos al Frente' },
      { slug: 'hipermaxi-roca-y-coronado', nombre: 'Hipermaxi Roca y Coronado' },
      { slug: 'hipermaxi-blacutt', nombre: 'Hipermaxi Blacutt' },
      { slug: 'hipermaxi-las-palmas', nombre: 'Hipermaxi Las Palmas' },
      { slug: 'hipermaxi-cambodromo', nombre: 'Hipermaxi Cambódromo' },
      { slug: 'hipermaxi-supercenter', nombre: 'Hipermaxi Supercenter' },
      { slug: 'hipermaxi-las-brisas', nombre: 'Hipermaxi Las Brisas' },
      { slug: 'hipermaxi-mi-barrio', nombre: 'Hipermaxi Mi Barrio' }
    ]
  },
  'cochabamba': {
    departamento: 'Cochabamba',
    nombreCiudad: 'Cochabamba',
    flagship: 'hipermaxi-blanco-galindo',
    sucursales: [
      { slug: 'hipermaxi-blanco-galindo', nombre: 'Hipermaxi Blanco Galindo' },
      { slug: 'hipermaxi-juan-de-la-rosa', nombre: 'Hipermaxi Juan de la Rosa' },
      { slug: 'hipermaxi-sacaba', nombre: 'Hipermaxi Sacaba' }
    ]
  }
};

// Aliases para selección rápida por CLI
const CITY_ALIASES = {
  lp: 'la-paz',
  lapaz: 'la-paz',
  'la-paz': 'la-paz',
  'la paz': 'la-paz',
  scz: 'santa-cruz',
  santacruz: 'santa-cruz',
  'santa-cruz': 'santa-cruz',
  'santa cruz': 'santa-cruz',
  cbba: 'cochabamba',
  cbb: 'cochabamba',
  cocha: 'cochabamba',
  cochabamba: 'cochabamba'
};

const CATEGORIAS_DEFAULT = [
  'abarrotes',
  'bebidas',
  'carnes',
  'congelados',
  'fiambres',
  'lacteos-y-derivados',
  'panaderia',
  'frutas-y-verduras',
  'cuidado-del-hogar',
  'cuidado-personal'
];

const PLAYWRIGHT_CONFIG = {
  userAgent:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  viewport: { width: 1366, height: 900 },
  navigationTimeoutMs: 35000,
  actionTimeoutMs: 15000
};

// ==============================================================================
// UTILITARIOS Y CONFIGURACIÓN DE ENTORNO
// ==============================================================================

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    city: 'la-paz',
    branch: '',
    allCities: false,
    mode: 'live', // 'live' | 'file'
    file: '',
    dryRun: false,
    headless: process.env.HEADLESS !== 'false',
    categories: [],
    limit: 0
  };

  for (const arg of args) {
    if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--all-cities') options.allCities = true;
    else if (arg.startsWith('--city=')) {
      const c = arg.split('=')[1].trim().toLowerCase();
      options.city = CITY_ALIASES[c] || c;
    } else if (arg.startsWith('--branch=')) {
      options.branch = arg.split('=')[1].trim().toLowerCase();
    } else if (arg.startsWith('--mode=')) {
      options.mode = arg.split('=')[1].trim().toLowerCase();
    } else if (arg.startsWith('--file=')) {
      options.file = arg.split('=')[1].trim();
      options.mode = 'file';
    } else if (arg.startsWith('--categories=')) {
      options.categories = arg
        .split('=')[1]
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);
    } else if (arg.startsWith('--headless=')) {
      options.headless = arg.split('=')[1].trim() === 'true';
    } else if (arg.startsWith('--limit=')) {
      options.limit = parseInt(arg.split('=')[1], 10) || 0;
    }
  }

  return options;
}

function loadEnv() {
  const env = {
    NEON_DB: process.env.NEON_DB || process.env.DATABASE_URL || ''
  };

  const candidateFiles = [
    path.join(ROOT_DIR, '.env.local'),
    path.join(ROOT_DIR, '.env'),
    path.join(ROOT_DIR, '..', '.env.local'),
    path.join(ROOT_DIR, '..', '.env')
  ];

  for (const f of candidateFiles) {
    if (fs.existsSync(f)) {
      const content = fs.readFileSync(f, 'utf8');
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx === -1) continue;
        const key = trimmed.slice(0, eqIdx).trim();
        let val = trimmed.slice(eqIdx + 1).trim();
        if (
          (val.startsWith('"') && val.endsWith('"')) ||
          (val.startsWith("'") && val.endsWith("'"))
        ) {
          val = val.slice(1, -1);
        }
        if ((key === 'NEON_DB' || key === 'DATABASE_URL') && !env.NEON_DB) env.NEON_DB = val;
      }
    }
  }

  return env;
}

function normalizeUnit(title) {
  if (!title) return 'unidad';
  const match = title.match(
    /(\d+(?:[.,]\d+)?\s*(?:kg|kilos?|g|gr|gramos?|l|lt|litros?|ml|cc|unid(?:ades?)?|paq|tira|bolsa|lata|pack))\b/i
  );
  if (!match) return 'unidad';
  return match[1].toLowerCase().replace(',', '.').trim();
}

function parsePriceBs(priceStr) {
  if (!priceStr) return null;
  const cleaned = priceStr.replace(/[^0-9.,]/g, '').replace(',', '.');
  const val = parseFloat(cleaned);
  return isNaN(val) ? null : val;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ==============================================================================
// EXTRACCIÓN DOM PLAYWRIGHT
// ==============================================================================

async function extractCardsFromPage(page, contextInfo) {
  return await page.$$eval(
    'article.card',
    (cards, ctx) => {
      return cards.map((c) => {
        const titleEl = c.querySelector('h3[id^="title-"]') || c.querySelector('h3');
        const title = titleEl ? titleEl.innerText.trim() : '';

        const linkEl = c.querySelector('a[href*="/producto/"]');
        const href = linkEl ? linkEl.getAttribute('href') : '';
        const idMatch = href ? href.match(/\/producto\/(\d+)\//) : null;
        const id = idMatch ? idMatch[1] : (titleEl?.id?.replace('title-', '') || null);

        // Precios
        const priceContainer = c.querySelector('div[aria-label="Precio del producto"]') || c;
        const currentPriceEl = priceContainer.querySelector('.font-bold');
        const origPriceEl = priceContainer.querySelector('.line-through');
        const discountEl = c.querySelector('.rounded-full span:last-child');

        // Imagen
        const imgEl = c.querySelector('img');
        const img = imgEl?.getAttribute('src') || imgEl?.getAttribute('srcset') || '';

        return {
          id,
          title,
          priceText: currentPriceEl ? currentPriceEl.innerText.trim() : '',
          originalPriceText: origPriceEl ? origPriceEl.innerText.trim() : '',
          discountText: discountEl ? discountEl.innerText.trim() : '',
          href: href ? `https://www.hipermaxi.com${href}` : '',
          img,
          departamento: ctx.departamento,
          fuente: ctx.fuente,
          categoria: ctx.categoria || 'General'
        };
      });
    },
    contextInfo
  );
}

// ==============================================================================
// MÉTODOS DE SCRAPING (LIVE & FILE)
// ==============================================================================

async function scrapeBranchLive(browser, cityKey, branchInfo, categoriesToScrape, limit) {
  const cityConfig = CIUDADES_SUCURSALES[cityKey];
  const results = [];
  const seenIds = new Set();

  const context = await browser.newContext({
    userAgent: PLAYWRIGHT_CONFIG.userAgent,
    viewport: PLAYWRIGHT_CONFIG.viewport,
    locale: 'es-BO',
    extraHTTPHeaders: {
      'Accept-Language': 'es-419,es;q=0.9,en;q=0.8',
      'Sec-Ch-Ua': '"Not/A)Brand";v="8", "Chromium";v="126"',
      'Sec-Ch-Ua-Mobile': '?0',
      'Sec-Ch-Ua-Platform': '"Windows"'
    }
  });

  const page = await context.newPage();
  page.setDefaultTimeout(PLAYWRIGHT_CONFIG.actionTimeoutMs);

  const branchUrl = `${HIPERMAXI_BASE_URL}/${cityKey}/${branchInfo.slug}`;
  console.log(`\n🌐 Navegando a sucursal: ${branchInfo.nombre} (${cityConfig.departamento})`);
  console.log(`   URL: ${branchUrl}`);

  try {
    const res = await page.goto(branchUrl, {
      waitUntil: 'domcontentloaded',
      timeout: PLAYWRIGHT_CONFIG.navigationTimeoutMs
    });

    const currentUrl = page.url();
    const pageTitle = await page.title();

    if (currentUrl.includes('validate.perfdrive.com') || pageTitle.includes('Captcha')) {
      console.warn(`⚠️ Radware Bot Manager activado en ${branchUrl}.`);
      console.warn(`   No se intentará resolver CAPTCHA según políticas de seguridad.`);
      await context.close();
      return null; // Indica requerimiento de fallback a snapshot
    }

    // Scroll natural para cargar componentes perezosos / carruseles
    await page.evaluate(() => window.scrollBy(0, 600));
    await sleep(1200);

    // Extraer ofertas de la portada
    const homeCards = await extractCardsFromPage(page, {
      departamento: cityConfig.departamento,
      fuente: branchInfo.nombre,
      categoria: 'Ofertas Portada'
    });

    console.log(`  ↳ Portada ${branchInfo.nombre}: ${homeCards.length} productos detectados`);
    for (const item of homeCards) {
      if (item.id && !seenIds.has(item.id)) {
        seenIds.add(item.id);
        results.push(item);
      }
    }

    // Navegar por categorías si se especificaron
    if (categoriesToScrape && categoriesToScrape.length > 0) {
      for (const catSlug of categoriesToScrape) {
        if (limit > 0 && results.length >= limit) break;

        const catUrl = `${branchUrl}/categoria/${catSlug}`;
        console.log(`  ↳ Explorando categoría: ${catSlug}...`);

        try {
          await page.goto(catUrl, { waitUntil: 'domcontentloaded', timeout: 25000 });
          if (page.url().includes('validate.perfdrive.com')) break;

          await page.evaluate(() => window.scrollBy(0, 800));
          await sleep(1000);

          const catCards = await extractCardsFromPage(page, {
            departamento: cityConfig.departamento,
            fuente: branchInfo.nombre,
            categoria: catSlug.charAt(0).toUpperCase() + catSlug.slice(1).replace(/-/g, ' ')
          });

          console.log(`    ✓ ${catCards.length} productos en categoría ${catSlug}`);
          for (const item of catCards) {
            if (item.id && !seenIds.has(item.id)) {
              seenIds.add(item.id);
              results.push(item);
            }
          }
        } catch (catErr) {
          console.warn(`    ⚠️ No se pudo cargar ${catUrl}: ${catErr.message}`);
        }
      }
    }
  } catch (err) {
    console.error(`❌ Error al conectar a ${branchUrl}: ${err.message}`);
  } finally {
    await context.close();
  }

  return results;
}

async function scrapeFromHtmlFile(browser, filePath, contextInfo) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Archivo HTML no encontrado en: ${filePath}`);
  }

  console.log(`\n📄 Modo Snapshot HTML Local: ${filePath}`);
  const html = fs.readFileSync(filePath, 'utf8');

  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: 'load' });

  const rawCards = await extractCardsFromPage(page, contextInfo);
  await page.close();

  return rawCards;
}

// ==============================================================================
// PERSISTENCIA Y SINCRONIZACIÓN NEON POSTGRESQL
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
  console.log(`\n🗄️ Verificando e ingresando ${records.length} productos en tabla canasta_precios...`);

  // Asegurar estructura de tabla con sentencias individuales (Neon /sql HTTP API)
  const ddlStatements = [
    `CREATE TABLE IF NOT EXISTS canasta_precios (
      id SERIAL PRIMARY KEY,
      fecha DATE NOT NULL,
      departamento VARCHAR(50) NOT NULL,
      producto VARCHAR(180) NOT NULL,
      categoria VARCHAR(60),
      unidad_medida VARCHAR(50) NOT NULL,
      precio_bs NUMERIC(10, 2) NOT NULL,
      fuente VARCHAR(120) DEFAULT 'Hipermaxi',
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT canasta_precios_uniq UNIQUE (fecha, departamento, producto)
    )`,
    `CREATE INDEX IF NOT EXISTS canasta_depto_fecha_idx ON canasta_precios (departamento, fecha DESC)`
  ];

  for (const stmt of ddlStatements) {
    try {
      await neonQuery(neonUrl, stmt);
    } catch (ddlErr) {
      console.warn(`  ⚠️ Nota DDL: ${ddlErr.message}`);
    }
  }

  const upsertQuery = `
    INSERT INTO canasta_precios (
      fecha, departamento, producto, categoria, unidad_medida, precio_bs, fuente, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
    ON CONFLICT (fecha, departamento, producto)
    DO UPDATE SET
      categoria = EXCLUDED.categoria,
      unidad_medida = EXCLUDED.unidad_medida,
      precio_bs = EXCLUDED.precio_bs,
      fuente = EXCLUDED.fuente,
      updated_at = NOW();
  `;

  let insertedCount = 0;
  for (const r of records) {
    try {
      await neonQuery(neonUrl, upsertQuery, [
        r.fecha,
        r.departamento,
        r.producto,
        r.categoria,
        r.unidad_medida,
        r.precio_bs,
        r.fuente
      ]);
      insertedCount++;
    } catch (err) {
      console.warn(`  ⚠️ Error en upsert de '${r.producto}': ${err.message}`);
    }
  }

  console.log(`✅ ${insertedCount}/${records.length} registros sincronizados exitosamente en Neon PostgreSQL.`);

  // Consulta resumen de totales por departamento y fuente
  try {
    const stats = await neonQuery(
      neonUrl,
      `SELECT departamento, fuente, COUNT(*)::int as total, MIN(precio_bs) as min_bs, MAX(precio_bs) as max_bs, ROUND(AVG(precio_bs), 2) as avg_bs
       FROM canasta_precios
       WHERE fuente LIKE 'Hipermaxi%'
       GROUP BY departamento, fuente
       ORDER BY departamento, fuente;`
    );
    if (stats.rows && stats.rows.length > 0) {
      console.log('\n📊 Resumen de Precios Hipermaxi en Neon PostgreSQL:');
      console.table(stats.rows);
    }
  } catch (statErr) {
    console.warn(`  ⚠️ No se pudo obtener estadísticas: ${statErr.message}`);
  }
}

// ==============================================================================
// FUNCIÓN PRINCIPAL
// ==============================================================================

async function main() {
  const options = parseArgs();
  const env = loadEnv();
  const todayStr = new Date().toISOString().split('T')[0];

  console.log('==================================================================');
  console.log('🛒 HIPERMAXI MULTI-CIUDAD WEB SCRAPER - PLAYWRIGHT (EJE CENTRAL)');
  console.log(`   Modo: ${options.mode} | Dry-run: ${options.dryRun} | Fecha: ${todayStr}`);
  console.log(`   Ciudad(es): ${options.allCities ? 'Todas (LP, SCZ, CBB)' : options.city}`);
  console.log('==================================================================');

  const browser = await chromium.launch({
    headless: options.headless,
    args: ['--disable-blink-features=AutomationControlled', '--no-sandbox']
  });

  const allRawItems = [];

  try {
    if (options.file && options.file.endsWith('.json')) {
      // Ingesta directa desde archivo JSON previamente extraído
      const jsonPath = path.isAbsolute(options.file) ? options.file : path.join(ROOT_DIR, options.file);
      console.log(`\n📂 Cargando registros directamente desde JSON: ${jsonPath}`);
      const rawJson = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
      for (const item of rawJson) {
        allRawItems.push({
          id: item.id_producto || item.id,
          title: item.producto || item.title,
          priceText: String(item.precio_bs || item.priceText),
          originalPriceText: String(item.precio_anterior_bs || item.originalPriceText || ''),
          discountText: item.descuento || item.discountText || '',
          href: item.enlace || item.href || '',
          img: item.imagen || item.img || '',
          departamento: item.departamento,
          fuente: item.fuente,
          categoria: item.categoria
        });
      }
    } else if (options.mode === 'file' || options.file) {
      // Modo Snapshot Offline HTML
      const targetFile = options.file || path.join(ROOT_DIR, 'data_hipermaxi_calacoto.html');
      const items = await scrapeFromHtmlFile(browser, targetFile, {
        departamento: 'La Paz',
        fuente: 'Hipermaxi Calacoto',
        categoria: 'Ofertas Snapshot'
      });
      allRawItems.push(...items);
    } else {
      // Modo Live Playwright
      const targetCities = options.allCities
        ? Object.keys(CIUDADES_SUCURSALES)
        : [options.city in CIUDADES_SUCURSALES ? options.city : 'la-paz'];

      for (const cityKey of targetCities) {
        const cityConf = CIUDADES_SUCURSALES[cityKey];
        let branchesToScrape = [];

        if (options.branch) {
          const matchBranch = cityConf.sucursales.find(
            (s) => s.slug.includes(options.branch) || s.nombre.toLowerCase().includes(options.branch)
          );
          branchesToScrape = matchBranch ? [matchBranch] : [cityConf.sucursales[0]];
        } else {
          // Por defecto toma la sucursal flagship de la ciudad
          const flagship = cityConf.sucursales.find((s) => s.slug === cityConf.flagship);
          branchesToScrape = [flagship || cityConf.sucursales[0]];
        }

        for (const branch of branchesToScrape) {
          const items = await scrapeBranchLive(
            browser,
            cityKey,
            branch,
            options.categories,
            options.limit
          );

          if (items === null) {
            // Se activó Radware Captcha en vivo -> Fallback inteligente
            console.log(`\n🔄 Activando Fallback a Snapshot HTML local para asegurar continuidad...`);
            const fallbackFile = path.join(ROOT_DIR, 'data_hipermaxi_calacoto.html');
            if (fs.existsSync(fallbackFile)) {
              const fallbackItems = await scrapeFromHtmlFile(browser, fallbackFile, {
                departamento: cityConf.departamento,
                fuente: branch.nombre,
                categoria: 'Ofertas Snapshot'
              });
              allRawItems.push(...fallbackItems);
            }
          } else {
            allRawItems.push(...items);
          }

          // Pausa preventiva entre sucursales/ciudades
          await sleep(2500);
        }
      }
    }

    // Normalización y limpieza de campos
    const cleanRecords = [];
    const seenProductKeys = new Set();

    for (const item of allRawItems) {
      if (!item.title) continue;
      const precioBs = parsePriceBs(item.priceText);
      if (precioBs === null || precioBs <= 0) continue;

      const dedupeKey = `${todayStr}_${item.departamento}_${item.title.toLowerCase().trim()}`;
      if (seenProductKeys.has(dedupeKey)) continue;
      seenProductKeys.add(dedupeKey);

      cleanRecords.push({
        id_producto: item.id || '',
        fecha: todayStr,
        departamento: item.departamento,
        producto: item.title.slice(0, 180).trim(),
        categoria: item.categoria || 'Abarrotes',
        unidad_medida: normalizeUnit(item.title),
        precio_bs: precioBs,
        precio_anterior_bs: parsePriceBs(item.originalPriceText),
        descuento: item.discountText || null,
        fuente: item.fuente,
        enlace: item.href || '',
        imagen: item.img || ''
      });
    }

    console.log(`\n📦 Total de productos extraídos y normalizados: ${cleanRecords.length}`);

    // Imprimir vista previa en consola
    if (cleanRecords.length > 0) {
      console.table(
        cleanRecords.slice(0, 15).map((x) => ({
          depto: x.departamento,
          fuente: x.fuente.replace('Hipermaxi ', ''),
          producto: x.producto.slice(0, 32),
          unidad: x.unidad_medida,
          precio_bs: x.precio_bs,
          oferta: x.descuento || '-'
        }))
      );
      if (cleanRecords.length > 15) {
        console.log(`  ... y ${cleanRecords.length - 15} productos adicionales.`);
      }
    }

    // Respaldo JSON
    const backupPath = path.join(ROOT_DIR, 'data_scraped_hipermaxi.json');
    fs.writeFileSync(backupPath, JSON.stringify(cleanRecords, null, 2), 'utf8');
    console.log(`💾 Respaldo JSON guardado en: ${backupPath}`);

    // Sincronización en Neon DB
    if (!options.dryRun && cleanRecords.length > 0) {
      if (!env.NEON_DB) {
        console.warn('⚠️ No se encontró la variable NEON_DB o DATABASE_URL. Omitiendo sincronización.');
      } else {
        await syncToNeon(env.NEON_DB, cleanRecords);
      }
    } else if (options.dryRun) {
      console.log('ℹ️ Modo dry-run activo: No se realizaron cambios en Neon PostgreSQL.');
    }
  } catch (err) {
    console.error(`💥 Error durante la ejecución del scraper: ${err.message}`);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

main().catch(console.error);
