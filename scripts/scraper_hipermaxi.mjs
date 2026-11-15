/**
 * ==============================================================================
 * HIPERMAXI MULTI-CIUDAD WEB SCRAPER (PLAYWRIGHT RESILIENTE - CERO OMISIÓN)
 * ==============================================================================
 * Web Scraper de supermercado y farmacia para la Canasta Familiar boliviana (Eje Central):
 *   - La Paz: Sucursal Calacoto (flagship), Achumani, Miraflores, Sopocachi,
 *             Los Pinos, El Poeta, Mega Center, Obrajes, Satélite, Costanera,
 *             Cota Cota, Renacer.
 *   - Santa Cruz: Sucursal Cañoto (flagship), Equipetrol, Mutualista, 3 Pasos al Frente,
 *                 Roca y Coronado, Blacutt, Las Palmas, Cambódromo, Supercenter,
 *                 Las Brisas, Mi Barrio, Santos Dumont.
 *   - Cochabamba: Sucursal Blanco Galindo (flagship), Juan de la Rosa, Sacaba,
 *                 Circunvalación, Panamericana, Beijin.
 *
 * Características principales y arquitectura anti-bot:
 *   1. Contexto Persistente en Google Chrome real (`channel: 'chrome'`), preservando
 *      cookies `__uzdbm` y localStorage de sucursal en `.browser_profile_hipermaxi`.
 *   2. Evasión de Radware Bot Manager sin Prototype Lie Detection:
 *      No altera `Navigator.prototype` con `Object.defineProperty`, evitando la prueba b9.
 *      Higienización minimalista en `addInitScript` (solo foco lógico y limpieza de Playwright).
 *   3. Máquina de estados `ensureCategoryAccessible` con Diagnóstico Dual del DOM
 *      (ausencia de firmas Radware y presencia confirmada de precios en Bolivianos 'Bs').
 *   4. Telemetría humana activa (`simulateHumanTelemetry` con trayectorias interpoladas y scroll).
 *   5. Temporización bimodular de reintentos: Intento 1 rápido (1.8s a 3.0s) para aprovechar
 *      cookies emitidas tras desafío de 14.9 KB; Intentos >= 2 con Backoff Exponencial y Full Jitter.
 *   6. Refresco intermedio de sesión en la portada de la sucursal para renovar tokens de `aperture.js`.
 *   7. Directriz de CERO OMISIÓN DE PÁGINAS (Zero Drops): Sin sentencias `continue` de abandono.
 *   8. Ventana reactiva de muestreo de hasta 3 segundos para asegurar la hidratación de Next.js.
 *   9. Checkpointing continuo en disco (`ws-dm/data/hipermaxi_checkpoint.json`).
 *   10. Inserción idempotente en Neon PostgreSQL (`canasta_precios` / `medicamentos_precios`)
 *       con protección de imágenes en Neon S3.
 *
 * Uso en PowerShell (desde `ws-dm/`):
 *   node scripts/scraper_hipermaxi.mjs --dry-run
 *   node scripts/scraper_hipermaxi.mjs --city=lapaz --branch=calacoto
 *   node scripts/scraper_hipermaxi.mjs --categories=carnes,congelados,lacteos-y-derivados
 *   node scripts/scraper_hipermaxi.mjs --service=farmacia --city=lapaz --branch=calacoto
 *   node scripts/scraper_hipermaxi.mjs --all-cities --supermercado
 *   node scripts/scraper_hipermaxi.mjs --headless --max-retries=6
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
const USER_DATA_DIR = path.resolve(ROOT_DIR, '.browser_profile_hipermaxi');
const CHECKPOINT_PATH = path.resolve(ROOT_DIR, 'data/hipermaxi_checkpoint.json');

// Catálogo Completo de Sucursales por Ciudad - Supermercado (23 Sucursales del Eje Central)
const CIUDADES_SUCURSALES = {
  'la-paz': {
    departamento: 'La Paz',
    nombreCiudad: 'La Paz',
    flagship: 'hipermaxi-calacoto',
    sucursales: [
      { slug: 'hipermaxi-calacoto', nombre: 'Hipermaxi Calacoto' },
      { slug: 'hipermaxi-achumani', nombre: 'Hipermaxi Achumani' },
      { slug: 'hipermaxi-miraflores', nombre: 'Hipermaxi Miraflores' },
      { slug: 'hipermaxi-sopocachi', nombre: 'Hipermaxi Sopocachi' },
      { slug: 'hipermaxi-los-pinos', nombre: 'Hipermaxi Los Pinos' },
      { slug: 'hipermaxi-el-poeta', nombre: 'Hipermaxi El Poeta' },
      { slug: 'hipermaxi-megacenter', nombre: 'Hipermaxi Mega Center' },
      { slug: 'hipermaxi-obrajes', nombre: 'Hipermaxi Obrajes' },
      { slug: 'hipermaxi-satelite', nombre: 'Hipermaxi Satélite' },
      { slug: 'hipermaxi-costanera', nombre: 'Hipermaxi Costanera' },
      { slug: 'hipermaxi-cota-cota', nombre: 'Hipermaxi Cota Cota' },
      { slug: 'hipermaxi-renacer', nombre: 'Hipermaxi Renacer' }
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
      { slug: 'hipermaxi-sacaba', nombre: 'Hipermaxi Sacaba' },
      { slug: 'hipermaxi-circunvalacion', nombre: 'Hipermaxi Circunvalación' },
      { slug: 'hipermaxi-panamericana', nombre: 'Hipermaxi Panamericana' },
      { slug: 'hipermaxi-beijin', nombre: 'Hipermaxi Beijin' }
    ]
  }
};

// Catálogo Completo de Sucursales de Farmacia (Eje Central de Bolivia)
const CIUDADES_FARMACIAS = {
  'la-paz': {
    departamento: 'La Paz',
    nombreCiudad: 'La Paz',
    flagship: 'farmacia-calacoto',
    sucursales: [
      { slug: 'farmacia-calacoto', nombre: 'Hipermaxi Farmacia Calacoto' },
      { slug: 'farmacia-achumani', nombre: 'Hipermaxi Farmacia Achumani' },
      { slug: 'farmacia-satelite', nombre: 'Hipermaxi Farmacia Satélite' },
      { slug: 'farmacia-obrajes', nombre: 'Hipermaxi Farmacia Obrajes' },
      { slug: 'farmacia-los-pinos', nombre: 'Hipermaxi Farmacia Los Pinos' },
      { slug: 'farmacia-costanera', nombre: 'Hipermaxi Farmacia Costanera' },
      { slug: 'farmacia-sopocachi', nombre: 'Hipermaxi Farmacia Sopocachi' },
      { slug: 'farmacia-cota-cota', nombre: 'Hipermaxi Farmacia Cota Cota' },
      { slug: 'farmacia-renacer', nombre: 'Hipermaxi Farmacia Renacer' },
      { slug: 'farmacia-megacenter', nombre: 'Hipermaxi Farmacia Mega Center' }
    ]
  },
  'santa-cruz': {
    departamento: 'Santa Cruz',
    nombreCiudad: 'Santa Cruz',
    flagship: 'farmacia-pampa-de-la-isla',
    sucursales: [
      { slug: 'farmacia-pampa-de-la-isla', nombre: 'Hipermaxi Farmacia Pampa de la Isla' },
      { slug: 'farmacia-villa-1ro-de-mayo', nombre: 'Hipermaxi Farmacia Villa 1ro. de Mayo' },
      { slug: 'farmacia-centenario', nombre: 'Hipermaxi Farmacia Centenario' },
      { slug: 'farmacia-mi-barrio', nombre: 'Hipermaxi Farmacia Mi Barrio' },
      { slug: 'farmacia-las-palmas', nombre: 'Hipermaxi Farmacia Las Palmas' },
      { slug: 'farmacia-super-center', nombre: 'Hipermaxi Farmacia Super Center' },
      { slug: 'farmacia-equipetrol', nombre: 'Hipermaxi Farmacia Equipetrol' },
      { slug: 'farmacia-santos-dumont', nombre: 'Hipermaxi Farmacia Santos Dumont' }
    ]
  },
  'cochabamba': {
    departamento: 'Cochabamba',
    nombreCiudad: 'Cochabamba',
    flagship: 'farmacia-blanco-galindo',
    sucursales: [
      { slug: 'farmacia-blanco-galindo', nombre: 'Hipermaxi Farmacia Blanco Galindo' },
      { slug: 'farmacia-juan-de-la-rosa', nombre: 'Hipermaxi Farmacia Juan de la Rosa' },
      { slug: 'farmacia-sacaba', nombre: 'Hipermaxi Farmacia Sacaba' },
      { slug: 'farmacia-circunvalacion', nombre: 'Hipermaxi Farmacia Circunvalación' },
      { slug: 'farmacia-panamericana', nombre: 'Hipermaxi Farmacia Panamericana' },
      { slug: 'farmacia-beijin', nombre: 'Hipermaxi Farmacia Beijin' }
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

// Catálogos Oficiales de Categorías (19 Supermercado | 13 Farmacia)
const CATEGORIAS_SUPERMERCADO = [
  'abarrotes',
  'bebidas',
  'carnes',
  'congelados',
  'fiambres',
  'lacteos-y-derivados',
  'panaderia',
  'pasteleria-y-masas-tipicas',
  'cuidado-del-bebe',
  'cuidado-del-hogar',
  'cuidado-personal',
  'bazar',
  'bazar-importacion',
  'importaciones-textil',
  'jugueteria',
  'jugueteria-importacion',
  'textiles-y-zapatos',
  'frutas-y-verduras',
  'granos-y-hortalizas'
];

const CATEGORIAS_FARMACIA = [
  'farmacia-eticos',
  'farmacia-galenicos',
  'farmacia-genericos',
  'farmacia-psicotropicos-y-estupefacientes',
  'farmacia-quirurgicos',
  'farmacia-venta-libre-otc',
  'alimentos',
  'bebidas',
  'cuidado-del-bebe',
  'cuidado-del-hogar',
  'cuidado-personal',
  'cuidados-otc',
  'no-comestible'
];

const PLAYWRIGHT_CONFIG = {
  viewport: { width: 1366, height: 768 },
  navigationTimeoutMs: 45000,
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
    service: 'supermercado', // 'supermercado' | 'farmacia'
    mode: 'live', // 'live' | 'file'
    file: '',
    dryRun: false,
    // Modo visible (--headed) por defecto para máxima resiliencia contra Radware
    headless: args.includes('--headless') || process.env.HEADLESS === 'true',
    categories: [],
    allCategories: false,
    limit: 0,
    delayMs: 2000,
    maxRetries: 10
  };

  for (const arg of args) {
    if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--all-cities') options.allCities = true;
    else if (arg === '--no-headless' || arg === '--headed' || arg === '--manual' || arg === '--visible') {
      options.headless = false;
    } else if (arg === '--headless') {
      options.headless = true;
    } else if (arg.startsWith('--headless=')) {
      options.headless = arg.split('=')[1].trim() === 'true';
    } else if (arg === '--farmacia' || arg === '--service=farmacia') {
      options.service = 'farmacia';
    } else if (arg === '--supermercado' || arg === '--service=supermercado') {
      options.service = 'supermercado';
    } else if (arg === '--all-services' || arg === '--service=all' || arg === '--completo') {
      options.service = 'all';
    } else if (arg.startsWith('--service=')) {
      options.service = arg.split('=')[1].trim().toLowerCase();
    } else if (arg === '--all-categories' || arg === '--categories=all') {
      options.allCategories = true;
    } else if (arg.startsWith('--city=')) {
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
    } else if (arg.startsWith('--limit=')) {
      options.limit = parseInt(arg.split('=')[1], 10) || 0;
    } else if (arg.startsWith('--delay=')) {
      options.delayMs = parseInt(arg.split('=')[1], 10) || 2000;
    } else if (arg.startsWith('--max-retries=')) {
      options.maxRetries = parseInt(arg.split('=')[1], 10) || 10;
    }
  }

  if (options.allCategories || options.categories.length === 0) {
    options.categories = options.service === 'farmacia' ? CATEGORIAS_FARMACIA : CATEGORIAS_SUPERMERCADO;
  }

  if (!args.some((a) => a.startsWith('--max-retries='))) {
    options.maxRetries = options.headless ? 6 : 10;
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
  let clean = priceStr.replace(/[^\d.,]/g, '').trim();
  if (!clean) return null;

  if (clean.includes(',') && clean.includes('.')) {
    // Formato retail Hipermaxi: "1,099.00" (coma es miles, punto es decimal)
    if (clean.indexOf(',') < clean.indexOf('.')) {
      clean = clean.replace(/,/g, '');
    } else {
      // Formato alternativo latino: "1.099,00" (punto es miles, coma es decimal)
      clean = clean.replace(/\./g, '').replace(',', '.');
    }
  } else if (clean.includes(',')) {
    const parts = clean.split(',');
    if (parts.length === 2 && parts[1].length === 3 && parts[0].length >= 1) {
      clean = clean.replace(',', '');
    } else {
      clean = clean.replace(',', '.');
    }
  }

  const val = parseFloat(clean);
  return isNaN(val) ? null : Number(val.toFixed(2));
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

const sleepWithJitter = async (baseMs, maxJitterMs = 2500) => {
  const jitter = Math.floor(Math.random() * maxJitterMs);
  await new Promise((resolve) => setTimeout(resolve, baseMs + jitter));
};

function saveCheckpoint(branchSlug, lastCategory, items) {
  try {
    const dir = path.dirname(CHECKPOINT_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const checkpointData = {
      timestamp: new Date().toISOString(),
      branchSlug,
      lastCategory,
      totalItems: items.length,
      sampleItems: items.slice(-5).map((x) => ({ id: x.id, title: x.title, precio: x.priceText }))
    };
    fs.writeFileSync(CHECKPOINT_PATH, JSON.stringify(checkpointData, null, 2), 'utf8');
  } catch (err) {
    console.warn(`  ⚠️ Nota: No se pudo guardar checkpoint: ${err.message}`);
  }
}

// ==============================================================================
// TELEMETRÍA HUMANA Y DETECCIÓN DUAL ANTI-BOT (RADWARE BOT MANAGER)
// ==============================================================================

/**
 * Simulación de micro-interacciones humanas (trayectorias interpoladas de ratón y scroll suave)
 * para alimentar los escuchadores de aperture.js y evitar puntuaciones robóticas.
 */
