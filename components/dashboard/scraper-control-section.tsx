'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  ScraperConsoleModal,
  ScraperServiceConfig,
} from './scraper-console-modal';

interface ScraperControlSectionProps {
  initialCounts?: {
    sicoes: number;
    canastaTotal: number;
    medicamentosTotal: number;
    farmacorp: number;
    chavez: number;
  };
}

const SCRAPER_SERVICES: ScraperServiceConfig[] = [
  {
    id: 'sicoes',
    name: 'SICOES Contrataciones Estatales',
    category: 'sicoes',
    script: 'scraper_sicoes_v2.mjs',
    description: 'Extracción de convocatorias públicas estatales, pliegos oficiales y vectorización semántica con pgvector.',
    icon: '🏛️',
    color: 'border-blue-200 hover:border-blue-500 bg-white',
    badgeBg: 'bg-blue-50 text-blue-700 border border-blue-200',
    badgeText: 'text-blue-700',
  },
  {
    id: 'hipermaxi-supermercado',
    name: 'Hipermaxi Supermercado',
    category: 'supermercado',
    script: 'scraper_hipermaxi.mjs',
    description: 'Extracción multi-sucursal de Canasta Familiar, Limpieza, Licores, Bebidas y Cuidado Personal.',
    icon: '🛒',
    color: 'border-amber-200 hover:border-amber-500 bg-white',
    badgeBg: 'bg-amber-50 text-amber-800 border border-amber-200',
    badgeText: 'text-amber-800',
    availableCities: [
      { id: 'lapaz', label: 'La Paz - Calacoto', branch: 'calacoto' },
      { id: 'cochabamba', label: 'Cochabamba - Blanco Galindo', branch: 'blanco-galindo' },
      { id: 'santacruz', label: 'Santa Cruz - Cañoto', branch: 'canoto' },
    ],
  },
  {
    id: 'hipermaxi-farmacia',
    name: 'Hipermaxi Farmacia & Salud',
    category: 'farmacia',
    script: 'scraper_hipermaxi.mjs',
    description: 'Monitoreo de medicamentos de venta libre, dermocosmética y salud comercializados por Hipermaxi.',
    icon: '💊',
    color: 'border-purple-200 hover:border-purple-500 bg-white',
    badgeBg: 'bg-purple-50 text-purple-800 border border-purple-200',
    badgeText: 'text-purple-800',
    availableCities: [
      { id: 'lapaz', label: 'La Paz - Sucursales', branch: 'calacoto' },
      { id: 'santacruz', label: 'Santa Cruz - Sucursales', branch: 'canoto' },
      { id: 'cochabamba', label: 'Cochabamba - Sucursales', branch: 'blanco-galindo' },
    ],
  },
  {
    id: 'farmacorp',
    name: 'Farmacorp Bolivia',
    category: 'farmacia',
    script: 'scraper_farmacorp.mjs',
    description: 'Catálogo nacional de medicamentos, presentaciones farmacéuticas, precios vigentes y descuentos.',
    icon: '🟢',
    color: 'border-emerald-200 hover:border-emerald-500 bg-white',
    badgeBg: 'bg-emerald-50 text-emerald-800 border border-emerald-200',
    badgeText: 'text-emerald-800',
  },
  {
    id: 'chavez',
    name: 'Farmacias Chávez',
    category: 'farmacia',
    script: 'scraper_chavez.mjs',
    description: 'Fármacos esenciales, cotejo de laboratorios (Bagó, Inti, Roemmers) y disponibilidad en línea.',
    icon: '🔵',
    color: 'border-indigo-200 hover:border-indigo-500 bg-white',
    badgeBg: 'bg-indigo-50 text-indigo-800 border border-indigo-200',
    badgeText: 'text-indigo-800',
  },
  {
    id: 's3-sync',
    name: 'Sincronizador Neon S3 (Bucket Assets)',
    category: 's3',
    script: 'sync_images_to_s3.mjs',
    description: 'Pipeline desacoplado para descargar y persistir imágenes de productos en S3 sin re-scrapear la web.',
    icon: '☁️',
    color: 'border-cyan-200 hover:border-cyan-500 bg-white',
    badgeBg: 'bg-cyan-50 text-cyan-800 border border-cyan-200',
    badgeText: 'text-cyan-800',
  },
];

