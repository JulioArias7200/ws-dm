import { NextRequest, NextResponse } from 'next/server';
import { getCanastaPrecios } from '@/lib/canasta-salud';
import { neonQuery } from '@/lib/db';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const query = searchParams.get('q') || '';
    const categoria = searchParams.get('categoria') || '';
    const departamento = searchParams.get('departamento') || searchParams.get('ciudad') || '';
    const limit = searchParams.get('limit') ? Number(searchParams.get('limit')) : 40;

    const items = await getCanastaPrecios({
      query: query || undefined,
      categoria: categoria && categoria !== 'TODAS' ? categoria : undefined,
      departamento: departamento && departamento !== 'TODOS' ? departamento : undefined,
      limit,
    });

    // Agrupar por nombre de producto para presentar comparativas duales
    const groupedMap = new Map<
      string,
      {
        producto: string;
        categoria: string;
        unidad_medida: string;
        departamento: string;
        oap?: { precio_bs: number; fecha: string };
        hipermaxi?: { precio_bs: number; fecha: string };
        diferencia_bs?: number;
        diferencia_pct?: number;
        ahorroFuente?: 'OAP' | 'Hipermaxi' | 'Igual';
      }
    >();

    for (const item of items) {
      // Normalizar nombre base (ej. "Papa Huaycha", "Arroz Grano de Oro")
      const key = item.producto.toLowerCase().trim();
      const existing = groupedMap.get(key) || {
        producto: item.producto,
        categoria: item.categoria,
        unidad_medida: item.unidad_medida,
        departamento: item.departamento,
      };

      if (item.fuente === 'Hipermaxi') {
        existing.hipermaxi = { precio_bs: item.precio_bs, fecha: item.fecha };
      } else {
        existing.oap = { precio_bs: item.precio_bs, fecha: item.fecha };
      }

      if (existing.oap && existing.hipermaxi) {
        const diff = Number((existing.hipermaxi.precio_bs - existing.oap.precio_bs).toFixed(2));
        existing.diferencia_bs = diff;
        existing.diferencia_pct =
          existing.oap.precio_bs > 0
            ? Number(((diff / existing.oap.precio_bs) * 100).toFixed(1))
            : 0;
        existing.ahorroFuente = diff > 0 ? 'OAP' : diff < 0 ? 'Hipermaxi' : 'Igual';
      }

      groupedMap.set(key, existing);
    }

    // Obtener lista de categorías y departamentos disponibles para los filtros
    const [meta] = await neonQuery<{
      categorias: string[];
      departamentos: string[];
    }>(
      `SELECT
         ARRAY(SELECT DISTINCT categoria FROM canasta_precios WHERE categoria IS NOT NULL ORDER BY categoria) AS categorias,
         ARRAY(SELECT DISTINCT departamento FROM canasta_precios WHERE departamento IS NOT NULL ORDER BY departamento) AS departamentos`
    );

    return NextResponse.json({
      success: true,
      totalRaw: items.length,
      countGrouped: groupedMap.size,
      comparativas: Array.from(groupedMap.values()),
      rawItems: items,
      filtrosDisponibles: {
        categorias: meta?.categorias || [],
        departamentos: meta?.departamentos || [],
      },
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: errorMsg }, { status: 500 });
  }
}