async function simulateHumanTelemetry(page) {
  try {
    const startX = 180 + Math.floor(Math.random() * 200);
    const startY = 220 + Math.floor(Math.random() * 150);
    const endX = 350 + Math.floor(Math.random() * 300);
    const endY = 280 + Math.floor(Math.random() * 250);

    await page.mouse.move(startX, startY, { steps: 8 });
    await sleepWithJitter(120, 180);
    await page.mouse.move(endX, endY, { steps: 14 });
    await page.mouse.wheel(0, 120 + Math.floor(Math.random() * 180));
    await sleepWithJitter(150, 200);
    await page.mouse.wheel(0, -60);
  } catch {
    // Se ignoran errores si la página navega en medio de la interacción
  }
}

/**
 * Predicado de diagnóstico dual del DOM:
 * Clasifica atómicamente el estado en 'RADWARE_CHALLENGE', 'ACCESSIBLE' o 'LOADING_OR_EMPTY'.
 */
async function evaluateCategoryState(page) {
  try {
    return await page.evaluate(() => {
      const title = (document.title || '').toLowerCase();
      const bodyText = (document.body?.innerText || '').toLowerCase();

      // 1. Detección de firmas específicas de bloqueo de Radware Bot Manager / ShieldSquare
      const hasPerfdriveIframe = Boolean(
        document.querySelector('iframe[src*="validate.perfdrive.com"], iframe[src*="radware"], iframe[src*="hcaptcha"]')
      );
      const isLoaderChallenge =
        title.includes('radware') ||
        title.includes('loader page') ||
        bodyText.includes('verifying your browser') ||
        bodyText.includes('loader page');

      const hasBlockText =
        isLoaderChallenge ||
        title.includes('security page') ||
        bodyText.includes('we apologize for the inconvenience') ||
        bodyText.includes('verify you are a human') ||
        bodyText.includes('anomaly detected') ||
        bodyText.includes('verificación de seguridad') ||
        bodyText.includes('case number') ||
        bodyText.includes('made us think that you are a bot') ||
        bodyText.includes('pardon our interruption') ||
        bodyText.includes('verificar que no soy un robot') ||
        bodyText.includes('confirma que no eres un robot');

      // 2. Verificación positiva de hidratación de catálogo Hipermaxi (precios en Bolivianos 'Bs')
      const priceMatches = (document.body?.innerText || '').match(/\bBs\.?\s*\d+([.,]\d{2})\b/g) || [];
      const productCount = priceMatches.length;

      const isActualBlock = Boolean(hasPerfdriveIframe || hasBlockText);

      if (isActualBlock && productCount === 0) {
        return {
          status: 'RADWARE_CHALLENGE',
          productCount: 0,
          isLoaderChallenge,
          hasInteractiveCaptcha: hasPerfdriveIframe || bodyText.includes('hcaptcha') || bodyText.includes('soy humano')
        };
      }

      if (productCount >= 1) {
        return {
          status: 'ACCESSIBLE',
          productCount,
          hasInteractiveCaptcha: false
        };
      }

      // Si la estructura del sitio cargó (header, nav o main) pero no hay firmas de bloqueo ni precios
      const hasStructure = Boolean(document.querySelector('header, nav, main, footer'));
      if (hasStructure && !isActualBlock) {
        return {
          status: 'ACCESSIBLE',
          productCount: 0,
          hasInteractiveCaptcha: false
        };
      }

      return {
        status: 'LOADING_OR_EMPTY',
        productCount: 0,
        hasInteractiveCaptcha: false
      };
    });
  } catch {
    return {
      status: 'LOADING_OR_EMPTY',
      productCount: 0,
      hasInteractiveCaptcha: false
    };
  }
}

