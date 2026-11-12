/**
 * ==============================================================================
 * SICOES WEB SCRAPER V2 (BASE PLAYWRIGHT DE scraper_amz.mjs + NEON PGVECTOR)
 * ==============================================================================
 * Versionado Playwright de `scraper-sicoes.mjs` construido replicando la
 * arquitectura y buenas prácticas de `scraper_amz.mjs` (sin modificarlo):
 *   1. Gestión de navegador Chromium (`HEADLESS=false` soportado) y cierre seguro
 *      en bloque `try/catch/finally`.
 *   2. Interacción real sobre `#formAvanzada` en SICOES (`codigoDpto='02'` La Paz,
 *      activación de checkboxes `*Despliegue` y consulta por lotes `r1`).
 *   3. Extracción híbrida (Algoritmo DOM `page.$$eval()` sobre `#tablaAvanzada`
 *      + Algoritmo de Red `page.on('response')` interceptando `operacion.php`)
 *      con paginación real y rate limiting.
 *   4. Respaldo JSON extendido (`data_scraped_sicoes_v2.json`), generación de
 *      embeddings (`1024` dims) y upsert idempotente en Neon PostgreSQL.
 *
 * Política anti-CAPTCHA:
 *   Solo consulta listados públicos de búsqueda y enlaces `fichaProceso.php`.
 *   Nunca intenta descargar archivos ni evadir Turnstile/reCAPTCHA.
 *
 * Uso en PowerShell (desde `ws-dm/`):
 *   node scripts/scraper_sicoes_v2.mjs --dry-run --pages=1
 *   node scripts/scraper_sicoes_v2.mjs --mode=hybrid --pages=1
 *   $env:HEADLESS="false"; node scripts/scraper_sicoes_v2.mjs --dry-run --pages=1
 * ==============================================================================
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const SICOES_BASE = 'https://www.sicoes.gob.bo';
const SICOES_CONVOCATORIAS_URL = `${SICOES_BASE}/portal/contrataciones/busqueda/convocatorias.php?tipo=convNacional`;
const NVIDIA_BASE = 'https://integrate.api.nvidia.com/v1';

const PLAYWRIGHT_DEFAULTS = {
  userAgent:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  viewport: { width: 1366, height: 900 },
  navigationTimeoutMs: 35000,
  actionTimeoutMs: 15000,
  rateLimitMs: 1500,
};

// Mapeo posicional de columnas en #tablaAvanzada cuando los 8 checkboxes *Despliegue están activos
const COLUMN_LABELS = [
  'cuce',
  'entidad',
  'tipo_contratacion',
  'modalidad',
  'objeto',
  'subasta',
  'fecha_publicacion',
  'fecha_presentacion',
  'estado',
  'archivos',
  'formularios',
  'ficha',
  'contacto',
  'garantia',
  'costo_pliego',
  'arpc',
  'reunion_aclaracion',
  'fecha_adjudicacion',
  'departamento',
  'normativa',
];

const DESPLIEGUE_CHECKBOXES = [
  'personaContDespliegue',
  'nomtoGarDespliegue',
  'costoPlieDespliegue',
  'arpcDespliegue',
  'fechaReunionDespliegue',
  'fechaAdjudicacionDespliegue',
  'dptoDespliegue',
  'normativaDespliegue',
];

const DEFAULT_BATCHES = [
  { r1: '11', label: 'Vigentes' },
  { r1: '1D', label: 'Adjudicadas' },
  { r1: '2C', label: 'Contratadas' },
  { r1: '2D', label: 'Desiertas' },
];

/**
 * Carga variables desde `process.env` y `.env` local de `ws-dm/`.
 */
export function loadEnv() {
  const env = {
    NEON_DB: process.env.NEON_DB || process.env.DATABASE_URL || '',
    nvidiaApiKey: process.env.nvidiaApiKey || process.env.NVIDIA_API_KEY || '',
  };

  const envPath = path.join(ROOT_DIR, '.env');
  if (fs.existsSync(envPath)) {
    for (const rawLine of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq === -1) continue;
      const key = line.slice(0, eq).trim();
      let val = line.slice(eq + 1).trim();
      if ((val.startsWith("'") && val.endsWith("'")) || (val.startsWith('"') && val.endsWith('"'))) {
        val = val.slice(1, -1).trim();
      }
      if ((key === 'NEON_DB' || key === 'DATABASE_URL') && !env.NEON_DB) env.NEON_DB = val;
      if ((key === 'nvidiaApiKey' || key === 'NVIDIA_API_KEY') && !env.nvidiaApiKey) env.nvidiaApiKey = val;
    }
  }
  return env;
}

