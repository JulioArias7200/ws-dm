'use client';

import { useState, useEffect, useCallback } from 'react';

interface Convocatoria {
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
  similitud_semantica?: number;
  pagerank_entidad?: number;
  score_hibrido?: number;
}

export default function LicitacionesPage() {
  const [query, setQuery] = useState('');
  const [filterEstado, setFilterEstado] = useState('TODOS');
  const [items, setItems] = useState<Convocatoria[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedItem, setSelectedItem] = useState<Convocatoria | null>(null);

  const fetchLicitaciones = useCallback(async () => {
    setLoading(true);
    try {
      const url = `/api/search?q=${encodeURIComponent(query)}&estado=${encodeURIComponent(filterEstado)}`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.items) {
        setItems(data.items);
      }
    } catch (err) {
      console.error('Error fetching licitaciones:', err);
    } finally {
      setLoading(false);
    }
  }, [query, filterEstado]);

  useEffect(() => {
    fetchLicitaciones();
  }, [fetchLicitaciones]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchLicitaciones();
  };

  return (
    <div className="flex flex-col gap-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#e0e2eb]">
        <div className="flex flex-col">
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded bg-[#e6e8f1] text-[#005cb8] text-[11px] font-mono font-bold uppercase tracking-wider">
              PGVECTOR // BÚSQUEDA HÍBRIDA
            </span>
          </div>
          <h1 className="text-2xl font-bold text-[#181c22] tracking-tight mt-1">
            Licitaciones & Convocatorias Estatales (La Paz)
          </h1>
          <p className="text-[14px] text-[#414753]">
            Búsqueda semántica por conceptos, términos de referencia y perfiles profesionales ponderada por PageRank.
          </p>
        </div>
      </div>

      {/* Barra de Búsqueda Semántica */}
      <form onSubmit={handleSearchSubmit} className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 text-[20px]">
            search
          </span>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por perfil, rubro u objeto de contratación (ej. auditoría forense, fibra óptica)..."
            className="w-full pl-11 pr-4 py-3 bg-white border border-[#e0e2eb] rounded-xl text-[14px] text-[#181c22] placeholder-gray-400 focus:outline-none focus:border-[#005cb8] focus:ring-1 focus:ring-[#005cb8] shadow-sm transition-all"
          />
        </div>
        <button
          type="submit"
          className="bg-[#005cb8] text-white px-6 py-3 rounded-xl text-[14px] font-bold hover:bg-[#004b98] transition-colors shadow-sm flex items-center justify-center gap-2"
        >
          <span>Buscar</span>
        </button>
      </form>

      {/* Píldoras de Filtro por Estado */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {['TODOS', 'VIGENTE', 'ADJUDICADA', 'DESIERTA'].map((est) => (
          <button
            key={est}
            onClick={() => setFilterEstado(est)}
            className={`px-4 py-1.5 rounded-lg text-[13px] font-medium transition-all ${
              filterEstado === est
                ? 'bg-[#005cb8] text-white shadow-sm'
                : 'bg-white text-[#414753] border border-[#e0e2eb] hover:bg-gray-50'
            }`}
          >
            {est}
          </button>
        ))}
      </div>

      {/* Lista de Tarjetas de Convocatorias */}
      {loading ? (
        <div className="p-12 text-center text-[#717785]">
          <span className="material-symbols-outlined text-4xl animate-spin text-[#005cb8]">sync</span>
          <p className="mt-2 text-[14px]">Consultando índice vectorial de Neon PostgreSQL...</p>
        </div>
      ) : items.length === 0 ? (
        <div className="bg-white p-12 text-center rounded-xl border border-[#e0e2eb]">
          <span className="material-symbols-outlined text-5xl text-gray-300">search_off</span>
          <p className="text-[16px] font-bold text-[#181c22] mt-3">No se encontraron convocatorias</p>
          <p className="text-[13px] text-[#717785] mt-1">Intenta con otros términos o cambia el filtro de estado.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {items.map((item) => (
            <div
              key={item.cuce}
              onClick={() => setSelectedItem(item)}
              className="bg-white p-5 rounded-xl border border-[#e0e2eb] hover:border-[#005cb8] hover:shadow-md transition-all cursor-pointer flex flex-col justify-between group"
            >
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={`px-2.5 py-0.5 rounded text-[10px] font-bold font-mono tracking-wider uppercase ${
                      item.estado === 'VIGENTE'
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : item.estado === 'ADJUDICADA'
                        ? 'bg-blue-50 text-blue-700 border border-blue-200'
                        : 'bg-gray-100 text-gray-600'
                    }`}
                  >
                    {item.estado}
                  </span>
                  <span className="text-[11px] font-mono text-[#717785]">{item.modalidad}</span>
                </div>

                <div className="text-[11px] font-mono text-[#005cb8] font-semibold">{item.cuce}</div>
                <div className="text-[12px] font-bold text-[#414753] line-clamp-1">{item.entidad}</div>
                <h3 className="text-[14px] font-bold text-[#181c22] line-clamp-2 group-hover:text-[#005cb8] transition-colors">
                  {item.objeto}
                </h3>
              </div>

              <div className="mt-4 pt-3 border-t border-[#f1f3fc] flex items-center justify-between">
                <div>
                  <div className="text-[10px] text-[#717785] uppercase font-mono">Presupuesto</div>
                  <div className="text-[15px] font-bold text-[#181c22] font-mono">
                    Bs {Number(item.monto_referencial_bs).toLocaleString('es-BO')}
                  </div>
                </div>

                {item.similitud_semantica !== undefined && (
                  <div className="text-right">
                    <div className="text-[10px] text-[#717785] uppercase font-mono">Similitud Cos</div>
                    <div className="text-[13px] font-bold text-emerald-600 font-mono">
                      {(item.similitud_semantica * 100).toFixed(1)}%
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Drawer Lateral para ver Detalle por CUCE */}
      {selectedItem && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-xs transition-opacity animate-in fade-in">
          <div className="w-full max-w-xl bg-white h-full shadow-2xl flex flex-col justify-between p-6 overflow-y-auto">
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between pb-3 border-b border-[#e0e2eb]">
                <span
                  className={`px-3 py-1 rounded-full text-[11px] font-bold uppercase font-mono ${
                    selectedItem.estado === 'VIGENTE' ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-100 text-gray-800'
                  }`}
                >
                  {selectedItem.estado}
                </span>
                <button
                  onClick={() => setSelectedItem(null)}
                  className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-black transition-colors"
                >
                  <span className="material-symbols-outlined text-[20px]">close</span>
                </button>
              </div>

              <div>
                <span className="text-[12px] font-mono text-[#005cb8] font-bold">{selectedItem.cuce}</span>
                <h2 className="text-[18px] font-bold text-[#181c22] mt-1">{selectedItem.objeto}</h2>
                <p className="text-[13px] text-[#414753] mt-1">{selectedItem.entidad}</p>
              </div>

              <div className="grid grid-cols-2 gap-3 bg-[#f1f3fc] p-4 rounded-xl">
                <div>
                  <div className="text-[11px] font-mono text-[#717785] uppercase">Monto Referencial</div>
                  <div className="text-[16px] font-bold text-[#181c22] font-mono">
                    Bs {Number(selectedItem.monto_referencial_bs).toLocaleString('es-BO')}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] font-mono text-[#717785] uppercase">Modalidad</div>
                  <div className="text-[14px] font-medium text-[#181c22]">{selectedItem.modalidad}</div>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <div className="text-[12px] font-bold text-[#181c22]">Cronograma de Fechas Oficiales:</div>
                <div className="flex items-center justify-between p-3 rounded-lg border border-[#e0e2eb] text-[13px]">
                  <span className="text-[#414753]">Fecha Inicio (Publicación):</span>
                  <span className="font-mono font-medium">
                    {new Date(selectedItem.fecha_publicacion).toLocaleDateString('es-BO')}
                  </span>
                </div>
                <div className="flex items-center justify-between p-3 rounded-lg border border-[#e0e2eb] text-[13px] bg-amber-50/50">
                  <span className="text-amber-900 font-medium">Fecha Fin (Presentación Límite):</span>
                  <span className="font-mono font-bold text-amber-900">
                    {new Date(selectedItem.fecha_presentacion).toLocaleString('es-BO')}
                  </span>
                </div>
              </div>

              {selectedItem.adjudicatario && (
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <div className="text-[11px] font-mono text-blue-700 uppercase font-bold">Proveedor Adjudicado</div>
                  <div className="text-[14px] font-bold text-blue-900">{selectedItem.adjudicatario}</div>
                  <div className="text-[12px] text-blue-700 mt-1">
                    Monto Final: Bs {Number(selectedItem.monto_adjudicado_bs).toLocaleString('es-BO')}
                  </div>
                </div>
              )}
            </div>

            <div className="pt-4 border-t border-[#e0e2eb] flex gap-3">
              <a
                href={selectedItem.pliego_url}
                target="_blank"
                rel="noreferrer"
                className="flex-1 bg-[#005cb8] text-white py-3 rounded-xl text-center text-[14px] font-bold hover:bg-[#004b98] transition-colors"
              >
                Abrir Pliego en SICOES
              </a>
              <button
                onClick={() => setSelectedItem(null)}
                className="px-5 py-3 border border-[#e0e2eb] rounded-xl text-[14px] font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

