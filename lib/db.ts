import { getAppConfig } from './config';
import { computeGraphMining, GraphEdge } from './graph-mining';
import { generateEmbedding } from './nvidia-ai';

export interface Convocatoria {
  cuce: string;
  entidad: string;
  tipo_entidad: string;
  tipo_contratacion?: string | null;
  objeto: string;
  modalidad: string;
  subasta: boolean;
  departamento: string;
  monto_referencial_bs: number | null;
  monto_adjudicado_bs: number | null;
  fecha_publicacion: string;
  fecha_presentacion: string | null;
  fecha_adjudicacion: string | null;
  estado: string;
  adjudicatario: string | null;
  formularios?: string | null;
  contacto?: string | null;
  normativa?: string | null;
  pliego_url: string;
  formulario_500_url: string | null;
  similitud_semantica?: number;
  pagerank_entidad?: number;
  score_hibrido?: number;
}

export interface UsageLog {
  id?: number;
  telegram_user_id?: number;
  username?: string;
  query_text: string;
  matched_cuce?: string;
  response_time_ms: number;
  queried_at?: string;
}

interface NeonSqlResponse<T = Record<string, unknown>> {
  rows?: T[];
  rowCount?: number;
}

/**
 * Ejecuta una sentencia SQL parametrizada contra Neon Serverless PostgreSQL (/sql)
 */