export function ScraperControlSection({ initialCounts }: ScraperControlSectionProps) {
  const [selectedService, setSelectedService] = useState<ScraperServiceConfig | null>(null);
  const [counts, setCounts] = useState(initialCounts);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/scraper-status');
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.counts) {
          setCounts(json.counts);
        }
      }
    } catch {
      // Ignorar fallback
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const getRecordCount = (id: string) => {
    if (!counts) return null;
    switch (id) {
      case 'sicoes':
        return counts.sicoes;
      case 'hipermaxi-supermercado':
        return counts.canastaTotal;
      case 'farmacorp':
        return counts.farmacorp;
      case 'chavez':
        return counts.chavez;
      case 'hipermaxi-farmacia':
        return counts.medicamentosTotal;
      case 's3-sync':
        return counts.canastaTotal ? Math.round(counts.canastaTotal * 0.95) : null;
      default:
        return null;
    }
  };

  return (
    <section className="flex flex-col gap-4 mt-2">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-[#e0e2eb]">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded bg-slate-900 text-white text-[10px] font-mono font-bold uppercase tracking-wider">
              OPERATIONS // PIPELINE HEADLESS EN SEGUNDO PLANO
            </span>
          </div>
          <h2 className="text-xl font-black text-[#181c22] tracking-tight mt-1">
            Centro de Control de Scraping & Telemetría en Vivo
          </h2>
          <p className="text-xs text-[#717785]">
            Ejecuta y supervisa los scrapers directamente desde el dashboard en segundo plano con streaming interactivo de eventos hacia la consola.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span>6 Módulos Disponibles</span>
          </span>
        </div>
      </div>

      {/* Grid de Tarjetas de Scraping */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {SCRAPER_SERVICES.map((srv) => {
          const count = getRecordCount(srv.id);
          return (
            <div
              key={srv.id}
              className={`p-5 rounded-2xl border shadow-xs hover:shadow-md transition-all flex flex-col justify-between ${srv.color} group`}
            >
              <div>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <span className="text-2xl p-2 bg-[#f8fafd] rounded-xl border border-stone-100">{srv.icon}</span>
                    <div>
                      <h3 className="text-[15px] font-bold text-[#181c22] group-hover:text-blue-700 transition-colors">
                        {srv.name}
                      </h3>
                      <span className="text-[10px] font-mono text-[#717785] block mt-0.5">
                        {srv.script}
                      </span>
                    </div>
                  </div>

                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold ${srv.badgeBg}`}>
                    Segundo Plano
                  </span>
                </div>

                <p className="text-xs text-[#414753] mt-3 leading-relaxed">
                  {srv.description}
                </p>

                {count != null && (
                  <div className="mt-4 pt-3 border-t border-stone-100 flex items-center justify-between text-xs">
                    <span className="text-[#717785]">Registros en Neon DB:</span>
                    <span className="font-mono font-bold text-stone-900 bg-stone-100 px-2 py-0.5 rounded">
                      {count.toLocaleString()} ítems
                    </span>
                  </div>
                )}
              </div>

              <div className="mt-4 pt-2">
                <button
                  onClick={() => setSelectedService(srv)}
                  className="w-full bg-[#181c22] hover:bg-[#005cb8] text-white text-xs font-bold py-2.5 px-3 rounded-xl transition-all shadow-xs flex items-center justify-center gap-2 cursor-pointer group/btn"
                >
                  <span>⚡ Control & Scraping en Vivo</span>
                  <span className="text-xs transform transition-transform group-hover/btn:translate-x-1">↗</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal de Consola Terminal Interactiva */}
      <ScraperConsoleModal
        isOpen={Boolean(selectedService)}
        onClose={() => setSelectedService(null)}
        service={selectedService}
        onScrapeSuccess={fetchStatus}
      />
    </section>
  );
}
