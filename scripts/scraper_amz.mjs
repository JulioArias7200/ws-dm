/**
 * ==============================================================================
 * SCRAPER MODULAR CON PLAYWRIGHT (NODE.JS ESM)
 * ==============================================================================
 * Evolución del script original de Amazon integrado con los algoritmos del
 * artículo "Web Scraping with JavaScript and Playwright" (Alex Aslam, DEV.to):
 *   1. Extracción DOM con `page.$$eval()` (ej. Amazon original o Books to Scrape).
 *   2. Carga de contenido dinámico mediante Scroll Infinito (`scrollHeight`).
 *   3. Interceptación de respuestas XHR/Fetch (`page.on('response')`).
 *   4. Gestión de sesiones y cookies tras login (`page.context().cookies()`).
 *   5. Buenas prácticas: `try/catch/finally` (cierre seguro), rate limiting y
 *      modo depuración configurable (`HEADLESS=false`).
 *
 * Uso (requiere tener instalado `playwright`):
 *   node scripts/scraper_amz.mjs              -> Ejecuta el modo 'amazon'
 *   node scripts/scraper_amz.mjs amazon       -> Ejecuta el ejemplo original Amazon
 *   node scripts/scraper_amz.mjs books        -> Ejecuta el demo seguro books.toscrape.com
 *   $env:HEADLESS="false"; node scripts/scraper_amz.mjs books -> Modo visual en PowerShell
 * ==============================================================================
 */

import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

/**
 * ------------------------------------------------------------------------------
 * ALGORITMO 1A: Extracción DOM original sobre Amazon (.s-card-container)
 * ------------------------------------------------------------------------------
 * Cómo funciona:
 *   1. Navega a la URL de búsqueda y espera a que el DOM inicial esté listo.
 *   2. Espera a que aparezca al menos una tarjeta de producto (auto-waiting).
 *   3. `page.$$eval` serializa los elementos que coinciden con `.s-card-container`
 *      y ejecuta el callback DENTRO del navegador para extraer título, imagen,
 *      precio oculto accesible (`.a-price .a-offscreen`) y enlace.
 *   4. `.filter(Boolean)` descarta elementos vacíos o anuncios sin título (`null`).
 */
export async function scrapeAmazonCatalog(page, query = 'playstation+5') {
  const url = `https://www.amazon.es/s?k=${encodeURIComponent(query)}`;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

  // Auto-waiting de Playwright: evita `sleep` manuales esperando el selector real
  await page.waitForSelector('.s-card-container', { timeout: 10000 }).catch(() => null);

  const products = await page.$$eval('.s-card-container', (results) =>
    results
      .map((el) => {
        const title = el.querySelector('h2')?.innerText?.trim();
        if (!title) return null; // Descarta tarjetas patrocinadas o incompletas

        const image = el.querySelector('img')?.getAttribute('src') || null;
        const price = el.querySelector('.a-price .a-offscreen')?.innerText?.trim() || null;
        const link = el.querySelector('.a-link-normal')?.getAttribute('href') || null;

        return { title, image, price, link };
      })
      .filter(Boolean)
  );

  return products;
}

/**
 * ------------------------------------------------------------------------------
 * ALGORITMO 1B: Extracción DOM genérica (ejemplo `books.toscrape.com` del artículo)
 * ------------------------------------------------------------------------------
 * Cómo funciona:
 *   Demuestra el patrón básico reutilizable para cualquier catálogo HTML:
 *   selecciona cada contenedor padre (`itemSelector`) y mapea campos relativos
 *   dentro de cada tarjeta en una sola ida y vuelta al navegador (`$$eval`).
 */
export async function scrapeBooksDemo(page) {
  await page.goto('https://books.toscrape.com', { waitUntil: 'domcontentloaded', timeout: 30000 });

  const books = await page.$$eval('.product_pod', (items) =>
    items.map((item) => ({
      title: item.querySelector('h3 a')?.getAttribute('title') || '',
      price: item.querySelector('.price_color')?.innerText?.trim() || '',
    }))
  );

  return books;
}

/**
 * ------------------------------------------------------------------------------
 * ALGORITMO 2: Contenido dinámico con Scroll Infinito
 * ------------------------------------------------------------------------------
 * Cómo funciona:
 *   Muchos sitios modernos (SPAs) cargan más elementos vía AJAX solo cuando el
 *   usuario llega al final de la página:
 *     1. Mide la altura actual del documento (`document.body.scrollHeight`).
 *     2. Desplaza el scroll hasta el fondo (`window.scrollTo`).
 *     3. Espera un tiempo prudente (`delayMs` / rate limiting) para permitir que
 *        lleguen nuevos nodos al DOM.
 *     4. Compara la nueva altura; si no creció (o alcanzó `maxScrolls`), termina
 *        el bucle y extrae todos los elementos acumulados con `page.$$eval()`.
 */
export async function scrapeWithInfiniteScroll(
  page,
  url,
  itemSelector = '.item',
  { delayMs = 2000, maxScrolls = 10 } = {}
) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

  let previousHeight = 0;
  for (let step = 0; step < maxScrolls; step++) {
    previousHeight = await page.evaluate(() => document.body.scrollHeight);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));

    // Pausa controlada para esperar la carga AJAX y no sobrecargar el servidor
    await page.waitForTimeout(delayMs);

    const newHeight = await page.evaluate(() => document.body.scrollHeight);
    if (newHeight === previousHeight) break; // No hay más contenido nuevo por cargar
  }

  return page.$$eval(itemSelector, (elements) =>
    elements.map((el) => el.innerText.trim()).filter(Boolean)
  );
}

