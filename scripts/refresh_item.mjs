/**
 * ==============================================================================
 * COMANDO CLI: ACTUALIZADOR Y SCRAPER EN DEMANDA DE ITEMS
 * ==============================================================================
 * Actualiza en vivo la información de productos mediante extracción DOM puntual:
 *   - Búsqueda tokenizada omnicanal: "maple de huevo", "leche PIL", "margarina regia"
 *   - Extracción en vivo (Shopify JSON / Playwright Headless)
 *   - Cálculo automático de deltas (Delta Bs, Delta %) y detección de ofertas
 *   - Persistencia inmediata en Neon PostgreSQL (`precios_historico`, `catalogo_productos_master`)
 *
 * Ejemplos de uso (desde `ws-dm/`):
 *   node scripts/refresh_item.mjs --query="maple de huevo"
 *   node scripts/refresh_item.mjs --query="leche PIL"
 *   node scripts/refresh_item.mjs --query="margarina regia"
 *   node scripts/refresh_item.mjs --id="MED_102"
 *   node scripts/refresh_item.mjs --url="https://farmacorp.com/products/paracetamol-500-mg-x-20-comprimidos-inti"
 *   node scripts/refresh_item.mjs --query="paneton" --limit=3
 * ==============================================================================
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const STOP_WORDS = new Set([
  'de', 'del', 'la', 'el', 'los', 'las', 'un', 'una', 'unos', 'unas',
  'en', 'para', 'por', 'con', 'sin', 'sobre', 'y', 'o', 'al', 'a'
]);

function extractSearchTokens(query) {
  if (!query) return [];
  const clean = query
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .trim();

  const parts = clean.split(/\s+/).filter((word) => word.length > 1 && !STOP_WORDS.has(word));
  return parts.length > 0 ? parts : [query.trim().toLowerCase()];
}

function buildTokenizedConditions(query, paramStartIndex = 1, fields = ['producto', 'categoria']) {
  const tokens = extractSearchTokens(query);
  if (tokens.length === 0) {
    return { sql: '1=1', params: [], tokens: [] };
  }

  const conditions = [];
  const params = [];
  let paramIdx = paramStartIndex;

  for (const token of tokens) {
    const fieldChecks = fields.map((f) => `${f} ILIKE $${paramIdx}`);
    conditions.push(`(${fieldChecks.join(' OR ')})`);
    params.push(`%${token}%`);
    paramIdx++;
  }

  return {
    sql: conditions.join(' AND '),
    params,
    tokens,
  };
}

function parsePriceBs(raw) {
  if (typeof raw === 'number') {
    return Number.isFinite(raw) && raw > 0 ? Number(raw.toFixed(2)) : null;
  }
  if (!raw || typeof raw !== 'string') return null;

  const clean = raw.replace(/[^\d.,]/g, '').trim();
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

function detectPlatform(url) {
  const u = (url || '').toLowerCase();
  if (u.includes('farmacorp.com')) return 'FARMACORP';
  if (u.includes('farmaciaschavez.com.bo')) return 'CHAVEZ';
  if (u.includes('hipermaxi.com')) return 'HIPERMAXI';
  return 'UNKNOWN';
}

async function scrapeProductUrl(url) {
  const platform = detectPlatform(url);
  if (platform === 'UNKNOWN') return null;

  // Intento Tier 1 para Shopify (Farmacorp)
  if (platform === 'FARMACORP') {
    try {
      const urlObj = new URL(url);
      const pathname = urlObj.pathname.replace(/\/$/, '');
      if (pathname.includes('/products/')) {
        const jsonUrl = `${urlObj.origin}${pathname}.js`;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 3500);

        const res = await fetch(jsonUrl, {
          signal: controller.signal,
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            Accept: 'application/json',
          },
        });
        clearTimeout(timeout);

        if (res.ok) {
          const data = await res.json();
          if (data && data.title && data.price != null) {
            const precioActual = Number((data.price / 100).toFixed(2));
            const precioAnterior = data.compare_at_price ? Number((data.compare_at_price / 100).toFixed(2)) : null;
            let descuentoPct = null;
            if (precioAnterior && precioAnterior > precioActual) {
              descuentoPct = Number((((precioAnterior - precioActual) / precioAnterior) * 100).toFixed(1));
            }
            const skuId = `farmacorp-${data.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 70)}`;
            return {
              producto: data.title,
              cadena: 'Farmacorp',
              precio_actual_bs: precioActual,
              precio_anterior_bs: precioAnterior,
              descuento_pct: descuentoPct,
              en_oferta: Boolean(descuentoPct && descuentoPct > 0),
              disponible: data.available !== false,
              enlace: url,
              imagen: data.featured_image || (data.images && data.images[0]) || '',
              sku_id: skuId,
            };
          }
        }
      }
    } catch {
      // Fallback a Playwright
    }
  }

  // Tier 2: Playwright Headless
  let browser = null;
  try {
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
    });

    const context = await browser.newContext({
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      viewport: { width: 1280, height: 800 },
    });

    const page = await context.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForTimeout(800);

    const scraped = await page.evaluate((plat) => {
      let title = '';
      let rawPrice = '';
      let rawOldPrice = '';
      let img = '';
      let chain = 'Tienda Oficial';

      if (plat === 'FARMACORP') {
        chain = 'Farmacorp';
        title = document.querySelector('h1.product-title, h1')?.textContent?.trim() || '';
        rawPrice = document.querySelector('.price--main, .price__current, [class*="price--main"]')?.textContent?.trim() || '';
        rawOldPrice = document.querySelector('.price--compare-at, [class*="compare-at"]')?.textContent?.trim() || '';
        img = document.querySelector('.product-gallery--image img, .product-main-image img')?.getAttribute('src') || '';
      } else if (plat === 'CHAVEZ') {
        chain = 'Farmacias Chavez';
        title = document.querySelector('h1[class*="prod__name"], h1')?.textContent?.trim() || '';
        rawPrice = document.querySelector('[class*="base__price"], p[class*="price"]')?.textContent?.trim() || '';
        rawOldPrice = document.querySelector('[class*="old__price"]')?.textContent?.trim() || '';
        img = document.querySelector('img[class*="prod__image"], img')?.getAttribute('src') || '';
      } else if (plat === 'HIPERMAXI') {
        chain = 'Hipermaxi';
        title = document.querySelector('h1, h2, h3[id^="title-"]')?.textContent?.trim() || '';
        rawPrice = document.querySelector('div[aria-label="Precio del producto"] .font-bold, .font-bold[class*="text-"]')?.textContent?.trim() || '';
        rawOldPrice = document.querySelector('.line-through')?.textContent?.trim() || '';
        img = document.querySelector('img[alt^="Imagen"], img')?.getAttribute('src') || '';
      }

      return { title, rawPrice, rawOldPrice, img, chain };
    }, platform);

    if (!scraped || !scraped.title) return null;

    const precioActual = parsePriceBs(scraped.rawPrice);
    if (!precioActual) return null;

    const precioAnterior = parsePriceBs(scraped.rawOldPrice);
    let descuentoPct = null;
    if (precioAnterior && precioAnterior > precioActual) {
      descuentoPct = Number((((precioAnterior - precioActual) / precioAnterior) * 100).toFixed(1));
    }

    const skuId = `${scraped.chain.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${scraped.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 65)}`;

    return {
      producto: scraped.title,
      cadena: scraped.chain,
      precio_actual_bs: precioActual,
      precio_anterior_bs: precioAnterior,
      descuento_pct: descuentoPct,
      en_oferta: Boolean(descuentoPct && descuentoPct > 0),
      disponible: true,
      enlace: url,
      imagen: scraped.img.startsWith('http') ? scraped.img : scraped.img ? `https:${scraped.img}` : '',
      sku_id: skuId,
    };
  } catch (err) {
    console.warn(`[PLAYWRIGHT SCRAPE ERROR] ${url}:`, err.message);
    return null;
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }
}

function loadEnv() {
  const envPath = path.resolve(ROOT_DIR, '.env');
  const env = {
    NEON_DB: process.env.NEON_DB || process.env.DATABASE_URL || '',
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

async function neonQuery(neonUrl, query, params = []) {
  if (!neonUrl) return { rows: [] };
  const u = new URL(neonUrl);
  const endpoint = `https://${u.host}/sql`;

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Neon-Connection-String': neonUrl,
    },
    body: JSON.stringify({ query, params }),
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Neon SQL HTTP ${res.status}: ${txt}`);
  }

  return await res.json();
}

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    query: '',
    id: '',
    url: '',
    limit: 5,
    dryRun: false,
  };

  for (const arg of args) {
    if (arg === '--dry-run') options.dryRun = true;
    else if (arg.startsWith('--query=')) options.query = arg.split('=')[1].trim();
    else if (arg.startsWith('--search=')) options.query = arg.split('=')[1].trim();
    else if (arg.startsWith('--id=')) options.id = arg.split('=')[1].trim();
    else if (arg.startsWith('--url=')) options.url = arg.split('=')[1].trim();
    else if (arg.startsWith('--limit=')) options.limit = parseInt(arg.split('=')[1], 10) || 5;
  }

  return options;
}

async function main() {
  const options = parseArgs();
  const env = loadEnv();

  console.log('==================================================================');
  console.log('🛒 ACTUALIZADOR Y SCRAPER EN DEMANDA DE ITEMS (BOLIVIA)');
  console.log('==================================================================');

  if (!options.query && !options.id && !options.url) {
    console.log('Uso:');
    console.log('   node scripts/refresh_item.mjs --query="<termino>"   (Ej. "maple de huevo", "leche PIL", "margarina regia")');
    console.log('   node scripts/refresh_item.mjs --id="<id>"           (Ej. "2328" o "MED_102")');
    console.log('   node scripts/refresh_item.mjs --url="<enlace>"      (URL directa de Farmacorp, Chávez o Hipermaxi)');
    console.log('   --limit=<num>         (Cantidad máxima de items a cotejar)');
    console.log('   --dry-run             (Simular sin persistir en base de datos)');
    process.exit(0);
  }

  // Caso 1: Actualización directa por URL
  if (options.url) {
    console.log(`\n🌐 Ejecutando scraping directo sobre URL: ${options.url}`);
    const live = await scrapeProductUrl(options.url);
    if (!live) {
      console.error('❌ No se pudo extraer la información del producto en la URL indicada.');
      process.exit(1);
    }
    console.table([{
      Producto: live.producto,
      Cadena: live.cadena,
      'Precio Actual': `Bs ${live.precio_actual_bs.toFixed(2)}`,
      'Precio Ant.': live.precio_anterior_bs ? `Bs ${live.precio_anterior_bs.toFixed(2)}` : '-',
      Descuento: live.descuento_pct ? `${live.descuento_pct}%` : '0%',
      Oferta: live.en_oferta ? 'SÍ 🔥' : 'NO',
      Disponible: live.disponible ? 'SÍ' : 'NO',
    }]);

    if (!options.dryRun && env.NEON_DB) {
      console.log('💾 Registrando observación en precios_historico...');
      await neonQuery(env.NEON_DB, `
        INSERT INTO precios_historico (
          sku_id, fecha, precio_actual_bs, precio_anterior_bs, descuento_pct, disponible, recorded_at
        ) VALUES ($1, CURRENT_DATE, $2, $3, $4, $5, NOW())
        ON CONFLICT (sku_id, fecha) DO UPDATE SET
          precio_actual_bs = EXCLUDED.precio_actual_bs,
          precio_anterior_bs = EXCLUDED.precio_anterior_bs,
          descuento_pct = EXCLUDED.descuento_pct;
      `, [live.sku_id, live.precio_actual_bs, live.precio_anterior_bs, live.descuento_pct, live.disponible]);
      console.log('✅ Observación guardada con éxito.');
    }
    return;
  }

  // Caso 2: Actualización por ID
  if (options.id) {
    const isMed = options.id.startsWith('MED_');
    const cleanId = isMed ? options.id.replace('MED_', '') : options.id;
    console.log(`\n🔍 Buscando producto con ID: ${options.id} en Neon...`);

    const sql = isMed
      ? `SELECT id, producto, cadena, departamento, precio_bs::float, enlace, imagen FROM medicamentos_precios WHERE id = $1`
      : `SELECT id, producto, fuente AS cadena, departamento, precio_bs::float, enlace, imagen FROM canasta_precios WHERE id = $1`;

    const res = await neonQuery(env.NEON_DB, sql, [Number(cleanId)]);
    if (!res?.rows || res.rows.length === 0) {
      console.error(`❌ No se encontró ningún producto con ID ${options.id}`);
      process.exit(1);
    }

    const row = res.rows[0];
    console.log(`📦 Encontrado: ${row.producto} (${row.cadena}) | Precio actual: Bs ${Number(row.precio_bs || 0).toFixed(2)}`);

    if (!row.enlace) {
      console.log('ℹ️ El producto no posee enlace oficial para scraping directo.');
      return;
    }

    console.log(`🌐 Scrapeando enlace: ${row.enlace}`);
    const live = await scrapeProductUrl(row.enlace);
    if (!live) {
      console.log('⚠️ No se pudo obtener información fresca de la tienda. Se mantiene el registro previo.');
      return;
    }

    const delta = Number((live.precio_actual_bs - row.precio_bs).toFixed(2));
    const deltaPct = row.precio_bs > 0 ? Number(((delta / row.precio_bs) * 100).toFixed(1)) : 0;

    console.table([{
      Producto: live.producto,
      Cadena: live.cadena,
      'Precio Anterior': `Bs ${Number(row.precio_bs).toFixed(2)}`,
      'Precio En Vivo': `Bs ${live.precio_actual_bs.toFixed(2)}`,
      'Delta Bs': delta === 0 ? 'Sin variación' : delta > 0 ? `+Bs ${delta}` : `-Bs ${Math.abs(delta)}`,
      'Oferta %': live.descuento_pct ? `${live.descuento_pct}% 🔥` : '-',
    }]);

    if (!options.dryRun && env.NEON_DB) {
      const skuId = `${row.cadena.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${live.producto.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 65)}`;
      await neonQuery(env.NEON_DB, `
        INSERT INTO precios_historico (
          sku_id, fecha, precio_actual_bs, precio_anterior_bs, descuento_pct, delta_precio_bs, delta_porcentaje, disponible, recorded_at
        ) VALUES ($1, CURRENT_DATE, $2, $3, $4, $5, $6, $7, NOW())
        ON CONFLICT (sku_id, fecha) DO UPDATE SET
          precio_actual_bs = EXCLUDED.precio_actual_bs,
          precio_anterior_bs = EXCLUDED.precio_anterior_bs,
          descuento_pct = EXCLUDED.descuento_pct,
          delta_precio_bs = EXCLUDED.delta_precio_bs,
          delta_porcentaje = EXCLUDED.delta_porcentaje;
      `, [skuId, live.precio_actual_bs, row.precio_bs, live.descuento_pct, delta, deltaPct, live.disponible]);

      if (isMed) {
        await neonQuery(env.NEON_DB, `
          UPDATE medicamentos_precios
          SET precio_bs = $1, fecha = CURRENT_DATE
          WHERE id = $2;
        `, [live.precio_actual_bs, Number(cleanId)]);
      } else {
        await neonQuery(env.NEON_DB, `
          UPDATE canasta_precios
          SET precio_bs = $1, fecha = CURRENT_DATE
          WHERE id = $2;
        `, [live.precio_actual_bs, Number(cleanId)]);
      }
      console.log('✅ Base de datos actualizada con éxito en precios_historico.');
    }
    return;
  }

  // Caso 3: Búsqueda Multitérmino Inteligente (maple de huevo, leche PIL, margarina regia)
  if (options.query) {
    console.log(`\n🔎 Procesando búsqueda multitérmino: "${options.query}"`);
    const tokens = extractSearchTokens(options.query);
    console.log(`📌 Tokens extraídos (sin stop-words): [${tokens.map(t => `"${t}"`).join(', ')}]`);

    const filterCanasta = buildTokenizedConditions(options.query, 1, ['producto', 'categoria']);
    const sqlCanasta = `
      SELECT id, producto, fuente AS cadena, departamento, precio_bs::float, enlace, imagen
      FROM canasta_precios
      WHERE ${filterCanasta.sql}
      ORDER BY fecha DESC
      LIMIT ${options.limit};
    `;

    const filterMed = buildTokenizedConditions(options.query, 1, ['producto', 'categoria', 'laboratorio']);
    const sqlMed = `
      SELECT id, producto, cadena, departamento, precio_bs::float, enlace, imagen
      FROM medicamentos_precios
      WHERE ${filterMed.sql}
      ORDER BY fecha DESC
      LIMIT ${options.limit};
    `;

    console.log('⚡ Consultando base de datos unificada...');
    const canastaRes = await neonQuery(env.NEON_DB, sqlCanasta, filterCanasta.params);
    const medRes = await neonQuery(env.NEON_DB, sqlMed, filterMed.params);

    const matches = [
      ...(canastaRes?.rows || []).map(r => ({ ...r, id: String(r.id), tipo: 'supermercado' })),
      ...(medRes?.rows || []).map(r => ({ ...r, id: `MED_${r.id}`, tipo: 'farmacia' }))
    ];

    console.log(`🎯 Encontradas ${matches.length} coincidencias en el catálogo.`);

    if (matches.length === 0) {
      console.log('ℹ️ No se encontraron productos para los términos indicados.');
      return;
    }

    console.table(matches.map(m => ({
      ID: m.id,
      Producto: m.producto.slice(0, 35),
      Cadena: m.cadena,
      Precio: `Bs ${Number(m.precio_bs || 0).toFixed(2)}`,
      TieneEnlace: m.enlace ? 'SÍ' : 'NO'
    })));

    const withLinks = matches.filter(m => m.enlace && m.enlace.startsWith('http')).slice(0, options.limit);
    if (withLinks.length === 0) {
      console.log('ℹ️ Los productos encontrados no poseen enlaces directos para scraping en tienda.');
      return;
    }

    console.log(`\n🚀 Ejecutando scraping personalizado en vivo sobre ${withLinks.length} items...`);
    const results = [];

    for (const item of withLinks) {
      console.log(`   Scrapeando [${item.cadena}]: ${item.producto.slice(0, 30)}...`);
      const live = await scrapeProductUrl(item.enlace);
      if (live) {
        const delta = Number((live.precio_actual_bs - item.precio_bs).toFixed(2));
        const deltaPct = item.precio_bs > 0 ? Number(((delta / item.precio_bs) * 100).toFixed(1)) : 0;

        results.push({
          Producto: live.producto.slice(0, 32),
          Cadena: live.cadena,
          'P. Anterior': `Bs ${item.precio_bs.toFixed(2)}`,
          'P. En Vivo': `Bs ${live.precio_actual_bs.toFixed(2)}`,
          'Delta Bs': delta === 0 ? 'Sin cambio' : delta > 0 ? `+Bs ${delta}` : `-Bs ${Math.abs(delta)}`,
          'Oferta %': live.descuento_pct ? `${live.descuento_pct}% 🔥` : '-',
          Estado: live.en_oferta ? 'EN OFERTA' : delta < 0 ? 'REBAJADO' : 'NORMAL'
        });

        if (!options.dryRun && env.NEON_DB) {
          const skuId = `${item.cadena.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${live.producto.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 65)}`;
          await neonQuery(env.NEON_DB, `
            INSERT INTO precios_historico (
              sku_id, fecha, precio_actual_bs, precio_anterior_bs, descuento_pct, delta_precio_bs, delta_porcentaje, disponible, recorded_at
            ) VALUES ($1, CURRENT_DATE, $2, $3, $4, $5, $6, $7, NOW())
            ON CONFLICT (sku_id, fecha) DO UPDATE SET
              precio_actual_bs = EXCLUDED.precio_actual_bs,
              precio_anterior_bs = EXCLUDED.precio_anterior_bs,
              descuento_pct = EXCLUDED.descuento_pct,
              delta_precio_bs = EXCLUDED.delta_precio_bs,
              delta_porcentaje = EXCLUDED.delta_porcentaje;
          `, [skuId, live.precio_actual_bs, item.precio_bs, live.descuento_pct, delta, deltaPct, live.disponible]);
        }
      }
    }

    if (results.length > 0) {
      console.log('\n📊 Resultados de Scraping en Vivo:');
      console.table(results);
      if (!options.dryRun) {
        console.log('✅ Serie temporal persistida exitosamente en precios_historico.');
      }
    }
  }
}

main().catch(err => {
  console.error('❌ Error fatal:', err);
  process.exit(1);
});
