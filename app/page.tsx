import Link from 'next/link';
import { getDashboardMetrics } from '@/lib/db';

export default async function HomePage() {
  const metrics = await getDashboardMetrics();

  return (
    <div className="flex flex-col gap-8 max-w-7xl mx-auto">
      {/* Banner de Bienvenida y Propósito */}
      <div className="bg-gradient-to-r from-[#005cb8] to-[#1275e2] text-white p-8 rounded-2xl shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded bg-white/20 text-white text-[11px] font-mono uppercase tracking-wider font-bold">
              CAPÍTULO 5: MINERÍA WEB
            </span>
            <span className="text-white/80 text-[12px]">• La Paz, Bolivia</span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight">
            Sistema de Inteligencia de Contrataciones Estatales
          </h1>
          <p className="text-white/90 text-[15px] max-w-2xl">
            Plataforma que integra <strong>Web Content Mining</strong> (Playwright), <strong>Web Structure Mining</strong> (PageRank & HITS), base de datos vectorial <strong>PostgreSQL (pgvector)</strong> y consulta ciudadana 24/7 vía <strong>Telegram</strong>.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3">
          <Link
            href="/licitaciones"
            className="bg-white text-[#005cb8] px-5 py-2.5 rounded-xl text-[14px] font-bold hover:bg-white/90 transition-all text-center shadow-sm"
          >
            Ver Licitaciones
          </Link>
          <Link
            href="/grafo"
            className="bg-white/10 text-white border border-white/30 px-5 py-2.5 rounded-xl text-[14px] font-bold hover:bg-white/20 transition-all text-center"
          >
            Explorar Grafo
          </Link>
        </div>
      </div>

      {/* Grid de KPIs Principales */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <div className="bg-white p-6 rounded-xl border border-[#e0e2eb] shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-[#717785] text-[13px] font-medium">
            <span>Convocatorias Indexadas</span>
            <span className="material-symbols-outlined text-[#005cb8]">layers</span>
          </div>
          <div className="text-3xl font-bold text-[#181c22] mt-2 font-mono">
            {metrics.totalConvocatorias}
          </div>
          <div className="flex items-center gap-2 mt-3 text-[12px] text-emerald-600 font-medium">
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            <span>{metrics.vigentes} vigentes en La Paz</span>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl border border-[#e0e2eb] shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-[#717785] text-[13px] font-medium">
            <span>Monto Total Licitado</span>
            <span className="material-symbols-outlined text-[#005cb8]">payments</span>
          </div>
          <div className="text-2xl font-bold text-[#181c22] mt-2 font-mono truncate">
            Bs {metrics.montoTotalLicitado.toLocaleString('es-BO')}
          </div>
          <div className="flex items-center gap-2 mt-3 text-[12px] text-[#414753]">
            <span>Adjudicado: Bs {metrics.montoAdjudicado.toLocaleString('es-BO')}</span>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl border border-[#e0e2eb] shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-[#717785] text-[13px] font-medium">
            <span>Nodos del Grafo (Red)</span>
            <span className="material-symbols-outlined text-[#005cb8]">account_tree</span>
          </div>
          <div className="text-3xl font-bold text-[#181c22] mt-2 font-mono">
            {metrics.totalNodosGrafo}
          </div>
          <div className="flex items-center gap-2 mt-3 text-[12px] text-[#005cb8] font-medium">
            <span>{metrics.totalAristasGrafo} aristas • {metrics.graphDensity} Δ densidad</span>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl border border-[#e0e2eb] shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-[#717785] text-[13px] font-medium">
            <span>Consultas en Telegram</span>
            <span className="material-symbols-outlined text-[#005cb8]">forum</span>
          </div>
          <div className="text-3xl font-bold text-[#181c22] mt-2 font-mono">
            {metrics.totalConsultasTelegram}
          </div>
          <div className="flex items-center gap-2 mt-3 text-[12px] text-emerald-600 font-medium">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span>Usage Mining Activo</span>
          </div>
        </div>
      </div>

      {/* Accesos a las 4 Interfaces Especializadas */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Link
          href="/licitaciones"
          className="bg-white p-6 rounded-xl border border-[#e0e2eb] hover:border-[#005cb8] hover:shadow-md transition-all group flex gap-4 items-start"
        >
          <div className="w-12 h-12 rounded-xl bg-blue-50 text-[#005cb8] flex items-center justify-center shrink-0 group-hover:bg-[#005cb8] group-hover:text-white transition-colors">
            <span className="material-symbols-outlined text-[24px]">gavel</span>
          </div>
          <div className="flex flex-col gap-1">
            <h2 className="text-[17px] font-bold text-[#181c22] group-hover:text-[#005cb8] transition-colors">
              Catálogo de Licitaciones & Búsqueda Semántica
            </h2>
            <p className="text-[13px] text-[#414753] leading-relaxed">
              Explora convocatorias abiertas (vigentes) y cerradas (adjudicadas o desiertas). Realiza búsquedas vectoriales con similitud de coseno impulsadas por <code>pgvector</code>.
            </p>
          </div>
        </Link>

        <Link
          href="/grafo"
          className="bg-white p-6 rounded-xl border border-[#e0e2eb] hover:border-[#005cb8] hover:shadow-md transition-all group flex gap-4 items-start"
        >
          <div className="w-12 h-12 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0 group-hover:bg-amber-600 group-hover:text-white transition-colors">
            <span className="material-symbols-outlined text-[24px]">hub</span>
          </div>
          <div className="flex flex-col gap-1">
            <h2 className="text-[17px] font-bold text-[#181c22] group-hover:text-amber-600 transition-colors">
              Topología de Red, PageRank y HITS
            </h2>
            <p className="text-[13px] text-[#414753] leading-relaxed">
              Modelado matemático de la red bipartita de entidades y rubros de La Paz. Ranking de prestigio con PageRank y separación de Hubs y Authorities.
            </p>
          </div>
        </Link>

        <Link
          href="/scraper"
          className="bg-white p-6 rounded-xl border border-[#e0e2eb] hover:border-[#005cb8] hover:shadow-md transition-all group flex gap-4 items-start"
        >
          <div className="w-12 h-12 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0 group-hover:bg-indigo-600 group-hover:text-white transition-colors">
            <span className="material-symbols-outlined text-[24px]">terminal</span>
          </div>
          <div className="flex flex-col gap-1">
            <h2 className="text-[17px] font-bold text-[#181c22] group-hover:text-indigo-600 transition-colors">
              Monitoreo del Scraper Playwright
            </h2>
            <p className="text-[13px] text-[#414753] leading-relaxed">
              Supervisión de la extracción automatizada de datos desde SICOES. Estado de sincronización, tasa de éxito y disparador manual de captura.
            </p>
          </div>
        </Link>

        <Link
          href="/telemetria"
          className="bg-white p-6 rounded-xl border border-[#e0e2eb] hover:border-[#005cb8] hover:shadow-md transition-all group flex gap-4 items-start"
        >
          <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0 group-hover:bg-emerald-600 group-hover:text-white transition-colors">
            <span className="material-symbols-outlined text-[24px]">cell_tower</span>
          </div>
          <div className="flex flex-col gap-1">
            <h2 className="text-[17px] font-bold text-[#181c22] group-hover:text-emerald-600 transition-colors">
              Bot Telegram & Web Usage Mining
            </h2>
            <p className="text-[13px] text-[#414753] leading-relaxed">
              Telemetría en tiempo real de los usuarios en Telegram. Registro de consultas, términos en tendencia, tiempos de respuesta y análisis de demanda.
            </p>
          </div>
        </Link>
      </div>
    </div>
  );
}
