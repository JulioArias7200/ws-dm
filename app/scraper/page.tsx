'use client';

import { useState, useEffect } from 'react';

interface ScraperItem {
  id: string;
  name: string;
  script: string;
  target: string;
  records: number;
  status: string;
  type: string;
}

interface ScraperStatusResponse {
  success: boolean;
  timestamp: string;
  counts: {
    sicoes: number;
    canastaTotal: number;
    canastaOap: number;
    canastaHipermaxi: number;
    medicamentosTotal: number;
    farmacorp: number;
    chavez: number;
    centrosSalud: number;
    telegramConsultas: number;
  };
  scrapers: ScraperItem[];
}

export default function ScraperPage() {
  const [data, setData] = useState<ScraperStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);

  async function loadStatus() {
    try {
      const res = await fetch('/api/scraper-status');
      const json = await res.json();
      if (json.success) {
        setData(json);
      }
    } catch (err) {
      console.error('Error cargando estado de scrapers:', err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadStatus();
    const interval = setInterval(loadStatus, 15000);
    return () => clearInterval(interval);
  }, []);

  const totalRecords = data
    ? data.counts.sicoes +
      data.counts.canastaTotal +
      data.counts.medicamentosTotal +
      data.counts.centrosSalud
    : 0;

  return (
    <div className="flex flex-col gap-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#e0e2eb]">
        <div className="flex flex-col">
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded bg-[#e6e8f1] text-[#005cb8] text-[11px] font-mono font-bold uppercase tracking-wider">
              DATA EXTRACTION // 4 SCRAPERS LOCALES & NEON DB
            </span>
          </div>
          <h1 className="text-2xl font-bold text-[#181c22] tracking-tight mt-1">
            Pipeline de Minería y Extracción de Datos
          </h1>
          <p className="text-[14px] text-[#414753]">
            Arquitectura desacoplada: los scripts de scraping se ejecutan localmente con Playwright y sincronizan hacia Neon PostgreSQL, permitiendo consultas instantáneas.
          </p>
        </div>

        <button
          onClick={loadStatus}
          disabled={loading}
          className="flex items-center gap-2 bg-[#005cb8] text-white px-4 py-2.5 rounded-xl text-[13px] font-bold hover:bg-[#004b98] transition-colors shadow-xs"
        >
          <span className={`material-symbols-outlined text-[16px] ${loading ? 'animate-spin' : ''}`}>
            sync
          </span>
          <span>Actualizar Telemetría</span>
        </button>
      </div>

      {/* KPI Cards de Ingesta Real en Neon DB */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <div className="bg-white p-5 rounded-xl border border-[#e0e2eb] shadow-sm flex flex-col justify-between">
          <div className="text-[11px] font-mono text-[#717785] uppercase">Total Registros en BD</div>
          <div className="text-3xl font-bold text-[#181c22] mt-1 font-mono">
            {loading ? '...' : totalRecords.toLocaleString('es-BO')}
          </div>
          <div className="text-[11px] text-emerald-600 mt-2 font-medium flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span>4 Colecciones Sincronizadas</span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-[#e0e2eb] shadow-sm flex flex-col justify-between">
          <div className="text-[11px] font-mono text-[#717785] uppercase">Convocatorias SICOES</div>
          <div className="text-3xl font-bold text-[#005cb8] mt-1 font-mono">
            {loading ? '...' : data?.counts.sicoes || 0}
          </div>
          <div className="text-[11px] text-[#717785] mt-2">Vectorizado con pgvector (1024d)</div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-[#e0e2eb] shadow-sm flex flex-col justify-between">
          <div className="text-[11px] font-mono text-[#717785] uppercase">Canasta Familiar (Dual)</div>
          <div className="text-3xl font-bold text-amber-600 mt-1 font-mono">
            {loading ? '...' : data?.counts.canastaTotal || 0}
          </div>
          <div className="text-[11px] text-[#717785] mt-2">
            OAP: {data?.counts.canastaOap || 0} • Hipermaxi: {data?.counts.canastaHipermaxi || 0}
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-[#e0e2eb] shadow-sm flex flex-col justify-between">
          <div className="text-[11px] font-mono text-[#717785] uppercase">Salud & Farmacias</div>
          <div className="text-3xl font-bold text-purple-600 mt-1 font-mono">
            {loading ? '...' : (data?.counts.medicamentosTotal || 0) + (data?.counts.centrosSalud || 0)}
          </div>
          <div className="text-[11px] text-[#717785] mt-2">
            Farm: {data?.counts.medicamentosTotal || 0} • OSM: {data?.counts.centrosSalud || 0}
          </div>
        </div>
      </div>

      {/* Tabla de Scrapers Oficiales */}
      <div className="bg-white rounded-2xl border border-[#e0e2eb] shadow-sm p-6 flex flex-col gap-4">
        <div className="flex items-center justify-between pb-3 border-b border-[#f1f3fc]">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[#005cb8]">terminal</span>
            <h2 className="text-[16px] font-bold text-[#181c22]">
              Scrapers y Pipelines ETL del Proyecto
            </h2>
          </div>
          <span className="text-[11px] font-mono text-emerald-700 font-bold bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
            Pipeline Activo
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {(data?.scrapers || []).map((sc) => (
            <div
              key={sc.id}
              className="p-4 rounded-xl border border-[#e0e2eb] bg-[#f8fafd] flex flex-col justify-between gap-3"
            >
              <div className="flex flex-col gap-1">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-mono text-[#005cb8] font-bold bg-blue-50 px-2 py-0.5 rounded">
                    {sc.script}
                  </span>
                  <span className="flex items-center gap-1 text-[11px] font-mono text-emerald-700 font-bold">
                    <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                    {sc.status}
                  </span>
                </div>
                <h3 className="text-[15px] font-bold text-[#181c22] mt-1">{sc.name}</h3>
                <p className="text-[12px] text-[#414753]">
                  Fuente: <strong>{sc.target}</strong> ({sc.type})
                </p>
              </div>

              <div className="pt-2 border-t border-gray-200/60 flex items-center justify-between text-[12px]">
                <span className="text-[#717785]">Registros en Neon DB:</span>
                <span className="font-mono font-bold text-[#181c22] text-[14px]">
                  {sc.records.toLocaleString('es-BO')}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Nota Metodológica de Desacoplamiento */}
      <div className="bg-blue-50/70 border border-blue-200 rounded-2xl p-5 flex items-start gap-4">
        <span className="material-symbols-outlined text-blue-700 text-[24px] mt-0.5">info</span>
        <div className="flex flex-col gap-1">
          <h3 className="text-[14px] font-bold text-blue-950">
            ¿Por qué el Scraping se ejecuta fuera de Telegram y de las funciones Serverless?
          </h3>
          <p className="text-[12px] text-blue-900 leading-relaxed">
            Los navegadores headless basados en Playwright requieren memoria y tiempos de ejecución que superan los límites de una función serverless (10 a 15 segundos). Al desacoplar la extracción hacia un proceso de lote local que puebla <strong>Neon PostgreSQL</strong>, el bot de Telegram y la interfaz web responden en <strong>menos de 100 ms</strong> con muestreo limpio y tolerancia a fallos.
          </p>
        </div>
      </div>
    </div>
  );
}