/**
 * Máquina de estados ensureCategoryAccessible:
 * Garantiza CERO OMISIÓN DE PÁGINAS (Zero Drops).
 * Sustituye el antiguo 'continue' por espera activa con telemetría, reintento rápido
 * en el intento 1 (para cookies __uzdbm) y Backoff Exponencial con Jitter en intentos >= 2.
 */
async function ensureCategoryAccessible(page, targetUrl, catSlug, branchName, options = {}) {
  const {
    maxRetries = 10,
    branchHomeUrl = HIPERMAXI_BASE_URL,
    isHeadless = false
  } = options;

  let attempt = 0;

  try {
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
  } catch (navErr) {
    console.warn(`   ⚠️ Timeout inicial en ${targetUrl} (${navErr.message}). Evaluando estado...`);
  }

  while (attempt <= maxRetries) {
    const inPageWaitCycles = !isHeadless ? 20 : 8;

    for (let cycle = 0; cycle < inPageWaitCycles; cycle++) {
      const state = await evaluateCategoryState(page);

      if (state.status === 'ACCESSIBLE') {
        if (state.productCount > 0) {
          console.log(`🎉 [DESBLOQUEADO]: Categoría '${catSlug}' accesible e hidratada (${state.productCount} precios detectados).`);
        }
        return true;
      }

      if (state.status === 'RADWARE_CHALLENGE') {
        if (cycle === 0) {
          console.warn(
            `\n🚨 [DETECCIÓN ANTI-BOT RADWARE / hCAPTCHA]: Bloqueo presente en '${catSlug}' (Intento ${attempt + 1}/${maxRetries + 1}).`
          );
          if (state.hasInteractiveCaptcha && !isHeadless) {
            await page.bringToFront().catch(() => {});
            process.stdout.write('\x07');
            console.log(`⏳ [MODO ASISTIDO]: Resuelve el desafío interactivo en la ventana visible de Chrome. Esperando validación...`);
          } else if (state.isLoaderChallenge) {
            console.log(`⏳ [LOADER PASIVO DETECTADO]: Esperando intercambio criptográfico de cookies __uzdbm (~4s)...`);
          } else {
            console.log(`⏳ [ESPERA ACTIVA]: Ejecutando sondeo con telemetría humana (NO se omitirá la categoría)...`);
          }
        }
        await simulateHumanTelemetry(page);

        // Si es el Loader pasivo de Radware ("Verifying your browser..."), stormcaster.js
        // intercambia tokens y escribe cookies en ~3-4s pero NO recarga automáticamente.
        // Tras 2 ciclos (aprox 3.5s), verificamos cookies y salimos del bucle para recargar inmediatamente.
        if (state.isLoaderChallenge && cycle >= 2) {
          const cookies = await page.context().cookies().catch(() => []);
          const hasUzCookies = cookies.some((c) => c.name.startsWith('__uz') || c.name.startsWith('uzm'));
          console.log(
            `🔄 [TRANSICIÓN TARPIT]: Cookies Radware detectadas (${hasUzCookies ? 'SÍ' : 'PENDIENTE'}). Recargando para validar acceso...`
          );
          break;
        }
      } else if (state.status === 'LOADING_OR_EMPTY') {
        if (cycle === 0) {
          console.log(`⏳ [MUESTREO HIDRATACIÓN]: Esperando renderizado de productos en '${catSlug}' (hasta 3s)...`);
        }
        await simulateHumanTelemetry(page);
      }

      await sleepWithJitter(1400, 400);
    }

    attempt++;
    if (attempt > maxRetries) {
      break;
    }

    // Intento 1: Reintento rápido en la misma sesión para aprovechar cookies __uzdbm tras el desafío de 14.9KB
    // Intentos >= 2: Backoff exponencial con Jitter para enfriar rolling counters de aperture.js
    if (attempt === 1) {
      console.log(`🔄 [RETRY 1]: Ejecutando reintento rápido de sesión con cookies __uzdbm activas...`);
      await sleepWithJitter(1800, 1200);
    } else {
      const baseBackoff = Math.min(60000, 5000 * Math.pow(2, attempt - 2));
      console.log(
        `⏳ [BACKOFF EXPONENCIAL]: Enfriando contadores de telemetría antes del reintento ${attempt}/${maxRetries} (~${Math.round(baseBackoff / 1000)}s)...`
      );
      await sleepWithJitter(baseBackoff, 4000);

      if (attempt === Math.ceil(maxRetries / 2)) {
        console.log(`🔄 [SESSION REFRESH]: Refrescando token de aperture.js en portada: ${branchHomeUrl}`);
        try {
          await page.goto(branchHomeUrl, { waitUntil: 'domcontentloaded', timeout: 35000 });
          await simulateHumanTelemetry(page);
          await sleepWithJitter(3000, 1500);
        } catch (homeErr) {
          console.warn(`   ⚠️ Advertencia en refresco de portada: ${homeErr.message}`);
        }
      }
    }

    console.log(`🔄 [RECARGA CONTROLADA]: Reintentando acceso a '${catSlug}' (${targetUrl})...`);
    try {
      await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
    } catch (reloadErr) {
      console.warn(`   ⚠️ Timeout parcial en recarga (${reloadErr.message}), evaluando estado del DOM...`);
    }
  }

  console.error(
    `❌ [FATAL CERO OMISIÓN]: No se pudo desbloquear la categoría '${catSlug}' tras ${maxRetries} reintentos controlados en ${targetUrl}.`
  );
  return false;
}

