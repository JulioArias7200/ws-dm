/**
 * ==============================================================================
 * MONITOR Y ACTUALIZADOR DE HISTÓRICO DE PRECIOS (PRICE TRACKER TIME-SERIES)
 * ==============================================================================
 * Módulo especializado para:
 *   1. Actualización puntual bajo demanda de un producto individual (Single Item Sync)
 *      en < 2 segundos mediante su URL canónica (Farmacorp, Farmacias Chávez, Hipermaxi).
 *   2. Registro de series temporales en base de datos (`precios_historico`).
 *   3. Cálculo de variaciones de precio (Delta Bs y Delta %) y detección de ofertas.
 *   4. Consulta y visualización del historial de precios de un SKU.
 *
 * Uso en PowerShell (desde `ws-dm/`):
 *   node scripts/price_tracker.mjs --url="https://farmacorp.com/products/paracetamol-500-mg-x-20-comprimidos-inti"
 *   node scripts/price_tracker.mjs --url="https://www.farmaciaschavez.com.bo/p/crema-combinada-alfa-x-15-gr-105775"
 *   node scripts/price_tracker.mjs --sku="farmacorp-paracetamol-500-mg"
 *   node scripts/price_tracker.mjs --history --limit=10
 * ==============================================================================
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const LOCAL_HISTORY_JSON = path.resolve(ROOT_DIR, 'data_price_history.json');

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    url: '',
    sku: '',
    history: false,
    limit: 15,
    headless: true,
    dryRun: false
  };

  for (const arg of args) {
    if (arg === '--history') options.history = true;
    else if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--no-headless' || arg === '--headed') options.headless = false;
    else if (arg.startsWith('--url=')) options.url = arg.split('=')[1].trim();
    else if (arg.startsWith('--sku=')) options.sku = arg.split('=')[1].trim();
    else if (arg.startsWith('--limit=')) options.limit = parseInt(arg.split('=')[1], 10) || 15;
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

async function neonQuery(neonUrl, query, params = []) {
  if (!neonUrl) return null;
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

function parsePriceBs(rawText) {
  if (!rawText) return null;
  const clean = rawText.replace(/[^\d.,]/g, '').trim();
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
  const u = url.toLowerCase();
  if (u.includes('farmacorp.com')) return 'FARMACORP';
  if (u.includes('farmaciaschavez.com.bo')) return 'CHAVEZ';
  if (u.includes('hipermaxi.com')) return 'HIPERMAXI';
  return 'UNKNOWN';
}

/**
 * Extracción puntual en una sola página de producto
 */
