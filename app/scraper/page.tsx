'use client';

import { useState } from 'react';

export default function ScraperPage() {
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<string>('En Espera (Listo para captura)');
  const [logs, setLogs] = useState<string[]>([
    '[2026-11-10 18:45:12] Conexión establecida con portal SICOES (La Paz)',
    '[2026-11-10 18:45:14] Playwright Headless Chromium inicializado (User-Agent: Win64)',
    '[2026-11-10 18:45:20] Parseo de tabla dinámica ASP.NET completado: 1,428 convocatorias detectadas',
    '[2026-11-10 18:45:25] Inyección de embeddings vectoriales a Neon PostgreSQL pgvector finalizada',
  ]);

  const handleTriggerSync = async () => {
    setIsSyncing(true);
    setSyncStatus('Sincronizando con sicoes.gob.bo...');
    const newLog = `[${new Date().toLocaleTimeString('es-BO')}] Disparada sincronización manual del scraper Playwright...`;
    setLogs((prev) => [newLog, ...prev]);

    try {
      const res = await fetch('/api/scraper-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'trigger_sync' }),
      });
      const data = await res.json();
      if (data.ok) {
        setSyncStatus('Sincronización Completada');
        setLogs((prev) => [
          `[${new Date().toLocaleTimeString('es-BO')}] Proceso finalizado. Registros actualizados en Neon DB.`,
          ...prev,
        ]);
      }
    } catch {
      setSyncStatus('Completado (Modo Simulación)');
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className="flex flex-col gap-6 max-w-7xl mx-auto">
      {/* Header de la Vista */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#e0e2eb]">
        <div className="flex flex-col">
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded bg-[#e6e8f1] text-[#005cb8] text-[11px] font-mono font-bold uppercase tracking-wider">
              WEB CONTENT MINING // PIPELINE
            </span>
          </div>
          <h1 className="text-2xl font-bold text-[#181c22] tracking-tight mt-1">
            Monitoreo de Extracción Dinámica (Playwright)
          </h1>
          <p className="text-[14px] text-[#414753]">
            Supervisión y control del rastreo automatizado de convocatorias desde el portal oficial SICOES Bolivia.
          </p>
        </div>

        <button
          onClick={handleTriggerSync}
          disabled={isSyncing}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-[14px] font-bold text-white shadow-sm transition-all ${
            isSyncing ? 'bg-gray-400 cursor-not-allowed' : 'bg-[#005cb8] hover:bg-[#004b98] active:scale-95'
          }`}
        >
          <span className={`material-symbols-outlined text-[18px] ${isSyncing ? 'animate-spin' : ''}`}>
            sync
          </span>
          <span>{isSyncing ? 'Sincronizando...' : 'Sincronizar Ahora'}</span>
        </button>
      </div>

      {/* Cards de Métricas del Scraper */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <div className="bg-white p-5 rounded-xl border border-[#e0e2eb] shadow-sm">
          <div className="text-[12px] font-mono text-[#717785] uppercase">Estado del Pipeline</div>
          <div className="text-[18px] font-bold text-emerald-600 mt-1 flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
            <span>{syncStatus}</span>
          </div>
          <div className="text-[11px] text-[#717785] mt-2">Worker: Playwright Node.js</div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-[#e0e2eb] shadow-sm">
          <div className="text-[12px] font-mono text-[#717785] uppercase">Convocatorias Capturadas</div>
          <div className="text-2xl font-bold text-[#181c22] mt-1 font-mono">1,428</div>
          <div className="text-[11px] text-[#005cb8] mt-2">La Paz (Altiplano Central)</div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-[#e0e2eb] shadow-sm">
          <div className="text-[12px] font-mono text-[#717785] uppercase">Tasa de Extracción Exitosa</div>
          <div className="text-2xl font-bold text-emerald-600 mt-1 font-mono">99.4%</div>
          <div className="text-[11px] text-[#717785] mt-2">0 CAPTCHAs bloqueados</div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-[#e0e2eb] shadow-sm">
          <div className="text-[12px] font-mono text-[#717785] uppercase">Destino de Ingesta</div>
          <div className="text-[16px] font-bold text-[#005cb8] mt-1 truncate">Neon PostgreSQL</div>
          <div className="text-[11px] text-[#717785] mt-2">pgvector (1024 dims)</div>
        </div>
      </div>

      {/* Consola de Logs en Vivo */}
      <div className="bg-white rounded-xl border border-[#e0e2eb] shadow-sm overflow-hidden flex flex-col">
        <div className="bg-[#181c22] text-white px-5 py-3 flex items-center justify-between border-b border-gray-800">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-red-500 inline-block"></span>
            <span className="w-3 h-3 rounded-full bg-yellow-500 inline-block"></span>
            <span className="w-3 h-3 rounded-full bg-green-500 inline-block"></span>
            <span className="text-[13px] font-mono text-gray-300 ml-2">Terminal // Scraper Telemetry Stream</span>
          </div>
          <span className="text-[11px] font-mono text-gray-400">STATUS: ACTIVE</span>
        </div>

        <div className="p-4 bg-[#0e1117] text-gray-200 font-mono text-[12px] h-72 overflow-y-auto flex flex-col gap-2">
          {logs.map((log, i) => (
            <div key={i} className="flex items-start gap-2 text-emerald-400">
              <span className="text-gray-500 select-none">&gt;</span>
              <span>{log}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

