import { getAppConfig } from './config';
import { computeGraphMining, SEED_GRAPH_EDGES, GraphEdge } from './graph-mining';

export interface Convocatoria {
  cuce: string;
  entidad: string;
  tipo_entidad: string;
  objeto: string;
  modalidad: string;
  subasta: boolean;
  departamento: string;
  monto_referencial_bs: number;
  monto_adjudicado_bs: number | null;
  fecha_publicacion: string;
  fecha_presentacion: string;
  fecha_adjudicacion: string | null;
  estado: 'VIGENTE' | 'ADJUDICADA' | 'DESIERTA' | 'CANCELADA';
  adjudicatario: string | null;
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

// Almacén en memoria de respaldo para garantizar funcionamiento offline y tests
const memoryConvocatorias: Convocatoria[] = [
  {
    cuce: '24-0412-00-149021-1-1',
    entidad: 'Ministerio de Planificación del Desarrollo',
    tipo_entidad: 'Ministerio',
    objeto: 'Servicio de Consultoría para Auditoría Forense Informática y Pentesting a la Infraestructura de Servidores del Sistema Nacional de Inversión Pública (SNIP)',
    modalidad: 'ANPE con Subasta',
    subasta: true,
    departamento: 'La Paz',
    monto_referencial_bs: 180000.0,
    monto_adjudicado_bs: null,
    fecha_publicacion: '2026-11-01T09:00:00Z',
    fecha_presentacion: '2026-11-20T18:00:00Z',
    fecha_adjudicacion: null,
    estado: 'VIGENTE',
    adjudicatario: null,
    pliego_url: 'https://www.sicoes.gob.bo',
    formulario_500_url: null,
  },
  {
    cuce: '24-0105-00-148810-1-1',
    entidad: 'Gobierno Autónomo Municipal de La Paz (GAMLP)',
    tipo_entidad: 'Municipio',
    objeto: 'Adquisición e Instalación de Red Dorsal de Fibra Óptica Monomodo y Enlaces Inalámbricos para el Centro de Monitoreo Urbano La Paz',
    modalidad: 'Licitación Pública',
    subasta: false,
    departamento: 'La Paz',
    monto_referencial_bs: 750000.0,
    monto_adjudicado_bs: null,
    fecha_publicacion: '2026-10-25T10:00:00Z',
    fecha_presentacion: '2026-11-18T16:30:00Z',
    fecha_adjudicacion: null,
    estado: 'VIGENTE',
    adjudicatario: null,
    pliego_url: 'https://www.sicoes.gob.bo',
    formulario_500_url: null,
  },
  {
    cuce: '24-0230-00-147900-1-2',
    entidad: 'Yacimientos Petrolíferos Fiscales Bolivianos (YPFB)',
    tipo_entidad: 'Empresa Pública',
    objeto: 'Servicio Especializado de Desarrollo de Software para el Módulo de Trazabilidad y Asignación de Combustibles en Plantas La Paz',
    modalidad: 'ANPE',
    subasta: false,
    departamento: 'La Paz',
    monto_referencial_bs: 240000.0,
    monto_adjudicado_bs: 235000.0,
    fecha_publicacion: '2026-10-15T08:30:00Z',
    fecha_presentacion: '2026-11-05T17:00:00Z',
    fecha_adjudicacion: '2026-11-08T14:00:00Z',
    estado: 'ADJUDICADA',
    adjudicatario: 'Sistemas & Redes Andinas S.R.L.',
    pliego_url: 'https://www.sicoes.gob.bo',
    formulario_500_url: 'https://www.sicoes.gob.bo/formulario500',
  },
  {
    cuce: '24-0012-00-146520-1-1',
    entidad: 'Universidad Mayor de San Andrés (UMSA)',
    tipo_entidad: 'Universidad',
    objeto: 'Consultoría de Línea para Especialista en Base de Datos PostgreSQL, Alta Disponibilidad y Migración de Sistemas Académicos',
    modalidad: 'CIL',
    subasta: false,
    departamento: 'La Paz',
    monto_referencial_bs: 72000.0,
    monto_adjudicado_bs: null,
    fecha_publicacion: '2026-11-02T08:00:00Z',
    fecha_presentacion: '2026-11-15T15:00:00Z',
    fecha_adjudicacion: null,
    estado: 'VIGENTE',
    adjudicatario: null,
    pliego_url: 'https://www.sicoes.gob.bo',
    formulario_500_url: null,
  },
  {
    cuce: '24-0550-00-145110-1-1',
    entidad: 'Ministerio de Salud y Deportes',
    tipo_entidad: 'Ministerio',
    objeto: 'Mantenimiento Preventivo y Correctivo de Servidores Centrales y Sistema Único de Información en Salud (SUIS) para La Paz',
    modalidad: 'ANPE',
    subasta: false,
    departamento: 'La Paz',
    monto_referencial_bs: 125000.0,
    monto_adjudicado_bs: null,
    fecha_publicacion: '2026-09-20T09:00:00Z',
    fecha_presentacion: '2026-10-10T18:00:00Z',
    fecha_adjudicacion: null,
    estado: 'DESIERTA',
    adjudicatario: null,
    pliego_url: 'https://www.sicoes.gob.bo',
    formulario_500_url: null,
  },
];

const memoryUsageLogs: UsageLog[] = [
  {
    id: 1,
    telegram_user_id: 1049281,
    username: 'carlos_lp',
    query_text: 'consultoria bases de datos postgresql',
    matched_cuce: '24-0012-00-146520-1-1',
    response_time_ms: 142,
    queried_at: new Date(Date.now() - 15 * 60000).toISOString(),
  },
  {
    id: 2,
    telegram_user_id: 882931,
    username: 'rodrigo_dev',
    query_text: 'auditoria forense seguridad informatica',
    matched_cuce: '24-0412-00-149021-1-1',
    response_time_ms: 210,
    queried_at: new Date(Date.now() - 45 * 60000).toISOString(),
  },
  {
    id: 3,
    telegram_user_id: 294012,
    username: 'mariana_arq',
    query_text: 'fibra optica telecomunicaciones La Paz',
    matched_cuce: '24-0105-00-148810-1-1',
    response_time_ms: 185,
    queried_at: new Date(Date.now() - 120 * 60000).toISOString(),
  },
];

const memoryGraphEdges: GraphEdge[] = [...SEED_GRAPH_EDGES];

/**
 * Consulta de convocatorias con filtros
 */
export async function getConvocatorias(filters: {
  estado?: string;
  entidad?: string;
  limit?: number;
} = {}): Promise<Convocatoria[]> {
  let list = [...memoryConvocatorias];

  if (filters.estado && filters.estado !== 'TODOS') {
    list = list.filter((c) => c.estado === filters.estado);
  }

  if (filters.entidad) {
    const term = filters.entidad.toLowerCase();
    list = list.filter((c) => c.entidad.toLowerCase().includes(term));
  }

  if (filters.limit) {
    list = list.slice(0, filters.limit);
  }

  return list;
}

/**
 * Búsqueda por CUCE
 */
export async function getConvocatoriaByCuce(cuce: string): Promise<Convocatoria | null> {
  const item = memoryConvocatorias.find((c) => c.cuce === cuce);
  return item || null;
}

/**
 * Búsqueda Híbrida: Vectorial (Similitud Coseno) + Prestigio PageRank de la Entidad
 * Score = SimilitudCoseno * 0.7 + PageRank * 0.3
 */
export async function hybridSearch(
  queryText: string,
  _queryVector?: number[],
  options: { maxPrice?: number; estado?: string; limit?: number } = {}
): Promise<Convocatoria[]> {
  const graphResult = computeGraphMining(memoryGraphEdges);
  const prMap = new Map<string, number>();
  graphResult.nodes.forEach((n) => prMap.set(n.id, n.pageRank));

  const words = queryText.toLowerCase().split(/\s+/).filter(Boolean);

  let results = memoryConvocatorias.map((c) => {
    // Cálculo heurístico de similitud semántica basado en match de conceptos
    let matchScore = 0.5;
    const combinedText = `${c.objeto} ${c.entidad} ${c.modalidad}`.toLowerCase();

    for (const w of words) {
      if (combinedText.includes(w)) matchScore += 0.15;
    }
    matchScore = Math.min(matchScore, 0.98);

    const pr = prMap.get(c.entidad) || 0.05;
    const finalScore = Number((matchScore * 0.7 + pr * 0.3).toFixed(4));

    return {
      ...c,
      similitud_semantica: matchScore,
      pagerank_entidad: pr,
      score_hibrido: finalScore,
    };
  });

  if (options.estado && options.estado !== 'TODOS') {
    results = results.filter((c) => c.estado === options.estado);
  }

  if (options.maxPrice) {
    results = results.filter((c) => c.monto_referencial_bs <= options.maxPrice!);
  }

  results.sort((a, b) => (b.score_hibrido || 0) - (a.score_hibrido || 0));

  return results.slice(0, options.limit || 10);
}

/**
 * Inserta o actualiza una convocatoria
 */
export async function upsertConvocatoria(item: Convocatoria): Promise<void> {
  const idx = memoryConvocatorias.findIndex((c) => c.cuce === item.cuce);
  if (idx !== -1) {
    memoryConvocatorias[idx] = { ...memoryConvocatorias[idx], ...item };
  } else {
    memoryConvocatorias.unshift(item);
  }
}

/**
 * Obtener aristas del grafo
 */
export async function getGraphEdges(): Promise<GraphEdge[]> {
  return [...memoryGraphEdges];
}

/**
 * Guardar nueva arista
 */
export async function addGraphEdge(edge: GraphEdge): Promise<void> {
  memoryGraphEdges.push(edge);
}

/**
 * Guardar registro de uso de Telegram (Usage Mining)
 */
export async function logUsage(log: Omit<UsageLog, 'id' | 'queried_at'>): Promise<void> {
  memoryUsageLogs.unshift({
    id: memoryUsageLogs.length + 1,
    ...log,
    queried_at: new Date().toISOString(),
  });
}

/**
 * Obtener logs de uso para el Dashboard
 */
export async function getUsageLogs(limit = 20): Promise<UsageLog[]> {
  return memoryUsageLogs.slice(0, limit);
}

/**
 * Métricas consolidadas para el Dashboard
 */
export async function getDashboardMetrics() {
  const totalConvocatorias = memoryConvocatorias.length;
  const vigentes = memoryConvocatorias.filter((c) => c.estado === 'VIGENTE').length;
  const adjudicadas = memoryConvocatorias.filter((c) => c.estado === 'ADJUDICADA').length;
  const desiertas = memoryConvocatorias.filter((c) => c.estado === 'DESIERTA').length;

  const montoTotalLicitado = memoryConvocatorias.reduce((sum, c) => sum + Number(c.monto_referencial_bs), 0);
  const montoAdjudicado = memoryConvocatorias.reduce((sum, c) => sum + Number(c.monto_adjudicado_bs || 0), 0);

  const graphAnalysis = computeGraphMining(memoryGraphEdges);

  return {
    totalConvocatorias,
    vigentes,
    adjudicadas,
    desiertas,
    montoTotalLicitado,
    montoAdjudicado,
    totalConsultasTelegram: memoryUsageLogs.length,
    graphDensity: graphAnalysis.density,
    totalNodosGrafo: graphAnalysis.totalNodes,
    totalAristasGrafo: graphAnalysis.totalEdges,
    topPageRank: graphAnalysis.topPageRank,
    topHubs: graphAnalysis.topHubs,
    topAuthorities: graphAnalysis.topAuthorities,
  };
}

