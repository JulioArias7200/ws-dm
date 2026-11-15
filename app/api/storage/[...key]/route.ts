import { NextRequest, NextResponse } from 'next/server';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { s3, BUCKET_ASSETS } from '@/lib/s3-client';

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ key: string[] }> }
) {
  try {
    const { key: keySegments } = await context.params;
    if (!keySegments || keySegments.length === 0) {
      return new NextResponse('Key not specified', { status: 400 });
    }

    const key = keySegments.join('/');

    const s3Res = await s3.send(
      new GetObjectCommand({
        Bucket: BUCKET_ASSETS,
        Key: key,
      })
    );

    if (!s3Res.Body) {
      return new NextResponse('Asset not found', { status: 404 });
    }

    // Convertir el stream de S3 a Uint8Array
    const bytes = await s3Res.Body.transformToByteArray();
    const contentType = s3Res.ContentType || 'image/webp';

    return new NextResponse(Buffer.from(bytes), {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=604800, stale-while-revalidate=86400',
        'ETag': s3Res.ETag || `"${key}"`,
      },
    });
  } catch (err: unknown) {
    const errorAny = err as { name?: string; $metadata?: { httpStatusCode?: number } };
    if (errorAny.name === 'NoSuchKey' || errorAny.$metadata?.httpStatusCode === 404) {
      return new NextResponse('Not found in S3', { status: 404 });
    }
    return new NextResponse('Error streaming S3 asset', { status: 500 });
  }
}