// ==============================================================================
// INICIALIZACIÓN DEL NAVEGADOR CON CONTEXTO PERSISTENTE
// ==============================================================================

async function createResilientContext(options) {
  if (!fs.existsSync(USER_DATA_DIR)) {
    fs.mkdirSync(USER_DATA_DIR, { recursive: true });
  }

  const launchOpts = {
    headless: options.headless,
    viewport: options.headless ? PLAYWRIGHT_CONFIG.viewport : null,
    locale: 'es-BO',
    timezoneId: 'America/La_Paz',
    ignoreDefaultArgs: ['--no-sandbox'],
    args: [
      '--test-type',
      '--disable-blink-features=AutomationControlled',
      '--disable-infobars',
      '--no-first-run',
      '--no-default-browser-check',
      ...(options.headless ? [] : ['--start-maximized'])
    ]
  };

  let context;
  try {
    context = await chromium.launchPersistentContext(USER_DATA_DIR, {
      ...launchOpts,
      channel: 'chrome'
    });
    console.log(`🖥️ Contexto persistente iniciado exitosamente en Google Chrome oficial.`);
  } catch (err) {
    console.warn(`⚠️ No se pudo iniciar con canal 'chrome' (${err.message}). Utilizando binario Chromium persistente...`);
    context = await chromium.launchPersistentContext(USER_DATA_DIR, launchOpts);
  }

  // Higienización minimalista: elimina artefactos de Playwright y asegura foco lógico
  // SIN modificar Navigator.prototype para no disparar Prototype Lie Detection (b9).
  await context.addInitScript(() => {
    try {
      delete window.__playwright__binding__;
      delete window.__pwInitScripts;
    } catch {}

    Document.prototype.hasFocus = function () {
      return true;
    };
  });

  return context;
}