/**
 * Parsea banderas CLI: `--dry-run`, `--mode=hybrid|dom|network`, `--pages=N`, `--limit=N`, `--page-size=N`.
 */
export function parseCliOptions(argv = process.argv.slice(2)) {
  const opts = {
    mode: 'hybrid',
    pages: 1,
    pageSize: 10,
    limitOverride: null,
    dryRun: false,
  };

  for (const arg of argv) {
    if (arg === '--dry-run') {
      opts.dryRun = true;
    } else if (arg.startsWith('--mode=')) {
      const val = arg.slice('--mode='.length).toLowerCase();
      if (['hybrid', 'dom', 'network'].includes(val)) {
        opts.mode = val;
      } else {
        throw new Error(`Modo no soportado "${val}". Usa hybrid, dom o network.`);
      }
    } else if (arg.startsWith('--pages=')) {
      const parsed = Number.parseInt(arg.slice('--pages='.length), 10);
      if (Number.isFinite(parsed) && parsed > 0) opts.pages = parsed;
    } else if (arg.startsWith('--page-size=') || arg.startsWith('--length=')) {
      const parsed = Number.parseInt(arg.split('=')[1], 10);
      if ([10, 25, 50, 100].includes(parsed)) opts.pageSize = parsed;
    } else if (arg.startsWith('--limit=')) {
      const parsed = Number.parseInt(arg.slice('--limit='.length), 10);
      if (Number.isFinite(parsed) && parsed > 0) opts.limitOverride = parsed;
    }
  }

  return opts;
}

function safeUnescape(str) {
  if (str == null) return '';
  try {
    return globalThis.unescape(String(str));
  } catch {
    return String(str);
  }
}

function decodeHtmlEntities(str) {
  return str
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;/gi, "'")
    .replace(/&aacute;/gi, 'á')
    .replace(/&eacute;/gi, 'é')
    .replace(/&iacute;/gi, 'í')
    .replace(/&oacute;/gi, 'ó')
    .replace(/&uacute;/gi, 'ú')
    .replace(/&ntilde;/gi, 'ñ')
    .replace(/&Aacute;/gi, 'Á')
    .replace(/&Eacute;/gi, 'É')
    .replace(/&Iacute;/gi, 'Í')
    .replace(/&Oacute;/gi, 'Ó')
    .replace(/&Uacute;/gi, 'Ú')
    .replace(/&Ntilde;/gi, 'Ñ');
}

export function cleanText(raw) {
  const unescaped = safeUnescape(raw);
  const noTags = unescaped.replace(/<[^>]+>/g, ' ');
  return decodeHtmlEntities(noTags).replace(/\s+/g, ' ').trim();
}

export function parseSicoesDate(ddmmyyyy) {
  const clean = cleanText(ddmmyyyy);
  const m = clean.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (!m) return null;
  const [, dd, mm, yyyy] = m;
  return `${yyyy}-${mm}-${dd}T00:00:00Z`;
}

export function mapEstado(rawEstado) {
  const norm = cleanText(rawEstado).toLowerCase();
  if (norm.includes('vigente')) return 'VIGENTE';
  if (norm.includes('adjudic')) return 'ADJUDICADA';
  if (norm.includes('contrat')) return 'CONTRATADA';
  if (norm.includes('desiert')) return 'DESIERTA';
  if (norm.includes('cancel')) return 'CANCELADA';
  if (norm.includes('anulad')) return 'ANULADA';
  if (norm.includes('suspend')) return 'SUSPENDIDA';
  return norm ? norm.toUpperCase().slice(0, 38) : 'VIGENTE';
}

export function inferTipoEntidad(entidad) {
  const lower = entidad.toLowerCase();
  if (lower.includes('ministerio')) return 'Ministerio';
  if (lower.includes('municipal') || lower.includes('gamlp') || lower.includes('gamea')) return 'Municipio';
  if (lower.includes('gobernaci') || lower.includes('departamental')) return 'Gobernación';
  if (lower.includes('universidad') || lower.includes('umsa') || lower.includes('upea')) return 'Universidad';
  if (lower.includes('hospital') || lower.includes('caja') || lower.includes('salud')) return 'Salud / Caja';
  if (
    lower.includes('empresa') ||
    lower.includes('ypfb') ||
    lower.includes('ende') ||
    lower.includes('entel') ||
    lower.includes('ylb')
  ) {
    return 'Empresa Pública';
  }
  return 'Entidad Estatal';
}

