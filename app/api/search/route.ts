import { NextRequest, NextResponse } from 'next/server';
import { hybridSearch, getConvocatorias } from '@/lib/db';
import { generateEmbedding } from '@/lib/nvidia-ai';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const query = searchParams.get('q') || '';
    const estado = searchParams.get('estado') || 'TODOS';
    const departamento = searchParams.get('departamento') || searchParams.get('depto') || 'TODOS';
    const maxPrice = searchParams.get('maxPrice') ? Number(searchParams.get('maxPrice')) : undefined;
    const limit = searchParams.get('limit') ? Number(searchParams.get('limit')) : 12;

    if (!query.trim()) {
      const items = await getConvocatorias({
        estado: estado !== 'TODOS' ? estado : undefined,
        departamento: departamento !== 'TODOS' ? departamento : undefined,
        limit,
      });
      return NextResponse.json({ success: true, count: items.length, items });
    }

    // Generar embedding con NVIDIA NIM (o fallback determinista)
    const embedding = await generateEmbedding(query);

    // Búsqueda híbrida (Coseno + PageRank) con filtro de departamento
    const results = await hybridSearch(query, embedding, {
      estado,
      departamento: departamento !== 'TODOS' ? departamento : undefined,
      maxPrice,
      limit,
    });

    return NextResponse.json({
      success: true,
      query,
      count: results.length,
      items: results,
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: errorMsg }, { status: 500 });
  }
}
