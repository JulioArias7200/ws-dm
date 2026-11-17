import { NextRequest, NextResponse } from 'next/server';
import { getProductDetail } from '@/lib/canasta-salud';
import { refreshProductItemById } from '@/lib/item-updater';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    const producto = searchParams.get('producto') || undefined;
    const cadena = searchParams.get('cadena') || undefined;

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'Parámetro id es requerido' },
        { status: 400 }
      );
    }

    let detail = await getProductDetail(id, producto, cadena);

    if (!detail) {
      return NextResponse.json(
        { success: false, error: 'Producto no encontrado' },
        { status: 404 }
      );
    }

    // Actualización automática en vivo si el producto posee enlace oficial
    if (detail.item?.enlace && detail.item.enlace.startsWith('http')) {
      try {
        const refreshed = await refreshProductItemById(id);
        if (refreshed && refreshed.cambio_detectado) {
          // Re-cargar detalle para devolver el histórico actualizado con el nuevo punto temporal
          const updatedDetail = await getProductDetail(id, producto, cadena);
          if (updatedDetail) {
            detail = updatedDetail;
          }
        }
      } catch (scrapeErr) {
        // En caso de corte o desafío anti-bot, conservar datos previos sin interrumpir
        console.warn('[API DETALLE] Actualización en vivo omitida:', scrapeErr);
      }
    }

    return NextResponse.json({
      success: true,
      detail,
    });
  } catch (err: unknown) {
    const errorAny = err as { digest?: string; message?: string };
    if (errorAny?.digest?.includes('BAILOUT') || String(errorAny?.message).includes('bail out of prerendering')) {
      throw err;
    }
    const message = err instanceof Error ? err.message : 'Error desconocido';
    console.error('[API DETALLE] Error obteniendo detalle del producto:', message);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
