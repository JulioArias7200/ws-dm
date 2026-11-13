import { Suspense } from 'react';
import Link from 'next/link';
import { getDashboardMetrics, neonQuery } from '@/lib/db';

async function DashboardKpis() {
  const metrics = await getDashboardMetrics();

  // Obtener conteos consolidados de Canasta y Farmacias
  const [extra] = await neonQuery<{
    canasta_count: number;
    medicamentos_count: number;
    centros_count: number;
  }>(
    `SELECT
       (SELECT COUNT(*)::int FROM canasta_precios) AS canasta_count,
       (SELECT COUNT(*)::int FROM medicamentos_precios) AS medicamentos_count,
       (SELECT COUNT(*)::int FROM centros_salud) AS centros_count`
  ).catch(() => [{ canasta_count: 526, medicamentos_count: 216, centros_count: 45 }]);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
      {/* KPI 1: SICOES */}
      <div className="bg-white p-5 rounded-2xl border border-[#e0e2eb] shadow-sm flex flex-col justify-between">
        <div className="flex items-center justify-between text-[#717785] text-[13px] font-medium">
          <span>Licitaciones SICOES</span>
          <span className="material-symbols-outlined text-[#005cb8]">gavel</span>
        </div>
        <div className="text-3xl font-bold text-[#181c22] mt-2 font-mono">
          {metrics.totalConvocatorias}
        </div>
        <div className="flex items-center gap-1.5 mt-3 text-[12px] text-emerald-600 font-medium">
          <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
          <span>{metrics.vigentes} vigentes • 9 Departamentos</span>
        </div>
      </div>

      {/* KPI 2: Canasta Familiar */}
      <div className="bg-white p-5 rounded-2xl border border-[#e0e2eb] shadow-sm flex flex-col justify-between">
        <div className="flex items-center justify-between text-[#717785] text-[13px] font-medium">
          <span>Canasta Familiar (Dual)</span>
          <span className="material-symbols-outlined text-amber-600">shopping_basket</span>
        </div>
        <div className="text-3xl font-bold text-[#181c22] mt-2 font-mono">
          {extra?.canasta_count || 526}
        </div>
        <div className="flex items-center gap-1.5 mt-3 text-[12px] text-amber-700 font-medium">
          <span>OAP Mercados vs Hipermaxi</span>
        </div>
      </div>

      {/* KPI 3: Farmacias & Centros OSM */}
      <div className="bg-white p-5 rounded-2xl border border-[#e0e2eb] shadow-sm flex flex-col justify-between">
        <div className="flex items-center justify-between text-[#717785] text-[13px] font-medium">
          <span>Salud & Farmacias</span>
          <span className="material-symbols-outlined text-purple-600">local_pharmacy</span>
        </div>
        <div className="text-3xl font-bold text-[#181c22] mt-2 font-mono">
          {(extra?.medicamentos_count || 216) + (extra?.centros_count || 45)}
        </div>
        <div className="flex items-center gap-1.5 mt-3 text-[12px] text-purple-700 font-medium">
          <span>{extra?.medicamentos_count || 216} fármacos • {extra?.centros_count || 45} hospitales</span>
        </div>
      </div>

      {/* KPI 4: Telegram Mining */}
      <div className="bg-white p-5 rounded-2xl border border-[#e0e2eb] shadow-sm flex flex-col justify-between">
        <div className="flex items-center justify-between text-[#717785] text-[13px] font-medium">
          <span>Consultas en Telegram</span>
          <span className="material-symbols-outlined text-[#005cb8]">forum</span>
        </div>
        <div className="text-3xl font-bold text-[#181c22] mt-2 font-mono">
          {metrics.totalConsultasTelegram}
        </div>
        <div className="flex items-center gap-1.5 mt-3 text-[12px] text-emerald-600 font-medium">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
          <span>Web Usage Mining Activo</span>
        </div>
      </div>
    </div>
  );
}

