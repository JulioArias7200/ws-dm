import { S3Client, PutObjectCommand, GetObjectCommand, HeadBucketCommand, CreateBucketCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const endpoint = process.env.AWS_ENDPOINT_URL_S3;
const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
const region = process.env.AWS_REGION || 'us-east-2';

export const BUCKET_ASSETS = 'assets';

export const s3 = new S3Client({
  endpoint,
  region,
  credentials: {
    accessKeyId: accessKeyId || '',
    secretAccessKey: secretAccessKey || '',
  },
  forcePathStyle: true,
});

/**
 * Asegura la existencia del bucket de almacenamiento
 */
export async function ensureBucketExists(bucketName = BUCKET_ASSETS) {
  try {
    await s3.send(new HeadBucketCommand({ Bucket: bucketName }));
  } catch (err: unknown) {
    const errorAny = err as { name?: string; $metadata?: { httpStatusCode?: number } };
    if (errorAny.name === 'NotFound' || errorAny.$metadata?.httpStatusCode === 404) {
      await s3.send(new CreateBucketCommand({ Bucket: bucketName }));
    }
  }
}

/**
 * Sube un buffer de imagen al bucket Neon S3
 */
export async function uploadImageToS3(key: string, buffer: Buffer | Uint8Array, contentType = 'image/webp'): Promise<string> {
  await ensureBucketExists(BUCKET_ASSETS);
  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET_ASSETS,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    })
  );
  return key;
}

/**
 * Obtiene URL firmada para visualización segura con expiración
 */
export async function getSignedAssetUrl(key: string, expiresIn = 86400): Promise<string> {
  return await getSignedUrl(s3, new GetObjectCommand({ Bucket: BUCKET_ASSETS, Key: key }), {
    expiresIn,
  });
}

