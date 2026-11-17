import { neonQuery } from './db';
import { chromium, Browser } from 'playwright';
import path from 'node:path';

export interface ScrapedLiveProduct {
  producto: string;
  cadena: string;
  precio_actual_bs: number;
  precio_anterior_bs: number | null;
  descuento_pct: number | null;
  en_oferta: boolean;
  disponible: boolean;
  enlace: string;
  imagen: string;
  sku_id: string;
}

export interface RefreshItemResult {
  id: string;
  sku_id: string;
  producto: string;
  cadena: string;
  departamento: string;
  precio_actual_bs: number;
  precio_anterior_bs: number | null;
  descuento_pct: number | null;
  delta_bs: number;
  delta_pct: number;
  en_oferta: boolean;
  disponible: boolean;
  enlace: string;
  imagen: string;
  cambio_detectado: boolean;
  fecha: string;
}

const STOP_WORDS = new Set([
  'de', 'del', 'la', 'el', 'los', 'las', 'un', 'una', 'unos', 'unas',
  'en', 'para', 'por', 'con', 'sin', 'sobre', 'y', 'o', 'al', 'a'
]);

/**
 * Normaliza y extrae tokens significativos de una consulta en lenguaje natural
 * Ejemplos:
 *   "maple de huevo" -> ["maple", "huevo"]
 *   "leche PIL" -> ["leche", "pil"]
 *   "margarina regia" -> ["margarina", "regia"]
 */
export function extractSearchTokens(query: string): string[] {
  if (!query) return [];
  const clean = query
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Quita tildes
    .replace(/[^a-z0-9\s]/g, ' ')
    .trim();

  const parts = clean.split(/\s+/).filter((word) => word.length > 1 && !STOP_WORDS.has(word));
  return parts.length > 0 ? parts : [query.trim().toLowerCase()];
}

/**
 * Construye cláusulas SQL tokenizadas para búsquedas multitérmino
 */
export function buildTokenizedConditions(
  query: string,
  paramStartIndex = 1,
  fields = ['producto', 'categoria']
): { sql: string; params: string[]; tokens: string[] } {
  const tokens = extractSearchTokens(query);
  if (tokens.length === 0) {
    return { sql: '1=1', params: [], tokens: [] };
  }

  const conditions: string[] = [];
  const params: string[] = [];
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

/**
 * Parsea cadenas de precios en Bolivianos soportando comas y puntos
 */
export function parsePriceBs(raw: unknown): number | null {
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

/**
 * Detecta la plataforma retail según la URL
 */
export function detectPlatform(url: string): 'FARMACORP' | 'CHAVEZ' | 'HIPERMAXI' | 'UNKNOWN' {
  const u = (url || '').toLowerCase();
  if (u.includes('farmacorp.com')) return 'FARMACORP';
  if (u.includes('farmaciaschavez.com.bo')) return 'CHAVEZ';
  if (u.includes('hipermaxi.com')) return 'HIPERMAXI';
  return 'UNKNOWN';
}

/**
 * Intento rápido de extracción HTTP sin levantar navegador completo (Tier 1)
 */
async function fetchShopifyDirect(url: string): Promise<ScrapedLiveProduct | null> {
  try {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname.replace(/\/$/, '');
    if (!pathname.includes('/products/')) return null;

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

    if (!res.ok) return null;

    const data = (await res.json()) as {
      title?: string;
      price?: number;
      compare_at_price?: number;
      available?: boolean;
      vendor?: string;
      images?: string[];
      featured_image?: string;
    };

    if (!data || !data.title || data.price == null) return null;

    const precioActual = Number((data.price / 100).toFixed(2));
    const precioAnterior = data.compare_at_price ? Number((data.compare_at_price / 100).toFixed(2)) : null;
    let descuentoPct: number | null = null;
    if (precioAnterior && precioAnterior > precioActual) {
      descuentoPct = Number((((precioAnterior - precioActual) / precioAnterior) * 100).toFixed(1));
    }

    const img = data.featured_image || (data.images && data.images[0]) || '';
    const imgUrl = img.startsWith('http') ? img : img ? `https:${img}` : '';
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
      imagen: imgUrl,
      sku_id: skuId,
    };
  } catch {
    return null;
  }
}

/**
 * Extracción en vivo mediante navegador Playwright Headless (Tier 2)
 */
async function scrapeWithPlaywright(url: string, platform: string): Promise<ScrapedLiveProduct | null> {
  let browser: Browser | null = null;
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

    if (!scraped.title) return null;

    const precioActual = parsePriceBs(scraped.rawPrice);
    if (!precioActual) return null;

    const precioAnterior = parsePriceBs(scraped.rawOldPrice);
    let descuentoPct: number | null = null;
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
    console.warn(`[PLAYWRIGHT SCRAPE ERROR] ${url}:`, err instanceof Error ? err.message : String(err));
    return null;
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }
}