async function extractSingleItem(page, targetUrl) {
  const platform = detectPlatform(targetUrl);
  console.log(`🌐 Navegando a producto (${platform}): ${targetUrl}`);

  await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(1000);

  let item = null;

  if (platform === 'FARMACORP') {
    item = await page.evaluate(() => {
      const title = document.querySelector('h1.product-title, h1')?.textContent?.trim() || '';
      const priceMain = document.querySelector('.price--main, .price__current, [class*="price--main"]')?.textContent?.trim() || '';
      const priceCompare = document.querySelector('.price--compare-at, [class*="compare-at"]')?.textContent?.trim() || '';
      const vendor = document.querySelector('.product-vendor a, .product-vendor')?.textContent?.trim() || 'Farmacorp';
      const img = document.querySelector('.product-gallery--image img, .product-main-image img')?.getAttribute('src') || '';

      return {
        producto: title,
        cadena: 'Farmacorp',
        laboratorio: vendor,
        categoria: 'Farmacia',
        rawPrice: priceMain,
        rawOldPrice: priceCompare,
        img: img ? (img.startsWith('http') ? img : `https:${img}`) : ''
      };
    });
  } else if (platform === 'CHAVEZ') {
    item = await page.evaluate(() => {
      const title = document.querySelector('h1[class*="prod__name"], h1')?.textContent?.trim() || '';
      const priceMain = document.querySelector('[class*="base__price"], p[class*="price"]')?.textContent?.trim() || '';
      const priceCompare = document.querySelector('[class*="old__price"]')?.textContent?.trim() || '';
      const desc = document.querySelector('[data-testid="description-content"]')?.textContent?.trim() || '';
      const img = document.querySelector('img[class*="prod__image"], img')?.getAttribute('src') || '';

      return {
        producto: title,
        cadena: 'Farmacias Chavez',
        laboratorio: 'Genérico',
        categoria: 'Medicamentos',
        description: desc,
        rawPrice: priceMain,
        rawOldPrice: priceCompare,
        img
      };
    });
  } else if (platform === 'HIPERMAXI') {
    item = await page.evaluate(() => {
      const title = document.querySelector('h1, h2')?.textContent?.trim() || '';
      const priceMain = document.querySelector('.font-bold[class*="text-"]')?.textContent?.trim() || '';
      const priceCompare = document.querySelector('.line-through')?.textContent?.trim() || '';
      const img = document.querySelector('img[alt^="Imagen"]')?.getAttribute('src') || '';

      return {
        producto: title,
        cadena: 'Hipermaxi',
        laboratorio: 'Hipermaxi',
        categoria: 'Supermercado',
        rawPrice: priceMain,
        rawOldPrice: priceCompare,
        img
      };
    });
  } else {
    throw new Error(`Plataforma no soportada para URL: ${targetUrl}`);
  }

  if (!item || !item.producto) {
    throw new Error('No se pudo extraer la información del producto en la página.');
  }

  const precioActual = parsePriceBs(item.rawPrice);
  const precioAnterior = parsePriceBs(item.rawOldPrice);

  let descuentoPct = 0;
  if (precioAnterior && precioAnterior > precioActual) {
    descuentoPct = Number((((precioAnterior - precioActual) / precioAnterior) * 100).toFixed(1));
  }

  const skuId = `${item.cadena.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${item.producto.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 60)}`;

  return {
    skuId,
    producto: item.producto,
    cadena: item.cadena,
    departamento: 'La Paz',
    categoria: item.categoria,
    laboratorio: item.laboratorio,
    precioActual,
    precioAnterior,
    descuentoPct,
    enlace: targetUrl,
    imagen: item.img,
    fecha: new Date().toISOString().split('T')[0]
  };
}

/**
 * Persiste la observación en Neon e histórico local
 */
async function recordPriceObservation(env, data, dryRun = false) {
  console.log('\n📊 Datos del Producto Extraído:');
  console.table([{
    SKU: data.skuId,
    Producto: data.producto.slice(0, 40),
    Cadena: data.cadena,
    'Precio Bs': data.precioActual,
    'Precio Ant.': data.precioAnterior || '-',
    'Descuento %': data.descuentoPct ? `${data.descuentoPct}%` : '0%',
    Fecha: data.fecha
  }]);

  if (dryRun) {
    console.log('ℹ️ Modo dry-run activo. No se modificó la base de datos.');
    return;
  }

  // Guardar en JSON local
  try {
    let localData = [];
    if (fs.existsSync(LOCAL_HISTORY_JSON)) {
      localData = JSON.parse(fs.readFileSync(LOCAL_HISTORY_JSON, 'utf-8'));
    }
    localData.push({
      ...data,
      timestamp: new Date().toISOString()
    });
    fs.writeFileSync(LOCAL_HISTORY_JSON, JSON.stringify(localData, null, 2), 'utf-8');
    console.log(`💾 Observación guardada en archivo local: ${LOCAL_HISTORY_JSON}`);
  } catch (err) {
    console.warn(`⚠️ Error al escribir JSON local: ${err.message}`);
  }

  // Sincronizar en Neon PostgreSQL
  if (env.NEON_DB) {
    try {
      // 1. Maestro
      await neonQuery(env.NEON_DB, `
        INSERT INTO catalogo_productos_master (
          sku_id, producto, cadena, departamento, categoria, laboratorio, enlace_canonica, imagen, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
        ON CONFLICT (sku_id) DO UPDATE SET
          producto = EXCLUDED.producto,
          categoria = EXCLUDED.categoria,
          laboratorio = EXCLUDED.laboratorio,
          enlace_canonica = COALESCE(EXCLUDED.enlace_canonica, catalogo_productos_master.enlace_canonica),
          imagen = COALESCE(EXCLUDED.imagen, catalogo_productos_master.imagen),
          updated_at = NOW();
      `, [data.skuId, data.producto, data.cadena, data.departamento, data.categoria, data.laboratorio, data.enlace, data.imagen]);

      // 2. Histórico
      const deltaBs = data.precioAnterior ? Number((data.precioActual - data.precioAnterior).toFixed(2)) : 0;
      const deltaPct = data.descuentoPct ? -Math.abs(data.descuentoPct) : 0;

      await neonQuery(env.NEON_DB, `
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
      `, [data.skuId, data.fecha, data.precioActual, data.precioAnterior, data.descuentoPct, deltaBs, deltaPct, true]);

      console.log(`✅ Observación registrada exitosamente en Neon PostgreSQL (Tablas: catalogo_productos_master y precios_historico).`);
    } catch (dbErr) {
      console.warn(`⚠️ Error al sincronizar en Neon: ${dbErr.message}`);
    }
  }
}