export function inferRubro(tipoContratacion, objeto) {
  const text = `${tipoContratacion} ${objeto}`.toLowerCase();
  if (/software|sistema|inform[aá]t|servidor|fibra|red |tecnolog|base de datos|ciberseguridad/.test(text)) {
    return 'TI, Software y Telecomunicaciones';
  }
  if (/medicamento|insumo|m[eé]dic|salud|hospital|laboratorio|equipo m[eé]dico/.test(text)) {
    return 'Salud e Insumos Médicos';
  }
  if (tipoContratacion === 'Obras' || /const\.|construcci[oó]n|infraestructura|paviment|electrificaci|cancha/.test(text)) {
    return 'Obras Civiles e Infraestructura';
  }
  if (tipoContratacion.includes('Consultoria') || /consultor|auditor[ií]a|estudio|supervisi[oó]n/.test(text)) {
    return 'Consultoría y Estudios Técnicos';
  }
  if (tipoContratacion.includes('Servicios')) {
    return 'Servicios Generales y Logística';
  }
  return 'Adquisición de Bienes y Materiales';
}

function extractFichaHref(rawOnclickOrHref, cuce) {
  const raw = String(rawOnclickOrHref || '');
  const match = raw.match(/irFicha\(\s*['"]([^'"]+)['"]\s*\)/i);
  if (match?.[1]) {
    return match[1].startsWith('http') ? match[1] : `${SICOES_BASE}${match[1]}`;
  }
  return `${SICOES_BASE}/portal/contrataciones/ficha/fichaProceso.php?cp=${encodeURIComponent(cuce)}`;
}

function normalizeSicoesRecord(raw, extractionSource = 'hybrid') {
  const cuce = cleanText(raw.cuce);
  if (!cuce) return null;

  const entidad = cleanText(raw.entidad) || 'Entidad Pública de La Paz';
  const tipoContratacion = cleanText(raw.tipo_contratacion) || 'Otros';
  const objeto = cleanText(raw.objeto) || 'Sin descripción publicada';
  const subastaNorm = cleanText(raw.subasta).toLowerCase();

  return {
    cuce,
    entidad,
    tipo_entidad: inferTipoEntidad(entidad),
    tipo_contratacion: tipoContratacion,
    objeto,
    modalidad: cleanText(raw.modalidad) || 'ANPE',
    subasta: subastaNorm === 'si' || subastaNorm === 'sí',
    departamento: cleanText(raw.departamento) || 'La Paz',
    monto_referencial_bs: null,
    monto_adjudicado_bs: null,
    fecha_publicacion: parseSicoesDate(raw.fecha_publicacion) || new Date().toISOString(),
    fecha_presentacion: parseSicoesDate(raw.fecha_presentacion),
    fecha_adjudicacion: parseSicoesDate(raw.fecha_adjudicacion),
    estado: mapEstado(raw.estado),
    adjudicatario: null,
    formularios: cleanText(raw.formularios) || null,
    contacto: cleanText(raw.contacto) || null,
    normativa: cleanText(raw.normativa) || null,
    pliego_url: raw.pliego_url || `${SICOES_BASE}/portal/contrataciones/ficha/fichaProceso.php?cp=${encodeURIComponent(cuce)}`,
    formulario_500_url: null,
    rubro_grafo: inferRubro(tipoContratacion, objeto),
    // Metadatos extendidos v2 (disponibles en data_scraped_sicoes_v2.json)
    archivos: Array.isArray(raw.archivos_lista)
      ? raw.archivos_lista
      : cleanText(raw.archivos)
        ? [cleanText(raw.archivos)]
        : [],
    garantia: cleanText(raw.garantia) || null,
    costo_pliego: cleanText(raw.costo_pliego) || null,
    arpc: cleanText(raw.arpc) || null,
    reunion_aclaracion: cleanText(raw.reunion_aclaracion) || null,
    extraction_source: extractionSource,
  };
}

/**
 * Configura e inicializa Chromium replicando el ciclo de vida seguro de `scraper_amz.mjs`.
 */
async function runWithBrowser(taskFn) {
  const headless = process.env.HEADLESS !== 'false';
  let browser;
  try {
    browser = await chromium.launch({ headless });
    const context = await browser.newContext({
      viewport: PLAYWRIGHT_DEFAULTS.viewport,
      userAgent: PLAYWRIGHT_DEFAULTS.userAgent,
    });
    const page = await context.newPage();
    page.setDefaultTimeout(PLAYWRIGHT_DEFAULTS.actionTimeoutMs);
    page.setDefaultNavigationTimeout(PLAYWRIGHT_DEFAULTS.navigationTimeoutMs);
    return await taskFn(page, context);
  } finally {
    if (browser) await browser.close();
  }
}

/**
 * Abre primero `/portal/index.php` para obtener el token de sesión oficial del portal,
 * navega a `convocatorias.php?tipo=convNacional&token=...`, activa la pestaña `#f-avanzada`,
 * selecciona La Paz ('02') y marca los 8 checkboxes `*Despliegue` respetando iCheck.
 */
