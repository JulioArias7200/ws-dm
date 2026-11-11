/**
 * ==============================================================================
 * MÓDULO DE MINERÍA DE ESTRUCTURA WEB (CAPÍTULO 5: TEORÍA DE GRAFOS)
 * Implementación pura en TypeScript de PageRank y Algoritmo HITS de Kleinberg
 * ==============================================================================
 */

export interface GraphEdge {
  source: string;
  target: string;
  weight?: number;
}

export interface NodeMetrics {
  id: string;
  label: string;
  type: 'Entidad' | 'Rubro' | 'Proveedor';
  inDegree: number;
  outDegree: number;
  pageRank: number;
  hubScore: number;
  authorityScore: number;
}

export interface GraphAnalysisResult {
  nodes: NodeMetrics[];
  edges: GraphEdge[];
  density: number;
  totalNodes: number;
  totalEdges: number;
  topPageRank: NodeMetrics[];
  topHubs: NodeMetrics[];
  topAuthorities: NodeMetrics[];
}

/**
 * Calcula PageRank, HITS y Centralidad de Grado sobre una lista de aristas
 * @param edges Lista de aristas dirigidas (origen -> destino)
 * @param dampingFactor Factor de amortiguamiento (estándar d = 0.85 de Brin y Page)
 * @param maxIterations Límite de iteraciones de convergencia
 * @param tolerance Tolerancia de cambio mínimo
 */
export function computeGraphMining(
  edges: GraphEdge[],
  dampingFactor = 0.85,
  maxIterations = 100,
  tolerance = 1e-6
): GraphAnalysisResult {
  // 1. Extraer nodos únicos
  const nodeSet = new Set<string>();
  for (const e of edges) {
    nodeSet.add(e.source);
    nodeSet.add(e.target);
  }

  const nodeIds = Array.from(nodeSet);
  const N = nodeIds.length;

  if (N === 0) {
    return {
      nodes: [],
      edges: [],
      density: 0,
      totalNodes: 0,
      totalEdges: 0,
      topPageRank: [],
      topHubs: [],
      topAuthorities: [],
    };
  }

  const nodeIndexMap = new Map<string, number>();
  nodeIds.forEach((id, idx) => nodeIndexMap.set(id, idx));

  // 2. Estructuras de adyacencia
  const outgoing = Array.from({ length: N }, () => [] as number[]);
  const incoming = Array.from({ length: N }, () => [] as number[]);
  const outDegree = new Array(N).fill(0);
  const inDegree = new Array(N).fill(0);

  for (const e of edges) {
    const u = nodeIndexMap.get(e.source)!;
    const v = nodeIndexMap.get(e.target)!;
    outgoing[u].push(v);
    incoming[v].push(u);
    outDegree[u]++;
    inDegree[v]++;
  }

  // 3. Algoritmo PageRank (Power Iteration con Damping Factor)
  let pr = new Array(N).fill(1 / N);
  const teleport = (1 - dampingFactor) / N;

  for (let iter = 0; iter < maxIterations; iter++) {
    const nextPr = new Array(N).fill(teleport);

    // Sumideros (nodos sin enlaces salientes distribuyen equitativamente)
    let sinkPrSum = 0;
    for (let i = 0; i < N; i++) {
      if (outDegree[i] === 0) {
        sinkPrSum += pr[i];
      }
    }
    const sinkContribution = (dampingFactor * sinkPrSum) / N;

    for (let j = 0; j < N; j++) {
      nextPr[j] += sinkContribution;
      for (const u of incoming[j]) {
        nextPr[j] += (dampingFactor * pr[u]) / outDegree[u];
      }
    }

    // Verificar convergencia
    let diff = 0;
    for (let i = 0; i < N; i++) {
      diff += Math.abs(nextPr[i] - pr[i]);
    }
    pr = nextPr;

    if (diff < tolerance) {
      break;
    }
  }

  // 4. Algoritmo HITS de Kleinberg (Hubs & Authorities con normalización L2)
  let authority = new Array(N).fill(1.0);
  let hub = new Array(N).fill(1.0);

  for (let iter = 0; iter < maxIterations; iter++) {
    const nextAuth = new Array(N).fill(0);
    const nextHub = new Array(N).fill(0);

    // Actualización de Autoridades: a_p = sum(h_q) para todo q -> p
    for (let p = 0; p < N; p++) {
      for (const q of incoming[p]) {
        nextAuth[p] += hub[q];
      }
    }

    // Normalización L2 de Autoridades
    const authNorm = Math.sqrt(nextAuth.reduce((sum, v) => sum + v * v, 0)) || 1.0;
    for (let p = 0; p < N; p++) {
      nextAuth[p] /= authNorm;
    }

    // Actualización de Hubs: h_p = sum(a_q) para todo p -> q
    for (let p = 0; p < N; p++) {
      for (const q of outgoing[p]) {
        nextHub[p] += nextAuth[q];
      }
    }

    // Normalización L2 de Hubs
    const hubNorm = Math.sqrt(nextHub.reduce((sum, v) => sum + v * v, 0)) || 1.0;
    for (let p = 0; p < N; p++) {
      nextHub[p] /= hubNorm;
    }

    // Comprobar cambio relativo
    let maxChange = 0;
    for (let i = 0; i < N; i++) {
      maxChange = Math.max(maxChange, Math.abs(nextAuth[i] - authority[i]), Math.abs(nextHub[i] - hub[i]));
    }

    authority = nextAuth;
    hub = nextHub;

    if (maxChange < tolerance) {
      break;
    }
  }

  // 5. Construcción de métricas por nodo
  const nodes: NodeMetrics[] = nodeIds.map((id, idx) => {
    // Clasificación heurística según la topología
    const isInstitution = outDegree[idx] > inDegree[idx] || id.toLowerCase().includes('ministerio') || id.toLowerCase().includes('gamlp') || id.toLowerCase().includes('umsa');
    return {
      id,
      label: id,
      type: isInstitution ? 'Entidad' : 'Rubro',
      inDegree: inDegree[idx],
      outDegree: outDegree[idx],
      pageRank: Number(pr[idx].toFixed(5)),
      hubScore: Number(hub[idx].toFixed(4)),
      authorityScore: Number(authority[idx].toFixed(4)),
    };
  });

  // Densidad de la red dirigida: E / (N * (N - 1))
  const maxPossibleEdges = N > 1 ? N * (N - 1) : 1;
  const density = Number((edges.length / maxPossibleEdges).toFixed(4));

  const sortedPR = [...nodes].sort((a, b) => b.pageRank - a.pageRank);
  const sortedHubs = [...nodes].sort((a, b) => b.hubScore - a.hubScore);
  const sortedAuth = [...nodes].sort((a, b) => b.authorityScore - a.authorityScore);

  return {
    nodes,
    edges,
    density,
    totalNodes: N,
    totalEdges: edges.length,
    topPageRank: sortedPR.slice(0, 10),
    topHubs: sortedHubs.slice(0, 10),
    topAuthorities: sortedAuth.slice(0, 10),
  };
}