// ==============================================================================
// EXTRACCIÓN DOM PLAYWRIGHT Y SCROLL INFINITO DINÁMICO
// ==============================================================================

/**
 * Desplaza la página continuamente hacia el fondo y espera la resolución
 * del indicador "Obteniendo más productos" hasta agotar el catálogo completo.
 */
async function autoScrollUntilAllLoaded(page, catSlug, options = {}) {
  const {
    maxScrollAttempts = 60,
    stableThreshold = 3,
    loaderTimeoutMs = 8000,
    limit = 0
  } = options;

  let stableCycles = 0;
  let lastLogTime = 0;

  for (let attempt = 1; attempt <= maxScrollAttempts; attempt++) {
    const currentCount = await page.$$eval('article.card', (els) => els.length).catch(() => 0);

    if (limit > 0 && currentCount >= limit) {
      console.log(`   🎯 Límite configurado (${limit}) alcanzado en '${catSlug}' (${currentCount} productos).`);
      break;
    }

    // Scroll suave hacia el final del documento para disparar el evento de scroll de Next.js
    await page.evaluate(() => {
      window.scrollTo({
        top: document.body.scrollHeight,
        behavior: 'smooth'
      });
    });

    // Detectar si el contenedor de carga "Obteniendo más productos" o los 3 puntos naranjas están presentes
    let hasLoader = await page.evaluate(() => {
      const text = (document.body?.innerText || '').toLowerCase();
      return text.includes('obteniendo más productos') || text.includes('cargando más productos');
    }).catch(() => false);

    if (hasLoader) {
      const now = Date.now();
      if (now - lastLogTime >= 3500) {
        console.log(`   ⏳ [CARGANDO MÁS PRODUCTOS]: Indicador activo en '${catSlug}' (${currentCount} productos en pantalla)...`);
        lastLogTime = now;
      }

      // Esperar activamente a que desaparezca el indicador y la grilla se hidrate
      const startWait = Date.now();
      while (Date.now() - startWait < loaderTimeoutMs) {
        await sleep(400);
        hasLoader = await page.evaluate(() => {
          const text = (document.body?.innerText || '').toLowerCase();
          return text.includes('obteniendo más productos') || text.includes('cargando más productos');
        }).catch(() => false);

        if (!hasLoader) break;
      }
      // Asentar los nuevos nodos article.card renderizados
      await sleep(800);
    } else {
      await sleep(1000);
    }

    const newCount = await page.$$eval('article.card', (els) => els.length).catch(() => 0);

    if (newCount > currentCount) {
      stableCycles = 0;
    } else {
      stableCycles++;
      // Si tras stableThreshold intentos el conteo no varía y ya no hay indicador: fin de la categoría
      if (stableCycles >= stableThreshold && !hasLoader) {
        break;
      }
    }

    // Telemetría asistida en caso de intento de bloqueo durante el scroll
    const state = await evaluateCategoryState(page);
    if (state.status === 'RADWARE_CHALLENGE') {
      await simulateHumanTelemetry(page);
    }
  }

  return await page.$$eval('article.card', (els) => els.length).catch(() => 0);
}

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

