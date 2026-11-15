'use client';

import { useState, useEffect, useCallback } from 'react';
import { MedicamentoItem, CentroSaludItem, ComparativaMedicamento } from '@/lib/canasta-salud';
import { MedicamentoCard } from '@/components/salud/medicamento-card';

const CADENAS = [
  { id: 'TODAS', label: 'Todas las Cadenas' },
  { id: 'Farmacorp', label: '🟢 Farmacorp' },
  { id: 'Chavez', label: '🔵 Farmacias Chávez' },
  { id: 'Hipermaxi', label: '🔴 Hipermaxi Farmacia' },
];

const RANGOS_PRECIO = [
  { id: 'TODOS', label: 'Todos los Precios', min: undefined, max: undefined },
  { id: '0-25', label: '< Bs 25 (Económicos)', min: 0, max: 25 },
  { id: '25-50', label: 'Bs 25 – Bs 50', min: 25, max: 50 },
  { id: '50-100', label: 'Bs 50 – Bs 100', min: 50, max: 100 },
  { id: '100+', label: '> Bs 100', min: 100, max: undefined },
];

const OPCIONES_ORDEN = [
  { id: 'precio_asc', label: '💰 Precio: Menor a Mayor' },
  { id: 'precio_desc', label: '💎 Precio: Mayor a Menor' },
  { id: 'descuento', label: '🏷️ Mayor Descuento %' },
  { id: 'nombre', label: '🔤 Nombre (A - Z)' },
];

function getMedImageUrl(rawImage?: string | null): string {
  if (!rawImage) return '/images/salud/medication.svg';
  if (rawImage.startsWith('http') || rawImage.startsWith('/api/')) return rawImage;
  return `/api/storage/${rawImage.replace(/^\/+/, '')}`;
}