/**
 * Extrae en vivo los datos actuales de una página de producto (Farmacorp / Chávez / Hipermaxi)
 */
export async function scrapeProductUrl(url: string): Promise<ScrapedLiveProduct | null> {
  const platform = detectPlatform(url);
  if (platform === 'UNKNOWN') return null;

  // 1. Intento rápido Tier 1 para Farmacorp
  if (platform === 'FARMACORP') {
    const direct = await fetchShopifyDirect(url);
    if (direct) return direct;
  }

  // 2. Fallback a Playwright Headless
  return await scrapeWithPlaywright(url, platform);
}

/**
 * Actualiza automáticamente un producto por su identificador de BD,
 * consultando la tienda oficial y registrando la variación en `precios_historico`.
 */
export async function refreshProductItemById(id: string): Promise<RefreshItemResult | null> {
  const isMed = id.startsWith('MED_');
  const cleanId = isMed ? id.replace('MED_', '') : id;

  // 1. Obtener registro actual de la base de datos
  let currentEnlace = '';
  let currentProd = '';
  let currentCadena = '';
  let currentDepto = 'La Paz';
  let currentPrice = 0;
  let currentImg = '';

  if (isMed) {
    const rows = await neonQuery<Record<string, unknown>>(
      `SELECT id, producto, cadena, departamento, precio_bs::float, enlace, imagen
       FROM medicamentos_precios WHERE id = $1`,
      [Number(cleanId)]
    );
    if (rows.length === 0) return null;
    const r = rows[0];
    currentProd = String(r.producto);
    currentCadena = String(r.cadena);
    currentDepto = String(r.departamento || 'La Paz');
    currentPrice = Number(r.precio_bs || 0);
    currentEnlace = r.enlace ? String(r.enlace) : '';
    currentImg = r.imagen ? String(r.imagen) : '';
  } else {
    const rows = await neonQuery<Record<string, unknown>>(
      `SELECT id, producto, fuente, departamento, precio_bs::float, enlace, imagen
       FROM canasta_precios WHERE id = $1`,
      [Number(cleanId)]
    );
    if (rows.length === 0) return null;
    const r = rows[0];
    currentProd = String(r.producto);
    currentCadena = String(r.fuente || 'Hipermaxi');
    currentDepto = String(r.departamento || 'La Paz');
    currentPrice = Number(r.precio_bs || 0);
    currentEnlace = r.enlace ? String(r.enlace) : '';
    currentImg = r.imagen ? String(r.imagen) : '';
  }

  const skuId = `${currentCadena.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${currentProd.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 65)}`;
  const today = new Date().toISOString().slice(0, 10);

  // Si no tiene enlace web directo, no es posible scrapear la tienda
  if (!currentEnlace) {
    return {
      id,
      sku_id: skuId,
      producto: currentProd,
      cadena: currentCadena,
      departamento: currentDepto,
      precio_actual_bs: currentPrice,
      precio_anterior_bs: null,
      descuento_pct: null,
      delta_bs: 0,
      delta_pct: 0,
      en_oferta: false,
      disponible: true,
      enlace: '',
      imagen: currentImg,
      cambio_detectado: false,
      fecha: today,
    };
  }

  // 2. Ejecutar extracción en vivo desde la tienda oficial
  const liveData = await scrapeProductUrl(currentEnlace);

  if (!liveData) {
    return {
      id,
      sku_id: skuId,
      producto: currentProd,
      cadena: currentCadena,
      departamento: currentDepto,
      precio_actual_bs: currentPrice,
      precio_anterior_bs: null,
      descuento_pct: null,
      delta_bs: 0,
      delta_pct: 0,
      en_oferta: false,
      disponible: true,
      enlace: currentEnlace,
      imagen: currentImg,
      cambio_detectado: false,
      fecha: today,
    };
  }

  // 3. Comparar precios y registrar en base de datos
  const nuevoPrecio = liveData.precio_actual_bs;
  const precioAnterior = liveData.precio_anterior_bs || currentPrice;
  const deltaBs = currentPrice > 0 ? Number((nuevoPrecio - currentPrice).toFixed(2)) : 0;
  const deltaPct = currentPrice > 0 ? Number((((nuevoPrecio - currentPrice) / currentPrice) * 100).toFixed(1)) : 0;
  const cambioDetectado = Math.abs(deltaBs) > 0.01;

  try {
    // A. Actualizar o insertar en catálogo maestro
    await neonQuery(
      `INSERT INTO catalogo_productos_master (
         sku_id, producto, cadena, departamento, enlace_canonica, imagen, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
       ON CONFLICT (sku_id) DO UPDATE SET
         enlace_canonica = COALESCE(EXCLUDED.enlace_canonica, catalogo_productos_master.enlace_canonica),
         imagen = COALESCE(EXCLUDED.imagen, catalogo_productos_master.imagen),
         updated_at = NOW();`,
      [skuId, liveData.producto || currentProd, currentCadena, currentDepto, currentEnlace, liveData.imagen || currentImg]
    );

    // B. Insertar observación en precios_historico (particionada)
    await neonQuery(
      `INSERT INTO precios_historico (
         sku_id, fecha, precio_actual_bs, precio_anterior_bs, descuento_pct, delta_precio_bs, delta_porcentaje, disponible, recorded_at
       ) VALUES ($1, CURRENT_DATE, $2, $3, $4, $5, $6, $7, NOW())
       ON CONFLICT (sku_id, fecha) DO UPDATE SET
         precio_actual_bs = EXCLUDED.precio_actual_bs,
         precio_anterior_bs = EXCLUDED.precio_anterior_bs,
         descuento_pct = EXCLUDED.descuento_pct,
         delta_precio_bs = EXCLUDED.delta_precio_bs,
         delta_porcentaje = EXCLUDED.delta_porcentaje,
         disponible = EXCLUDED.disponible;`,
      [
        skuId,
        nuevoPrecio,
        precioAnterior,
        liveData.descuento_pct,
        deltaBs,
        deltaPct,
        liveData.disponible,
      ]
    );

    // C. Sincronizar en tabla operacional
    if (isMed) {
      await neonQuery(
        `UPDATE medicamentos_precios
         SET precio_bs = $1,
             precio_anterior_bs = COALESCE($2, precio_anterior_bs),
             descuento_pct = COALESCE($3, descuento_pct),
             fecha = CURRENT_DATE
         WHERE id = $4`,
        [nuevoPrecio, precioAnterior, liveData.descuento_pct, Number(cleanId)]
      );
    } else {
      await neonQuery(
        `UPDATE canasta_precios
         SET precio_bs = $1,
             fecha = CURRENT_DATE
         WHERE id = $2`,
        [nuevoPrecio, Number(cleanId)]
      );
    }
  } catch (dbErr) {
    console.error('[ITEM UPDATER] Error persistiendo en Neon:', dbErr);
  }

  return {
    id,
    sku_id: skuId,
    producto: liveData.producto || currentProd,
    cadena: currentCadena,
    departamento: currentDepto,
    precio_actual_bs: nuevoPrecio,
    precio_anterior_bs: precioAnterior !== nuevoPrecio ? precioAnterior : null,
    descuento_pct: liveData.descuento_pct,
    delta_bs: deltaBs,
    delta_pct: deltaPct,
    en_oferta: liveData.en_oferta,
    disponible: liveData.disponible,
    enlace: currentEnlace,
    imagen: liveData.imagen || currentImg,
    cambio_detectado: cambioDetectado,
    fecha: today,
  };
}