async function scrapeBranchLive(
  context,
  cityKey,
  branchInfo,
  categoriesToScrape,
  limit,
  isHeadless = false,
  cityCatalog = CIUDADES_SUCURSALES,
  delayMs = 2000,
  maxRetries = 10
) {
  const cityConfig = cityCatalog[cityKey] || CIUDADES_SUCURSALES[cityKey];
  const results = [];
  const seenIds = new Set();
  let lastReportTime = 0;

  // Reusar la primera página del contexto persistente para mantener continuidad de sesión
  const pages = context.pages();
  const page = pages.length > 0 ? pages[0] : await context.newPage();
  page.setDefaultTimeout(PLAYWRIGHT_CONFIG.actionTimeoutMs);

  const branchUrl = `${HIPERMAXI_BASE_URL}/${cityKey}/${branchInfo.slug}`;
  console.log(`\n🌐 Navegando a sucursal: ${branchInfo.nombre} (${cityConfig.departamento})`);
  console.log(`   URL: ${branchUrl}`);

  try {
    const navBranchOk = await ensureCategoryAccessible(page, branchUrl, 'portada', branchInfo.nombre, {
      maxRetries,
      branchHomeUrl: HIPERMAXI_BASE_URL,
      isHeadless
    });

    if (!navBranchOk) {
      console.error(`🚨 [DETENCIÓN]: No fue posible acceder a la portada de ${branchInfo.nombre}. Guardando checkpoint...`);
      saveCheckpoint(branchInfo.slug, 'portada', results);
      return null;
    }

    // Scroll natural para cargar carruseles y componentes perezosos de portada
    for (let s = 0; s < 2; s++) {
      await page.evaluate(() => window.scrollBy(0, 600));
      await sleep(800);
    }

    // Extraer ofertas de la portada
    const homeCards = await extractCardsFromPage(page, {
      departamento: cityConfig.departamento,
      fuente: branchInfo.nombre,
      categoria: 'Ofertas Portada'
    });

    for (const item of homeCards) {
      if (item.id && !seenIds.has(item.id)) {
        seenIds.add(item.id);
        results.push(item);
      }
    }

    console.log(`📄 [PÁGINAS PROCESADAS]: Portada ${branchInfo.nombre} (${branchUrl})`);
    console.log(`🔍 [PRODUCTOS ANALIZADOS]: ${homeCards.length} productos detectados (Total sucursal: ${results.length})`);
    saveCheckpoint(branchInfo.slug, 'portada', results);
    lastReportTime = Date.now();

    // Navegar por cada categoría sin omitir ninguna
    if (categoriesToScrape && categoriesToScrape.length > 0) {
      for (const catSlug of categoriesToScrape) {
        if (limit > 0 && results.length >= limit) break;

        const catUrl = `${branchUrl}/categoria/${catSlug}`;

        try {
          const navCatOk = await ensureCategoryAccessible(page, catUrl, catSlug, branchInfo.nombre, {
            maxRetries,
            branchHomeUrl: branchUrl,
            isHeadless
          });

          if (!navCatOk) {
            // Política CERO OMISIÓN: detener y guardar checkpoint para intervención sin perder progreso
            console.error(`🚨 [DETENCIÓN POR SEGURIDAD]: Se detiene la corrida en '${catSlug}' para no omitir registros.`);
            saveCheckpoint(branchInfo.slug, catSlug, results);
            break;
          }

          // 1. Detección inicial en el DOM
          await page.waitForSelector('article.card', { timeout: 3000 }).catch(() => null);
          let cardCount = await page.$$eval('article.card', (els) => els.length).catch(() => 0);

          // 2. Ventana de muestreo reactivo de hasta 3 segundos si inicialmente no hay productos
          if (cardCount === 0) {
            await page.evaluate(() => window.scrollBy(0, 500));
            await sleep(1500);
            cardCount = await page.$$eval('article.card', (els) => els.length).catch(() => 0);

            if (cardCount === 0) {
              await page.evaluate(() => window.scrollBy(0, 500));
              await sleep(1500);
              cardCount = await page.$$eval('article.card', (els) => els.length).catch(() => 0);
            }
          }

          // 3. Scroll infinito dinámico esperando "Obteniendo más productos" hasta agotar el catálogo
          await autoScrollUntilAllLoaded(page, catSlug, {
            limit,
            maxScrollAttempts: 60,
            stableThreshold: 3
          });

          const catCards = await extractCardsFromPage(page, {
            departamento: cityConfig.departamento,
            fuente: branchInfo.nombre,
            categoria: catSlug.charAt(0).toUpperCase() + catSlug.slice(1).replace(/-/g, ' ')
          });

          let newItemsCount = 0;
          for (const item of catCards) {
            if (item.id && !seenIds.has(item.id)) {
              seenIds.add(item.id);
              results.push(item);
              newItemsCount++;
            }
          }

          const now = Date.now();
          if (now - lastReportTime >= 5000 || catCards.length > 0) {
            console.log(`📄 [PÁGINAS PROCESADAS]: ${branchInfo.nombre} -> Categoría '${catSlug}'`);
            console.log(`🔍 [PRODUCTOS ANALIZADOS]: ${catCards.length} tarjetas (+${newItemsCount} nuevos, acumulado sucursal: ${results.length})`);
            console.log(`✅ [PROCESO REALIZADO CORRECTAMENTE]: Extracción de '${catSlug}' completada sin omisiones.`);
            lastReportTime = now;
          }

          saveCheckpoint(branchInfo.slug, catSlug, results);

          if (delayMs > 0) await sleep(delayMs);

        } catch (catErr) {
          console.warn(`    ⚠️ Error al procesar categoría ${catUrl}: ${catErr.message}`);
        }
      }
    }
  } catch (err) {
    console.error(`❌ Error general en sucursal ${branchUrl}: ${err.message}`);
  }

  return results;
}

