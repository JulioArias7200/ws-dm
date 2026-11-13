'use client';

import { useState, useEffect, useCallback } from 'react';

interface ComparativaCanasta {
  producto: string;
  categoria: string;
  unidad_medida: string;
  departamento: string;
  oap?: { precio_bs: number; fecha: string };
  hipermaxi?: { precio_bs: number; fecha: string };
  diferencia_bs?: number;
  diferencia_pct?: number;
  ahorroFuente?: 'OAP' | 'Hipermaxi' | 'Igual';
}

export default function CanastaPage() {
  const [query, setQuery] = useState('');
  const [categoria, setCategoria] = useState('TODAS');
  const [ciudad, setCiudad] = useState('TODAS');
  const [items, setItems] = useState<ComparativaCanasta[]>([]);
  const [loading, setLoading] = useState(false);
  const [categoriasList, setCategoriasList] = useState<string[]>([]);
  const [ciudadesList, setCiudadesList] = useState<string[]>([]);

  const fetchCanasta = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (query) params.set('q', query);
      if (categoria && categoria !== 'TODAS') params.set('categoria', categoria);
      if (ciudad && ciudad !== 'TODAS') params.set('ciudad', ciudad);
      params.set('limit', '40');

      const res = await fetch(`/api/canasta?${params.toString()}`);
      const data = await res.json();
      if (data.comparativas) {
        setItems(data.comparativas);
      }
      if (data.filtrosDisponibles) {
        if (data.filtrosDisponibles.categorias?.length) {
          setCategoriasList(data.filtrosDisponibles.categorias);
        }
        if (data.filtrosDisponibles.departamentos?.length) {
          setCiudadesList(data.filtrosDisponibles.departamentos);
        }
      }
    } catch (err) {
      console.error('Error cargando canasta:', err);
    } finally {
      setLoading(false);
    }
  }, [query, categoria, ciudad]);

  useEffect(() => {
    fetchCanasta();
  }, [fetchCanasta]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchCanasta();
  };

  const dualItemsCount = items.filter((i) => i.oap && i.hipermaxi).length;

  return (
    <div className="flex flex-col gap-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#e0e2eb]">
        <div className="flex flex-col">
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] font-mono font-bold uppercase tracking-wider">
              DUAL CHANNEL // OAP POPULAR VS HIPERMAXI
            </span>
          </div>
          <h1 className="text-2xl font-bold text-[#181c22] tracking-tight mt-1">
            Canasta Familiar: Monitor y Brecha de Precios
          </h1>
          <p className="text-[14px] text-[#414753]">
            Comparativa transparente entre mercados populares (OAP Min. Desarrollo Productivo) y cadenas de supermercados (Hipermaxi).
          </p>
        </div>

        <div className="flex items-center gap-3 bg-white p-2.5 rounded-xl border border-[#e0e2eb] shadow-sm">
          <div className="text-right">
            <div className="text-[10px] font-mono text-[#717785] uppercase">Productos Cotejados</div>
            <div className="text-[18px] font-mono font-bold text-[#005cb8]">{items.length}</div>
          </div>
          <div className="h-8 w-px bg-gray-200" />
          <div className="text-right">
            <div className="text-[10px] font-mono text-[#717785] uppercase">Cotejo Dual 1:1</div>
            <div className="text-[18px] font-mono font-bold text-emerald-600">{dualItemsCount}</div>
          </div>
        </div>
      </div>

      {/* Buscador y Filtros */}
      <div className="flex flex-col gap-3">
        <form onSubmit={handleSearchSubmit} className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 text-[20px]">
              search
            </span>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar alimento o producto (ej. Papa Huaycha, Carne de Res, Arroz, Aceite, Pollo)..."
              className="w-full pl-11 pr-4 py-3 bg-white border border-[#e0e2eb] rounded-xl text-[14px] text-[#181c22] placeholder-gray-400 focus:outline-none focus:border-[#005cb8] shadow-sm transition-all"
            />
          </div>
          <button
            type="submit"
            className="bg-[#005cb8] text-white px-6 py-3 rounded-xl text-[14px] font-bold hover:bg-[#004b98] transition-colors shadow-sm flex items-center justify-center gap-2"
          >
            <span>Buscar</span>
          </button>
        </form>

        {/* Barra de Filtros por Categoría y Ciudad */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-white p-3 rounded-xl border border-[#e0e2eb] shadow-xs">
          <div className="flex items-center gap-2 overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0">
            <span className="text-[11px] font-mono text-[#717785] uppercase shrink-0 font-bold">
              Categoría:
            </span>
            {['TODAS', 'Verduras y Tubérculos', 'Carnes y Huevo', 'Abarrotes y Frutas'].map((cat) => (
              <button
                key={cat}
                onClick={() => setCategoria(cat)}
                className={`px-3 py-1 rounded-lg text-[12px] font-medium transition-colors whitespace-nowrap ${
                  categoria === cat
                    ? 'bg-[#005cb8] text-white font-bold'
                    : 'bg-[#f1f3fc] text-[#414753] hover:bg-[#e4e8f7]'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 self-end sm:self-auto">
            <span className="text-[11px] font-mono text-[#717785] uppercase shrink-0 font-bold">
              Ciudad:
            </span>
            <select
              value={ciudad}
              onChange={(e) => setCiudad(e.target.value)}
              className="px-3 py-1 bg-[#f1f3fc] border border-[#e0e2eb] rounded-lg text-[12px] font-medium text-[#181c22] focus:outline-none focus:border-[#005cb8]"
            >
              <option value="TODAS">Todas las Ciudades</option>
              {ciudadesList.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Grid de Productos */}
      {loading ? (
        <div className="p-12 text-center text-[#717785]">
          <span className="material-symbols-outlined text-4xl animate-spin text-[#005cb8]">sync</span>
          <p className="mt-2 text-[14px]">Consultando cotizaciones en Neon PostgreSQL...</p>
        </div>
      ) : items.length === 0 ? (
        <div className="bg-white p-12 text-center rounded-xl border border-[#e0e2eb]">
          <span className="material-symbols-outlined text-5xl text-gray-300">shopping_cart_off</span>
          <p className="text-[16px] font-bold text-[#181c22] mt-3">No se encontraron productos</p>
          <p className="text-[13px] text-[#717785] mt-1">Intenta ajustando el término o cambiando la categoría.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {items.map((item, idx) => (
            <div
              key={`${item.producto}-${idx}`}
              className="bg-white p-5 rounded-xl border border-[#e0e2eb] shadow-sm flex flex-col justify-between hover:border-[#005cb8] transition-all"
            >
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold font-mono tracking-wider uppercase bg-[#f1f3fc] text-[#005cb8]">
                    {item.categoria || 'Canasta Básica'}
                  </span>
                  <span className="text-[11px] font-mono text-[#717785]">{item.departamento}</span>
                </div>

                <h3 className="text-[15px] font-bold text-[#181c22] line-clamp-1">{item.producto}</h3>
                <div className="text-[11px] font-mono text-[#717785]">Unidad: {item.unidad_medida}</div>

                {/* Comparativa Dual Lado a Lado */}
                <div className="grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-[#f1f3fc]">
                  {/* OAP */}
                  <div className="bg-[#f8fafd] p-2.5 rounded-lg border border-[#e6eaf2] flex flex-col">
                    <span className="text-[10px] font-mono text-[#717785] uppercase">🏪 Mercado OAP</span>
                    <span className="text-[16px] font-mono font-bold text-[#181c22] mt-0.5">
                      {item.oap ? `Bs ${item.oap.precio_bs.toFixed(2)}` : 'Sin cotización'}
                    </span>
                    {item.oap && (
                      <span className="text-[9px] font-mono text-[#717785] mt-1">
                        {item.oap.fecha}
                      </span>
                    )}
                  </div>

                  {/* Hipermaxi */}
                  <div className="bg-[#f8fafd] p-2.5 rounded-lg border border-[#e6eaf2] flex flex-col">
                    <span className="text-[10px] font-mono text-[#717785] uppercase">🛒 Hipermaxi</span>
                    <span className="text-[16px] font-mono font-bold text-[#005cb8] mt-0.5">
                      {item.hipermaxi ? `Bs ${item.hipermaxi.precio_bs.toFixed(2)}` : 'Sin cotización'}
                    </span>
                    {item.hipermaxi && (
                      <span className="text-[9px] font-mono text-[#717785] mt-1">
                        {item.hipermaxi.fecha}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Indicador de Brecha de Precios */}
              {item.oap && item.hipermaxi ? (
                <div
                  className={`mt-4 p-2 rounded-lg text-[11px] font-medium flex items-center justify-between ${
                    item.ahorroFuente === 'OAP'
                      ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                      : item.ahorroFuente === 'Hipermaxi'
                      ? 'bg-blue-50 text-blue-800 border border-blue-200'
                      : 'bg-gray-100 text-gray-700'
                  }`}
                >
                  <span className="font-mono font-bold">
                    {item.ahorroFuente === 'OAP'
                      ? '💡 Ahorro en Mercado Popular'
                      : item.ahorroFuente === 'Hipermaxi'
                      ? '💡 Ahorro en Hipermaxi'
                      : '⚖️ Precio Igual'}
                  </span>
                  <span className="font-mono font-bold">
                    {item.diferencia_bs !== 0
                      ? `Bs ${Math.abs(item.diferencia_bs || 0).toFixed(2)} (${Math.abs(
                          item.diferencia_pct || 0
                        )}%)`
                      : '0.0%'}
                  </span>
                </div>
              ) : (
                <div className="mt-4 p-2 rounded-lg bg-gray-50 border border-gray-200 text-[11px] text-gray-600 font-mono text-center">
                  Fuente única disponible en esta plaza
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