async function prepareAvanzadaForm(page) {
  const indexUrl = `${SICOES_BASE}/portal/index.php`;
  console.log(`🌐 Iniciando sesión en ${indexUrl}...`);
  await page.goto(indexUrl, { waitUntil: 'domcontentloaded' });

  const sessionToken = await page.$eval('#token', (el) => el.value).catch(() => '');
  const targetUrl = sessionToken
    ? `${SICOES_CONVOCATORIAS_URL}&token=${encodeURIComponent(sessionToken)}`
    : SICOES_CONVOCATORIAS_URL;

  console.log(`🌐 Navegando a ${targetUrl}...`);
  await page.goto(targetUrl, { waitUntil: 'domcontentloaded' });

  const tabSelector = 'a[href="#f-avanzada"]';
  await page.waitForSelector(tabSelector);
  await page.click(tabSelector);
  await page.waitForSelector('#formAvanzada select#codigoDpto', { state: 'visible' });

  // Selecciona Departamento La Paz ('02')
  await page.selectOption('#formAvanzada select#codigoDpto', '02');

  // Marca los 8 checkboxes opcionales manejando iCheck + input nativo
  const checkedCount = await page.evaluate((checkboxNames) => {
    let activated = 0;
    for (const name of checkboxNames) {
      const el = document.querySelector(`#formAvanzada input[name="${name}"]`);
      if (!el) continue;

      if (window.jQuery && typeof window.jQuery(el).iCheck === 'function') {
        window.jQuery(el).iCheck('check');
      } else {
        el.checked = true;
        el.dispatchEvent(new Event('change', { bubbles: true }));
      }
      if (el.checked) activated += 1;
    }
    return activated;
  }, DESPLIEGUE_CHECKBOXES);

  // Recupera hashes dinámicos de columnas de sesión para mapear JSON de `operacion.php`
  const colsAvanzada = await page.evaluate(() => {
    const input = document.querySelector('#colsConvocatoriasAvanzada');
    if (!input?.value) return [];
    try {
      return JSON.parse(input.value);
    } catch {
      return [];
    }
  });

  console.log(
    `🎛️  Formulario #formAvanzada listo (La Paz=02, checkboxes activos=${checkedCount}/${DESPLIEGUE_CHECKBOXES.length}, hashes=${colsAvanzada.length})`
  );

  return colsAvanzada;
}

/**
 * Extrae las filas renderizadas de `#tablaAvanzada tbody tr` mediante `page.$$eval()`.
 * Lee encabezados reales en `thead th` para tolerar variaciones de columnas desplegadas.
 */
async function extractTableRowsViaDom(page) {
  return page.$$eval('#tablaAvanzada tbody tr', (rows) => {
    const headerCells = Array.from(document.querySelectorAll('#tablaAvanzada thead th')).map((th) =>
      (th.innerText || '').trim().toLowerCase()
    );

    const resolveKey = (headerText, idx) => {
      if (headerText.includes('cuce')) return 'cuce';
      if (headerText.includes('entidad')) return 'entidad';
      if (headerText.includes('tipo')) return 'tipo_contratacion';
      if (headerText.includes('modalidad')) return 'modalidad';
      if (headerText.includes('objeto')) return 'objeto';
      if (headerText.includes('subasta')) return 'subasta';
      if (headerText.includes('publicaci')) return 'fecha_publicacion';
      if (headerText.includes('presentaci')) return 'fecha_presentacion';
      if (headerText.includes('estado')) return 'estado';
      if (headerText.includes('archivo') || headerText.includes('documento')) return 'archivos';
      if (headerText.includes('formulario')) return 'formularios';
      if (headerText.includes('ficha')) return 'ficha';
      if (headerText.includes('contacto')) return 'contacto';
      if (headerText.includes('garant')) return 'garantia';
      if (headerText.includes('costo') || headerText.includes('pliego')) return 'costo_pliego';
      if (headerText.includes('arpc')) return 'arpc';
      if (headerText.includes('reuni')) return 'reunion_aclaracion';
      if (headerText.includes('adjudicaci')) return 'fecha_adjudicacion';
      if (headerText.includes('departamento') || headerText.includes('depto')) return 'departamento';
      if (headerText.includes('normativa')) return 'normativa';

      const fallbackKeys = [
        'cuce', 'entidad', 'tipo_contratacion', 'modalidad', 'objeto', 'subasta',
        'fecha_publicacion', 'fecha_presentacion', 'estado', 'archivos', 'formularios',
        'ficha', 'contacto', 'garantia', 'costo_pliego', 'arpc', 'reunion_aclaracion',
        'fecha_adjudicacion', 'departamento', 'normativa',
      ];
      return fallbackKeys[idx] || `col_${idx}`;
    };

    return rows
      .map((tr) => {
        if (tr.querySelector('.dataTables_empty')) return null;
        const cells = Array.from(tr.querySelectorAll('td'));
        if (cells.length < 9) return null;

        const out = {};
        cells.forEach((td, idx) => {
          const key = resolveKey(headerCells[idx] || '', idx);
          if (key === 'archivos') {
            const docLinks = Array.from(td.querySelectorAll('a'))
              .map((a) => (a.innerText || '').trim())
              .filter(Boolean);
            out.archivos_lista = docLinks.length
              ? docLinks
              : (td.innerText || '').trim()
                ? [(td.innerText || '').trim()]
                : [];
            out.archivos = out.archivos_lista.join(', ');
          } else if (key === 'formularios') {
            const formLinks = Array.from(td.querySelectorAll('a'))
              .map((a) => (a.innerText || '').trim())
              .filter(Boolean);
            out.formularios = formLinks.length ? formLinks.join(', ') : (td.innerText || '').trim();
          } else if (key === 'ficha') {
            const fichaAnchor = td.querySelector('a[onclick*="irFicha"], a');
            out.ficha_onclick = fichaAnchor?.getAttribute('onclick') || fichaAnchor?.getAttribute('href') || '';
          } else {
            out[key] = (td.innerText || '').trim();
          }
        });

        return out;
      })
      .filter(Boolean);
  });
}