async function scrapeFromHtmlFile(context, filePath, contextInfo) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Archivo HTML no encontrado en: ${filePath}`);
  }

  console.log(`\n📄 Modo Snapshot HTML Local: ${filePath}`);
  const html = fs.readFileSync(filePath, 'utf8');

  const page = await context.newPage();
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
      fecha, departamento, producto, categoria, unidad_medida, precio_bs, fuente, enlace, imagen, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
    ON CONFLICT (fecha, departamento, producto)
    DO UPDATE SET
      categoria = EXCLUDED.categoria,
      unidad_medida = EXCLUDED.unidad_medida,
      precio_bs = EXCLUDED.precio_bs,
      fuente = EXCLUDED.fuente,
      enlace = COALESCE(EXCLUDED.enlace, canasta_precios.enlace),
      imagen = CASE
        WHEN canasta_precios.imagen LIKE 'canasta/%' THEN canasta_precios.imagen
        ELSE COALESCE(EXCLUDED.imagen, canasta_precios.imagen)
      END,
      updated_at = NOW();
  `;

  const BATCH_SIZE = 100;
  let insertedCount = 0;
  const totalBatches = Math.ceil(records.length / BATCH_SIZE);

  for (let b = 0; b < records.length; b += BATCH_SIZE) {
    const chunk = records.slice(b, b + BATCH_SIZE);
    const valuePlaceholders = [];
    const params = [];

    chunk.forEach((r, idx) => {
      const offset = idx * 9;
      valuePlaceholders.push(
        `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}, $${offset + 9}, NOW())`
      );
      params.push(
        r.fecha,
        r.departamento,
        r.producto,
        r.categoria,
        r.unidad_medida,
        r.precio_bs,
        r.fuente,
        r.enlace || null,
        r.imagen || null
      );
    });

    const batchQuery = `
      INSERT INTO canasta_precios (
        fecha, departamento, producto, categoria, unidad_medida, precio_bs, fuente, enlace, imagen, updated_at
      ) VALUES ${valuePlaceholders.join(',\n')}
      ON CONFLICT (fecha, departamento, producto)
      DO UPDATE SET
        categoria = EXCLUDED.categoria,
        unidad_medida = EXCLUDED.unidad_medida,
        precio_bs = EXCLUDED.precio_bs,
        fuente = EXCLUDED.fuente,
        enlace = COALESCE(EXCLUDED.enlace, canasta_precios.enlace),
        imagen = CASE
          WHEN canasta_precios.imagen LIKE 'canasta/%' THEN canasta_precios.imagen
          ELSE COALESCE(EXCLUDED.imagen, canasta_precios.imagen)
        END,
        updated_at = NOW();
    `;

    try {
      await neonQuery(neonUrl, batchQuery, params);
      insertedCount += chunk.length;
      const bIdx = Math.floor(b / BATCH_SIZE) + 1;
      process.stdout.write(`\r  📦 [LOTE ${bIdx}/${totalBatches}] Sincronizados ${insertedCount}/${records.length} productos en Neon PostgreSQL...`);
    } catch (err) {
      console.warn(`\n  ⚠️ Nota: Error en lote ${Math.floor(b / BATCH_SIZE) + 1}: ${err.message}. Intentando fallback individual...`);
      for (const r of chunk) {
        try {
          await neonQuery(neonUrl, upsertQuery, [
            r.fecha,
            r.departamento,
            r.producto,
            r.categoria,
            r.unidad_medida,
            r.precio_bs,
            r.fuente,
            r.enlace || null,
            r.imagen || null
          ]);
          insertedCount++;
        } catch (singleErr) {}
      }
    }
  }

  console.log(`\n✅ [PROCESO REALIZADO CORRECTAMENTE]: ${insertedCount}/${records.length} registros de Hipermaxi sincronizados en Neon PostgreSQL.`);

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

