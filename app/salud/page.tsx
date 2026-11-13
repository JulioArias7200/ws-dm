'use client';

import { useState, useEffect, useCallback } from 'react';
import { MedicamentoItem, CentroSaludItem, ComparativaMedicamento } from '@/lib/canasta-salud';

export default function SaludPage() {
  const [activeTab, setActiveTab] = useState<'farmacias' | 'centros'>('farmacias');

  // Estado para Farmacias
  const [pharmaQuery, setPharmaQuery] = useState('');
  const [cadenaFilter, setCadenaFilter] = useState('TODAS');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
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
      if (pharmaQuery) params.set('q', pharmaQuery);
      if (cadenaFilter && cadenaFilter !== 'TODAS') params.set('cadena', cadenaFilter);
      params.set('page', String(page));
      params.set('limit', '12');

      const res = await fetch(`/api/farmacias?${params.toString()}`);
      const data = await res.json();
      if (data.paginado) {
        setMedicamentos(data.paginado.items || []);
        setTotalPages(data.paginado.totalPages || 1);
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
  }, [pharmaQuery, cadenaFilter, page]);

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
        <div className="flex flex-col gap-6">
          {/* Buscador de Fármacos */}
          <div className="flex flex-col sm:flex-row gap-3">
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
                placeholder="Buscar medicamento o principio activo (ej. Paracetamol, Ibuprofeno, Amoxicilina, Aspirina)..."
                className="w-full pl-11 pr-4 py-3 bg-white border border-[#e0e2eb] rounded-xl text-[14px] text-[#181c22] placeholder-gray-400 focus:outline-none focus:border-[#005cb8] shadow-sm transition-all"
              />
            </div>

            {/* Filtro por Cadena */}
            <div className="flex items-center bg-white p-1 rounded-xl border border-[#e0e2eb] shadow-xs">
              {(['TODAS', 'Farmacorp', 'Chávez'] as const).map((cad) => (
                <button
                  key={cad}
                  onClick={() => {
                    setCadenaFilter(cad);
                    setPage(1);
                  }}
                  className={`px-3 py-2 rounded-lg text-[12px] font-medium transition-colors ${
                    cadenaFilter === cad
                      ? 'bg-[#005cb8] text-white font-bold'
                      : 'text-[#414753] hover:bg-gray-50'
                  }`}
                >
                  {cad === 'TODAS' ? 'Todas' : cad === 'Farmacorp' ? '🟢 Farmacorp' : '🔵 Chávez'}
                </button>
              ))}
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
              <p className="mt-2 text-[14px]">Consultando catálogos de Farmacorp y Chávez en Neon DB...</p>
            </div>
          ) : medicamentos.length === 0 ? (
            <div className="bg-white p-12 text-center rounded-xl border border-[#e0e2eb]">
              <span className="material-symbols-outlined text-5xl text-gray-300">medication</span>
              <p className="text-[16px] font-bold text-[#181c22] mt-3">No se encontraron medicamentos</p>
              <p className="text-[13px] text-[#717785] mt-1">Prueba con otro principio activo o elimina el filtro.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {medicamentos.map((med) => {
                const isFarmacorp = med.cadena.toLowerCase().includes('farmacorp');
                return (
                  <div
                    key={med.id}
                    className="bg-white p-5 rounded-xl border border-[#e0e2eb] shadow-sm flex flex-col justify-between hover:border-[#005cb8] transition-all"
                  >
                    <div className="flex flex-col gap-2">
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono tracking-wider uppercase ${
                            isFarmacorp
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : 'bg-blue-50 text-blue-700 border border-blue-200'
                          }`}
                        >
                          {isFarmacorp ? '🟢 Farmacorp' : '🔵 Farmacias Chávez'}
                        </span>
                        <span className="text-[10px] font-mono text-[#717785]">{med.departamento}</span>
                      </div>

                      <h3 className="text-[15px] font-bold text-[#181c22] line-clamp-2 mt-1">
                        {med.producto}
                      </h3>

                      {med.presentacion && (
                        <div className="text-[11px] font-mono text-[#717785]">
                          Presentación: {med.presentacion}
                        </div>
                      )}

                      {med.laboratorio && (
                        <div className="text-[11px] text-[#414753]">
                          Laboratorio: <span className="font-medium">{med.laboratorio}</span>
                        </div>
                      )}
                    </div>

                    <div className="mt-4 pt-3 border-t border-[#f1f3fc] flex items-center justify-between">
                      <div>
                        <div className="text-[10px] font-mono text-[#717785] uppercase">Precio Oficial</div>
                        <div className="text-[18px] font-mono font-bold text-[#181c22]">
                          Bs {med.precio_bs.toFixed(2)}
                        </div>
                        {med.precio_anterior_bs && (
                          <div className="text-[11px] font-mono text-gray-400 line-through">
                            Bs {med.precio_anterior_bs.toFixed(2)}
                          </div>
                        )}
                      </div>

                      {med.enlace ? (
                        <a
                          href={med.enlace}
                          target="_blank"
                          rel="noreferrer"
                          className="bg-[#005cb8] text-white px-3.5 py-2 rounded-xl text-[12px] font-bold hover:bg-[#004b98] transition-colors flex items-center gap-1 shadow-xs"
                        >
                          <span>Comprar</span>
                          <span className="material-symbols-outlined text-[14px]">open_in_new</span>
                        </a>
                      ) : (
                        <span className="text-[11px] text-gray-400 font-mono">En tienda física</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Paginador */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-3 pt-4 border-t border-[#e0e2eb]">
              <button
                onClick={() => setPage((p) => Math.max(p - 1, 1))}
                disabled={page <= 1}
                className="px-4 py-2 rounded-xl border border-[#e0e2eb] text-[13px] font-medium text-[#414753] hover:bg-[#f1f3fc] disabled:opacity-40 transition-colors"
              >
                Anterior
              </button>
              <span className="text-[13px] font-mono text-[#717785]">
                Página {page} de {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(p + 1, totalPages))}
                disabled={page >= totalPages}
                className="px-4 py-2 rounded-xl border border-[#e0e2eb] text-[13px] font-medium text-[#414753] hover:bg-[#f1f3fc] disabled:opacity-40 transition-colors"
              >
                Siguiente
              </button>
            </div>
          )}
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

