import { NextRequest, NextResponse } from 'next/server';
import { getDashboardMetrics, getUsageLogs } from '@/lib/db';

export const dynamic = 'force-dynamic';

let scraperState = {
  isRunning: false,
  lastSync: '2026-11-10T18:45:00Z',
  totalItemsScraped: 1428,
  successRate: 99.4,
  lastLog: 'Sincronización completada con portal SICOES (La Paz): 1,428 registros indexados.',
};

export async function GET() {
  const metrics = await getDashboardMetrics();
  const logs = await getUsageLogs(5);

  return NextResponse.json({
    scraper: scraperState,
    metrics,
    recentTelegramLogs: logs,
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (body.action === 'trigger_sync') {
      scraperState.isRunning = true;
      scraperState.lastSync = new Date().toISOString();
      scraperState.lastLog = `Sincronización manual disparada a las ${new Date().toLocaleTimeString('es-BO')}`;

      // Simular finalización
      setTimeout(() => {
        scraperState.isRunning = false;
        scraperState.lastLog = `Sincronización finalizada exitosamente. Convocatorias actualizadas.`;
      }, 3000);

      return NextResponse.json({ ok: true, state: scraperState });
    }

    return NextResponse.json({ ok: false, message: 'Acción no reconocida' });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: errorMsg }, { status: 500 });
  }
}
