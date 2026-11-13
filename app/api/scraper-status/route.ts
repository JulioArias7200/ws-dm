import { NextResponse } from 'next/server';
import { neonQuery, getUsageLogs } from '@/lib/db';

export async function GET() {
  try {
    const [counts] = await neonQuery<{
      sicoes_count: number;
      canasta_count: number;
      medicamentos_count: number;
      centros_count: number;
      logs_count: number;
    }>(
      `SELECT
         (SELECT COUNT(*)::int FROM sicoes_convocatorias) AS sicoes_count,
         (SELECT COUNT(*)::int FROM canasta_precios) AS canasta_count,
         (SELECT COUNT(*)::int FROM medicamentos_precios) AS medicamentos_count,
         (SELECT COUNT(*)::int FROM centros_salud) AS centros_count,
         (SELECT COUNT(*)::int FROM sicoes_usage_logs) AS logs_count`
    );

    const [canastaSources] = await neonQuery<{
      oap_count: number;
      hipermaxi_count: number;
    }>(
      `SELECT
         COUNT(*) FILTER (WHERE fuente = 'OAP Bolivia')::int AS oap_count,
         COUNT(*) FILTER (WHERE fuente = 'Hipermaxi')::int AS hipermaxi_count
       FROM canasta_precios`
    );

    const [pharmaChains] = await neonQuery<{
      farmacorp_count: number;
      chavez_count: number;
    }>(
      `SELECT
         COUNT(*) FILTER (WHERE cadena ILIKE '%farmacorp%')::int AS farmacorp_count,
         COUNT(*) FILTER (WHERE cadena ILIKE '%chavez%')::int AS chavez_count
       FROM medicamentos_precios`
    );

    const recentLogs = await getUsageLogs(8);

    const scrapers = [
      {
        id: 'sicoes',
        name: 'SICOES Contrataciones Estatales',
        script: 'scraper_sicoes_v2.mjs',
        target: 'sicoes.gob.bo',
        records: counts?.sicoes_count ?? 0,
        status: 'OK',
        type: 'ASP.NET Dynamic Table',
      },
      {
        id: 'hipermaxi',
        name: 'Hipermaxi Supermercados',
        script: 'scraper_hipermaxi.mjs',
        target: 'hipermaxi.com',
        records: canastaSources?.hipermaxi_count ?? 0,
        status: 'OK',
        type: 'VTEX Headless E-commerce',
      },
      {
        id: 'farmacorp',
        name: 'Farmacorp Bolivia',
        script: 'scraper_farmacorp.mjs',
        target: 'farmacorp.com',
        records: pharmaChains?.farmacorp_count ?? 0,
        status: 'OK',
        type: 'VTEX Intelligent Search',
      },
      {
        id: 'chavez',
        name: 'Farmacias Chávez',
        script: 'scraper_chavez.mjs',
        target: 'farmaciaschavez.com.bo',
        records: pharmaChains?.chavez_count ?? 0,
        status: 'OK',
        type: 'Dynamic Catalog Web Scraper',
      },
    ];

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      counts: {
        sicoes: counts?.sicoes_count ?? 0,
        canastaTotal: counts?.canasta_count ?? 0,
        canastaOap: canastaSources?.oap_count ?? 0,
        canastaHipermaxi: canastaSources?.hipermaxi_count ?? 0,
        medicamentosTotal: counts?.medicamentos_count ?? 0,
        farmacorp: pharmaChains?.farmacorp_count ?? 0,
        chavez: pharmaChains?.chavez_count ?? 0,
        centrosSalud: counts?.centros_count ?? 0,
        telegramConsultas: counts?.logs_count ?? 0,
      },
      scrapers,
      recentTelegramLogs: recentLogs,
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: errorMsg }, { status: 500 });
  }
}
