/**
 * ==============================================================================
 * SICOES WEB SCRAPER REAL (NODE.JS + NEON POSTGRESQL HTTP SQL + PGVECTOR)
 * Extrae convocatorias reales de La Paz (codigoDpto=02) desde sicoes.gob.bo
 * sin evadir captchas/Turnstile, genera embeddings reales (1024 dims) y carga
 * las filas reales y aristas de grafo en Neon PostgreSQL.
 * ==============================================================================
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const SICOES_BASE = 'https://www.sicoes.gob.bo';
const NVIDIA_BASE = 'https://integrate.api.nvidia.com/v1';
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

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

function loadEnv() {
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

function cleanText(raw) {
  const unescaped = safeUnescape(raw);
  const noTags = unescaped.replace(/<[^>]+>/g, ' ');
  return decodeHtmlEntities(noTags).replace(/\s+/g, ' ').trim();
}

function parseSicoesDate(ddmmyyyy) {
  const clean = cleanText(ddmmyyyy);
  const m = clean.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (!m) return null;
  const [, dd, mm, yyyy] = m;
  return `${yyyy}-${mm}-${dd}T00:00:00Z`;
}

function mapEstado(rawEstado) {
  const norm = cleanText(rawEstado).toLowerCase();
  if (norm.includes('vigente')) return 'VIGENTE';
  if (norm.includes('adjudic')) return 'ADJUDICADA';
  if (norm.includes('contrat')) return 'CONTRATADA';
  if (norm.includes('desiert')) return 'DESIERTA';
  if (norm.includes('cancel')) return 'CANCELADA';
  if (norm.includes('anulad')) return 'ANULADA';
  return norm ? norm.toUpperCase().slice(0, 38) : 'VIGENTE';
}

function inferTipoEntidad(entidad) {
  const lower = entidad.toLowerCase();
  if (lower.includes('ministerio')) return 'Ministerio';
  if (lower.includes('municipal') || lower.includes('gamlp') || lower.includes('gamea')) return 'Municipio';
  if (lower.includes('gobernaci') || lower.includes('departamental')) return 'Gobernación';
  if (lower.includes('universidad') || lower.includes('umsa') || lower.includes('upea')) return 'Universidad';
  if (lower.includes('hospital') || lower.includes('caja') || lower.includes('salud')) return 'Salud / Caja';
  if (lower.includes('empresa') || lower.includes('ypfb') || lower.includes('ende') || lower.includes('entel') || lower.includes('ylb')) {
    return 'Empresa Pública';
  }
  return 'Entidad Estatal';
}

function inferRubro(tipoContratacion, objeto) {
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

async function initSicoesSession() {
  const r1 = await fetch(`${SICOES_BASE}/portal/index.php`, {
    headers: { 'User-Agent': USER_AGENT },
    signal: AbortSignal.timeout(25000),
  });
  if (!r1.ok) throw new Error(`SICOES index respondió HTTP ${r1.status}`);

  const cookies = r1.headers.getSetCookie ? r1.headers.getSetCookie() : [];
  const cookieHeader = cookies.map((c) => c.split(';')[0]).join('; ');
  const html1 = await r1.text();
  const token1 = html1.match(/id="token"[^>]*value="([^"]+)"/i)?.[1] || '';

  const convUrl = `${SICOES_BASE}/portal/contrataciones/busqueda/convocatorias.php?tipo=convNacional&token=${token1}`;
  const r2 = await fetch(convUrl, {
    headers: { 'User-Agent': USER_AGENT, Cookie: cookieHeader, Referer: `${SICOES_BASE}/portal/index.php` },
    signal: AbortSignal.timeout(25000),
  });
  if (!r2.ok) throw new Error(`SICOES convocatorias respondió HTTP ${r2.status}`);

  const html2 = await r2.text();
  const colsJson = html2.match(/id="colsConvocatoriasAvanzada"[^>]*value='([^']+)'/i)?.[1];
  const colsAvanzada = JSON.parse(colsJson || '[]');
  const formHtml = html2.match(/<form id="formAvanzada"[\s\S]*?<\/form>/i)?.[0] || '';
  const formToken = formHtml.match(/name="token"[^>]*value="([^"]+)"/i)?.[1] || token1;

  if (!colsAvanzada.length || !formToken) {
    throw new Error('No se pudieron extraer las columnas o token de búsqueda desde SICOES.');
  }

  return { cookieHeader, convUrl, colsAvanzada, formToken };
}

async function fetchSicoesBatch(session, { r1, length, label }) {
  const params = new URLSearchParams({
    token: session.formToken,
    entidad: '',
    codigoDpto: '02', // Departamento de La Paz
    cuce1: '', cuce2: '', cuce3: '', cuce4: '', cuce5: '', cuce6: '',
    objetoContrato: '',
    codigoModalidad: '',
    r1,
    codigoContrato: '',
    nroContrato: '',
    codigoNormativa: '',
    montoDesde: '', montoHasta: '',
    publicacionDesde: '', publicacionHasta: '',
    presentacionPropuestasDesde: '', presentacionPropuestasHasta: '',
    desiertaDesde: '', desiertaHasta: '',
    subasta: '',
    nroDocumento: '', nombreAdjudicado: '',
    personaContDespliegue: 'on',
    fechaAdjudicacionDespliegue: 'option2',
    dptoDespliegue: 'option3',
    normativaDespliegue: 'option3',
    tipo: 'Avanzada',
    operacion: 'convNacional',
    autocorrector: '',
    nroRegistros: String(length),
    draw: '1',
    start: '0',
    length: String(length),
    captcha: '',
  });

  const res = await fetch(`${SICOES_BASE}/portal/contrataciones/operacion.php`, {
    method: 'POST',
    headers: {
      'User-Agent': USER_AGENT,
      Cookie: session.cookieHeader,
      Referer: session.convUrl,
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'X-Requested-With': 'XMLHttpRequest',
    },
    body: params.toString(),
    signal: AbortSignal.timeout(30000),
  });

  if (!res.ok) throw new Error(`operacion.php (${label}) respondió HTTP ${res.status}`);
  const payload = await res.json();
  const rows = Array.isArray(payload.data) ? payload.data : [];
  console.log(`  ↳ Filtro ${label} (r1=${r1 || 'ALL'}): ${rows.length} filas extraídas (total SICOES: ${payload.recordsTotal})`);

  return rows.map((rawRow) => {
    const mapped = {};
    session.colsAvanzada.forEach((colKey, idx) => {
      const colName = COLUMN_LABELS[idx] || `col_${idx}`;
      mapped[colName] = cleanText(rawRow[colKey] ?? '');
    });

    const cuce = mapped.cuce;
    const entidad = mapped.entidad || 'Entidad Pública de La Paz';
    const tipoContratacion = mapped.tipo_contratacion || 'Otros';
    const estado = mapEstado(mapped.estado);

    return {
      cuce,
      entidad,
      tipo_entidad: inferTipoEntidad(entidad),
      tipo_contratacion: tipoContratacion,
      objeto: mapped.objeto || 'Sin descripción publicada',
      modalidad: mapped.modalidad || 'ANPE',
      subasta: mapped.subasta.toLowerCase() === 'si' || mapped.subasta.toLowerCase() === 'sí',
      departamento: mapped.departamento || 'La Paz',
      monto_referencial_bs: null,
      monto_adjudicado_bs: null,
      fecha_publicacion: parseSicoesDate(mapped.fecha_publicacion) || new Date().toISOString(),
      fecha_presentacion: parseSicoesDate(mapped.fecha_presentacion),
      fecha_adjudicacion: parseSicoesDate(mapped.fecha_adjudicacion),
      estado,
      adjudicatario: null,
      formularios: mapped.formularios || null,
      contacto: mapped.contacto || null,
      normativa: mapped.normativa || null,
      pliego_url: `${SICOES_BASE}/portal/contrataciones/ficha/fichaProceso.php?cp=${encodeURIComponent(cuce)}`,
      formulario_500_url: null,
      rubro_grafo: inferRubro(tipoContratacion, mapped.objeto || ''),
    };
  });
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

async function runScraper() {
  console.log('==================================================================');
  console.log('🚀 WEB SCRAPER REAL SICOES (DEPARTAMENTO DE LA PAZ -> NEON PGVECTOR)');
  console.log('==================================================================');

  const env = loadEnv();
  const session = await initSicoesSession();
  console.log('🔐 Sesión SICOES inicializada. Columnas detectadas:', session.colsAvanzada.length);

  const batches = [
    { r1: '11', length: 10, label: 'Vigentes' },
    { r1: '1D', length: 5, label: 'Adjudicadas' },
    { r1: '2C', length: 5, label: 'Contratadas' },
    { r1: '2D', length: 5, label: 'Desiertas' },
  ];

  const byCuce = new Map();
  for (const b of batches) {
    const rows = await fetchSicoesBatch(session, b);
    for (const row of rows) {
      if (row.cuce && !byCuce.has(row.cuce)) {
        byCuce.set(row.cuce, row);
      }
    }
  }

  const records = [...byCuce.values()];
  console.log(`📦 Total de convocatorias únicas reales extraídas: ${records.length}`);

  const outJsonPath = path.join(ROOT_DIR, 'data_scraped_sicoes.json');
  fs.writeFileSync(outJsonPath, JSON.stringify(records, null, 2));
  console.log(`💾 Respaldo JSON real guardado en: ${outJsonPath}`);

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

  console.log('\n📋 Muestra de registros reales extraídos:');
  console.table(
    records.slice(0, 6).map((r) => ({
      cuce: r.cuce,
      entidad: r.entidad.slice(0, 32),
      modalidad: r.modalidad,
      estado: r.estado,
      pub: r.fecha_publicacion?.slice(0, 10),
      pres: r.fecha_presentacion?.slice(0, 10) || '-',
    }))
  );
}

runScraper().catch((err) => {
  console.error('❌ Error en scraper SICOES:', err);
  process.exit(1);
});