function parseNetworkPayloadRows(payload, colsAvanzada) {
  const rows = Array.isArray(payload?.data) ? payload.data : [];
  return rows.map((rawRow) => {
    const mapped = {};
    colsAvanzada.forEach((colKey, idx) => {
      const colName = COLUMN_LABELS[idx] || `col_${idx}`;
      const cellVal = rawRow[colKey] ?? '';
      if (colName === 'ficha') {
        mapped.ficha_onclick = String(cellVal);
      } else {
        mapped[colName] = cleanText(cellVal);
      }
    });
    return mapped;
  });
}

function mergeDomAndNetworkRows(domRows, netRows, mode) {
  if (mode === 'dom') {
    return domRows
      .map((row) =>
        normalizeSicoesRecord(
          { ...row, pliego_url: extractFichaHref(row.ficha_onclick, cleanText(row.cuce)) },
          'dom'
        )
      )
      .filter(Boolean);
  }

  if (mode === 'network') {
    return netRows
      .map((row) =>
        normalizeSicoesRecord(
          { ...row, pliego_url: extractFichaHref(row.ficha_onclick, cleanText(row.cuce)) },
          'network'
        )
      )
      .filter(Boolean);
  }

  // Modo hybrid: combina metadatos DOM completos (archivos/enlaces visibles) con payload XHR
  const netByCuce = new Map();
  for (const nr of netRows) {
    const cuce = cleanText(nr.cuce);
    if (cuce) netByCuce.set(cuce, nr);
  }

  const merged = [];
  const seen = new Set();

  for (const dr of domRows) {
    const cuce = cleanText(dr.cuce);
    if (!cuce) continue;
    seen.add(cuce);
    const nr = netByCuce.get(cuce) || {};
    const combined = {
      ...nr,
      ...dr,
      pliego_url: extractFichaHref(dr.ficha_onclick || nr.ficha_onclick, cuce),
    };
    const rec = normalizeSicoesRecord(combined, Object.keys(nr).length ? 'hybrid' : 'dom');
    if (rec) merged.push(rec);
  }

  for (const nr of netRows) {
    const cuce = cleanText(nr.cuce);
    if (!cuce || seen.has(cuce)) continue;
    const rec = normalizeSicoesRecord(
      { ...nr, pliego_url: extractFichaHref(nr.ficha_onclick, cuce) },
      'network'
    );
    if (rec) merged.push(rec);
  }

  return merged;
}

async function waitForTablaAvanzadaSettled(page) {
  await page.waitForSelector('#tablaAvanzada tbody tr', { timeout: 20000 });
  await page
    .waitForFunction(
      () => {
        const proc = document.querySelector('#tablaAvanzada_processing');
        if (proc && window.getComputedStyle(proc).display !== 'none') return false;
        const firstRow = document.querySelector('#tablaAvanzada tbody tr');
        return Boolean(firstRow && firstRow.innerText.trim().length > 0);
      },
      { timeout: 20000 }
    )
    .catch(() => null);
}

/**
 * Ejecuta una búsqueda real en `#formAvanzada` para un estado `r1`, interceptando
 * respuestas de `operacion.php` (Algoritmo 3) y extrayendo el DOM con paginación (Algoritmo 1).
 */
