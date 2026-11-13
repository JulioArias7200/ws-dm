'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Sidebar } from './sidebar';

export function AppShell({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen flex flex-col bg-[#f9f9ff] text-[#181c22]">
      {/* Sidebar Responsive */}
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* Contenedor Principal (Con margen a la izquierda en pantallas grandes) */}
      <div className="lg:pl-64 flex-1 flex flex-col min-h-screen">
        {/* Header Superior */}
        <header className="sticky top-0 z-30 h-16 bg-white/95 backdrop-blur-md flex items-center justify-between px-4 sm:px-8 border-b border-[#e0e2eb] shadow-xs">
          <div className="flex items-center gap-3">
            {/* Botón Hamburguesa para Móvil */}
            <button
              onClick={() => setSidebarOpen(true)}
              className="p-2 rounded-xl border border-[#e0e2eb] hover:bg-[#f1f3fc] text-[#414753] lg:hidden flex items-center justify-center transition-colors"
              aria-label="Abrir menú de navegación"
            >
              <span className="material-symbols-outlined text-[20px]">menu</span>
            </button>

            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <span className="text-[16px] sm:text-[17px] font-bold text-[#181c22] tracking-tight">
                  Minería Web Bolivia
                </span>
                <span className="hidden sm:inline px-2 py-0.5 rounded bg-[#e6e8f1] text-[#005cb8] text-[10px] font-mono font-bold uppercase tracking-wider">
                  CORE-NODE v2.5
                </span>
              </div>
              <span className="text-[11px] text-[#717785] hidden md:inline truncate">
                Contrataciones SICOES • Canasta Familiar OAP vs Hipermaxi • Salud OSM & Farmacias
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-4">
            <div className="hidden sm:flex items-center gap-2 bg-emerald-50 text-emerald-700 px-3 py-1 rounded-full text-[12px] font-medium border border-emerald-200">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              <span>Neon DB (Online)</span>
            </div>

            <Link
              href="/telemetria"
              className="flex items-center gap-1.5 bg-[#005cb8] text-white px-3.5 py-1.5 rounded-xl text-[13px] font-bold hover:bg-[#004b98] transition-colors shadow-xs"
            >
              <span className="material-symbols-outlined text-[16px]">send</span>
              <span className="hidden xs:inline">Probar Bot</span>
            </Link>
          </div>
        </header>

        {/* Contenido Dinámico de la Página */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">{children}</main>
      </div>
    </div>
  );
}