/**
 * Aristas semilla oficiales de contrataciones en La Paz para arranque inmediato
 */
export const SEED_GRAPH_EDGES: GraphEdge[] = [
  { source: 'Ministerio de Planificación del Desarrollo', target: 'Auditoría Forense & Ciberseguridad' },
  { source: 'Gobierno Autónomo Municipal de La Paz (GAMLP)', target: 'Fibra Óptica & Telecomunicaciones' },
  { source: 'Yacimientos Petrolíferos Fiscales Bolivianos (YPFB)', target: 'Desarrollo de Software' },
  { source: 'Universidad Mayor de San Andrés (UMSA)', target: 'Bases de Datos & DBA' },
  { source: 'Ministerio de Salud y Deportes', target: 'Infraestructura & Servidores' },
  { source: 'Gobierno Autónomo Municipal de La Paz (GAMLP)', target: 'Desarrollo de Software' },
  { source: 'Ministerio de Planificación del Desarrollo', target: 'Bases de Datos & DBA' },
  { source: 'Ministerio de Economía y Finanzas Públicas', target: 'Auditoría Forense & Ciberseguridad' },
  { source: 'Ministerio de Economía y Finanzas Públicas', target: 'Desarrollo de Software' },
  { source: 'Empresa Nacional de Telecomunicaciones (ENTEL)', target: 'Fibra Óptica & Telecomunicaciones' },
  { source: 'Empresa Nacional de Telecomunicaciones (ENTEL)', target: 'Infraestructura & Servidores' },
  { source: 'Universidad Mayor de San Andrés (UMSA)', target: 'Desarrollo de Software' },
];

