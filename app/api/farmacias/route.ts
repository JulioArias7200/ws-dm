import { NextRequest, NextResponse } from 'next/server';
import {
  getMedicamentosPreciosPaginado,
  compareMedicamentos,
  searchCentrosSalud,
} from '@/lib/canasta-salud';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const tipo = searchParams.get('tipo') || 'medicamentos';
    const query = searchParams.get('q') || '';
    const cadena = searchParams.get('cadena') || '';
    const page = searchParams.get('page') ? Number(searchParams.get('page')) : 1;
    const limit = searchParams.get('limit') ? Number(searchParams.get('limit')) : 12;
    const minPrice = searchParams.get('minPrice') ? Number(searchParams.get('minPrice')) : undefined;
    const maxPrice = searchParams.get('maxPrice') ? Number(searchParams.get('maxPrice')) : undefined;
    const sortBy = (searchParams.get('sortBy') as 'precio_asc' | 'precio_desc' | 'descuento' | 'nombre') || undefined;

    if (tipo === 'centros') {
      const centros = await searchCentrosSalud({
        query: query || undefined,
        tipo: searchParams.get('subtipo') || undefined,
        limit: 30,
      });

      return NextResponse.json({
        success: true,
        tipo: 'centros',
        total: centros.length,
        items: centros,
      });
    }

    // Si hay búsqueda comparativa específica por nombre y sin filtro de cadena
    if (query.trim() && (!cadena || cadena === 'TODAS')) {
      const comparativa = await compareMedicamentos(query.trim());
      const paginado = await getMedicamentosPreciosPaginado({
        page,
        pageSize: limit,
        query: query.trim(),
        minPrice,
        maxPrice,
        sortBy,
      });

      return NextResponse.json({
        success: true,
        tipo: 'medicamentos',
        comparativa,
        paginado,
      });
    }

    // Catálogo paginado por cadena o general
    const paginado = await getMedicamentosPreciosPaginado({
      cadena: cadena && cadena !== 'TODAS' ? cadena : undefined,
      page,
      pageSize: limit,
      query: query || undefined,
      minPrice,
      maxPrice,
      sortBy,
    });

    return NextResponse.json({
      success: true,
      tipo: 'medicamentos',
      paginado,
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: errorMsg }, { status: 500 });
  }
}
