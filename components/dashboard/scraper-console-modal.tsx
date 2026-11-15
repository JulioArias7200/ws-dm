'use client';

import { useState, useEffect, useRef } from 'react';

export interface ScraperServiceConfig {
  id: string;
  name: string;
  category: 'sicoes' | 'supermercado' | 'farmacia' | 's3';
  script: string;
  description: string;
  icon: string;
  color: string;
  badgeBg: string;
  badgeText: string;
  recordsCount?: number;
  availableCities?: Array<{ id: string; label: string; branch: string }>;
}

interface ScraperConsoleModalProps {
  isOpen: boolean;
  onClose: () => void;
  service: ScraperServiceConfig | null;
  onScrapeSuccess?: () => void;
}

interface LogLine {
  id: string;
  text: string;
  timestamp: string;
  stream: 'stdout' | 'stderr' | 'system';
}

export function ScraperConsoleModal({
  isOpen,
  onClose,
  service,
  onScrapeSuccess,
}: ScraperConsoleModalProps) {
  const [phase, setPhase] = useState<'test' | 'full'>('test');
  const [selectedCity, setSelectedCity] = useState('lapaz');
  const [selectedBranch, setSelectedBranch] = useState('calacoto');
  const [isRunning, setIsRunning] = useState(false);
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [autoScroll, setAutoScroll] = useState(true);
  const [copied, setCopied] = useState(false);
  const [status, setStatus] = useState<'idle' | 'running' | 'success' | 'error'>('idle');

  const abortControllerRef = useRef<AbortController | null>(null);
  const consoleBottomRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll al final del log
  useEffect(() => {
    if (autoScroll && consoleBottomRef.current) {
      consoleBottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, autoScroll]);

  // Cerrar con Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isRunning) {
        onClose();
      }
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, isRunning, onClose]);

  if (!isOpen || !service) return null;

  const handleStartScraping = async () => {
    if (isRunning) return;

    setIsRunning(true);
    setStatus('running');
    setLogs([
      {
        id: `sys-${Date.now()}`,
        text: `⚡ Preparando ejecución desacoplada en segundo plano para '${service.name}'...`,
        timestamp: new Date().toLocaleTimeString(),
        stream: 'system',
      },
      {
        id: `sys-${Date.now() + 1}`,
        text: `📌 Modo de ejecución: ${phase === 'test' ? 'Muestra Rápida (Prueba de 20-30 items)' : 'Exhaustivo / Completo'} | Motor: Playwright Headless`,
        timestamp: new Date().toLocaleTimeString(),
        stream: 'system',
      },
    ]);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const res = await fetch('/api/scraper/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          service: service.id,
          phase,
          city: selectedCity,
          branch: selectedBranch,
        }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        throw new Error(`Error en el servidor: HTTP ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split('\n\n');
        buffer = events.pop() || '';

        for (const event of events) {
          if (!event.startsWith('data: ')) continue;
          try {
            const data = JSON.parse(event.replace(/^data: /, ''));

            if (data.type === 'log') {
              setLogs((prev) => [
                ...prev,
                {
                  id: `log-${Date.now()}-${Math.random()}`,
                  text: data.text,
                  timestamp: new Date(data.timestamp).toLocaleTimeString(),
                  stream: data.stream,
                },
              ]);
            } else if (data.type === 'init') {
              setLogs((prev) => [
                ...prev,
                {
                  id: `init-${Date.now()}`,
                  text: data.message,
                  timestamp: new Date(data.timestamp).toLocaleTimeString(),
                  stream: 'system',
                },
              ]);
            } else if (data.type === 'done') {
              setLogs((prev) => [
                ...prev,
                {
                  id: `done-${Date.now()}`,
                  text: data.message,
                  timestamp: new Date(data.timestamp).toLocaleTimeString(),
                  stream: 'system',
                },
              ]);
              setStatus(data.success ? 'success' : 'error');
              if (data.success && onScrapeSuccess) {
                onScrapeSuccess();
              }
            } else if (data.type === 'error') {
              setLogs((prev) => [
                ...prev,
                {
                  id: `err-${Date.now()}`,
                  text: `❌ ERROR: ${data.error}`,
                  timestamp: new Date(data.timestamp).toLocaleTimeString(),
                  stream: 'stderr',
                },
              ]);
              setStatus('error');
            }
          } catch {
            // Ignorar fragmentos mal formados
          }
        }
      }
    } catch (err: unknown) {
      if ((err as Error)?.name === 'AbortError') {
        setLogs((prev) => [
          ...prev,
          {
            id: `abort-${Date.now()}`,
            text: '⏹️ Proceso abortado por el usuario.',
            timestamp: new Date().toLocaleTimeString(),
            stream: 'system',
          },
        ]);
        setStatus('idle');
      } else {
        const msg = err instanceof Error ? err.message : 'Error de conexión';
        setLogs((prev) => [
          ...prev,
          {
            id: `err-fatal-${Date.now()}`,
            text: `❌ Fallo en streaming: ${msg}`,
            timestamp: new Date().toLocaleTimeString(),
            stream: 'stderr',
          },
        ]);
        setStatus('error');
      }
    } finally {
      setIsRunning(false);
      abortControllerRef.current = null;
    }
  };

  const handleAbort = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  };

  const handleCopyLogs = () => {
    const text = logs.map((l) => `[${l.timestamp}] ${l.text}`).join('\n');
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const formatLogLine = (line: string) => {
    if (line.includes('[PROCESO REALIZADO CORRECTAMENTE]') || line.includes('✅')) {
      return 'text-emerald-400 font-semibold';
    }
    if (line.includes('[PÁGINAS PROCESADAS]') || line.includes('📄')) {
      return 'text-sky-300';
    }
    if (line.includes('[PRODUCTOS ANALIZADOS]') || line.includes('🔍')) {
      return 'text-indigo-300 font-medium';
    }
    if (line.includes('[LOTE') || line.includes('📦')) {
      return 'text-amber-300 font-bold';
    }
    if (line.includes('ERROR') || line.includes('❌') || line.includes('⚠️')) {
      return 'text-rose-400 font-bold';
    }
    if (line.includes('▶️') || line.includes('🚀') || line.includes('╔') || line.includes('║') || line.includes('╚')) {
      return 'text-blue-400';
    }
    return 'text-slate-300';
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-950/70 backdrop-blur-md animate-in fade-in duration-200"
      onClick={() => {
        if (!isRunning) onClose();
      }}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="relative w-full max-w-4xl max-h-[92vh] bg-slate-900 text-white rounded-3xl shadow-2xl border border-slate-800 overflow-hidden flex flex-col animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header de la Modal */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/80">
          <div className="flex items-center gap-3">
            <span className="text-2xl">{service.icon}</span>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white tracking-tight">{service.name}</h2>
                <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase tracking-wider ${service.badgeBg} ${service.badgeText}`}>
                  {service.script}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">{service.description}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {status === 'running' && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 animate-pulse">
                <span className="w-2 h-2 rounded-full bg-amber-400"></span>
                <span>Ejecutando en 2do Plano</span>
              </span>
            )}
            {status === 'success' && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                <span>Completado Exitosamente</span>
              </span>
            )}
            {status === 'error' && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30">
                <span className="w-2 h-2 rounded-full bg-rose-400"></span>
                <span>Error Detectado</span>
              </span>
            )}

            <button
              onClick={onClose}
              disabled={isRunning}
              className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-400 hover:text-white transition-colors cursor-pointer disabled:opacity-40"
              aria-label="Cerrar modal"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Barra de Controles y Parámetros */}
        <div className="px-6 py-3 bg-slate-950/40 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-3 flex-wrap">
            {/* Selector de Modo/Fase */}
            <div className="flex items-center gap-1.5">
              <span className="text-slate-400 font-mono text-[11px]">Modo:</span>
              <select
                value={phase}
                disabled={isRunning}
                onChange={(e) => setPhase(e.target.value as 'test' | 'full')}
                className="bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1 text-white font-medium focus:outline-none focus:border-blue-500 disabled:opacity-50"
              >
                <option value="test">⚡ Muestra Rápida (Prueba 20-30 items)</option>
                <option value="full">🚀 Exhaustivo (Completo)</option>
              </select>
            </div>

            {/* Selector de Sucursal/Ciudad (si aplica) */}
            {service.availableCities && service.availableCities.length > 0 && (
              <div className="flex items-center gap-1.5">
                <span className="text-slate-400 font-mono text-[11px]">Sucursal:</span>
                <select
                  value={`${selectedCity}:${selectedBranch}`}
                  disabled={isRunning}
                  onChange={(e) => {
                    const [c, b] = e.target.value.split(':');
                    setSelectedCity(c);
                    setSelectedBranch(b);
                  }}
                  className="bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1 text-white font-medium focus:outline-none focus:border-blue-500 disabled:opacity-50"
                >
                  {service.availableCities.map((ct) => (
                    <option key={`${ct.id}:${ct.branch}`} value={`${ct.id}:${ct.branch}`}>
                      {ct.label}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Botones de Disparo */}
          <div className="flex items-center gap-2">
            {isRunning ? (
              <button
                onClick={handleAbort}
                className="px-4 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs transition-colors shadow-xs flex items-center gap-1.5 cursor-pointer"
              >
                <span className="w-2 h-2 rounded-full bg-white animate-ping"></span>
                <span>⏹ Abortar Proceso</span>
              </button>
            ) : (
              <button
                onClick={handleStartScraping}
                className="px-4 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs transition-colors shadow-xs flex items-center gap-1.5 cursor-pointer"
              >
                <span>▶ Iniciar Scraping en 2do Plano</span>
              </button>
            )}
          </div>
        </div>

        {/* Consola Terminal Interactiva en Vivo */}
        <div className="p-4 bg-slate-950 flex-1 overflow-hidden flex flex-col">
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-800/80 text-[11px] text-slate-400 font-mono">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/80 inline-block"></span>
              <span className="font-bold text-slate-300">Terminal de Eventos & Telemetría en Vivo</span>
              <span>({logs.length} eventos registrados)</span>
            </div>

            <div className="flex items-center gap-3">
              <label className="flex items-center gap-1 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={autoScroll}
                  onChange={(e) => setAutoScroll(e.target.checked)}
                  className="rounded bg-slate-800 border-slate-700 text-blue-500 text-xs"
                />
                <span className="text-[10px]">Auto-scroll</span>
              </label>

              <button
                onClick={handleCopyLogs}
                disabled={logs.length === 0}
                className="hover:text-white transition-colors cursor-pointer disabled:opacity-40"
              >
                {copied ? '✓ Copiado' : '📋 Copiar'}
              </button>

              <button
                onClick={() => setLogs([])}
                disabled={isRunning || logs.length === 0}
                className="hover:text-rose-400 transition-colors cursor-pointer disabled:opacity-40"
              >
                🗑 Limpiar
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto space-y-1 font-mono text-[11px] p-2 bg-slate-950/90 rounded-xl border border-slate-900 scrollbar-thin">
            {logs.length === 0 ? (
              <div className="h-48 flex flex-col items-center justify-center text-slate-600 space-y-2 select-none">
                <span className="text-3xl">💻</span>
                <p>Consola lista. Haz clic en &quot;Iniciar Scraping en 2do Plano&quot; para ejecutar.</p>
                <p className="text-[10px] text-slate-500">Los logs se transmitirán en vivo línea por línea sin abrir ventanas de navegador.</p>
              </div>
            ) : (
              logs.map((log) => (
                <div key={log.id} className="flex items-start gap-2 leading-relaxed">
                  <span className="text-slate-600 shrink-0 select-none">[{log.timestamp}]</span>
                  <span className={`break-all ${formatLogLine(log.text)}`}>{log.text}</span>
                </div>
              ))
            )}
            <div ref={consoleBottomRef} />
          </div>
        </div>

        {/* Footer de Estado de la Terminal */}
        <div className="px-6 py-2.5 bg-slate-950 border-t border-slate-800 flex items-center justify-between text-[11px] text-slate-400 font-mono">
          <div className="flex items-center gap-4">
            <span>Servicio: <strong className="text-white">{service.id}</strong></span>
            <span>Target: <strong className="text-white">{service.script}</strong></span>
          </div>
          <div>
            <span>Persistencia: <strong className="text-emerald-400">Neon PostgreSQL</strong></span>
          </div>
        </div>
      </div>
    </div>
  );
}

