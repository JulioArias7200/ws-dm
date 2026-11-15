import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const envPath = path.join(ROOT_DIR, '.env');
const content = fs.readFileSync(envPath, 'utf8');

for (const line of content.split(/\r?\n/)) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const eqIdx = trimmed.indexOf('=');
  if (eqIdx > 0) {
    const key = trimmed.slice(0, eqIdx).trim();
    let val = trimmed.slice(eqIdx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    process.env[key] = val;
  }
}

const endpoint = process.env.AWS_ENDPOINT_URL_S3;
const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
const region = process.env.AWS_REGION || 'us-east-2';
const neonUrl = process.env.NEON_DB;
const bucket = 'assets';

const s3 = new S3Client({
  endpoint,
  region,
  credentials: { accessKeyId, secretAccessKey },
  forcePathStyle: true,
});

async function neonQuery(sql, params = []) {
  const parsed = new URL(neonUrl);
  const res = await fetch(`https://${parsed.hostname}/sql`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Neon-Connection-String': neonUrl,
    },
    body: JSON.stringify({ query: sql, params }),
  });
  const data = await res.json();
  return data.rows || [];
}

async function main() {
  console.log('--- SINCRONIZACIÓN DE IMÁGENES HACIA NEON S3 BUCKET "ASSETS" ---');
  const dataFile = path.join(ROOT_DIR, 'data_scraped_hipermaxi.json');
  if (!fs.existsSync(dataFile)) {
    console.log('No se encontró data_scraped_hipermaxi.json');
    return;
  }

  const products = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
  console.log(`Total productos Hipermaxi leídos: ${products.length}`);

  let uploadedCount = 0;
  for (const p of products) {
    let imgUrl = p.imagen;
    if (!imgUrl) continue;

    // Si es una URL de Next image proxy, extraer la URL real
    if (imgUrl.includes('url=')) {
      const match = imgUrl.match(/url=([^&]+)/);
      if (match) {
        imgUrl = decodeURIComponent(match[1]);
        if (imgUrl.includes('url=')) {
          const m2 = imgUrl.match(/url=([^&]+)/);
          if (m2) imgUrl = decodeURIComponent(m2[1]);
        }
      }
    }

    const key = `canasta/hipermaxi/${p.id_producto || p.producto.replace(/\s+/g, '_').toLowerCase()}.webp`;

    try {
      // Descargar imagen
      const imgRes = await fetch(imgUrl, { signal: AbortSignal.timeout(10000) });
      if (imgRes.ok) {
        const arrayBuf = await imgRes.arrayBuffer();
        const buf = Buffer.from(arrayBuf);

        // Subir a S3
        await s3.send(
          new PutObjectCommand({
            Bucket: bucket,
            Key: key,
            Body: buf,
            ContentType: imgRes.headers.get('content-type') || 'image/webp',
          })
        );

        uploadedCount++;
        const s3KeyPath = key; // Ruta en S3

        // Actualizar en Neon DB
        await neonQuery(
          `UPDATE canasta_precios
           SET imagen = $1, enlace = $2
           WHERE producto = $3 AND fuente ILIKE '%Hipermaxi%'`,
          [s3KeyPath, p.enlace || null, p.producto]
        );
      }
    } catch (e) {
      // Si falla la descarga externa, guardar la URL remota directamente como fallback
      await neonQuery(
        `UPDATE canasta_precios
         SET imagen = $1, enlace = $2
         WHERE producto = $3 AND fuente ILIKE '%Hipermaxi%'`,
        [p.imagen || null, p.enlace || null, p.producto]
      );
    }
  }

  console.log(`✅ ${uploadedCount} imágenes subidas a Neon S3 y actualizadas en Neon PostgreSQL.`);

  // Verificación de registros actualizados
  const sample = await neonQuery(
    `SELECT producto, fuente, imagen, enlace FROM canasta_precios WHERE fuente ILIKE '%Hipermaxi%' AND imagen IS NOT NULL LIMIT 4;`
  );
  console.log('\nMuestra de registros en Neon DB:', sample);
}

main().catch(console.error);

