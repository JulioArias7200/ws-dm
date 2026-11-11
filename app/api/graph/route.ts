import { NextResponse } from 'next/server';
import { getGraphEdges } from '@/lib/db';
import { computeGraphMining } from '@/lib/graph-mining';

export async function GET() {
  try {
    const edges = await getGraphEdges();
    const result = computeGraphMining(edges, 0.85);

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: errorMsg }, { status: 500 });
  }
}
