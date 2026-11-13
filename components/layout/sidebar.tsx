'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect } from 'react';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export function Sidebar({ isOpen, onClose }: SidebarProps) {
  const pathname = usePathname();

  // Cerrar sidebar en cambio de ruta en móvil
  useEffect(() => {
    onClose();
  }, [pathname, onClose]);

  const navLinks = [
    {
      group: 'Inteligencia & Mercados',
      items: [
        { href: '/', label: 'Dashboard Global', icon: 'dashboard' },
        { href: '/licitaciones', label: 'Licitaciones SICOES', icon: 'gavel' },
        { href: '/canasta', label: 'Canasta Familiar (Dual)', icon: 'shopping_basket' },
        { href: '/salud', label: 'Farmacias & Salud OSM', icon: 'local_pharmacy' },
      ],
    },
    {
      group: 'Minería & Algoritmos',
      items: [
        { href: '/grafo', label: 'Red & PageRank', icon: 'account_tree' },
        { href: '/scraper', label: 'Pipeline de Scrapers', icon: 'terminal' },
        { href: '/telemetria', label: 'Bot Telegram & Uso', icon: 'cell_tower' },
      ],
    },
  ];

  return (
    <>
      {/* Backdrop para dispositivos móviles */}
      {isOpen && (
        <div
          onClick={onClose}
          className="fixed inset-0 bg-black/50 z-40 lg:hidden backdrop-blur-xs transition-opacity"
          aria-hidden="true"
        />
      )}

      {/* Contenedor del Sidebar */}
      <aside
        className={`fixed left-0 top-0 h-full w-64 bg-white z-50 flex flex-col justify-between border-r border-[#e0e2eb] shadow-sm transition-transform duration-300 ease-in-out ${
          isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        <div className="flex flex-col">
          {/* Header del Sidebar */}
          <div className="h-16 px-5 flex items-center justify-between border-b border-[#e0e2eb] bg-[#f8fafd]">
            <Link href="/" className="flex items-center gap-2.5 overflow-hidden">
              <div className="w-8 h-8 rounded-lg bg-[#005cb8] flex items-center justify-center text-white shrink-0 shadow-xs">
                <span className="material-symbols-outlined text-[18px]">hub</span>
              </div>
              <div className="flex flex-col overflow-hidden">
                <span className="text-[15px] font-bold text-[#181c22] tracking-tight truncate leading-tight">
                  DataMiner BO
                </span>
                <span className="text-[10px] font-mono text-[#005cb8] font-bold uppercase tracking-wider truncate">
                  SICOES • OAP • FARM
                </span>
              </div>
            </Link>

            {/* Botón cerrar para móvil */}
            <button
              onClick={onClose}
              className="p-1 rounded-lg hover:bg-gray-200 text-gray-500 lg:hidden"
              aria-label="Cerrar navegación"
            >
              <span className="material-symbols-outlined text-[20px]">close</span>
            </button>
          </div>

          {/* Estado de conexión del Pipeline */}
          <div className="p-3">
            <div className="bg-[#f1f3fc] p-2.5 rounded-xl flex flex-col gap-1 border border-[#e0e2eb]/60">
              <div className="flex items-center justify-between text-[#414753] text-[10px] font-mono uppercase">
                <span className="flex items-center gap-1 font-bold">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                  Neon PostgreSQL
                </span>
                <span className="text-[#005cb8] font-bold">pgvector</span>
              </div>
              <div className="text-[11px] text-[#717785] truncate font-medium">
                4 Pipelines ETL Sincronizados
              </div>
            </div>
          </div>

          {/* Menú de Navegación */}
          <nav className="flex flex-col gap-4 px-3 py-1 overflow-y-auto max-h-[calc(100vh-210px)]">
            {navLinks.map((section) => (
              <div key={section.group} className="flex flex-col gap-1">
                <div className="px-3 text-[10px] font-mono uppercase tracking-wider text-[#717785] font-bold">
                  {section.group}
                </div>
                {section.items.map((item) => {
                  const isActive = pathname === item.href;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`flex items-center gap-2.5 px-3 py-2 rounded-xl text-[13px] font-medium transition-all ${
                        isActive
                          ? 'bg-[#005cb8] text-white shadow-xs font-semibold'
                          : 'text-[#414753] hover:bg-[#f1f3fc] hover:text-[#181c22]'
                      }`}
                    >
                      <span
                        className={`material-symbols-outlined text-[18px] ${
                          isActive ? 'text-white' : 'text-[#005cb8]'
                        }`}
                      >
                        {item.icon}
                      </span>
                      <span className="truncate">{item.label}</span>
                    </Link>
                  );
                })}
              </div>
            ))}
          </nav>
        </div>

        {/* Footer del Sidebar */}
        <div className="p-3.5 border-t border-[#e0e2eb] bg-[#f8fafd] flex flex-col gap-1.5">
          <div className="flex items-center justify-between text-[11px] font-mono text-[#414753]">
            <span>Bot Telegram</span>
            <span className="text-emerald-700 font-bold">@ChatDM7200bot</span>
          </div>
          <div className="flex items-center justify-between text-[10px] font-mono text-[#717785]">
            <span>UMSA Minería Web</span>
            <span>2026</span>
          </div>
        </div>
      </aside>
    </>
  );
}