/**
 * Consulta y visualiza el historial de un producto
 */
async function showHistory(env, skuFilter, limit = 15) {
  console.log(`\n📈 Consultando histórico de precios${skuFilter ? ' para SKU: ' + skuFilter : ''}...`);

  if (env.NEON_DB) {
    try {
      const sql = skuFilter
        ? `SELECT h.fecha, m.producto, m.cadena, h.precio_actual_bs, h.precio_anterior_bs, h.descuento_pct, h.delta_precio_bs
           FROM precios_historico h
           JOIN catalogo_productos_master m ON h.sku_id = m.sku_id
           WHERE h.sku_id ILIKE $1
           ORDER BY h.fecha DESC
           LIMIT $2;`
        : `SELECT h.fecha, m.producto, m.cadena, h.precio_actual_bs, h.precio_anterior_bs, h.descuento_pct, h.delta_precio_bs
           FROM precios_historico h
           JOIN catalogo_productos_master m ON h.sku_id = m.sku_id
           ORDER BY h.fecha DESC
           LIMIT $1;`;

      const params = skuFilter ? [`%${skuFilter}%`, limit] : [limit];
      const res = await neonQuery(env.NEON_DB, sql, params);

      if (res && res.rows && res.rows.length > 0) {
        console.table(res.rows);
        return;
      }
    } catch (err) {
      console.warn(`⚠️ Consulta en Neon falló (${err.message}). Consultando respaldo local...`);
    }
  }

  // Fallback local
  if (fs.existsSync(LOCAL_HISTORY_JSON)) {
    const raw = JSON.parse(fs.readFileSync(LOCAL_HISTORY_JSON, 'utf-8'));
    const filtered = skuFilter
      ? raw.filter(x => x.skuId.toLowerCase().includes(skuFilter.toLowerCase()) || x.producto.toLowerCase().includes(skuFilter.toLowerCase()))
      : raw;
    console.table(filtered.slice(-limit));
  } else {
    console.log('ℹ️ No hay registros históricos aún.');
  }
}

async function main() {
  const options = parseArgs();
  const env = loadEnv();

  console.log('==================================================================');
  console.log('📈 MONITOR Y ACTUALIZADOR DE PRECIOS HISTÓRICOS (BOLIVIA)');
  console.log('==================================================================');

  if (options.history) {
    await showHistory(env, options.sku, options.limit);
    return;
  }

  if (!options.url) {
    console.log('Uso:');
    console.log('  node scripts/price_tracker.mjs --url="<URL_DEL_PRODUCTO>"');
    console.log('  node scripts/price_tracker.mjs --history');
    console.log('  node scripts/price_tracker.mjs --sku="<SKU_ID>" --history');
    return;
  }

  const browser = await chromium.launch({
    headless: options.headless,
    args: ['--disable-blink-features=AutomationControlled', '--no-sandbox']
  });

  try {
    const page = await browser.newPage({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
      viewport: { width: 1280, height: 800 }
    });

    const data = await extractSingleItem(page, options.url);
    await recordPriceObservation(env, data, options.dryRun);
  } catch (err) {
    console.error(`❌ Error en actualización puntual: ${err.message}`);
  } finally {
    await browser.close();
  }
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});

