import { neonQuery } from './db';

export interface CanastaItem {
  fecha: string;
  departamento: string;
  producto: string;
  categoria: string;
  unidad_medida: string;
  precio_bs: number;
  fuente?: string;
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

export interface MedicamentoItem {
  id: number;
  fecha: string;
  departamento: string;
  cadena: string;
  producto: string;
  laboratorio: string | null;
  categoria: string | null;
  presentacion: string | null;
  precio_bs: number;
  precio_anterior_bs: number | null;
  descuento_pct: number | null;
  enlace: string | null;
  imagen: string | null;
  disponible: boolean;
}

export interface ComparativaMedicamento {
  termino: string;
  farmacorpTotal: number;
  chavezTotal: number;
  items: Array<{
    nombre: string;
    cadena: string;
    precio_bs: number;
    laboratorio: string | null;
    presentacion: string | null;
    enlace: string | null;
    descuento_pct: number | null;
  }>;
  resumenAhorro?: {
    mejorCadena: string;
    precioMin: number;
    precioMax: number;
    ahorroBs: number;
  };
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
  fuente?: string;
  limit?: number;
} = {}): Promise<CanastaItem[]> {
  try {
    const [{ count }] = await neonQuery<{ count: number }>(
      `SELECT COUNT(*)::int AS count FROM canasta_precios`
    );
    if (!count) {
      await syncCanastaOapToNeon();
    }

    const params: unknown[] = [];
    const conditions: string[] = [];

    if (options.departamento && options.departamento.toUpperCase() !== 'ALL') {
      params.push(options.departamento.toUpperCase());
      conditions.push(`UPPER(departamento) = $${params.length}`);
    }

    if (options.fuente && options.fuente.toLowerCase() !== 'todas' && options.fuente.toLowerCase() !== 'all') {
      params.push(`%${options.fuente}%`);
      conditions.push(`fuente ILIKE $${params.length}`);
    }

    if (options.categoria) {
      params.push(options.categoria);
      conditions.push(`categoria = $${params.length}`);
    }

    if (options.query) {
      params.push(`%${options.query}%`);
      conditions.push(`producto ILIKE $${params.length}`);
    }

    const limitVal = Math.min(Math.max(Number(options.limit || 16), 1), 40);
    params.push(limitVal);

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const rows = await neonQuery<Record<string, unknown>>(
      `SELECT DISTINCT ON (producto, fuente)
              fecha::text AS fecha, departamento, producto, categoria, unidad_medida, precio_bs::float AS precio_bs, fuente
       FROM canasta_precios
       ${where}
       ORDER BY producto ASC, fuente ASC, fecha DESC
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
      fuente: r.fuente ? String(r.fuente) : undefined,
    }));
  } catch (err) {
    console.warn('[CANASTA] Error consultando precios OAP/Hipermaxi:', err);
    return [];
  }
}

/**
 * Compara precios de la fecha más reciente entre La Paz, Cochabamba y Santa Cruz (Eje Central)
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
      `SELECT c.fecha::text AS fecha, UPPER(c.departamento) AS departamento, c.producto, c.unidad_medida, c.precio_bs::float AS precio_bs
       FROM canasta_precios c
       WHERE c.fecha >= (SELECT MAX(fecha) - INTERVAL '7 days' FROM canasta_precios)
       ORDER BY c.producto ASC, c.fecha DESC`
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
      const dep = String(r.departamento);
      const val = Number(r.precio_bs);
      if (dep === 'LA PAZ' && entry.laPaz == null) entry.laPaz = val;
      else if (dep === 'COCHABAMBA' && entry.cbba == null) entry.cbba = val;
      else if (dep === 'SANTA CRUZ' && entry.scz == null) entry.scz = val;
      map.set(prod, entry);
    }

    return Array.from(map.values()).filter((e) => e.laPaz || e.cbba || e.scz).slice(0, 10);
  } catch (err) {
    console.warn('[CANASTA] Error comparando eje troncal:', err);
    return [];
  }
}

const CIUDADES_VIEWBOX: Record<string, string> = {
  'LA PAZ': '-68.24,-16.42,-68.00,-16.62',
  'COCHABAMBA': '-66.25,-17.32,-66.08,-17.46',
  'SANTA CRUZ': '-63.26,-17.72,-63.10,-17.88',
};

async function fetchOsmNominatim(queryTerm: string, limit = 15, depto = 'La Paz'): Promise<CentroSaludItem[]> {
  const normDepto = depto.toUpperCase();
  const box = CIUDADES_VIEWBOX[normDepto] || CIUDADES_VIEWBOX['LA PAZ'];
  const url =
    `${NOMINATIM_URL}?q=${encodeURIComponent(queryTerm)}&viewbox=${box}` +
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
        departamento: depto,
        direccion: it.display_name ? it.display_name.split(',').slice(1, 4).join(',').trim() : null,
        lat: Number(it.lat),
        lon: Number(it.lon),
        telefono: it.extratags?.phone || it.extratags?.['contact:phone'] || null,
        horario: it.extratags?.opening_hours || null,
      };
    });
}

/**
 * Sincroniza centros reales de salud desde OpenStreetMap Nominatim hacia Neon
 */
export async function syncCentrosSaludOsmToNeon(depto = 'La Paz'): Promise<number> {
  const amenities = ['hospital', 'clinic', 'pharmacy'];
  const collected = new Map<string, CentroSaludItem>();

  for (const amenity of amenities) {
    try {
      const list = await fetchOsmNominatim(`[${amenity}]`, 12, depto);
      for (const item of list) {
        collected.set(item.osm_id, { ...item, tipo: amenity, departamento: depto });
      }
      await new Promise((r) => setTimeout(r, 1100)); // Respetar límite 1 req/s de Nominatim
    } catch (err) {
      console.warn(`[SALUD] Error consultando Nominatim [${amenity}] en ${depto}:`, err);
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
       departamento = EXCLUDED.departamento,
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

/**
 * Consulta medicamentos y precios reales en Neon PostgreSQL
 * (Farmacorp y Farmacias Chávez)
 */
export async function getMedicamentosPrecios(options: {
  query?: string;
  cadena?: string;
  departamento?: string;
  limit?: number;
} = {}): Promise<MedicamentoItem[]> {
  try {
    const params: unknown[] = [];
    const conditions: string[] = ['disponible = true'];

    if (options.cadena) {
      params.push(`%${options.cadena}%`);
      conditions.push(`cadena ILIKE $${params.length}`);
    }

    if (options.query) {
      params.push(`%${options.query}%`);
      conditions.push(`(producto ILIKE $${params.length} OR laboratorio ILIKE $${params.length} OR categoria ILIKE $${params.length})`);
    }

    if (options.departamento) {
      params.push(options.departamento);
      conditions.push(`UPPER(departamento) = UPPER($${params.length})`);
    }

    const limitVal = Math.min(Math.max(Number(options.limit || 10), 1), 50);
    params.push(limitVal);

    const rows = await neonQuery<Record<string, unknown>>(
      `SELECT id, fecha::text AS fecha, departamento, cadena, producto, laboratorio, categoria,
              presentacion, precio_bs::float AS precio_bs, precio_anterior_bs::float AS precio_anterior_bs,
              descuento_pct::float AS descuento_pct, enlace, imagen, disponible
       FROM medicamentos_precios
       WHERE ${conditions.join(' AND ')}
       ORDER BY precio_bs ASC
       LIMIT $${params.length}`,
      params
    );

    return rows.map((r) => ({
      id: Number(r.id),
      fecha: String(r.fecha).slice(0, 10),
      departamento: String(r.departamento),
      cadena: String(r.cadena),
      producto: String(r.producto),
      laboratorio: r.laboratorio ? String(r.laboratorio) : null,
      categoria: r.categoria ? String(r.categoria) : null,
      presentacion: r.presentacion ? String(r.presentacion) : null,
      precio_bs: Number(r.precio_bs),
      precio_anterior_bs: r.precio_anterior_bs != null ? Number(r.precio_anterior_bs) : null,
      descuento_pct: r.descuento_pct != null ? Number(r.descuento_pct) : null,
      enlace: r.enlace ? String(r.enlace) : null,
      imagen: r.imagen ? String(r.imagen) : null,
      disponible: Boolean(r.disponible),
    }));
  } catch (err) {
    console.warn('[FARMACIAS] Error consultando medicamentos_precios:', err);
    return [];
  }
}

/**
 * Consulta catálogo de medicamentos paginado en bloques de 5 elementos
 */
export async function getMedicamentosPreciosPaginado(options: {
  cadena?: string;
  query?: string;
  page?: number;
  pageSize?: number;
}): Promise<{
  items: MedicamentoItem[];
  total: number;
  page: number;
  totalPages: number;
}> {
  try {
    const page = Math.max(1, options.page || 1);
    const pageSize = Math.max(1, options.pageSize || 5);
    const offset = (page - 1) * pageSize;

    const countParams: unknown[] = [];
    const conditions: string[] = ['disponible = true'];

    if (options.cadena) {
      countParams.push(`%${options.cadena}%`);
      conditions.push(`cadena ILIKE $${countParams.length}`);
    }

    if (options.query) {
      countParams.push(`%${options.query}%`);
      conditions.push(`(producto ILIKE $${countParams.length} OR laboratorio ILIKE $${countParams.length} OR categoria ILIKE $${countParams.length})`);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const [{ total }] = await neonQuery<{ total: number }>(
      `SELECT COUNT(*)::int AS total FROM medicamentos_precios ${where}`,
      countParams
    );

    const queryParams = [...countParams, pageSize, offset];

    const rows = await neonQuery<Record<string, unknown>>(
      `SELECT id, fecha::text AS fecha, departamento, cadena, producto, laboratorio, categoria,
              presentacion, precio_bs::float AS precio_bs, precio_anterior_bs::float AS precio_anterior_bs,
              descuento_pct::float AS descuento_pct, enlace, imagen, disponible
       FROM medicamentos_precios
       ${where}
       ORDER BY precio_bs ASC
       LIMIT $${queryParams.length - 1} OFFSET $${queryParams.length}`,
      queryParams
    );

    const items: MedicamentoItem[] = rows.map((r) => ({
      id: Number(r.id),
      fecha: String(r.fecha).slice(0, 10),
      departamento: String(r.departamento),
      cadena: String(r.cadena),
      producto: String(r.producto),
      laboratorio: r.laboratorio ? String(r.laboratorio) : null,
      categoria: r.categoria ? String(r.categoria) : null,
      presentacion: r.presentacion ? String(r.presentacion) : null,
      precio_bs: Number(r.precio_bs),
      precio_anterior_bs: r.precio_anterior_bs != null ? Number(r.precio_anterior_bs) : null,
      descuento_pct: r.descuento_pct != null ? Number(r.descuento_pct) : null,
      enlace: r.enlace ? String(r.enlace) : null,
      imagen: r.imagen ? String(r.imagen) : null,
      disponible: Boolean(r.disponible),
    }));

    const totalPages = Math.max(1, Math.ceil(total / pageSize));

    return {
      items,
      total,
      page,
      totalPages,
    };
  } catch (err) {
    console.warn('[FARMACIAS] Error consultando catalogo paginado:', err);
    return { items: [], total: 0, page: 1, totalPages: 1 };
  }
}

/**
 * Compara precios de un fármaco entre Farmacorp y Farmacias Chávez
 */
export async function compareMedicamentos(query: string): Promise<ComparativaMedicamento> {
  const all = await getMedicamentosPrecios({ query, limit: 30 });

  const farmacorpItems = all.filter((m) => m.cadena.toLowerCase().includes('farmacorp'));
  const chavezItems = all.filter((m) => m.cadena.toLowerCase().includes('chavez'));

  const items = all.slice(0, 8).map((m) => ({
    nombre: m.producto,
    cadena: m.cadena,
    precio_bs: m.precio_bs,
    laboratorio: m.laboratorio,
    presentacion: m.presentacion,
    enlace: m.enlace,
    descuento_pct: m.descuento_pct,
  }));

  let resumenAhorro: ComparativaMedicamento['resumenAhorro'];

  if (farmacorpItems.length > 0 && chavezItems.length > 0) {
    const minF = Math.min(...farmacorpItems.map((m) => m.precio_bs));
    const minC = Math.min(...chavezItems.map((m) => m.precio_bs));
    const maxVal = Math.max(minF, minC);
    const minVal = Math.min(minF, minC);
    const mejor = minF < minC ? 'Farmacorp' : minC < minF ? 'Farmacias Chávez' : 'Ambas al mismo precio';

    resumenAhorro = {
      mejorCadena: mejor,
      precioMin: minVal,
      precioMax: maxVal,
      ahorroBs: Number((maxVal - minVal).toFixed(2)),
    };
  }

  return {
    termino: query,
    farmacorpTotal: farmacorpItems.length,
    chavezTotal: chavezItems.length,
    items,
    resumenAhorro,
  };
}