async function scrapeBatchWithPlaywright(
  page,
  batch,
  { mode, maxPages, pageSize = 10, colsAvanzada, limitOverride }
) {
  const capturedNetworkPages = [];

  const responseListener = async (response) => {
    try {
      if (!response.url().includes('/portal/contrataciones/operacion.php')) return;
      if (response.request().method() !== 'POST') return;
      const contentType = response.headers()['content-type'] || '';
      if (!contentType.includes('application/json') && !contentType.includes('text/html')) return;
      const data = await response.json();
      capturedNetworkPages.push(data);
    } catch {
      // Ignora respuestas abortadas o no JSON
    }
  };

  page.on('response', responseListener);

  try {
    await page.selectOption('#formAvanzada select#r1', batch.r1);

    // Ajusta el número de registros por página si se especificó pageSize
    if (pageSize && pageSize !== 10) {
      await page.evaluate((size) => {
        const inputNro = document.querySelector('#formAvanzada input[name="nroRegistros"]');
        if (inputNro) inputNro.value = String(size);
        const inputLen = document.querySelector('#formAvanzada input[name="length"]');
        if (inputLen) inputLen.value = String(size);
      }, pageSize);
    }

    const searchBtn = '#formAvanzada input.busquedaForm[type="submit"]';
    const [xhrResponse] = await Promise.all([
      page
        .waitForResponse(
          (res) =>
            res.url().includes('/portal/contrataciones/operacion.php') &&
            res.request().method() === 'POST',
          { timeout: 25000 }
        )
        .catch(() => null),
      page.click(searchBtn),
    ]);

    if (!xhrResponse) {
      console.warn(`  ⚠️ No se detectó XHR operacion.php inmediato para ${batch.label}; verificando DOM...`);
    }

    await waitForTablaAvanzadaSettled(page);

    const collected = [];
    let latestRecordsTotal = 0;

    for (let currentPage = 1; currentPage <= maxPages; currentPage++) {
      const domRows = mode === 'network' ? [] : await extractTableRowsViaDom(page);
      const latestNetPayload = capturedNetworkPages[capturedNetworkPages.length - 1];
      if (latestNetPayload?.recordsTotal != null) {
        latestRecordsTotal = Number(latestNetPayload.recordsTotal) || latestRecordsTotal;
      }

      const netRows =
        mode === 'dom' || !latestNetPayload ? [] : parseNetworkPayloadRows(latestNetPayload, colsAvanzada);

      const pageRecords = mergeDomAndNetworkRows(domRows, netRows, mode);
      collected.push(...pageRecords);

      if (currentPage >= maxPages) break;

      const previousFirstCuce = domRows[0]?.cuce || '';
      const nextPageNum = currentPage + 1;

      // Paginación real de SICOES usando el botón exacto:
      // <a href="javascript:void(0);" onclick="busquedadraw('2');" aria-label="Next">Siguiente</a>
      const nextAnchorLocator = page.locator('a[aria-label="Next"], a:has-text("Siguiente")').first();
      const hasNextAnchor = (await nextAnchorLocator.count()) > 0;

      const isNextDisabled = hasNextAnchor
        ? await nextAnchorLocator.evaluate((el) => {
          const li = el.closest('li');
          return li ? li.classList.contains('disabled') : false;
        })
        : true;

      if (isNextDisabled) {
        console.log(`    ↳ Fin de paginación alcanzado para ${batch.label} en página ${currentPage}`);
        break;
      }

      await Promise.all([
        page
          .waitForResponse(
            (res) =>
              res.url().includes('/portal/contrataciones/operacion.php') &&
              res.request().method() === 'POST',
            { timeout: 20000 }
          )
          .catch(() => null),
        nextAnchorLocator.click().catch(() => {
          return page.evaluate((p) => {
            if (typeof window.busquedadraw === 'function') window.busquedadraw(String(p));
          }, nextPageNum);
        }),
      ]);

      await page.waitForTimeout(PLAYWRIGHT_DEFAULTS.rateLimitMs);
      await page
        .waitForFunction(
          (prevCuce) => {
            const cell = document.querySelector('#tablaAvanzada tbody tr td');
            return Boolean(cell && cell.innerText.trim() !== prevCuce);
          },
          previousFirstCuce,
          { timeout: 12000 }
        )
        .catch(() => null);
      await waitForTablaAvanzadaSettled(page);
    }

    const capped = limitOverride ? collected.slice(0, limitOverride) : collected;
    console.log(
      `  ↳ Lote ${batch.label} (r1=${batch.r1}, mode=${mode}): ${capped.length} filas extraídas (total SICOES reportado: ${latestRecordsTotal || 'DOM'})`
    );
    return capped;
  } finally {
    page.off('response', responseListener);
  }
}