async function syncFarmaciaToNeon(neonUrl, records) {
  console.log(`\n🗄️ Verificando e ingresando ${records.length} productos farmacéuticos en tabla medicamentos_precios (Hipermaxi Farmacia)...`);

  const ddl = `
    CREATE TABLE IF NOT EXISTS medicamentos_precios (
      id SERIAL PRIMARY KEY,
      fecha DATE NOT NULL,
      departamento VARCHAR(50) NOT NULL,
      cadena VARCHAR(60) NOT NULL,
      producto VARCHAR(255) NOT NULL,
      laboratorio VARCHAR(120),
      categoria VARCHAR(80),
      presentacion VARCHAR(120),
      precio_bs NUMERIC(10, 2) NOT NULL,
      precio_anterior_bs NUMERIC(10, 2),
      descuento_pct NUMERIC(5, 2),
      enlace TEXT,
      imagen TEXT,
      disponible BOOLEAN DEFAULT true,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT med_precios_uniq UNIQUE (fecha, cadena, departamento, producto)
    );
  `;
  try {
    await neonQuery(neonUrl, ddl);
  } catch (e) {}

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

  let insertedCount = 0;
  for (const r of records) {
    try {
      await neonQuery(neonUrl, upsertSql, [
        r.fecha,
        r.departamento,
        'Hipermaxi Farmacia',
        r.producto,
        'Hipermaxi Farmacia',
        r.categoria || 'Farmacia',
        r.unidad_medida || 'Unidad',
        r.precio_bs,
        r.precio_anterior_bs,
        null,
        r.enlace || null,
        r.imagen || null,
        true
      ]);
      insertedCount++;
    } catch (err) {
      console.warn(`  ⚠️ Error en upsert de '${r.producto}': ${err.message}`);
    }
  }

  console.log(`\n✅ [PROCESO REALIZADO CORRECTAMENTE]: ${insertedCount}/${records.length} fármacos de Hipermaxi Farmacia sincronizados en Neon PostgreSQL.`);

  try {
    const stats = await neonQuery(
      neonUrl,
      `SELECT cadena, departamento, COUNT(*)::int as total, MIN(precio_bs) as min_bs, MAX(precio_bs) as max_bs, ROUND(AVG(precio_bs), 2) as avg_bs
       FROM medicamentos_precios
       WHERE cadena = 'Hipermaxi Farmacia'
       GROUP BY cadena, departamento;`
    );
    if (stats.rows && stats.rows.length > 0) {
      console.log('\n📊 Resumen de Precios Hipermaxi Farmacia en Neon PostgreSQL:');
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
// FUNCIÓN PRINCIPAL
// ==============================================================================

async function main() {
  const startTime = Date.now();
  const options = parseArgs();
  const env = loadEnv();
  const todayStr = new Date().toISOString().split('T')[0];

  console.log('==================================================================');
  console.log('🛒 HIPERMAXI MULTI-CIUDAD WEB SCRAPER - CERO OMISIÓN RESILIENTE');
  console.log(`   Modo: ${options.mode} | Servicio: ${options.service} | Dry-run: ${options.dryRun}`);
  console.log(`   Ciudad(es): ${options.allCities ? 'Todas (LP, SCZ, CBB)' : options.city}`);
  console.log(`   Categorías: ${options.categories.length} seleccionadas | Reintentos máx: ${options.maxRetries}`);
  console.log(`   Ventana Visible: ${options.headless ? '❌ NO (--headless)' : '🖥️ SÍ (--headed / Asistencia Anti-Bot Activa)'}`);
  console.log(`   Perfil de Navegación: ${USER_DATA_DIR}`);
  console.log('==================================================================');

  const context = await createResilientContext(options);
  const allRawItems = [];

  try {
    if (options.file && options.file.endsWith('.json')) {
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
      const targetFile = options.file || path.join(ROOT_DIR, 'data_hipermaxi_calacoto.html');
      const items = await scrapeFromHtmlFile(context, targetFile, {
        departamento: 'La Paz',
        fuente: 'Hipermaxi Calacoto',
        categoria: 'Ofertas Snapshot'
      });
      allRawItems.push(...items);
    } else {
      // Modo Live Playwright con Contexto Persistente
      const servicesList = options.service === 'all' ? ['supermercado', 'farmacia'] : [options.service];

      for (const currentSvc of servicesList) {
        console.log(`\n==================================================================`);
        console.log(`🎯 INICIANDO SERVICIO: ${currentSvc.toUpperCase()} (HIPERMAXI)`);
        console.log(`==================================================================`);

        const cityCatalog = currentSvc === 'farmacia' ? CIUDADES_FARMACIAS : CIUDADES_SUCURSALES;
        const categoriesForSvc = (options.categories.length > 0 && options.service !== 'all')
          ? options.categories
          : (currentSvc === 'farmacia' ? CATEGORIAS_FARMACIA : CATEGORIAS_SUPERMERCADO);

        const targetCities = options.allCities
          ? Object.keys(cityCatalog)
          : [options.city in cityCatalog ? options.city : 'la-paz'];

        const svcRawItems = [];

        for (const cityKey of targetCities) {
          const cityConf = cityCatalog[cityKey];
          let branchesToScrape = [];

          if (options.branch) {
            const matchBranch = cityConf.sucursales.find(
              (s) => s.slug.includes(options.branch) || s.nombre.toLowerCase().includes(options.branch)
            );
            branchesToScrape = matchBranch ? [matchBranch] : [cityConf.sucursales[0]];
          } else {
            const flagship = cityConf.sucursales.find((s) => s.slug === cityConf.flagship);
            branchesToScrape = [flagship || cityConf.sucursales[0]];
          }

          for (const branch of branchesToScrape) {
            const items = await scrapeBranchLive(
              context,
              cityKey,
              branch,
              categoriesForSvc,
              options.limit,
              options.headless,
              cityCatalog,
              options.delayMs,
              options.maxRetries
            );

            if (items === null) {
              console.log(`\n🔄 Activando Fallback a Snapshot HTML local para asegurar continuidad...`);
              const fallbackFile = path.join(ROOT_DIR, 'data_hipermaxi_calacoto.html');
              if (fs.existsSync(fallbackFile)) {
                const fallbackItems = await scrapeFromHtmlFile(context, fallbackFile, {
                  departamento: cityConf.departamento,
                  fuente: branch.nombre,
                  categoria: 'Ofertas Snapshot'
                });
                svcRawItems.push(...fallbackItems);
              }
            } else {
              svcRawItems.push(...items);
            }

            await sleep(options.delayMs || 2500);
          }
        }

        allRawItems.push(...svcRawItems);

        // Normalización y guardado por servicio
        const svcCleanRecords = [];
        const seenSvcKeys = new Set();

        for (const item of svcRawItems) {
          if (!item.title) continue;
          const precioBs = parsePriceBs(item.priceText);
          if (precioBs === null || precioBs <= 0) continue;

          const dedupeKey = `${todayStr}_${item.departamento}_${item.title.toLowerCase().trim()}`;
          if (seenSvcKeys.has(dedupeKey)) continue;
          seenSvcKeys.add(dedupeKey);

          svcCleanRecords.push({
            id_producto: item.id || '',
            fecha: todayStr,
            departamento: item.departamento,
            producto: item.title.slice(0, 180).trim(),
            categoria: item.categoria || (currentSvc === 'farmacia' ? 'Farmacia' : 'Abarrotes'),
            unidad_medida: normalizeUnit(item.title),
            precio_bs: precioBs,
            precio_anterior_bs: parsePriceBs(item.originalPriceText),
            descuento: item.discountText || null,
            fuente: item.fuente,
            enlace: item.href || '',
            imagen: item.img || ''
          });
        }

        console.log(`\n📦 Total extraídos en ${currentSvc.toUpperCase()}: ${svcCleanRecords.length} productos.`);

        if (!options.dryRun && svcCleanRecords.length > 0) {
          if (env.NEON_DB) {
            if (currentSvc === 'farmacia') {
              await syncFarmaciaToNeon(env.NEON_DB, svcCleanRecords);
            } else {
              await syncToNeon(env.NEON_DB, svcCleanRecords);
            }
          }
        }
      }
    }

    // Normalización y resumen consolidado global
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

    console.log(`\n📦 Total acumulado de productos extraídos y normalizados: ${cleanRecords.length}`);

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

    const backupPath = path.join(ROOT_DIR, 'data_scraped_hipermaxi.json');
    fs.writeFileSync(backupPath, JSON.stringify(cleanRecords, null, 2), 'utf8');
    console.log(`💾 Respaldo JSON guardado en: ${backupPath}`);

    if (options.dryRun) {
      console.log('ℹ️ Modo dry-run activo: No se realizaron cambios en Neon PostgreSQL.');
    }

    const endTime = Date.now();
    printTelemetryBanner({
      title: 'HIPERMAXI',
      startTime,
      endTime,
      totalItems: cleanRecords.length,
      extraInfo: [
        `Ciudades: ${options.allCities ? 'Todas (LP, SCZ, CBB)' : options.city}`,
        `Servicio: ${options.service.toUpperCase()}`,
        `Respaldo JSON: ${backupPath}`,
        `Base de Datos Neon: ${options.dryRun ? 'No (dry-run)' : 'Sincronizado con Triggers'}`
      ]
    });
  } catch (err) {
    console.error(`💥 Error durante la ejecución del scraper: ${err.message}`);
    process.exitCode = 1;
  } finally {
    await context.close();
  }
}

main().catch(console.error);
