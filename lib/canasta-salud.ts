import { neonQuery } from './db';

export interface CanastaItem {
  fecha: string;
  departamento: string;
  producto: string;
  categoria: string;
  unidad_medida: string;
  precio_bs: number;
}

export interface CentroSaludItem {
  osm_id: string;
  nombre: string;
  tipo: string;
  departamento: string;
  direccion: string | null;
  lat: number;
  lon: number;
  telefono: string | null;
  horario: string | null;
  distancia_km?: number;
}

const OAP_CSV_URL =
  'https://oap.produccion.gob.bo/wp-content/plugins/dashboard-precios/html/datos_index.csv';
const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';

function classifyProductCategory(producto: string): string {
  const lower = producto.toLowerCase();
  if (/carne|pollo|cerdo|res|huevo/.test(lower)) return 'Carnes y Huevo';
  if (/papa|arveja|cebolla|haba|tomate|zanahoria/.test(lower)) return 'Verduras y Tubérculos';
  return 'Abarrotes y Frutas';
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

function toIsoDate(ddmmyyyy: string): string | null {
  const m = ddmmyyyy.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

/**
 * Descarga precios reales diarios del Observatorio Agroambiental (OAP Bolivia)
 * e ingesta en lotes hacia Neon PostgreSQL (`canasta_precios`).
 */
export async function syncCanastaOapToNeon(): Promise<{ inserted: number; latestDate: string | null }> {
  const res = await fetch(`${OAP_CSV_URL}?t=${Date.now()}`, {
    signal: AbortSignal.timeout(20000),
    headers: { 'User-Agent': 'SicoesMinerLaPaz/1.0' },
  });
  if (!res.ok) throw new Error(`OAP CSV HTTP ${res.status}`);

  const csvText = await res.text();
  const lines = csvText.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return { inserted: 0, latestDate: null };

  const dedup = new Map<string, CanastaItem>();
  for (const line of lines.slice(1)) {
    const [rawFecha, rawDepto, rawProd, rawUnidad, rawPrecio] = parseCsvLine(line);
    const fecha = toIsoDate(rawFecha || '');
    const precio = Number(rawPrecio);
    if (!fecha || !rawDepto || !rawProd || !Number.isFinite(precio)) continue;

    const depto = rawDepto.toUpperCase();
    const key = `${fecha}|${depto}|${rawProd}`;
    dedup.set(key, {
      fecha,
      departamento: depto,
      producto: rawProd,
      categoria: classifyProductCategory(rawProd),
      unidad_medida: rawUnidad || '1 Und.',
      precio_bs: Number(precio.toFixed(2)),
    });
  }

  const rows = Array.from(dedup.values());
  const chunkSize = 80;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const params: unknown[] = [];
    const placeholders = chunk.map((r) => {
      const base = params.length;
      params.push(r.fecha, r.departamento, r.producto, r.categoria, r.unidad_medida, r.precio_bs);
      return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, 'OAP Bolivia')`;
    });

    await neonQuery(
      `INSERT INTO canasta_precios (fecha, departamento, producto, categoria, unidad_medida, precio_bs, fuente)
       VALUES ${placeholders.join(', ')}
       ON CONFLICT (fecha, departamento, producto) DO UPDATE SET
         precio_bs = EXCLUDED.precio_bs,
         unidad_medida = EXCLUDED.unidad_medida,
         categoria = EXCLUDED.categoria,
         updated_at = CURRENT_TIMESTAMP`,
      params
    );
  }

  const latestDate = rows.reduce<string | null>(
    (max, r) => (!max || r.fecha > max ? r.fecha : max),
    null
  );
  return { inserted: rows.length, latestDate };
}

/**
 * Obtiene últimos precios reales de La Paz (con auto-sync si la tabla está vacía).
 */
export async function getCanastaPrecios(options: {
  categoria?: string;
  query?: string;
  departamento?: string;
  limit?: number;
} = {}): Promise<CanastaItem[]> {
  try {
    const [{ count }] = await neonQuery<{ count: number }>(
      `SELECT COUNT(*)::int AS count FROM canasta_precios`
    );
    if (!count) {
      await syncCanastaOapToNeon();
    }

    const depto = (options.departamento || 'LA PAZ').toUpperCase();
    const params: unknown[] = [depto];
    const conditions = [`departamento = $1`];

    if (options.categoria) {
      params.push(options.categoria);
      conditions.push(`categoria = $${params.length}`);
    }

    if (options.query) {
      params.push(`%${options.query}%`);
      conditions.push(`producto ILIKE $${params.length}`);
    }

    const limitVal = Math.min(Math.max(Number(options.limit || 12), 1), 30);
    params.push(limitVal);

    const rows = await neonQuery<Record<string, unknown>>(
      `SELECT DISTINCT ON (producto)
              fecha::text AS fecha, departamento, producto, categoria, unidad_medida, precio_bs::float AS precio_bs
       FROM canasta_precios
       WHERE ${conditions.join(' AND ')}
       ORDER BY producto ASC, fecha DESC
       LIMIT $${params.length}`,
      params
    );

    return rows.map((r) => ({
      fecha: String(r.fecha).slice(0, 10),
      departamento: String(r.departamento),
      producto: String(r.producto),
      categoria: String(r.categoria || ''),
      unidad_medida: String(r.unidad_medida),
      precio_bs: Number(r.precio_bs),
    }));
  } catch (err) {
    console.warn('[CANASTA] Error consultando precios OAP:', err);
    return [];
  }
}

/**
 * Compara precios de la fecha más reciente entre La Paz, Cochabamba y Santa Cruz
 */
export async function compareCanastaEje(): Promise<
  Array<{ producto: string; unidad: string; fecha: string; laPaz?: number; cbba?: number; scz?: number }>
> {
  try {
    const [{ count }] = await neonQuery<{ count: number }>(
      `SELECT COUNT(*)::int AS count FROM canasta_precios`
    );
    if (!count) await syncCanastaOapToNeon();

    const rows = await neonQuery<Record<string, unknown>>(
      `WITH latest AS (
         SELECT MAX(fecha) AS max_fecha FROM canasta_precios
       )
       SELECT c.fecha::text AS fecha, c.departamento, c.producto, c.unidad_medida, c.precio_bs::float AS precio_bs
       FROM canasta_precios c, latest l
       WHERE c.fecha = l.max_fecha
       ORDER BY c.producto ASC`
    );

    const map = new Map<
      string,
      { producto: string; unidad: string; fecha: string; laPaz?: number; cbba?: number; scz?: number }
    >();

    for (const r of rows) {
      const prod = String(r.producto);
      const entry = map.get(prod) || {
        producto: prod,
        unidad: String(r.unidad_medida),
        fecha: String(r.fecha).slice(0, 10),
      };
      const dep = String(r.departamento).toUpperCase();
      const val = Number(r.precio_bs);
      if (dep === 'LA PAZ') entry.laPaz = val;
      else if (dep === 'COCHABAMBA') entry.cbba = val;
      else if (dep === 'SANTA CRUZ') entry.scz = val;
      map.set(prod, entry);
    }

    return Array.from(map.values()).slice(0, 10);
  } catch (err) {
    console.warn('[CANASTA] Error comparando eje troncal:', err);
    return [];
  }
}

async function fetchOsmNominatim(queryTerm: string, limit = 15): Promise<CentroSaludItem[]> {
  const url =
    `${NOMINATIM_URL}?q=${encodeURIComponent(queryTerm)}&viewbox=-68.24,-16.42,-68.00,-16.62` +
    `&bounded=1&format=jsonv2&addressdetails=1&extratags=1&limit=${limit}`;
  const res = await fetch(url, {
    signal: AbortSignal.timeout(15000),
    headers: { 'User-Agent': 'SicoesMinerLaPazBot/1.0 (https://ws-dm.vercel.app)' },
  });
  if (!res.ok) return [];

  const items = (await res.json()) as Array<{
    osm_type?: string;
    osm_id?: number;
    name?: string;
    type?: string;
    lat?: string;
    lon?: string;
    display_name?: string;
    extratags?: Record<string, string>;
  }>;

  return items
    .filter((it) => it.osm_id && it.lat && it.lon && (it.name || it.display_name))
    .map((it) => {
      const fallbackName = it.display_name?.split(',')[0] || 'Centro de Salud';
      const tipo = it.type || 'hospital';
      return {
        osm_id: `${it.osm_type || 'node'}_${it.osm_id}`,
        nombre: it.name || fallbackName,
        tipo,
        departamento: 'La Paz',
        direccion: it.display_name ? it.display_name.split(',').slice(1, 4).join(',').trim() : null,
        lat: Number(it.lat),
        lon: Number(it.lon),
        telefono: it.extratags?.phone || it.extratags?.['contact:phone'] || null,
        horario: it.extratags?.opening_hours || null,
      };
    });
}

/**
 * Sincroniza centros reales de salud en La Paz desde OpenStreetMap Nominatim hacia Neon
 */
export async function syncCentrosSaludOsmToNeon(): Promise<number> {
  const amenities = ['hospital', 'clinic', 'pharmacy'];
  const collected = new Map<string, CentroSaludItem>();

  for (const amenity of amenities) {
    try {
      const list = await fetchOsmNominatim(`[${amenity}]`, 12);
      for (const item of list) {
        collected.set(item.osm_id, { ...item, tipo: amenity });
      }
      await new Promise((r) => setTimeout(r, 1100)); // Respetar límite 1 req/s de Nominatim
    } catch (err) {
      console.warn(`[SALUD] Error consultando Nominatim [${amenity}]:`, err);
    }
  }

  const rows = Array.from(collected.values());
  if (rows.length === 0) return 0;

  const params: unknown[] = [];
  const placeholders = rows.map((r) => {
    const b = params.length;
    params.push(r.osm_id, r.nombre, r.tipo, r.departamento, r.direccion, r.lat, r.lon, r.telefono, r.horario);
    return `($${b + 1}, $${b + 2}, $${b + 3}, $${b + 4}, $${b + 5}, $${b + 6}, $${b + 7}, $${b + 8}, $${b + 9})`;
  });

  await neonQuery(
    `INSERT INTO centros_salud (osm_id, nombre, tipo, departamento, direccion, lat, lon, telefono, horario)
     VALUES ${placeholders.join(', ')}
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

  return rows.length;
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return Number((R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))).toFixed(2));
}

/**
 * Busca centros de salud reales en La Paz por tipo, nombre/zona o cercanía GPS
 */
export async function searchCentrosSalud(options: {
  tipo?: string;
  query?: string;
  nearLat?: number;
  nearLon?: number;
  limit?: number;
} = {}): Promise<CentroSaludItem[]> {
  try {
    const [{ count }] = await neonQuery<{ count: number }>(
      `SELECT COUNT(*)::int AS count FROM centros_salud`
    );
    if (!count) {
      await syncCentrosSaludOsmToNeon();
    }

    const params: unknown[] = [];
    const conditions: string[] = [];

    if (options.tipo) {
      params.push(options.tipo);
      conditions.push(`tipo = $${params.length}`);
    }
    if (options.query) {
      params.push(`%${options.query}%`);
      conditions.push(`(nombre ILIKE $${params.length} OR direccion ILIKE $${params.length})`);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const rows = await neonQuery<Record<string, unknown>>(
      `SELECT osm_id, nombre, tipo, departamento, direccion, lat::float AS lat, lon::float AS lon, telefono, horario
       FROM centros_salud
       ${where}
       ORDER BY nombre ASC`,
      params
    );

    let items: CentroSaludItem[] = rows.map((r) => ({
      osm_id: String(r.osm_id),
      nombre: String(r.nombre),
      tipo: String(r.tipo),
      departamento: String(r.departamento || 'La Paz'),
      direccion: r.direccion != null ? String(r.direccion) : null,
      lat: Number(r.lat),
      lon: Number(r.lon),
      telefono: r.telefono != null ? String(r.telefono) : null,
      horario: r.horario != null ? String(r.horario) : null,
    }));

    // Si buscaron un nombre/zona específico y no estaba en caché de Neon, consultar Nominatim en vivo
    if (options.query && items.length === 0) {
      const live = await fetchOsmNominatim(`${options.query} salud La Paz`, 6);
      items = live;
    }

    if (options.nearLat != null && options.nearLon != null) {
      items = items
        .map((c) => ({
          ...c,
          distancia_km: haversineKm(options.nearLat!, options.nearLon!, c.lat, c.lon),
        }))
        .sort((a, b) => (a.distancia_km ?? 999) - (b.distancia_km ?? 999));
    }

    return items.slice(0, options.limit || 6);
  } catch (err) {
    console.warn('[SALUD] Error buscando centros de salud:', err);
    return [];
  }
}

