'use client';

import { useState, useEffect } from 'react';

interface UsageLog {
  id?: number;
  telegram_user_id?: number;
  username?: string;
  query_text: string;
  matched_cuce?: string;
  response_time_ms: number;
  queried_at?: string;
}

export default function TelemetriaPage() {
  const [logs, setLogs] = useState<UsageLog[]>([]);
  const [testQuery, setTestQuery] = useState('');
  const [testResponse, setTestResponse] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    async function loadLogs() {
      try {
        const res = await fetch('/api/scraper-status');
        const data = await res.json();
        if (data.recentTelegramLogs) {
          setLogs(data.recentTelegramLogs);
        }
      } catch (err) {
        console.error('Error cargando telemetría:', err);
      }
    }
    loadLogs();
    const interval = setInterval(loadLogs, 10000);
    return () => clearInterval(interval);
  }, []);

  const handleTestBot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testQuery.trim()) return;

    setTesting(true);
    setTestResponse(null);

    try {
      const simulatedUpdate = {
        simulate: true,
        update_id: Date.now(),
        message: {
          message_id: 101,
          from: { id: 777999, is_bot: false, first_name: 'Simulador Web', username: 'web_tester' },
          chat: { id: 777999, first_name: 'Simulador', type: 'private' },
          date: Math.floor(Date.now() / 1000),
          text: testQuery,
        },
      };

      const res = await fetch('/api/telegram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(simulatedUpdate),
      });

      const payload = await res.json();
      if (res.ok && payload.ok) {
        setTestResponse(
          payload.reply ||
            `✅ Petición procesada por el Webhook de Telegram y registrada en Web Usage Mining.`
        );
        const refresh = await fetch('/api/scraper-status');
        const d = await refresh.json();
        if (d.recentTelegramLogs) setLogs(d.recentTelegramLogs);
      } else {
        setTestResponse(`❌ Error al invocar el webhook de Telegram.`);
      }
    } catch (err) {
      setTestResponse(`⚠️ Excepción: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setTesting(false);
    }
  };

  const avgLatency =
    logs.length > 0
      ? Math.round(logs.reduce((sum, l) => sum + (l.response_time_ms || 0), 0) / logs.length)
      : 0;
  const topQuery = logs[0]?.query_text || 'Sin consultas aún';

  return (
    <div className="flex flex-col gap-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#e0e2eb]">
        <div className="flex flex-col">
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded bg-[#e6e8f1] text-[#005cb8] text-[11px] font-mono font-bold uppercase tracking-wider">
              WEB USAGE MINING // TELEMETRÍA 24/7
            </span>
          </div>
          <h1 className="text-2xl font-bold text-[#181c22] tracking-tight mt-1">
            Bot de Telegram & Telemetría de Consultas
          </h1>
          <p className="text-[14px] text-[#414753]">
            Monitoreo en tiempo real de interacciones ciudadanas, patrones de búsqueda y latencias de respuesta.
          </p>
        </div>

        <div className="flex items-center gap-2 bg-emerald-50 text-emerald-700 px-3.5 py-1.5 rounded-xl border border-emerald-200 text-[12px] font-medium">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
          <span>Webhook Serverless: Activo</span>
        </div>
      </div>

      {/* Grid de Métricas de Uso */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        <div className="bg-white p-5 rounded-xl border border-[#e0e2eb] shadow-sm">
          <div className="text-[11px] font-mono text-[#717785] uppercase">Total Consultas Registradas</div>
          <div className="text-3xl font-bold text-[#181c22] mt-1 font-mono">{logs.length}</div>
          <div className="text-[11px] text-emerald-600 mt-2 font-medium">Persistido en Neon PostgreSQL</div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-[#e0e2eb] shadow-sm">
          <div className="text-[11px] font-mono text-[#717785] uppercase">Latencia Promedio Webhook</div>
          <div className="text-3xl font-bold text-[#005cb8] mt-1 font-mono">{avgLatency} ms</div>
          <div className="text-[11px] text-[#717785] mt-2">Vercel Serverless Edge</div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-[#e0e2eb] shadow-sm">
          <div className="text-[11px] font-mono text-[#717785] uppercase">Última Consulta Registrada</div>
          <div className="text-[18px] font-bold text-[#181c22] mt-1 truncate">{topQuery}</div>
          <div className="text-[11px] text-[#717785] mt-2">Bot @ChatDM7200bot • La Paz</div>
        </div>
      </div>

      {/* Simulador Interactivo de Consulta al Bot */}
      <div className="bg-white p-6 rounded-2xl border border-[#e0e2eb] shadow-sm flex flex-col gap-4">
        <div className="flex items-center gap-2 pb-2 border-b border-[#f1f3fc]">
          <span className="material-symbols-outlined text-[#005cb8]">send</span>
          <h2 className="text-[16px] font-bold text-[#181c22]">
            Simulador de Consulta al Bot de Telegram (Test In-Browser)
          </h2>
        </div>
        <p className="text-[13px] text-[#414753]">
          Prueba los 4 sectores principales del bot (<code>/start</code>, <code>/sicoes</code>, <code>/canasta</code>, <code>/salud</code>) o envía consultas directas con parámetros.
        </p>

        <div className="flex flex-wrap gap-2">
          {[
            '/start',
            '/sicoes',
            '/canasta',
            '/salud',
            '/buscar medicamentos',
            '/vigentes',
            '/canasta papa',
            '/salud hospital',
            '/entidades_top',
            '/stats',
          ].map((cmdBtn) => (
              <button
                key={cmdBtn}
                type="button"
                onClick={() => setTestQuery(cmdBtn)}
                className="px-2.5 py-1 rounded-lg bg-[#f1f3fc] text-[#005cb8] text-[12px] font-mono hover:bg-[#e0e6f8] transition-colors"
              >
                {cmdBtn}
              </button>
            )
          )}
        </div>

        <form onSubmit={handleTestBot} className="flex gap-3">
          <input
            type="text"
            value={testQuery}
            onChange={(e) => setTestQuery(e.target.value)}
            placeholder="Escribe un comando o consulta (ej. /vigentes o '/buscar medicamentos hospital')..."
            className="flex-1 px-4 py-2.5 bg-[#f8fafd] border border-[#e0e2eb] rounded-xl text-[14px] text-[#181c22] focus:outline-none focus:border-[#005cb8]"
          />
          <button
            type="submit"
            disabled={testing}
            className="bg-[#005cb8] text-white px-5 py-2.5 rounded-xl text-[14px] font-bold hover:bg-[#004b98] transition-colors disabled:opacity-50"
          >
            {testing ? 'Procesando...' : 'Enviar al Bot'}
          </button>
        </form>

        {testResponse && (
          <pre className="p-4 bg-blue-50 border border-blue-200 rounded-xl text-[12px] text-blue-950 font-mono whitespace-pre-wrap leading-relaxed">
            {testResponse}
          </pre>
        )}
      </div>

      {/* Feed en Vivo de Web Usage Mining */}
      <div className="bg-white rounded-2xl border border-[#e0e2eb] shadow-sm p-6 flex flex-col gap-4">
        <div className="flex items-center justify-between pb-3 border-b border-[#f1f3fc]">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[#005cb8]">history</span>
            <h2 className="text-[16px] font-bold text-[#181c22]">
              Registro Histórico de Consultas (Usage Mining Stream)
            </h2>
          </div>
          <span className="text-[11px] font-mono text-[#717785]">Últimas consultas registradas</span>
        </div>

        <div className="flex flex-col divide-y divide-[#f1f3fc]">
          {logs.map((log, i) => (
            <div key={log.id || i} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-start gap-3">
                <span className="material-symbols-outlined text-gray-400 text-[18px] mt-0.5">account_circle</span>
                <div className="flex flex-col">
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-bold text-[#181c22]">
                      @{log.username || 'usuario_telegram'}
                    </span>
                    {log.matched_cuce && (
                      <span className="px-2 py-0.5 rounded bg-blue-50 text-[#005cb8] text-[10px] font-mono font-bold">
                        CUCE: {log.matched_cuce}
                      </span>
                    )}
                  </div>
                  <span className="text-[13px] text-[#414753] mt-0.5 font-medium">
                    &quot;{log.query_text}&quot;
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-4 text-[12px] font-mono text-[#717785] self-end sm:self-auto">
                <span className="text-emerald-600 font-bold">{log.response_time_ms} ms</span>
                <span>{log.queried_at ? new Date(log.queried_at).toLocaleTimeString('es-BO') : 'Reciente'}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