export default function HomePage() {
  return (
    <div className="flex flex-col gap-8 max-w-7xl mx-auto">
      {/* Banner Principal de Bienvenida */}
      <div className="bg-gradient-to-r from-[#005cb8] via-[#006bd6] to-[#1275e2] text-white p-6 sm:p-8 rounded-3xl shadow-sm flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
        <div className="flex flex-col gap-2.5 max-w-2xl">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded bg-white/20 text-white text-[11px] font-mono uppercase tracking-wider font-bold">
              PROYECTO DE MINERÍA WEB // BOLIVIA 2026
            </span>
            <span className="text-white/80 text-[12px] hidden sm:inline">• Ecosistema Unificado</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
            Plataforma Integral de Inteligencia de Datos y Acceso Ciudadano
          </h1>
          <p className="text-white/90 text-[14px] sm:text-[15px] leading-relaxed">
            Integración de <strong>Web Content Mining</strong> (SICOES, Canasta OAP, Farmacorp, Chávez), <strong>Web Structure Mining</strong> (PageRank & HITS) y <strong>Web Usage Mining</strong> con consulta 24/7 vía <strong>Telegram</strong> y base vectorial <strong>PostgreSQL (pgvector)</strong>.
          </p>
        </div>

        <div className="flex flex-wrap sm:flex-col gap-2.5 w-full sm:w-auto shrink-0">
          <Link
            href="/licitaciones"
            className="flex-1 sm:flex-none bg-white text-[#005cb8] px-5 py-3 rounded-xl text-[14px] font-bold hover:bg-white/90 transition-all text-center shadow-xs"
          >
            Explorar SICOES
          </Link>
          <Link
            href="/canasta"
            className="flex-1 sm:flex-none bg-white/10 text-white border border-white/30 px-5 py-3 rounded-xl text-[14px] font-bold hover:bg-white/20 transition-all text-center"
          >
            Ver Canasta Familiar
          </Link>
        </div>
      </div>

      {/* Grid de KPIs Principales */}
      <Suspense
        fallback={
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className="bg-white p-6 rounded-2xl border border-[#e0e2eb] shadow-sm h-32 animate-pulse"
              />
            ))}
          </div>
        }
      >
        <DashboardKpis />
      </Suspense>

      {/* Grid de las 6 Secciones del Sistema */}
      <div className="flex flex-col gap-3">
        <h2 className="text-[18px] font-bold text-[#181c22]">
          Módulos y Servicios de la Plataforma
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {/* Módulo 1: Licitaciones */}
          <Link
            href="/licitaciones"
            className="bg-white p-5 rounded-2xl border border-[#e0e2eb] hover:border-[#005cb8] hover:shadow-md transition-all group flex flex-col justify-between"
          >
            <div className="flex items-start gap-3.5">
              <div className="w-11 h-11 rounded-xl bg-blue-50 text-[#005cb8] flex items-center justify-center shrink-0 group-hover:bg-[#005cb8] group-hover:text-white transition-colors">
                <span className="material-symbols-outlined text-[22px]">gavel</span>
              </div>
              <div className="flex flex-col gap-1">
                <h3 className="text-[15px] font-bold text-[#181c22] group-hover:text-[#005cb8] transition-colors">
                  Licitaciones & Semántica
                </h3>
                <p className="text-[12px] text-[#414753] leading-relaxed">
                  Búsqueda vectorial con <code>pgvector</code> y similitud de coseno en los 9 departamentos de Bolivia.
                </p>
              </div>
            </div>
            <div className="mt-4 pt-3 border-t border-[#f1f3fc] flex items-center justify-between text-[11px] font-mono text-[#005cb8] font-bold">
              <span>SICOES Oficial</span>
              <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
            </div>
          </Link>

          {/* Módulo 2: Canasta Familiar */}
          <Link
            href="/canasta"
            className="bg-white p-5 rounded-2xl border border-[#e0e2eb] hover:border-amber-600 hover:shadow-md transition-all group flex flex-col justify-between"
          >
            <div className="flex items-start gap-3.5">
              <div className="w-11 h-11 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0 group-hover:bg-amber-600 group-hover:text-white transition-colors">
                <span className="material-symbols-outlined text-[22px]">shopping_basket</span>
              </div>
              <div className="flex flex-col gap-1">
                <h3 className="text-[15px] font-bold text-[#181c22] group-hover:text-amber-600 transition-colors">
                  Canasta Familiar (Dual)
                </h3>
                <p className="text-[12px] text-[#414753] leading-relaxed">
                  Cotejo de precios entre mercados populares (OAP) y supermercados (Hipermaxi) con cálculo de brecha de ahorro.
                </p>
              </div>
            </div>
            <div className="mt-4 pt-3 border-t border-[#f1f3fc] flex items-center justify-between text-[11px] font-mono text-amber-700 font-bold">
              <span>OAP vs Hipermaxi</span>
              <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
            </div>
          </Link>

          {/* Módulo 3: Farmacias & Salud */}
          <Link
            href="/salud"
            className="bg-white p-5 rounded-2xl border border-[#e0e2eb] hover:border-purple-600 hover:shadow-md transition-all group flex flex-col justify-between"
          >
            <div className="flex items-start gap-3.5">
              <div className="w-11 h-11 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0 group-hover:bg-purple-600 group-hover:text-white transition-colors">
                <span className="material-symbols-outlined text-[22px]">local_pharmacy</span>
              </div>
              <div className="flex flex-col gap-1">
                <h3 className="text-[15px] font-bold text-[#181c22] group-hover:text-purple-600 transition-colors">
                  Farmacias & Centros OSM
                </h3>
                <p className="text-[12px] text-[#414753] leading-relaxed">
                  Comparador de fármacos Farmacorp vs Farmacias Chávez con enlaces de compra y red de centros de salud.
                </p>
              </div>
            </div>
            <div className="mt-4 pt-3 border-t border-[#f1f3fc] flex items-center justify-between text-[11px] font-mono text-purple-700 font-bold">
              <span>Farmacorp • Chávez • OSM</span>
              <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
            </div>
          </Link>

          {/* Módulo 4: Grafo & PageRank */}
          <Link
            href="/grafo"
            className="bg-white p-5 rounded-2xl border border-[#e0e2eb] hover:border-indigo-600 hover:shadow-md transition-all group flex flex-col justify-between"
          >
            <div className="flex items-start gap-3.5">
              <div className="w-11 h-11 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0 group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                <span className="material-symbols-outlined text-[22px]">account_tree</span>
              </div>
              <div className="flex flex-col gap-1">
                <h3 className="text-[15px] font-bold text-[#181c22] group-hover:text-indigo-600 transition-colors">
                  Red Bipartita & PageRank
                </h3>
                <p className="text-[12px] text-[#414753] leading-relaxed">
                  Topología visual interactiva en SVG con PageRank estocástico ($d=0.85$) y algoritmo HITS (Hubs & Authorities).
                </p>
              </div>
            </div>
            <div className="mt-4 pt-3 border-t border-[#f1f3fc] flex items-center justify-between text-[11px] font-mono text-indigo-700 font-bold">
              <span>SVG Topology Network</span>
              <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
            </div>
          </Link>

          {/* Módulo 5: Pipeline de Scrapers */}
          <Link
            href="/scraper"
            className="bg-white p-5 rounded-2xl border border-[#e0e2eb] hover:border-slate-800 hover:shadow-md transition-all group flex flex-col justify-between"
          >
            <div className="flex items-start gap-3.5">
              <div className="w-11 h-11 rounded-xl bg-gray-100 text-gray-800 flex items-center justify-center shrink-0 group-hover:bg-gray-800 group-hover:text-white transition-colors">
                <span className="material-symbols-outlined text-[22px]">terminal</span>
              </div>
              <div className="flex flex-col gap-1">
                <h3 className="text-[15px] font-bold text-[#181c22] group-hover:text-gray-900 transition-colors">
                  Pipeline de Scrapers
                </h3>
                <p className="text-[12px] text-[#414753] leading-relaxed">
                  Supervisión y control del rastreo automatizado de los 4 scrapers oficiales del proyecto en Neon DB.
                </p>
              </div>
            </div>
            <div className="mt-4 pt-3 border-t border-[#f1f3fc] flex items-center justify-between text-[11px] font-mono text-gray-700 font-bold">
              <span>Playwright & Local ETL</span>
              <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
            </div>
          </Link>

          {/* Módulo 6: Bot Telegram & Telemetría */}
          <Link
            href="/telemetria"
            className="bg-white p-5 rounded-2xl border border-[#e0e2eb] hover:border-emerald-600 hover:shadow-md transition-all group flex flex-col justify-between"
          >
            <div className="flex items-start gap-3.5">
              <div className="w-11 h-11 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0 group-hover:bg-emerald-600 group-hover:text-white transition-colors">
                <span className="material-symbols-outlined text-[22px]">cell_tower</span>
              </div>
              <div className="flex flex-col gap-1">
                <h3 className="text-[15px] font-bold text-[#181c22] group-hover:text-emerald-600 transition-colors">
                  Bot Telegram & Telemetría
                </h3>
                <p className="text-[12px] text-[#414753] leading-relaxed">
                  Simulador interactivo en el navegador y registro en vivo de consultas ciudadanas (Web Usage Mining).
                </p>
              </div>
            </div>
            <div className="mt-4 pt-3 border-t border-[#f1f3fc] flex items-center justify-between text-[11px] font-mono text-emerald-700 font-bold">
              <span>@ChatDM7200bot</span>
              <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
}
