'use client';

import { useState, useEffect } from 'react';
import { NodeMetrics, GraphEdge } from '@/lib/graph-mining';

export default function GrafoPage() {
  const [nodes, setNodes] = useState<NodeMetrics[]>([]);
  const [edges, setEdges] = useState<GraphEdge[]>([]);
  const [density, setDensity] = useState(0);
  const [topPageRank, setTopPageRank] = useState<NodeMetrics[]>([]);
  const [topHubs, setTopHubs] = useState<NodeMetrics[]>([]);
  const [topAuthorities, setTopAuthorities] = useState<NodeMetrics[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadGraphData() {
      try {
        const res = await fetch('/api/graph');
        const data = await res.json();
        if (data.success && data.data) {
          setNodes(data.data.nodes);
          setEdges(data.data.edges);
          setDensity(data.data.density);
          setTopPageRank(data.data.topPageRank);
          setTopHubs(data.data.topHubs);
          setTopAuthorities(data.data.topAuthorities);
        }
      } catch (err) {
        console.error('Error cargando grafo:', err);
      } finally {
        setLoading(false);
      }
    }
    loadGraphData();
  }, []);

  return (
    <div className="flex flex-col gap-6 max-w-7xl mx-auto">
      {/* Sub-header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#e0e2eb]">
        <div className="flex flex-col">
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded bg-[#e6e8f1] text-[#005cb8] text-[11px] font-mono font-bold uppercase tracking-wider">
              GRAPH-MINING // ALGORITHMS: HITS & PAGERANK (NODE.JS)
            </span>
          </div>
          <h1 className="text-2xl font-bold text-[#181c22] tracking-tight mt-1">
            Topología de la Red de Contrataciones Estatales - La Paz
          </h1>
          <p className="text-[14px] text-[#414753]">
            Modelado algorítmico en TypeScript de PageRank estocástico (d=0.85) y Kleinberg HITS sobre la red bipartita de entidades y rubros.
          </p>
        </div>

        <div className="flex items-center gap-3 bg-white p-2 rounded-xl border border-[#e0e2eb] shadow-sm">
          <div className="px-3 py-1 bg-[#f1f3fc] rounded-lg text-right">
            <div className="text-[10px] font-mono text-[#717785] uppercase">Densidad Red</div>
            <div className="text-[14px] font-mono font-bold text-[#005cb8]">{density} Δ</div>
          </div>
          <div className="px-3 py-1 bg-[#f1f3fc] rounded-lg text-right">
            <div className="text-[10px] font-mono text-[#717785] uppercase">Nodos</div>
            <div className="text-[14px] font-mono font-bold text-[#181c22]">{nodes.length}</div>
          </div>
        </div>
      </div>

      {/* Visualización Visual de la Red (SVG Topology Graph) */}
      <div className="bg-white rounded-2xl border border-[#e0e2eb] p-6 shadow-sm flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[#005cb8]">hub</span>
            <h2 className="text-[16px] font-bold text-[#181c22]">
              Mapa Visual de Interconexión Bipartita
            </h2>
          </div>
          <div className="flex items-center gap-4 text-[12px]">
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-[#005cb8]"></span>
              <span>Entidad Estatal (Convocante)</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-amber-500"></span>
              <span>Rubro Técnico (Área de Servicio)</span>
            </span>
          </div>
        </div>

        {/* Canvas de red estilizado */}
        <div className="relative w-full h-80 bg-[#f8fafd] rounded-xl border border-[#e6eaf2] overflow-hidden flex items-center justify-center p-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 w-full max-h-72 overflow-y-auto">
            {nodes.map((n) => (
              <div
                key={n.id}
                className={`p-3 rounded-xl border transition-all flex flex-col justify-between ${
                  n.type === 'Entidad'
                    ? 'bg-blue-50/70 border-blue-200 text-blue-950'
                    : 'bg-amber-50/70 border-amber-200 text-amber-950'
                }`}
              >
                <div className="text-[11px] font-bold truncate">{n.label}</div>
                <div className="flex items-center justify-between mt-2 pt-1 border-t border-black/5 text-[10px] font-mono">
                  <span>PR: {n.pageRank}</span>
                  <span>Auth: {n.authorityScore}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Tablas Comparativas: PageRank vs HITS */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Tabla 1: Ranking PageRank */}
        <div className="bg-white rounded-xl border border-[#e0e2eb] shadow-sm p-5 flex flex-col gap-3">
          <div className="flex items-center gap-2 pb-2 border-b border-[#f1f3fc]">
            <span className="material-symbols-outlined text-[#005cb8]">stars</span>
            <h3 className="text-[15px] font-bold text-[#181c22]">
              Top Entidades por PageRank (Prestigio Estructural)
            </h3>
          </div>
          <div className="flex flex-col divide-y divide-[#f1f3fc]">
            {topPageRank.slice(0, 6).map((node, i) => (
              <div key={node.id} className="py-2.5 flex items-center justify-between text-[13px]">
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-gray-100 flex items-center justify-center text-[10px] font-mono font-bold text-[#717785]">
                    {i + 1}
                  </span>
                  <span className="font-medium text-[#181c22] line-clamp-1">{node.label}</span>
                </div>
                <span className="font-mono font-bold text-[#005cb8] text-[12px] bg-blue-50 px-2 py-0.5 rounded">
                  {node.pageRank}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Tabla 2: Algoritmo HITS (Hubs & Authorities) */}
        <div className="bg-white rounded-xl border border-[#e0e2eb] shadow-sm p-5 flex flex-col gap-3">
          <div className="flex items-center gap-2 pb-2 border-b border-[#f1f3fc]">
            <span className="material-symbols-outlined text-amber-600">swap_horiz</span>
            <h3 className="text-[15px] font-bold text-[#181c22]">
              Algoritmo HITS (Hubs vs Authorities)
            </h3>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-[11px] font-mono text-purple-700 uppercase font-bold mb-2">
                Top Hubs (Contratadores)
              </div>
              <div className="flex flex-col gap-1.5">
                {topHubs.slice(0, 4).map((h) => (
                  <div key={h.id} className="bg-purple-50 p-2 rounded-lg text-[11px]">
                    <div className="font-bold text-purple-900 truncate">{h.label}</div>
                    <div className="font-mono text-purple-700">Hub: {h.hubScore}</div>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <div className="text-[11px] font-mono text-amber-700 uppercase font-bold mb-2">
                Top Authorities (Rubros)
              </div>
              <div className="flex flex-col gap-1.5">
                {topAuthorities.slice(0, 4).map((a) => (
                  <div key={a.id} className="bg-amber-50 p-2 rounded-lg text-[11px]">
                    <div className="font-bold text-amber-900 truncate">{a.label}</div>
                    <div className="font-mono text-amber-700">Auth: {a.authorityScore}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

