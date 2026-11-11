import type { Metadata } from 'next';
import './globals.css';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'SICOES-Miner La Paz | Minería Web & Contrataciones Estatales',
  description:
    'Plataforma de Minería Web, Búsqueda Semántica con pgvector, PageRank y Telemetría de Contrataciones Estatales en La Paz, Bolivia.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" className="h-full light" style={{ colorScheme: 'light' }}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200"
          rel="stylesheet"
        />
      </head>
      <body className="bg-surface text-on-surface font-sans min-h-screen flex antialiased">
        {/* Barra Lateral / Sidebar Global */}
        <aside className="fixed left-0 top-0 h-full w-72 bg-surface-container-lowest z-50 flex flex-col justify-between shadow-[0_1px_8px_rgba(0,0,0,0.04)] border-r border-outline-variant/50">
          <div className="flex flex-col">
            {/* Header del Sidebar */}
            <div className="h-16 px-6 flex items-center gap-3 bg-surface-container-low border-b border-outline-variant/40">
              <div className="w-9 h-9 rounded-lg bg-surface-container-high flex items-center justify-center text-primary">
                <span className="material-symbols-outlined text-[20px]">hub</span>
              </div>
              <div className="flex flex-col overflow-hidden">
                <span className="text-[16px] font-bold text-on-surface tracking-tight truncate">
                  SICOES-Miner
                </span>
                <span className="text-[11px] font-mono text-primary uppercase tracking-wider truncate">
                  Dep. La Paz • v2.4
                </span>
              </div>
            </div>

            {/* Sub-tarjeta de estado del nodo */}
            <div className="p-4">
              <div className="bg-surface-container-low p-3 rounded-lg flex flex-col gap-1 border border-outline-variant/30">
                <div className="flex items-center justify-between text-on-surface-variant text-[11px] font-mono uppercase">
                  <span className="flex items-center gap-1">
                    <span className="material-symbols-outlined text-[14px]">terminal</span> Pipeline Node
                  </span>
                  <span className="text-secondary font-bold">LPZ-01</span>
                </div>
                <div className="text-[12px] font-medium text-on-surface truncate">
                  Cluster: Altiplano Central (Neon DB)
                </div>
              </div>
            </div>

            {/* Menú de Navegación */}
            <nav className="flex flex-col gap-1 px-4 py-2">
              <div className="px-3 py-1 text-[11px] font-mono uppercase tracking-wider text-outline">
                Inteligencia & Auditoría
              </div>
              <Link
                href="/scraper"
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-[14px] font-medium text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-colors"
              >
                <span className="material-symbols-outlined text-[20px] text-primary">dashboard</span>
                <span>Monitoreo & Scraper</span>
              </Link>
              <Link
                href="/licitaciones"
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-[14px] font-medium text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-colors"
              >
                <span className="material-symbols-outlined text-[20px] text-primary">gavel</span>
                <span>Licitaciones & Semántica</span>
              </Link>
              <Link
                href="/grafo"
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-[14px] font-medium text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-colors"
              >
                <span className="material-symbols-outlined text-[20px] text-primary">account_tree</span>
                <span>Minería de Red & PageRank</span>
              </Link>

              <div className="px-3 pt-4 pb-1 text-[11px] font-mono uppercase tracking-wider text-outline">
                Integración & Despacho
              </div>
              <Link
                href="/telemetria"
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-[14px] font-medium text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-colors"
              >
                <span className="material-symbols-outlined text-[20px] text-primary">cell_tower</span>
                <span>Bot Telegram & Telemetría</span>
              </Link>
            </nav>
          </div>

          {/* Footer del Sidebar */}
          <div className="p-4 flex flex-col gap-2 bg-surface-container-lowest border-t border-outline-variant/40">
            <div className="bg-surface-container-low p-3 rounded-lg flex flex-col gap-1.5">
              <div className="flex items-center justify-between text-[11px] font-mono text-on-surface-variant">
                <span className="flex items-center gap-1">
                  <span className="material-symbols-outlined text-[14px] text-primary">storage</span> pgvector Sync
                </span>
                <span className="text-primary font-bold">100% OK</span>
              </div>
              <div className="w-full bg-surface-container-highest h-1.5 rounded-full overflow-hidden">
                <div className="bg-primary h-full w-full"></div>
              </div>
            </div>
            <div className="flex items-center justify-between text-[11px] font-mono text-outline pt-1">
              <span>SICOES / UMSA 2026</span>
              <span>La Paz, BO</span>
            </div>
          </div>
        </aside>

        {/* Contenido Principal con Header Superior */}
        <div className="pl-72 flex-1 flex flex-col min-h-screen">
          <header className="sticky top-0 z-40 h-16 bg-surface/90 backdrop-blur-md flex items-center justify-between px-8 border-b border-outline-variant/40 shadow-xs">
            <div className="flex items-center gap-4">
              <div className="flex flex-col">
                <div className="flex items-center gap-2">
                  <span className="text-[17px] font-bold text-on-surface tracking-tight">
                    SICOES-Miner La Paz
                  </span>
                  <span className="px-2 py-0.5 rounded bg-surface-container-high text-primary text-[10px] font-mono font-bold uppercase tracking-wider">
                    LP-MINING-CORE
                  </span>
                </div>
                <span className="text-[12px] text-on-surface-variant hidden sm:inline">
                  Minería Web de Contrataciones Estatales, PageRank y Consulta en Línea
                </span>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 bg-emerald-50 text-emerald-700 px-3 py-1 rounded-full text-[12px] font-medium border border-emerald-200">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                <span>Neon PostgreSQL (Online)</span>
              </div>
              <Link
                href="/telemetria"
                className="flex items-center gap-1.5 bg-primary text-white px-3.5 py-1.5 rounded-lg text-[13px] font-medium hover:bg-primary/90 transition-colors shadow-xs"
              >
                <span className="material-symbols-outlined text-[16px]">send</span>
                <span>Probar Bot</span>
              </Link>
            </div>
          </header>

          <main className="flex-1 p-8 bg-surface">{children}</main>
        </div>
      </body>
    </html>
  );
}