export default function SaludPage() {
  const [activeTab, setActiveTab] = useState<'farmacias' | 'centros'>('farmacias');

  // Estado para Farmacias
  const [pharmaQuery, setPharmaQuery] = useState('');
  const [cadenaFilter, setCadenaFilter] = useState('TODAS');
  const [rangoPrecio, setRangoPrecio] = useState('TODOS');
  const [customMin, setCustomMin] = useState('');
  const [customMax, setCustomMax] = useState('');
  const [appliedCustomMin, setAppliedCustomMin] = useState<number | undefined>(undefined);
  const [appliedCustomMax, setAppliedCustomMax] = useState<number | undefined>(undefined);
  const [sortBy, setSortBy] = useState<'precio_asc' | 'precio_desc' | 'descuento' | 'nombre'>('precio_asc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number | 'all'>(12);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [medicamentos, setMedicamentos] = useState<MedicamentoItem[]>([]);
  const [comparativa, setComparativa] = useState<ComparativaMedicamento | null>(null);
  const [loadingPharma, setLoadingPharma] = useState(false);

  // Estado para Centros de Salud
  const [centrosQuery, setCentrosQuery] = useState('');
  const [centros, setCentros] = useState<CentroSaludItem[]>([]);
  const [loadingCentros, setLoadingCentros] = useState(false);

  // Carga de Medicamentos
  const fetchMedicamentos = useCallback(async () => {
    setLoadingPharma(true);
    try {
      const params = new URLSearchParams();
      if (pharmaQuery.trim()) params.set('q', pharmaQuery.trim());
      if (cadenaFilter && cadenaFilter !== 'TODAS') params.set('cadena', cadenaFilter);

      // Determinar límites de precio
      let minVal = appliedCustomMin;
      let maxVal = appliedCustomMax;

      if (rangoPrecio !== 'CUSTOM') {
        const found = RANGOS_PRECIO.find((r) => r.id === rangoPrecio);
        if (found) {
          minVal = found.min;
          maxVal = found.max;
        }
      }

      if (minVal != null) params.set('minPrice', String(minVal));
      if (maxVal != null) params.set('maxPrice', String(maxVal));
      if (sortBy) params.set('sortBy', sortBy);

      params.set('page', String(page));
      params.set('limit', pageSize === 'all' ? '500' : String(pageSize));

      const res = await fetch(`/api/farmacias?${params.toString()}`);
      const data = await res.json();
      if (data.paginado) {
        setMedicamentos(data.paginado.items || []);
        setTotalPages(data.paginado.totalPages || 1);
        setTotalItems(data.paginado.total || 0);
      }
      if (data.comparativa) {
        setComparativa(data.comparativa);
      } else {
        setComparativa(null);
      }
    } catch (err) {
      console.error('Error cargando medicamentos:', err);
    } finally {
      setLoadingPharma(false);
    }
  }, [pharmaQuery, cadenaFilter, rangoPrecio, appliedCustomMin, appliedCustomMax, sortBy, page, pageSize]);

  // Carga de Centros de Salud
  const fetchCentros = useCallback(async () => {
    setLoadingCentros(true);
    try {
      const params = new URLSearchParams();
      params.set('tipo', 'centros');
      if (centrosQuery) params.set('q', centrosQuery);
      params.set('departamento', 'La Paz');

      const res = await fetch(`/api/farmacias?${params.toString()}`);
      const data = await res.json();
      if (data.items) {
        setCentros(data.items);
      }
    } catch (err) {
      console.error('Error cargando centros de salud:', err);
    } finally {
      setLoadingCentros(false);
    }
  }, [centrosQuery]);

  useEffect(() => {
    if (activeTab === 'farmacias') {
      fetchMedicamentos();
    } else {
      fetchCentros();
    }
  }, [activeTab, fetchMedicamentos, fetchCentros]);

  // Manejar aplicación de filtro personalizado de precios
  const handleApplyCustomPrice = (e: React.FormEvent) => {
    e.preventDefault();
    const minNum = customMin ? Number(customMin) : undefined;
    const maxNum = customMax ? Number(customMax) : undefined;
    setAppliedCustomMin(minNum);
    setAppliedCustomMax(maxNum);
    setRangoPrecio('CUSTOM');
    setPage(1);
  };

  // Restablecer todos los filtros
  const handleResetFilters = () => {
    setPharmaQuery('');
    setCadenaFilter('TODAS');
    setRangoPrecio('TODOS');
    setCustomMin('');
    setCustomMax('');
    setAppliedCustomMin(undefined);
    setAppliedCustomMax(undefined);
    setSortBy('precio_asc');
    setPage(1);
  };

  const hasActiveFilters =
    pharmaQuery.trim() !== '' ||
    cadenaFilter !== 'TODAS' ||
    rangoPrecio !== 'TODOS' ||
    sortBy !== 'precio_asc';

  return (
    <div className="flex flex-col gap-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#e0e2eb]">
        <div className="flex flex-col">
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded bg-blue-50 text-[#005cb8] border border-blue-200 text-[11px] font-mono font-bold uppercase tracking-wider">
              HEALTHCARE // FARMACIAS & OPENSTREETMAP
            </span>
          </div>
          <h1 className="text-2xl font-bold text-[#181c22] tracking-tight mt-1">
            Salud Ciudadana: Farmacias y Centros de Atención
          </h1>
          <p className="text-[14px] text-[#414753]">
            Cotejo de medicamentos entre cadenas farmacéuticas bolivianas y geolocalización de hospitales y postas sanitarias.
          </p>
        </div>

        {/* Selector de Pestaña Principal */}
        <div className="flex items-center bg-[#f1f3fc] p-1 rounded-xl">
          <button
            onClick={() => setActiveTab('farmacias')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-[13px] font-bold transition-all ${
              activeTab === 'farmacias'
                ? 'bg-white text-[#005cb8] shadow-xs'
                : 'text-[#414753] hover:text-[#181c22]'
            }`}
          >
            <span className="material-symbols-outlined text-[18px]">local_pharmacy</span>
            <span>Farmacias (Precios)</span>
          </button>
          <button
            onClick={() => setActiveTab('centros')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-[13px] font-bold transition-all ${
              activeTab === 'centros'
                ? 'bg-white text-[#005cb8] shadow-xs'
                : 'text-[#414753] hover:text-[#181c22]'
            }`}
          >
            <span className="material-symbols-outlined text-[18px]">emergency</span>
            <span>Centros de Salud (OSM)</span>
          </button>
        </div>
      </div>

      {/* PESTAÑA 1: FARMACIAS */}
      {activeTab === 'farmacias' && (
        <div className="flex flex-col gap-5">
          {/* Fila 1: Buscador de Fármacos + Selector de Farmacia */}
          <div className="flex flex-col lg:flex-row gap-3">
            <div className="relative flex-1">
              <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 text-[20px]">
                search
              </span>
              <input
                type="text"
                value={pharmaQuery}
                onChange={(e) => {
                  setPharmaQuery(e.target.value);
                  setPage(1);
                }}
                placeholder="Buscar por fármaco o principio activo (ej. Paracetamol, Ibuprofeno, Amoxicilina, Aspirina)..."
                className="w-full pl-11 pr-4 py-3 bg-white border border-[#e0e2eb] rounded-xl text-[14px] text-[#181c22] placeholder-gray-400 focus:outline-none focus:border-[#005cb8] shadow-sm transition-all"
              />
            </div>

            {/* Filtro por Cadena de Farmacia */}
            <div className="flex items-center bg-white p-1 rounded-xl border border-[#e0e2eb] shadow-xs overflow-x-auto shrink-0">
              {CADENAS.map((cad) => (
                <button
                  key={cad.id}
                  onClick={() => {
                    setCadenaFilter(cad.id);
                    setPage(1);
                  }}
                  className={`px-3.5 py-2 rounded-lg text-[12px] font-medium transition-colors whitespace-nowrap ${
                    cadenaFilter === cad.id
                      ? 'bg-[#005cb8] text-white font-bold shadow-xs'
                      : 'text-[#414753] hover:bg-gray-50'
                  }`}
                >
                  {cad.label}
                </button>
              ))}
            </div>
          </div>

          {/* Fila 2: Panel Avanzado de Precios y Ordenamiento */}
          <div className="bg-white p-4 rounded-2xl border border-[#e0e2eb] shadow-xs flex flex-col gap-3">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3 border-b border-[#f1f3fc]">
              {/* Píldoras de Rango de Precios */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 lg:pb-0">
                <span className="text-[11px] font-mono text-[#717785] uppercase shrink-0 font-bold mr-1">
                  Rango Precios:
                </span>
                {RANGOS_PRECIO.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => {
                      setRangoPrecio(r.id);
                      setAppliedCustomMin(undefined);
                      setAppliedCustomMax(undefined);
                      setCustomMin('');
                      setCustomMax('');
                      setPage(1);
                    }}
                    className={`px-3 py-1.5 rounded-lg text-[12px] font-medium transition-colors whitespace-nowrap ${
                      rangoPrecio === r.id
                        ? 'bg-emerald-600 text-white font-bold shadow-xs'
                        : 'bg-[#f1f3fc] text-[#414753] hover:bg-[#e4e8f7]'
                    }`}
                  >
                    {r.label}
                  </button>
                ))}
              </div>

              {/* Selector de Ordenamiento */}
              <div className="flex items-center gap-2 self-start lg:self-auto shrink-0">
                <span className="text-[11px] font-mono text-[#717785] uppercase font-bold shrink-0">
                  Ordenar por:
                </span>
                <select
                  value={sortBy}
                  onChange={(e) => {
                    setSortBy(e.target.value as 'precio_asc' | 'precio_desc' | 'descuento' | 'nombre');
                    setPage(1);
                  }}
                  className="px-3 py-1.5 bg-[#f1f3fc] border border-[#e0e2eb] rounded-lg text-[12px] font-medium text-[#181c22] focus:outline-none focus:border-[#005cb8]"
                >
                  {OPCIONES_ORDEN.map((op) => (
                    <option key={op.id} value={op.id}>
                      {op.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Sub-fila: Inputs personalizados de precio y botón limpiar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-[12px]">
              <form onSubmit={handleApplyCustomPrice} className="flex items-center gap-2 flex-wrap">
                <span className="text-[#717785] font-medium">Personalizado:</span>
                <div className="flex items-center gap-1">
                  <span className="text-[#717785] font-mono text-[11px]">Bs</span>
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    value={customMin}
                    onChange={(e) => setCustomMin(e.target.value)}
                    placeholder="Mínimo"
                    className="w-20 px-2 py-1 bg-[#f8fafd] border border-[#e0e2eb] rounded-lg text-[12px] text-[#181c22] focus:outline-none focus:border-[#005cb8]"
                  />
                </div>
                <span className="text-[#717785]">-</span>
                <div className="flex items-center gap-1">
                  <span className="text-[#717785] font-mono text-[11px]">Bs</span>
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    value={customMax}
                    onChange={(e) => setCustomMax(e.target.value)}
                    placeholder="Máximo"
                    className="w-20 px-2 py-1 bg-[#f8fafd] border border-[#e0e2eb] rounded-lg text-[12px] text-[#181c22] focus:outline-none focus:border-[#005cb8]"
                  />
                </div>
                <button
                  type="submit"
                  className="px-3 py-1 bg-[#005cb8] text-white rounded-lg text-[11px] font-bold hover:bg-[#004b98] transition-colors"
                >
                  Filtrar
                </button>
              </form>

              <div className="flex items-center gap-3">
                <span className="text-[#717785] font-mono">
                  Mostrando <strong>{medicamentos.length}</strong> de <strong>{totalItems}</strong> medicamentos
                </span>

                {hasActiveFilters && (
                  <button
                    onClick={handleResetFilters}
                    className="text-[#005cb8] hover:text-[#004b98] font-bold text-[11px] flex items-center gap-1 underline underline-offset-2"
                  >
                    <span className="material-symbols-outlined text-[14px]">refresh</span>
                    <span>Limpiar Filtros</span>
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Tarjeta de Resumen Comparativo si hay búsqueda de fármaco */}
          {comparativa && comparativa.resumenAhorro && (
            <div className="bg-emerald-50 border border-emerald-200 p-5 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-[22px]">savings</span>
                </div>
                <div>
                  <h3 className="text-[15px] font-bold text-emerald-950">
                    Oportunidad de Ahorro: {comparativa.termino.toUpperCase()}
                  </h3>
                  <p className="text-[12px] text-emerald-800">
                    Mejor cotización en: <strong>{comparativa.resumenAhorro.mejorCadena}</strong> a Bs{' '}
                    {comparativa.resumenAhorro.precioMin.toFixed(2)} (vs Bs{' '}
                    {comparativa.resumenAhorro.precioMax.toFixed(2)})
                  </p>
                </div>
              </div>
              <div className="text-right sm:border-l sm:border-emerald-200 sm:pl-5">
                <span className="text-[11px] font-mono text-emerald-800 uppercase block">Diferencia</span>
                <span className="text-[20px] font-mono font-bold text-emerald-900">
                  Bs {comparativa.resumenAhorro.ahorroBs.toFixed(2)}
                </span>
              </div>
            </div>
          )}

          {/* Grid de Medicamentos */}
          {loadingPharma ? (
            <div className="p-12 text-center text-[#717785]">
              <span className="material-symbols-outlined text-4xl animate-spin text-[#005cb8]">sync</span>
              <p className="mt-2 text-[14px]">Consultando catálogos de Farmacorp, Chávez e Hipermaxi en Neon DB...</p>
            </div>
          ) : medicamentos.length === 0 ? (
            <div className="bg-white p-12 text-center rounded-2xl border border-[#e0e2eb] flex flex-col items-center gap-3">
              <div className="w-14 h-14 rounded-2xl bg-gray-50 text-gray-400 flex items-center justify-center">
                <span className="material-symbols-outlined text-4xl">medication</span>
              </div>
              <h3 className="text-[16px] font-bold text-[#181c22]">No se encontraron medicamentos</h3>
              <p className="text-[13px] text-[#717785] max-w-md">
                No hay coincidencias con los filtros seleccionados (Cadena: <strong>{cadenaFilter}</strong>, Rango:{' '}
                <strong>{rangoPrecio}</strong>).
              </p>
              <button
                onClick={handleResetFilters}
                className="mt-2 bg-[#005cb8] text-white px-4 py-2 rounded-xl text-[13px] font-bold hover:bg-[#004b98] transition-colors"
              >
                Restablecer Filtros
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8">
              {medicamentos.map((med) => (
                <MedicamentoCard key={med.id} med={med} />
              ))}
            </div>
          )}

          {/* Barra de Paginación Completa de Medicamentos */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-6 p-4 bg-white rounded-2xl border border-[#e0e2eb] shadow-xs">
            <div className="flex items-center gap-3">
              <span className="text-[12px] text-[#414753] font-mono">
                Total:{' '}
                <strong className="text-[#005cb8]">{totalItems}</strong> medicamentos en catálogo
              </span>

              <div className="h-4 w-px bg-gray-200 hidden sm:block" />

              <div className="flex items-center gap-1.5 text-[11px] font-mono text-[#717785]">
                <span>Por pág:</span>
                {[12, 24, 48, 'all'].map((sz) => (
                  <button
                    key={sz}
                    onClick={() => {
                      setPageSize(sz as number | 'all');
                      setPage(1);
                    }}
                    className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                      pageSize === sz
                        ? 'bg-[#005cb8] text-white'
                        : 'bg-[#f1f3fc] text-[#414753] hover:bg-[#e4e8f7]'
                    }`}
                  >
                    {sz === 'all' ? 'Todos' : sz}
                  </button>
                ))}
              </div>
            </div>

            {pageSize !== 'all' && totalPages > 1 && (
              <div className="flex items-center gap-1.5">
                <button
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="px-3 py-1.5 rounded-lg border border-[#e0e2eb] bg-white text-[#181c22] text-[12px] font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50 flex items-center gap-1 transition-colors"
                >
                  <span className="material-symbols-outlined text-[16px]">chevron_left</span>
                  <span>Anterior</span>
                </button>

                <div className="flex items-center gap-1 px-2 font-mono text-[12px] text-[#414753]">
                  Página <strong className="text-[#005cb8]">{page}</strong> de{' '}
                  <strong className="text-[#181c22]">{totalPages}</strong>
                </div>

                <button
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className="px-3 py-1.5 rounded-lg border border-[#e0e2eb] bg-white text-[#181c22] text-[12px] font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50 flex items-center gap-1 transition-colors"
                >
                  <span>Siguiente</span>
                  <span className="material-symbols-outlined text-[16px]">chevron_right</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* PESTAÑA 2: CENTROS DE SALUD OSM */}
      {activeTab === 'centros' && (
        <div className="flex flex-col gap-6">
          <div className="relative">
            <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 text-[20px]">
              search
            </span>
            <input
              type="text"
              value={centrosQuery}
              onChange={(e) => setCentrosQuery(e.target.value)}
              placeholder="Buscar por nombre de hospital o zona (ej. Hospital de Clínicas, Sopocachi, Miraflores)..."
              className="w-full pl-11 pr-4 py-3 bg-white border border-[#e0e2eb] rounded-xl text-[14px] text-[#181c22] placeholder-gray-400 focus:outline-none focus:border-[#005cb8] shadow-sm transition-all"
            />
          </div>

          {loadingCentros ? (
            <div className="p-12 text-center text-[#717785]">
              <span className="material-symbols-outlined text-4xl animate-spin text-[#005cb8]">sync</span>
              <p className="mt-2 text-[14px]">Consultando nodos sanitarios de OpenStreetMap...</p>
            </div>
          ) : centros.length === 0 ? (
            <div className="bg-white p-12 text-center rounded-xl border border-[#e0e2eb]">
              <span className="material-symbols-outlined text-5xl text-gray-300">emergency</span>
              <p className="text-[16px] font-bold text-[#181c22] mt-3">No se encontraron centros de salud</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {centros.map((c) => (
                <div
                  key={c.osm_id}
                  className="bg-white p-5 rounded-xl border border-[#e0e2eb] shadow-sm flex flex-col justify-between hover:border-[#005cb8] transition-all"
                >
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold font-mono tracking-wider uppercase bg-red-50 text-red-700 border border-red-200">
                        {c.tipo || 'Centro de Salud'}
                      </span>
                      <span className="text-[10px] font-mono text-[#717785]">{c.departamento}</span>
                    </div>

                    <h3 className="text-[15px] font-bold text-[#181c22] mt-1">{c.nombre}</h3>
                    {c.direccion && (
                      <p className="text-[12px] text-[#414753] line-clamp-2">📍 {c.direccion}</p>
                    )}
                  </div>

                  <div className="mt-4 pt-3 border-t border-[#f1f3fc] flex items-center justify-between">
                    <span className="text-[10px] font-mono text-[#717785]">
                      {c.lat.toFixed(4)}, {c.lon.toFixed(4)}
                    </span>
                    <a
                      href={`https://www.openstreetmap.org/?mlat=${c.lat}&mlon=${c.lon}#map=17/${c.lat}/${c.lon}`}
                      target="_blank"
                      rel="noreferrer"
                      className="bg-[#f1f3fc] text-[#005cb8] px-3 py-1.5 rounded-lg text-[11px] font-bold hover:bg-[#e2e8f8] transition-colors flex items-center gap-1"
                    >
                      <span>Abrir Mapa</span>
                      <span className="material-symbols-outlined text-[14px]">map</span>
                    </a>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