export async function neonQuery<T = Record<string, unknown>>(
  query: string,
  params: unknown[] = []
): Promise<T[]> {
  const { neonDatabaseUrl } = getAppConfig();
  if (!neonDatabaseUrl) {
    throw new Error('NEON_DB no está configurada en .env');
  }

  const parsed = new URL(neonDatabaseUrl);
  const res = await fetch(`https://${parsed.hostname}/sql`, {
    method: 'POST',
    signal: AbortSignal.timeout(15000),
    headers: {
      'Content-Type': 'application/json',
      'Neon-Connection-String': neonDatabaseUrl,
    },
    body: JSON.stringify({ query, params }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Neon SQL HTTP ${res.status}: ${errText}`);
  }

  const data = (await res.json()) as NeonSqlResponse<T>;
  return data.rows || [];
}

function mapConvocatoriaRow(row: Record<string, unknown>): Convocatoria {
  return {
    cuce: String(row.cuce ?? ''),
    entidad: String(row.entidad ?? ''),
    tipo_entidad: String(row.tipo_entidad ?? 'Entidad Estatal'),
    tipo_contratacion: row.tipo_contratacion != null ? String(row.tipo_contratacion) : null,
    objeto: String(row.objeto ?? ''),
    modalidad: String(row.modalidad ?? ''),
    subasta: Boolean(row.subasta),
    departamento: String(row.departamento ?? 'La Paz'),
    monto_referencial_bs:
      row.monto_referencial_bs != null ? Number(row.monto_referencial_bs) : null,
    monto_adjudicado_bs:
      row.monto_adjudicado_bs != null ? Number(row.monto_adjudicado_bs) : null,
    fecha_publicacion: row.fecha_publicacion ? String(row.fecha_publicacion) : new Date().toISOString(),
    fecha_presentacion: row.fecha_presentacion ? String(row.fecha_presentacion) : null,
    fecha_adjudicacion: row.fecha_adjudicacion ? String(row.fecha_adjudicacion) : null,
    estado: String(row.estado ?? 'VIGENTE'),
    adjudicatario: row.adjudicatario != null ? String(row.adjudicatario) : null,
    formularios: row.formularios != null ? String(row.formularios) : null,
    contacto: row.contacto != null ? String(row.contacto) : null,
    normativa: row.normativa != null ? String(row.normativa) : null,
    pliego_url: String(row.pliego_url ?? 'https://www.sicoes.gob.bo'),
    formulario_500_url: row.formulario_500_url != null ? String(row.formulario_500_url) : null,
    similitud_semantica:
      row.similitud_semantica != null ? Number(Number(row.similitud_semantica).toFixed(4)) : undefined,
  };
}

/**
 * Consulta de convocatorias reales en Neon PostgreSQL con filtros
 */
export async function getConvocatorias(filters: {
  estado?: string;
  estados?: string[];
  tipoContratacion?: string;
  entidad?: string;
  departamento?: string;
  limit?: number;
} = {}): Promise<Convocatoria[]> {
  try {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (filters.estados && filters.estados.length > 0) {
      params.push(filters.estados);
      conditions.push(`estado = ANY($${params.length}::text[])`);
    } else if (filters.estado && filters.estado !== 'TODOS') {
      params.push(filters.estado);
      conditions.push(`estado = $${params.length}`);
    }

    if (filters.tipoContratacion) {
      params.push(`%${filters.tipoContratacion}%`);
      conditions.push(`(tipo_contratacion ILIKE $${params.length} OR objeto ILIKE $${params.length})`);
    }

    if (filters.entidad) {
      params.push(`%${filters.entidad}%`);
      conditions.push(`entidad ILIKE $${params.length}`);
    }

    if (filters.departamento && filters.departamento !== 'TODOS' && filters.departamento !== 'ALL') {
      params.push(`%${filters.departamento}%`);
      conditions.push(`departamento ILIKE $${params.length}`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limitVal = Math.min(Math.max(Number(filters.limit || 25), 1), 100);
    params.push(limitVal);

    const rows = await neonQuery(
      `SELECT cuce, entidad, tipo_entidad, tipo_contratacion, objeto, modalidad, subasta,
              departamento, monto_referencial_bs, monto_adjudicado_bs,
              fecha_publicacion, fecha_presentacion, fecha_adjudicacion,
              estado, adjudicatario, formularios, contacto, normativa,
              pliego_url, formulario_500_url
       FROM sicoes_convocatorias
       ${whereClause}
       ORDER BY fecha_publicacion DESC, updated_at DESC
       LIMIT $${params.length}`,
      params
    );

    return rows.map(mapConvocatoriaRow);
  } catch (err) {
    console.warn('[DB] No se pudo consultar getConvocatorias en Neon:', err);
    return [];
  }
}

/**
 * Búsqueda por CUCE exacto en Neon PostgreSQL
 */
export async function getConvocatoriaByCuce(cuce: string): Promise<Convocatoria | null> {
  try {
    const rows = await neonQuery(
      `SELECT cuce, entidad, tipo_entidad, tipo_contratacion, objeto, modalidad, subasta,
              departamento, monto_referencial_bs, monto_adjudicado_bs,
              fecha_publicacion, fecha_presentacion, fecha_adjudicacion,
              estado, adjudicatario, formularios, contacto, normativa,
              pliego_url, formulario_500_url
       FROM sicoes_convocatorias
       WHERE cuce = $1
       LIMIT 1`,
      [cuce]
    );
    return rows[0] ? mapConvocatoriaRow(rows[0]) : null;
  } catch (err) {
    console.warn('[DB] No se pudo consultar getConvocatoriaByCuce en Neon:', err);
    return null;
  }
}

/**
 * Búsqueda Híbrida con pgvector (Similitud Coseno <=>) + Prestigio PageRank de la Entidad
 * Score = SimilitudCoseno * 0.7 + PageRank * 0.3
 */
export async function hybridSearch(
  queryText: string,
  queryVector?: number[],
  options: { maxPrice?: number; estado?: string; departamento?: string; limit?: number } = {}
): Promise<Convocatoria[]> {
  try {
    const vec = queryVector && queryVector.length === 1024 ? queryVector : await generateEmbedding(queryText);
    const vecLiteral = `[${vec.join(',')}]`;

    const params: unknown[] = [vecLiteral];
    const conditions = ['embedding IS NOT NULL'];

    if (options.estado && options.estado !== 'TODOS') {
      params.push(options.estado);
      conditions.push(`estado = $${params.length}`);
    }

    if (options.departamento && options.departamento !== 'TODOS' && options.departamento !== 'ALL') {
      params.push(`%${options.departamento}%`);
      conditions.push(`departamento ILIKE $${params.length}`);
    }

    if (options.maxPrice) {
      params.push(options.maxPrice);
      conditions.push(`(monto_referencial_bs IS NULL OR monto_referencial_bs <= $${params.length})`);
    }

    const fetchLimit = Math.min(Math.max(Number(options.limit || 10) * 3, 15), 60);
    params.push(fetchLimit);

    const rows = await neonQuery(
      `SELECT cuce, entidad, tipo_entidad, tipo_contratacion, objeto, modalidad, subasta,
              departamento, monto_referencial_bs, monto_adjudicado_bs,
              fecha_publicacion, fecha_presentacion, fecha_adjudicacion,
              estado, adjudicatario, formularios, contacto, normativa,
              pliego_url, formulario_500_url,
              (1 - (embedding <=> $1::vector))::float AS similitud_semantica
       FROM sicoes_convocatorias
       WHERE ${conditions.join(' AND ')}
       ORDER BY embedding <=> $1::vector ASC
       LIMIT $${params.length}`,
      params
    );

    const edges = await getGraphEdges();
    const graphResult = computeGraphMining(edges);
    const prMap = new Map<string, number>();
    graphResult.nodes.forEach((n) => prMap.set(n.id, n.pageRank));

    const mapped = rows.map((row) => {
      const item = mapConvocatoriaRow(row);
      const sim = item.similitud_semantica ?? 0;
      const pr = prMap.get(item.entidad) || 0.02;
      const score = Number((sim * 0.7 + pr * 0.3).toFixed(4));
      return {
        ...item,
        similitud_semantica: sim,
        pagerank_entidad: pr,
        score_hibrido: score,
      };
    });

    mapped.sort((a, b) => (b.score_hibrido || 0) - (a.score_hibrido || 0));
    return mapped.slice(0, options.limit || 10);
  } catch (err) {
    console.warn('[DB] No se pudo ejecutar hybridSearch en Neon:', err);
    return [];
  }
}

/**
 * Inserta o actualiza una convocatoria real en Neon PostgreSQL
 */
export async function upsertConvocatoria(item: Convocatoria, embedding?: number[]): Promise<void> {
  const vecLiteral = embedding && embedding.length === 1024 ? `[${embedding.join(',')}]` : null;
  await neonQuery(
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
      objeto = EXCLUDED.objeto,
      estado = EXCLUDED.estado,
      updated_at = CURRENT_TIMESTAMP`,
    [
      item.cuce,
      item.entidad,
      item.tipo_entidad,
      item.tipo_contratacion ?? null,
      item.objeto,
      item.modalidad,
      item.subasta,
      item.departamento,
      item.monto_referencial_bs,
      item.monto_adjudicado_bs,
      item.fecha_publicacion,
      item.fecha_presentacion,
      item.fecha_adjudicacion,
      item.estado,
      item.adjudicatario,
      item.formularios ?? null,
      item.contacto ?? null,
      item.normativa ?? null,
      item.pliego_url,
      item.formulario_500_url,
      vecLiteral,
    ]
  );
}

/**
 * Obtener aristas reales del grafo desde Neon PostgreSQL
 */
export async function getGraphEdges(): Promise<GraphEdge[]> {
  try {
    const rows = await neonQuery<{ source: string; target: string; weight: number }>(
      `SELECT source_node AS source, target_node AS target, weight::float AS weight
       FROM sicoes_graph_edges`
    );
    return rows.map((r) => ({
      source: String(r.source),
      target: String(r.target),
      weight: Number(r.weight || 1),
    }));
  } catch (err) {
    console.warn('[DB] No se pudo consultar getGraphEdges en Neon:', err);
    return [];
  }
}

/**
 * Guardar nueva arista real en Neon PostgreSQL
 */
export async function addGraphEdge(edge: GraphEdge): Promise<void> {
  await neonQuery(
    `INSERT INTO sicoes_graph_edges (source_node, target_node, edge_type, weight)
     VALUES ($1, $2, 'CONVOCA_RUBRO', $3)
     ON CONFLICT (source_node, target_node, edge_type) DO NOTHING`,
    [edge.source, edge.target, edge.weight ?? 1.0]
  );
}

/**
 * Guardar registro de uso de Telegram / Web (Web Usage Mining)
 */
export async function logUsage(log: Omit<UsageLog, 'id' | 'queried_at'>): Promise<void> {
  try {
    await neonQuery(
      `INSERT INTO sicoes_usage_logs (telegram_user_id, username, query_text, matched_cuce, response_time_ms)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        log.telegram_user_id ?? null,
        log.username ?? null,
        log.query_text,
        log.matched_cuce ?? null,
        Math.round(log.response_time_ms || 0),
      ]
    );
  } catch (err) {
    console.warn('[DB] No se pudo registrar logUsage en Neon:', err);
  }
}

/**
 * Obtener logs reales de uso para el Dashboard
 */
export async function getUsageLogs(limit = 20): Promise<UsageLog[]> {
  try {
    const rows = await neonQuery<{
      id: number;
      telegram_user_id: string | null;
      username: string | null;
      query_text: string;
      matched_cuce: string | null;
      response_time_ms: number;
      queried_at: string;
    }>(
      `SELECT id, telegram_user_id, username, query_text, matched_cuce, response_time_ms, queried_at
       FROM sicoes_usage_logs
       ORDER BY queried_at DESC
       LIMIT $1`,
      [limit]
    );

    return rows.map((r) => ({
      id: Number(r.id),
      telegram_user_id: r.telegram_user_id != null ? Number(r.telegram_user_id) : undefined,
      username: r.username ?? undefined,
      query_text: String(r.query_text),
      matched_cuce: r.matched_cuce ?? undefined,
      response_time_ms: Number(r.response_time_ms || 0),
      queried_at: String(r.queried_at),
    }));
  } catch (err) {
    console.warn('[DB] No se pudo consultar getUsageLogs en Neon:', err);
    return [];
  }
}

/**
 * Métricas consolidadas en vivo desde Neon PostgreSQL para el Dashboard
 */
export async function getDashboardMetrics() {
  try {
    const [convSummary] = await neonQuery<{
      total: number;
      vigentes: number;
      adjudicadas: number;
      contratadas: number;
      desiertas: number;
      monto_total: string;
      monto_adjudicado: string;
    }>(
      `SELECT
         COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE estado = 'VIGENTE')::int AS vigentes,
         COUNT(*) FILTER (WHERE estado = 'ADJUDICADA')::int AS adjudicadas,
         COUNT(*) FILTER (WHERE estado = 'CONTRATADA')::int AS contratadas,
         COUNT(*) FILTER (WHERE estado = 'DESIERTA')::int AS desiertas,
         COALESCE(SUM(monto_referencial_bs), 0)::text AS monto_total,
         COALESCE(SUM(monto_adjudicado_bs), 0)::text AS monto_adjudicado
       FROM sicoes_convocatorias`
    );

    const [usageSummary] = await neonQuery<{ total: number }>(
      `SELECT COUNT(*)::int AS total FROM sicoes_usage_logs`
    );

    const edges = await getGraphEdges();
    const graphAnalysis = computeGraphMining(edges);

    return {
      totalConvocatorias: convSummary?.total ?? 0,
      vigentes: convSummary?.vigentes ?? 0,
      adjudicadas: convSummary?.adjudicadas ?? 0,
      contratadas: convSummary?.contratadas ?? 0,
      desiertas: convSummary?.desiertas ?? 0,
      montoTotalLicitado: Number(convSummary?.monto_total ?? 0),
      montoAdjudicado: Number(convSummary?.monto_adjudicado ?? 0),
      totalConsultasTelegram: usageSummary?.total ?? 0,
      graphDensity: graphAnalysis.density,
      totalNodosGrafo: graphAnalysis.totalNodes,
      totalAristasGrafo: graphAnalysis.totalEdges,
      topPageRank: graphAnalysis.topPageRank,
      topHubs: graphAnalysis.topHubs,
      topAuthorities: graphAnalysis.topAuthorities,
    };
  } catch (err) {
    console.warn('[DB] No se pudo consultar getDashboardMetrics en Neon:', err);
    return {
      totalConvocatorias: 0,
      vigentes: 0,
      adjudicadas: 0,
      contratadas: 0,
      desiertas: 0,
      montoTotalLicitado: 0,
      montoAdjudicado: 0,
      totalConsultasTelegram: 0,
      graphDensity: 0,
      totalNodosGrafo: 0,
      totalAristasGrafo: 0,
      topPageRank: [],
      topHubs: [],
      topAuthorities: [],
    };
  }
}
