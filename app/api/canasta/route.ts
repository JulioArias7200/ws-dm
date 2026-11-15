import { NextRequest, NextResponse } from 'next/server';
import { getUnifiedCatalogProducts, UnifiedCatalogOptions } from '@/lib/canasta-salud';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const query = searchParams.get('q') || '';
    const macroParam = (searchParams.get('macro') || searchParams.get('macroCategoria') || 'todas').toLowerCase();
    const subcategoria = searchParams.get('categoria') || searchParams.get('subcategoria') || '';
    const cadena = searchParams.get('cadena') || '';
    const ciudad = searchParams.get('ciudad') || searchParams.get('departamento') || '';
    const page = Number(searchParams.get('page') || 1);
    const pageSizeParam = searchParams.get('pageSize') || searchParams.get('limit') || '24';
    const pageSize = pageSizeParam === 'all' ? 200 : Number(pageSizeParam);
    const sortBy = (searchParams.get('sortBy') as UnifiedCatalogOptions['sortBy']) || 'precio_asc';
    const minPrice = searchParams.get('minPrice') ? Number(searchParams.get('minPrice')) : undefined;
    const maxPrice = searchParams.get('maxPrice') ? Number(searchParams.get('maxPrice')) : undefined;

    const validMacros = ['todas', 'canasta', 'limpieza', 'licores', 'farmacia', 'personal', 'otros'];
    const macroCategoria = validMacros.includes(macroParam)
      ? (macroParam as UnifiedCatalogOptions['macroCategoria'])
      : 'todas';

    const result = await getUnifiedCatalogProducts({
      query: query.trim() || undefined,
      macroCategoria,
      subcategoria: subcategoria && subcategoria !== 'TODAS' ? subcategoria : undefined,
      cadena: cadena && cadena !== 'TODAS' ? cadena : undefined,
      departamento: ciudad && ciudad !== 'TODAS' && ciudad !== 'TODOS' ? ciudad : undefined,
      minPrice,
      maxPrice,
      sortBy,
      page,
      pageSize,
    });

    return NextResponse.json({
      success: true,
      total: result.total,
      countGrouped: result.total,
      totalRaw: result.total,
      page: result.page,
      pageSize: result.pageSize,
      totalPages: result.totalPages,
      items: result.items,
      comparativas: result.items, // Retrocompatibilidad para componentes existentes
      macroCounts: result.macroCounts,
      filtrosDisponibles: result.filtrosDisponibles,
    });
  } catch (err: unknown) {
    const errorAny = err as { digest?: string; message?: string };
    if (errorAny?.digest?.includes('BAILOUT') || String(errorAny?.message).includes('bail out of prerendering')) {
      throw err;
    }
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error('[API CANASTA] Error procesando catálogo unificado:', errorMsg);
    return NextResponse.json({ success: false, error: errorMsg }, { status: 500 });
  }
}
