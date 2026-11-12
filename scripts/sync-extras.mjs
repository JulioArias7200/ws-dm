/**
 * Aplica tablas adicionales en Neon PostgreSQL (`canasta_precios`, `centros_salud`)
 * e ingesta datos reales de OAP Bolivia (Canasta Familiar) y OpenStreetMap (Centros de Salud La Paz).
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

function loadNeonUrl() {
  let url = process.env.NEON_DB || process.env.DATABASE_URL || '';
  const envPath = path.join(ROOT_DIR, '.env');
  if (!url && fs.existsSync(envPath)) {
    const raw = fs.readFileSync(envPath, 'utf8');
    url = raw.match(/^(?:NEON_DB|DATABASE_URL)\s*=\s*(.+)$/m)?.[1]?.trim() || '';
    if ((url.startsWith('"') && url.endsWith('"')) || (url.startsWith("'") && url.endsWith("'"))) {
      url = url.slice(1, -1).trim();
    }
  }
  if (!url) throw new Error('NEON_DB no configurada.');
  return url;
}

async function neonSql(neonUrl, query, params = []) {
  const u = new URL(neonUrl);
  const res = await fetch(`https://${u.hostname}/sql`, {
    method: 'POST',
    signal: AbortSignal.timeout(20000),
    headers: { 'Content-Type': 'application/json', 'Neon-Connection-String': neonUrl },
    body: JSON.stringify({ query, params }),
  });
  if (!res.ok) throw new Error(`Neon HTTP ${res.status}: ${await res.text()}`);
  return res.json();
}

function splitSql(sqlText) {
  return sqlText
    .split(/\r?\n/)
    .filter((l) => !l.trim().startsWith('--'))
    .join('\n')
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseCsvLine(line) {
  const out = [];
  let cur = '';
  let q = false;
  for (const ch of line) {
    if (ch === '"') q = !q;
    else if (ch === ',' && !q) {
      out.push(cur.trim());
      cur = '';
    } else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

function classifyProduct(p) {
  const l = p.toLowerCase();
  if (/carne|pollo|cerdo|res|huevo/.test(l)) return 'Carnes y Huevo';
  if (/papa|arveja|cebolla|haba|tomate|zanahoria/.test(l)) return 'Verduras y Tubérculos';
  return 'Abarrotes y Frutas';
}

async function main() {
  const neonUrl = loadNeonUrl();
  const schemaSql = fs.readFileSync(path.join(ROOT_DIR, 'db', 'schema.sql'), 'utf8');
  for (const stmt of splitSql(schemaSql)) {
    await neonSql(neonUrl, stmt);
  }
  console.log('🗄️ Esquema actualizado en Neon PostgreSQL (`WS-DM`).');

  // 1. Ingesta real OAP Canasta Familiar
  const oapRes = await fetch(
    `https://oap.produccion.gob.bo/wp-content/plugins/dashboard-precios/html/datos_index.csv?t=${Date.now()}`,
    { signal: AbortSignal.timeout(25000), headers: { 'User-Agent': 'SicoesMinerLaPaz/1.0' } }
  );
  if (!oapRes.ok) throw new Error(`OAP CSV HTTP ${oapRes.status}`);
  const csvLines = (await oapRes.text()).split(/\r?\n/).filter((l) => l.trim()).slice(1);

  const dedupPrecios = new Map();
  for (const line of csvLines) {
    const [rawFecha, rawDepto, rawProd, rawUnidad, rawPrecio] = parseCsvLine(line);
    const m = (rawFecha || '').match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    const precio = Number(rawPrecio);
    if (!m || !rawDepto || !rawProd || !Number.isFinite(precio)) continue;
    const fecha = `${m[3]}-${m[2]}-${m[1]}`;
    const depto = rawDepto.toUpperCase();
    dedupPrecios.set(`${fecha}|${depto}|${rawProd}`, {
      fecha,
      departamento: depto,
      producto: rawProd,
      categoria: classifyProduct(rawProd),
      unidad_medida: rawUnidad || '1 Und.',
      precio_bs: Number(precio.toFixed(2)),
    });
  }

  const precioRows = [...dedupPrecios.values()];
  for (let i = 0; i < precioRows.length; i += 80) {
    const chunk = precioRows.slice(i, i + 80);
    const params = [];
    const ph = chunk.map((r) => {
      const b = params.length;
      params.push(r.fecha, r.departamento, r.producto, r.categoria, r.unidad_medida, r.precio_bs);
      return `($${b + 1}, $${b + 2}, $${b + 3}, $${b + 4}, $${b + 5}, $${b + 6}, 'OAP Bolivia')`;
    });
    await neonSql(
      neonUrl,
      `INSERT INTO canasta_precios (fecha, departamento, producto, categoria, unidad_medida, precio_bs, fuente)
       VALUES ${ph.join(', ')}
       ON CONFLICT (fecha, departamento, producto) DO UPDATE SET
         precio_bs = EXCLUDED.precio_bs,
         unidad_medida = EXCLUDED.unidad_medida,
         categoria = EXCLUDED.categoria,
         updated_at = CURRENT_TIMESTAMP`,
      params
    );
  }
  console.log(`🛒 Canasta Familiar OAP sincronizada: ${precioRows.length} registros reales.`);

  // 2. Ingesta real Centros de Salud OSM La Paz
  const saludMap = new Map();
  for (const amenity of ['hospital', 'clinic', 'pharmacy']) {
    const nomUrl =
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(`[${amenity}]`)}` +
      `&viewbox=-68.24,-16.42,-68.00,-16.62&bounded=1&format=jsonv2&addressdetails=1&extratags=1&limit=15`;
    try {
      const r = await fetch(nomUrl, {
        signal: AbortSignal.timeout(20000),
        headers: { 'User-Agent': 'SicoesMinerLaPazBot/1.0 (https://ws-dm.vercel.app)' },
      });
      if (r.ok) {
        const list = await r.json();
        for (const it of list) {
          if (!it.osm_id || !it.lat || !it.lon) continue;
          const osmId = `${it.osm_type || 'node'}_${it.osm_id}`;
          saludMap.set(osmId, {
            osm_id: osmId,
            nombre: it.name || it.display_name?.split(',')[0] || `Centro ${amenity}`,
            tipo: amenity,
            departamento: 'La Paz',
            direccion: it.display_name ? it.display_name.split(',').slice(1, 4).join(',').trim() : null,
            lat: Number(it.lat),
            lon: Number(it.lon),
            telefono: it.extratags?.phone || it.extratags?.['contact:phone'] || null,
            horario: it.extratags?.opening_hours || null,
          });
        }
      }
    } catch (e) {
      console.warn(`⚠️ Timeout parcial OSM [${amenity}]:`, e.message);
    }
    await new Promise((res) => setTimeout(res, 1100));
  }

  const saludRows = [...saludMap.values()];
  if (saludRows.length > 0) {
    const params = [];
    const ph = saludRows.map((r) => {
      const b = params.length;
      params.push(r.osm_id, r.nombre, r.tipo, r.departamento, r.direccion, r.lat, r.lon, r.telefono, r.horario);
      return `($${b + 1}, $${b + 2}, $${b + 3}, $${b + 4}, $${b + 5}, $${b + 6}, $${b + 7}, $${b + 8}, $${b + 9})`;
    });
    await neonSql(
      neonUrl,
      `INSERT INTO centros_salud (osm_id, nombre, tipo, departamento, direccion, lat, lon, telefono, horario)
       VALUES ${ph.join(', ')}
       ON CONFLICT (osm_id) DO UPDATE SET
         nombre = EXCLUDED.nombre,
         tipo = EXCLUDED.tipo,
         direccion = EXCLUDED.direccion,
         lat = EXCLUDED.lat,
         lon = EXCLUDED.lon,
         telefono = COALESCE(EXCLUDED.telefono, centros_salud.telefono),
         horario = COALESCE(EXCLUDED.horario, centros_salud.horario),
         updated_at = CURRENT_TIMESTAMP`,
      params
    );
  }
  console.log(`🏥 Centros de Salud OSM La Paz sincronizados: ${saludRows.length} establecimientos reales.`);
}

main().catch((err) => {
  console.error('❌ Error en sync-extras:', err);
  process.exit(1);
});