function deterministicFallbackVector(text, dimensions = 1024) {
  const vec = new Array(dimensions).fill(0);
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = (hash << 5) - hash + text.charCodeAt(i);
    hash |= 0;
    const idx = Math.abs((hash + i * 31) % dimensions);
    vec[idx] += 1.0;
  }
  const norm = Math.sqrt(vec.reduce((sum, v) => sum + v * v, 0)) || 1.0;
  return vec.map((v) => Number((v / norm).toFixed(6)));
}

async function generateBatchEmbeddings(records, nvidiaApiKey) {
  const texts = records.map((r) => `${r.objeto} | ${r.entidad} | ${r.tipo_contratacion} | ${r.modalidad}`.slice(0, 1500));

  if (!nvidiaApiKey) {
    console.warn('⚠️ nvidiaApiKey no configurada; usando vectores deterministas de respaldo.');
    return { usedNvidia: false, vectors: texts.map((t) => deterministicFallbackVector(t, 1024)) };
  }

  const vectors = [];
  const chunkSize = 10;
  try {
    for (let i = 0; i < texts.length; i += chunkSize) {
      const batch = texts.slice(i, i + chunkSize);
      const res = await fetch(`${NVIDIA_BASE}/embeddings`, {
        method: 'POST',
        signal: AbortSignal.timeout(25000),
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${nvidiaApiKey}`,
        },
        body: JSON.stringify({
          input: batch,
          model: 'nvidia/nemotron-3.5-embed-1b',
          input_type: 'passage',
          encoding_format: 'float',
          dimensions: 1024,
        }),
      });

      if (!res.ok) {
        const errBody = await res.text();
        throw new Error(`HTTP ${res.status}: ${errBody}`);
      }
      const json = await res.json();
      for (const item of json.data) {
        vectors.push(item.embedding);
      }
    }
    console.log(`🧠 Embeddings reales generados con NVIDIA NIM (nvidia/nemotron-3.5-embed-1b, 1024 dims): ${vectors.length}`);
    return { usedNvidia: true, vectors };
  } catch (err) {
    console.warn(`⚠️ Falló NVIDIA NIM (${err.message}); usando vectores deterministas locales.`);
    return { usedNvidia: false, vectors: texts.map((t) => deterministicFallbackVector(t, 1024)) };
  }
}

async function neonQuery(neonUrl, query, params = []) {
  const u = new URL(neonUrl);
  const res = await fetch(`https://${u.hostname}/sql`, {
    method: 'POST',
    signal: AbortSignal.timeout(20000),
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
  return res.json();
}

function splitSqlStatements(sqlText) {
  const withoutLineComments = sqlText
    .split(/\r?\n/)
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n');
  return withoutLineComments
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean);
}

async function syncToNeon(neonUrl, records, vectors) {
  const schemaPath = path.join(ROOT_DIR, 'db', 'schema.sql');
  const statements = splitSqlStatements(fs.readFileSync(schemaPath, 'utf8'));

  console.log(`🗄️ Aplicando esquema DDL limpio (${statements.length} sentencias) en Neon PostgreSQL...`);
  for (const stmt of statements) {
    await neonQuery(neonUrl, stmt);
  }

  console.log(`⬆️ Insertando/actualizando ${records.length} convocatorias reales con pgvector...`);
  for (let i = 0; i < records.length; i++) {
    const r = records[i];
    const vecLiteral = `[${vectors[i].join(',')}]`;

    await neonQuery(
      neonUrl,
      `INSERT INTO sicoes_convocatorias (
        cuce, entidad, tipo_entidad, tipo_contratacion, objeto, modalidad, subasta,
        departamento, monto_referencial_bs, monto_adjudicado_bs,
        fecha_publicacion, fecha_presentacion, fecha_adjudicacion,
        estado, adjudicatario, formularios, contacto, normativa,
        pliego_url, formulario_500_url, embedding, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7,
        $8, $9, $10,
        $11, $12, $13,
        $14, $15, $16, $17, $18,
        $19, $20, $21::vector, CURRENT_TIMESTAMP
      )
      ON CONFLICT (cuce) DO UPDATE SET
        entidad = EXCLUDED.entidad,
        tipo_entidad = EXCLUDED.tipo_entidad,
        tipo_contratacion = EXCLUDED.tipo_contratacion,
        objeto = EXCLUDED.objeto,
        modalidad = EXCLUDED.modalidad,
        subasta = EXCLUDED.subasta,
        departamento = EXCLUDED.departamento,
        fecha_publicacion = EXCLUDED.fecha_publicacion,
        fecha_presentacion = EXCLUDED.fecha_presentacion,
        fecha_adjudicacion = EXCLUDED.fecha_adjudicacion,
        estado = EXCLUDED.estado,
        formularios = EXCLUDED.formularios,
        contacto = EXCLUDED.contacto,
        normativa = EXCLUDED.normativa,
        pliego_url = EXCLUDED.pliego_url,
        embedding = EXCLUDED.embedding,
        updated_at = CURRENT_TIMESTAMP`,
      [
        r.cuce,
        r.entidad,
        r.tipo_entidad,
        r.tipo_contratacion,
        r.objeto,
        r.modalidad,
        r.subasta,
        r.departamento,
        r.monto_referencial_bs,
        r.monto_adjudicado_bs,
        r.fecha_publicacion,
        r.fecha_presentacion,
        r.fecha_adjudicacion,
        r.estado,
        r.adjudicatario,
        r.formularios,
        r.contacto,
        r.normativa,
        r.pliego_url,
        r.formulario_500_url,
        vecLiteral,
      ]
    );

    await neonQuery(
      neonUrl,
      `INSERT INTO sicoes_graph_edges (source_node, target_node, edge_type, weight)
       VALUES ($1, $2, 'CONVOCA_RUBRO', 1.0)
       ON CONFLICT (source_node, target_node, edge_type) DO NOTHING`,
      [r.entidad, r.rubro_grafo]
    );
  }
}

/**
 * Orquestador principal de `scraper_sicoes_v2.mjs`.
 */
export async function runScraperV2(cliOptions = parseCliOptions()) {
  console.log('==================================================================');
  console.log('🚀 SICOES SCRAPER V2 - PLAYWRIGHT + EXTRACCIÓN HÍBRIDA (LA PAZ)');
  console.log(
    `   Modo: ${cliOptions.mode} | Páginas/lote: ${cliOptions.pages} | Tamaño pág: ${cliOptions.pageSize} | Dry-run: ${cliOptions.dryRun}`
  );
  console.log('==================================================================');

  const env = loadEnv();
  const batches = DEFAULT_BATCHES.map((b) => ({
    ...b,
    limit: cliOptions.limitOverride ?? b.limit,
  }));

  const byCuce = new Map();

  await runWithBrowser(async (page) => {
    const colsAvanzada = await prepareAvanzadaForm(page);

    for (const batch of batches) {
      const rows = await scrapeBatchWithPlaywright(page, batch, {
        mode: cliOptions.mode,
        maxPages: cliOptions.pages,
        pageSize: cliOptions.pageSize,
        limitOverride: cliOptions.limitOverride,
        colsAvanzada,
      });

      for (const row of rows) {
        if (row.cuce && !byCuce.has(row.cuce)) {
          byCuce.set(row.cuce, row);
        }
      }

      await page.waitForTimeout(PLAYWRIGHT_DEFAULTS.rateLimitMs);
    }
  });

  const records = [...byCuce.values()];
  console.log(`📦 Total de convocatorias únicas reales extraídas: ${records.length}`);

  const outJsonPath = path.join(ROOT_DIR, 'data_scraped_sicoes_v2.json');
  fs.writeFileSync(outJsonPath, JSON.stringify(records, null, 2));
  console.log(`💾 Respaldo JSON v2 guardado en: ${outJsonPath}`);

  if (cliOptions.dryRun) {
    console.log('🧪 Modo --dry-run activo: se omitió generación de embeddings y carga en Neon PostgreSQL.');
  } else {
    const { vectors } = await generateBatchEmbeddings(records, env.nvidiaApiKey);

    if (env.NEON_DB) {
      await syncToNeon(env.NEON_DB, records, vectors);
      const countRes = await neonQuery(
        env.NEON_DB,
        'SELECT estado, COUNT(*)::int AS total FROM sicoes_convocatorias GROUP BY estado ORDER BY total DESC'
      );
      console.log('✅ Sincronización completada en Neon PostgreSQL (`WS-DM`):');
      console.table(countRes.rows);
    } else {
      console.warn('⚠️ NEON_DB no configurada en .env; se omitió carga en base de datos.');
    }
  }

  console.log('\n📋 Muestra de registros reales extraídos (SICOES v2):');
  console.table(
    records.slice(0, 6).map((r) => ({
      cuce: r.cuce,
      entidad: r.entidad.slice(0, 28),
      modalidad: r.modalidad,
      estado: r.estado,
      fuente: r.extraction_source,
      normativa: (r.normativa || '-').slice(0, 18),
      garantia: (r.garantia || '-').slice(0, 14),
    }))
  );

  return records;
}

const isDirectRun =
  Boolean(process.argv[1]) &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isDirectRun) {
  runScraperV2().catch((err) => {
    console.error('❌ Error en scraper SICOES v2:', err.message);
    process.exitCode = 1;
  });
}