/**
 * ------------------------------------------------------------------------------
 * ALGORITMO 3: Interceptación de peticiones de red (XHR / Fetch JSON)
 * ------------------------------------------------------------------------------
 * Cómo funciona:
 *   En lugar de parsear etiquetas HTML frágiles en sitios tipo SPA (React/Next/Vue),
 *   Playwright permite suscribirse al evento `response` del navegador ANTES de
 *   navegar (`page.goto`). Cada vez que la web consulta su propia API en segundo
 *   plano cuya URL contiene `apiPathMatch`, capturamos directamente el JSON limpio.
 */
export async function captureNetworkApiResponses(page, url, apiPathMatch = '/api/') {
  const capturedPayloads = [];

  // El listener debe registrarse antes de disparar la navegación
  page.on('response', async (response) => {
    try {
      if (!response.url().includes(apiPathMatch)) return;
      const contentType = response.headers()['content-type'] || '';
      if (!contentType.includes('application/json')) return;

      const data = await response.json();
      capturedPayloads.push({
        url: response.url(),
        status: response.status(),
        data,
      });
    } catch {
      // Ignora respuestas abortadas o cuerpos no JSON
    }
  });

  await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
  return capturedPayloads;
}

/**
 * ------------------------------------------------------------------------------
 * ALGORITMO 4: Autenticación y captura de cookies de sesión
 * ------------------------------------------------------------------------------
 * Cómo funciona:
 *   Para portales internos o cuentas propias autorizadas que requieren login:
 *     1. Rellena usuario y contraseña con `page.fill()` y pulsa enviar (`click`).
 *     2. Espera a que termine la navegación post-login.
 *     3. Extrae las cookies del contexto (`page.context().cookies()`) para poder
 *        inyectarlas en sesiones futuras sin volver a iniciar sesión cada vez.
 */
export async function loginAndCaptureCookies(
  page,
  loginUrl,
  { usernameSelector = '#username', passwordSelector = '#password', submitSelector = '#submit' } = {},
  { username, password } = {}
) {
  if (!username || !password) {
    throw new Error('Se requieren credenciales explícitas (username y password) para autenticar.');
  }

  await page.goto(loginUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.fill(usernameSelector, username);
  await page.fill(passwordSelector, password);

  // `Promise.all` sincroniza el clic con la navegación resultante para evitar race conditions
  await Promise.all([
    page.waitForLoadState('networkidle', { timeout: 15000 }),
    page.click(submitSelector),
  ]);

  return page.context().cookies();
}

/**
 * ------------------------------------------------------------------------------
 * ORQUESTADOR PRINCIPAL CON BUENAS PRÁCTICAS (try/catch/finally y modo headless)
 * ------------------------------------------------------------------------------
 */
async function main() {
  const mode = (process.argv[2] || 'amazon').toLowerCase();
  const headless = process.env.HEADLESS !== 'false';

  let browser;
  try {
    // 1. Lanzar Chromium (usar HEADLESS=false para depurar visualmente)
    browser = await chromium.launch({ headless });
    const page = await browser.newPage();

    if (mode === 'books') {
      console.log('📚 Ejecutando Algoritmo 1B (DOM $$eval en books.toscrape.com)...');
      const books = await scrapeBooksDemo(page);
      console.log(`✅ Extraídos ${books.length} libros. Muestra:`, books.slice(0, 5));
    } else if (mode === 'network') {
      const targetUrl = process.argv[3] || 'https://quotes.toscrape.com/scroll';
      const match = process.argv[4] || '/api/';
      console.log(`🌐 Ejecutando Algoritmo 3 (Interceptación de red en ${targetUrl})...`);
      const apiData = await captureNetworkApiResponses(page, targetUrl, match);
      console.log(`✅ Respuestas JSON interceptadas: ${apiData.length}`);
    } else if (mode === 'scroll') {
      const targetUrl = process.argv[3] || 'https://quotes.toscrape.com/scroll';
      console.log(`📜 Ejecutando Algoritmo 2 (Scroll infinito en ${targetUrl})...`);
      const items = await scrapeWithInfiniteScroll(page, targetUrl, '.quote', {
        delayMs: 1500,
        maxScrolls: 3,
      });
      console.log(`✅ Elementos cargados tras scroll: ${items.length}`);
    } else {
      const query = process.argv[3] || 'playstation 5';
      console.log(`🛒 Ejecutando Algoritmo 1A (DOM $$eval original en Amazon: "${query}")...`);
      const products = await scrapeAmazonCatalog(page, query);
      console.log(products);
    }
  } catch (err) {
    // Buena práctica del artículo: capturar errores sin colgar el proceso
    console.error('❌ Error durante el scraping con Playwright:', err.message);
    process.exitCode = 1;
  } finally {
    // Garantiza el cierre del navegador incluso si ocurre una excepción
    if (browser) await browser.close();
  }
}

// Ejecuta `main()` solo cuando se invoca el archivo directamente (sin depender del nombre de archivo)
const isDirectRun =
  Boolean(process.argv[1]) &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isDirectRun) {
  main();
}
