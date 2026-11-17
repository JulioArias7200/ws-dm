import { neonQuery } from './db';
import { buildTokenizedConditions } from './item-updater';

export interface CanastaItem {
  id?: string | number;
  fecha: string;
  departamento: string;
  producto: string;
  categoria: string;
  unidad_medida: string;
  precio_bs: number;
  precio_anterior_bs?: number | null;
  descuento_pct?: number | null;
  fuente?: string;
  imagen?: string | null;
  enlace?: string | null;
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
  hipermaxiTotal?: number;
  items: Array<{
    id?: number;
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

    if (
      options.departamento &&
      options.departamento.toUpperCase() !== 'ALL' &&
      options.departamento.toUpperCase() !== 'TODAS' &&
      options.departamento.toUpperCase() !== 'TODOS'
    ) {
      params.push(options.departamento.toUpperCase());
      conditions.push(`UPPER(departamento) = $${params.length}`);
    }

    if (options.fuente && options.fuente.toLowerCase() !== 'todas' && options.fuente.toLowerCase() !== 'all') {
      params.push(`%${options.fuente}%`);
      conditions.push(`fuente ILIKE $${params.length}`);
    }

    if (options.categoria && options.categoria !== 'TODAS' && options.categoria !== 'ALL') {
      params.push(options.categoria);
      conditions.push(`categoria = $${params.length}`);
    }

    if (options.query && options.query.trim()) {
      const tokenFilter = buildTokenizedConditions(options.query, params.length + 1, ['producto', 'categoria']);
      conditions.push(`(${tokenFilter.sql})`);
      params.push(...tokenFilter.params);
    }

    const limitVal = options.limit && options.limit > 0 ? options.limit : 1000;
    params.push(limitVal);

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const rows = await neonQuery<Record<string, unknown>>(
      `SELECT DISTINCT ON (producto, fuente)
              id::text AS id, fecha::text AS fecha, INITCAP(LOWER(departamento)) AS departamento, producto, categoria,
              unidad_medida, precio_bs::float AS precio_bs, fuente, imagen, enlace
       FROM canasta_precios
       ${where}
       ORDER BY producto ASC, fuente ASC, fecha DESC
       LIMIT $${params.length}`,
      params
    );

    return rows.map((r) => ({
      id: r.id ? String(r.id) : undefined,
      fecha: String(r.fecha).slice(0, 10),
      departamento: String(r.departamento),
      producto: String(r.producto),
      categoria: String(r.categoria || ''),
      unidad_medida: String(r.unidad_medida),
      precio_bs: Number(r.precio_bs),
      fuente: r.fuente ? String(r.fuente) : undefined,
      imagen: r.imagen ? String(r.imagen) : null,
      enlace: r.enlace ? String(r.enlace) : null,
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

    if (options.query && options.query.trim()) {
      const tokenFilter = buildTokenizedConditions(options.query, params.length + 1, ['producto', 'laboratorio', 'categoria']);
      conditions.push(`(${tokenFilter.sql})`);
      params.push(...tokenFilter.params);
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
  minPrice?: number;
  maxPrice?: number;
  sortBy?: 'precio_asc' | 'precio_desc' | 'descuento' | 'nombre';
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
      const cleanCadena = options.cadena.toLowerCase().replace(/á/g, 'a').trim();
      countParams.push(`%${cleanCadena}%`);
      conditions.push(`REPLACE(LOWER(cadena), 'á', 'a') ILIKE $${countParams.length}`);
    }

    if (options.query) {
      countParams.push(`%${options.query}%`);
      conditions.push(`(producto ILIKE $${countParams.length} OR laboratorio ILIKE $${countParams.length} OR categoria ILIKE $${countParams.length})`);
    }

    if (options.minPrice != null && !isNaN(options.minPrice) && options.minPrice >= 0) {
      countParams.push(options.minPrice);
      conditions.push(`precio_bs >= $${countParams.length}`);
    }

    if (options.maxPrice != null && !isNaN(options.maxPrice) && options.maxPrice > 0) {
      countParams.push(options.maxPrice);
      conditions.push(`precio_bs <= $${countParams.length}`);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const [{ total }] = await neonQuery<{ total: number }>(
      `SELECT COUNT(*)::int AS total FROM medicamentos_precios ${where}`,
      countParams
    );

    let orderClause = 'precio_bs ASC';
    if (options.sortBy === 'precio_desc') {
      orderClause = 'precio_bs DESC';
    } else if (options.sortBy === 'descuento') {
      orderClause = 'COALESCE(descuento_pct, 0) DESC, precio_bs ASC';
    } else if (options.sortBy === 'nombre') {
      orderClause = 'producto ASC';
    }

    const queryParams = [...countParams, pageSize, offset];

    const rows = await neonQuery<Record<string, unknown>>(
      `SELECT id, fecha::text AS fecha, departamento, cadena, producto, laboratorio, categoria,
              presentacion, precio_bs::float AS precio_bs, precio_anterior_bs::float AS precio_anterior_bs,
              descuento_pct::float AS descuento_pct, enlace, imagen, disponible
       FROM medicamentos_precios
       ${where}
       ORDER BY ${orderClause}
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
  const all = await getMedicamentosPrecios({ query, limit: 50 });

  const farmacorpItems = all.filter((m) => m.cadena.toLowerCase().includes('farmacorp'));
  const chavezItems = all.filter((m) => m.cadena.toLowerCase().includes('chavez'));
  const hipermaxiItems = all.filter((m) => m.cadena.toLowerCase().includes('hipermaxi'));

  // Asegurar representación equilibrada de las 3 cadenas farmacéuticas
  const combined = [
    ...farmacorpItems.slice(0, 4),
    ...chavezItems.slice(0, 4),
    ...hipermaxiItems.slice(0, 4),
  ];

  const items = combined.map((m) => ({
    id: m.id,
    nombre: m.producto,
    cadena: m.cadena,
    precio_bs: m.precio_bs,
    laboratorio: m.laboratorio,
    presentacion: m.presentacion,
    enlace: m.enlace,
    descuento_pct: m.descuento_pct,
  }));

  let resumenAhorro: ComparativaMedicamento['resumenAhorro'];

  const cotizaciones: Array<{ cadena: string; minPrice: number }> = [];
  if (farmacorpItems.length > 0) {
    cotizaciones.push({ cadena: 'Farmacorp', minPrice: Math.min(...farmacorpItems.map((m) => m.precio_bs)) });
  }
  if (chavezItems.length > 0) {
    cotizaciones.push({ cadena: 'Farmacias Chávez', minPrice: Math.min(...chavezItems.map((m) => m.precio_bs)) });
  }
  if (hipermaxiItems.length > 0) {
    cotizaciones.push({ cadena: 'Hipermaxi Farmacia', minPrice: Math.min(...hipermaxiItems.map((m) => m.precio_bs)) });
  }

  if (cotizaciones.length >= 2) {
    cotizaciones.sort((a, b) => a.minPrice - b.minPrice);
    const minVal = cotizaciones[0].minPrice;
    const maxVal = cotizaciones[cotizaciones.length - 1].minPrice;
    const mejor = cotizaciones[0].cadena;

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
    hipermaxiTotal: hipermaxiItems.length,
    items,
    resumenAhorro,
  };
}

export interface UnifiedCatalogOptions {
  query?: string;
  macroCategoria?: 'canasta' | 'limpieza' | 'licores' | 'farmacia' | 'personal' | 'otros' | 'todas';
  subcategoria?: string;
  cadena?: string;
  departamento?: string;
  minPrice?: number;
  maxPrice?: number;
  sortBy?: 'precio_asc' | 'precio_desc' | 'nombre' | 'descuento';
  page?: number;
  pageSize?: number;
}

export interface UnifiedProductItem {
  id: string;
  producto: string;
  categoria: string;
  macroCategoria: string;
  unidad_medida: string;
  precio_bs: number;
  precio_anterior_bs?: number | null;
  descuento_pct?: number | null;
  cadena: string;
  departamento: string;
  imagen: string | null;
  rawImagen?: string | null;
  isS3?: boolean;
  enlace: string | null;
  laboratorio?: string | null;
  fecha: string;
  sector: 'supermercado' | 'farmacia' | 'oap';
  oap?: { precio_bs: number; fecha: string; fuente?: string };
  hipermaxi?: { precio_bs: number; fecha: string; fuente?: string; enlace?: string | null };
  diferencia_bs?: number;
  diferencia_pct?: number;
  ahorroFuente?: 'OAP' | 'Hipermaxi' | 'Igual';
  cotejoDual?: {
    oapPrecio?: number;
    hipermaxiPrecio?: number;
    ahorroBs?: number;
    ahorroPct?: number;
    ahorroFuente?: 'OAP' | 'Hipermaxi' | 'Igual';
  };
}

export interface UnifiedCatalogResult {
  items: UnifiedProductItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  macroCounts: {
    todas: number;
    canasta: number;
    limpieza: number;
    licores: number;
    farmacia: number;
    personal: number;
    otros: number;
  };
  filtrosDisponibles: {
    cadenas: string[];
    ciudades: string[];
    subcategorias: string[];
  };
}

function resolveProductImage(producto: string, rawImage?: string | null, sector?: string): string {
  if (rawImage) {
    if (rawImage.startsWith('http') || rawImage.startsWith('/api/')) return rawImage;
    return `/api/storage/${rawImage.replace(/^\/+/, '')}`;
  }
  const p = producto.toLowerCase();
  if (sector === 'farmacia') return '/images/salud/medication.svg';
  if (p.includes('papa')) return '/images/canasta/papa.svg';
  if (p.includes('pollo')) return '/images/canasta/pollo.svg';
  if (p.includes('carne') || p.includes('res') || p.includes('cerdo') || p.includes('chuleta'))
    return '/images/canasta/carne.svg';
  if (p.includes('arroz')) return '/images/canasta/arroz.svg';
  if (p.includes('aceite')) return '/images/canasta/aceite.svg';
  if (p.includes('leche')) return '/images/canasta/leche.svg';
  if (p.includes('huevo')) return '/images/canasta/huevo.svg';
  if (
    p.includes('cebolla') ||
    p.includes('tomate') ||
    p.includes('zanahoria') ||
    p.includes('arveja') ||
    p.includes('haba')
  )
    return '/images/canasta/verdura.svg';
  return '/images/canasta/alimentos.svg';
}

/**
 * Consulta unificada de alto rendimiento sobre Canasta Familiar, Limpieza, Licores, Farmacia y Otros
 * con paginación SQL nativa, conteo exacto y soporte facetado.
 */
export async function getUnifiedCatalogProducts(
  options: UnifiedCatalogOptions = {}
): Promise<UnifiedCatalogResult> {
  const page = Math.max(1, Number(options.page || 1));
  const pageSize = Math.max(1, Number(options.pageSize || 24));
  const offset = (page - 1) * pageSize;

  const macroFilter = options.macroCategoria && options.macroCategoria !== 'todas'
    ? options.macroCategoria
    : undefined;

  const baseView = `
    WITH unified AS (
      SELECT 
        id::text AS id,
        fecha::text AS fecha,
        INITCAP(LOWER(departamento)) AS departamento,
        producto,
        categoria,
        CASE 
          WHEN categoria ILIKE '%hogar%' OR categoria ILIKE '%limpieza%' THEN 'limpieza'
          WHEN categoria ILIKE '%bebida%' OR categoria ILIKE '%licor%' OR categoria ILIKE '%cerveza%' OR categoria ILIKE '%vino%' THEN 'licores'
          WHEN categoria ILIKE '%cuidado personal%' OR categoria ILIKE '%cuidado del bebe%' OR categoria ILIKE '%belleza%' THEN 'personal'
          WHEN categoria ILIKE '%bazar%' OR categoria ILIKE '%juguet%' OR categoria ILIKE '%textil%' THEN 'otros'
          ELSE 'canasta'
        END AS macro_categoria,
        unidad_medida,
        precio_bs::float AS precio_bs,
        NULL::float AS precio_anterior_bs,
        NULL::float AS descuento_pct,
        fuente AS cadena,
        imagen,
        enlace,
        NULL::text AS laboratorio,
        CASE WHEN fuente ILIKE '%oap%' THEN 'oap' ELSE 'supermercado' END AS sector
      FROM canasta_precios

      UNION ALL

      SELECT 
        ('MED_' || id)::text AS id,
        fecha::text AS fecha,
        INITCAP(LOWER(departamento)) AS departamento,
        producto,
        COALESCE(categoria, 'Medicamentos') AS categoria,
        'farmacia' AS macro_categoria,
        COALESCE(presentacion, '1 Unidad') AS unidad_medida,
        precio_bs::float AS precio_bs,
        precio_anterior_bs::float AS precio_anterior_bs,
        descuento_pct::float AS descuento_pct,
        cadena,
        imagen,
        enlace,
        laboratorio,
        'farmacia' AS sector
      FROM medicamentos_precios
    )
  `;

  // Construir condiciones dinámicas WHERE
  const conditions: string[] = ['1=1'];
  const params: unknown[] = [];

  if (macroFilter) {
    params.push(macroFilter);
    conditions.push(`macro_categoria = $${params.length}`);
  }

  if (options.subcategoria && options.subcategoria !== 'TODAS') {
    params.push(options.subcategoria);
    conditions.push(`categoria = $${params.length}`);
  }

  if (options.cadena && options.cadena !== 'TODAS') {
    params.push(`%${options.cadena}%`);
    conditions.push(`cadena ILIKE $${params.length}`);
  }

  if (options.departamento && options.departamento !== 'TODAS' && options.departamento !== 'TODOS') {
    params.push(options.departamento.toLowerCase());
    conditions.push(`LOWER(departamento) = $${params.length}`);
  }

  if (options.query && options.query.trim()) {
    const tokenFilter = buildTokenizedConditions(options.query, params.length + 1, ['producto', 'categoria', "COALESCE(laboratorio, '')"]);
    conditions.push(`(${tokenFilter.sql})`);
    params.push(...tokenFilter.params);
  }

  if (options.minPrice != null && options.minPrice >= 0) {
    params.push(options.minPrice);
    conditions.push(`precio_bs >= $${params.length}`);
  }

  if (options.maxPrice != null && options.maxPrice > 0) {
    params.push(options.maxPrice);
    conditions.push(`precio_bs <= $${params.length}`);
  }

  const whereClause = conditions.join(' AND ');

  // Cláusula de ordenamiento
  let orderClause = 'precio_bs ASC';
  if (options.sortBy === 'precio_desc') {
    orderClause = 'precio_bs DESC';
  } else if (options.sortBy === 'nombre') {
    orderClause = 'producto ASC';
  } else if (options.sortBy === 'descuento') {
    orderClause = 'COALESCE(descuento_pct, 0) DESC, precio_bs ASC';
  }

  // 1. Conteo total con los filtros actuales
  const countSql = `
    ${baseView}
    SELECT COUNT(*)::int AS total
    FROM unified
    WHERE ${whereClause}
  `;
  const [{ total = 0 }] = await neonQuery<{ total: number }>(countSql, params);

  // 2. Consulta de datos paginados
  const dataParams = [...params, pageSize, offset];
  const dataSql = `
    ${baseView}
    SELECT *
    FROM unified
    WHERE ${whereClause}
    ORDER BY ${orderClause}
    LIMIT $${dataParams.length - 1} OFFSET $${dataParams.length}
  `;
  const rows = await neonQuery<Record<string, unknown>>(dataSql, dataParams);

  // 3. Obtener conteos por macro-categoría para renderizar badges en tiempo real
  const macroCountsSql = `
    ${baseView}
    SELECT macro_categoria, COUNT(*)::int AS c
    FROM unified
    GROUP BY macro_categoria
  `;
  const countRows = await neonQuery<{ macro_categoria: string; c: number }>(macroCountsSql);
  const macroMap: Record<string, number> = {
    todas: 0,
    canasta: 0,
    limpieza: 0,
    licores: 0,
    farmacia: 0,
    personal: 0,
    otros: 0,
  };
  for (const cr of countRows) {
    const k = cr.macro_categoria as keyof typeof macroMap;
    const cnt = Number(cr.c);
    if (k in macroMap) macroMap[k] = cnt;
    macroMap.todas += cnt;
  }

  const items: UnifiedProductItem[] = rows.map((r) => {
    const rawImg = r.imagen ? String(r.imagen) : null;
    const isS3 = Boolean(rawImg && (rawImg.startsWith('canasta/') || rawImg.startsWith('farmacias/')));
    return {
      id: String(r.id),
      producto: String(r.producto),
      categoria: String(r.categoria || ''),
      macroCategoria: String(r.macro_categoria),
      unidad_medida: String(r.unidad_medida || '1 Unidad'),
      precio_bs: Number(r.precio_bs),
      precio_anterior_bs: r.precio_anterior_bs != null ? Number(r.precio_anterior_bs) : null,
      descuento_pct: r.descuento_pct != null ? Number(r.descuento_pct) : null,
      cadena: String(r.cadena),
      departamento: String(r.departamento),
      imagen: resolveProductImage(String(r.producto), rawImg, String(r.sector)),
      rawImagen: rawImg,
      isS3,
      enlace: r.enlace ? String(r.enlace) : null,
      laboratorio: r.laboratorio ? String(r.laboratorio) : null,
      fecha: String(r.fecha).slice(0, 10),
      sector: r.sector as 'supermercado' | 'farmacia' | 'oap',
    };
  });

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return {
    items,
    total,
    page,
    pageSize,
    totalPages,
    macroCounts: macroMap as UnifiedCatalogResult['macroCounts'],
    filtrosDisponibles: {
      cadenas: ['Hipermaxi', 'Farmacorp', 'Farmacias Chavez', 'OAP Bolivia'],
      ciudades: ['La Paz', 'Santa Cruz', 'Cochabamba'],
      subcategorias: [
        'Abarrotes',
        'Lacteos y derivados',
        'Carnes',
        'Frutas y verduras',
        'Panaderia',
        'Cuidado del hogar',
        'Bebidas',
        'Medicamentos',
        'Cuidado personal',
        'Cuidado del bebe',
        'Bazar',
        'Congelados',
        'Fiambres',
      ],
    },
  };
}

export interface ProductDetailResult {
  item: UnifiedProductItem;
  isS3: boolean;
  s3Key: string | null;
  rawImagen: string | null;
  enlace: string | null;
  sucursales: Array<{
    cadena: string;
    departamento: string;
    precio_bs: number;
    fecha: string;
    enlace: string | null;
  }>;
  historicoPrecios: Array<{
    fecha: string;
    precio_bs: number;
    delta_bs: number;
    delta_pct: number;
    fuente?: string;
  }>;
  comparativas: Array<{
    tienda: string;
    departamento: string;
    producto: string;
    precio_bs: number;
    diferencia_bs: number;
    diferencia_pct: number;
    tipo: 'ahorro' | 'mas_caro' | 'igual';
    enlace: string | null;
  }>;
}

/**
 * Obtiene el detalle profundo de un producto para la Modal interactiva:
 * enlace canónico, estado de sincronización S3, histórico de precios,
 * sucursales disponibles y cotejo con tiendas/farmacias competidoras.
 */
export async function getProductDetail(
  id: string,
  productoNombre?: string,
  cadena?: string
): Promise<ProductDetailResult | null> {
  const isMed = id.startsWith('MED_');
  const cleanId = isMed ? id.replace('MED_', '') : id;

  let currentItem: UnifiedProductItem | null = null;

  if (isMed) {
    const medRows = await neonQuery<Record<string, unknown>>(
      `SELECT id, fecha::text, departamento, cadena, producto, laboratorio, categoria,
              presentacion, precio_bs::float, precio_anterior_bs::float, descuento_pct::float,
              enlace, imagen
       FROM medicamentos_precios
       WHERE id = $1`,
      [Number(cleanId)]
    );
    if (medRows.length > 0) {
      const r = medRows[0];
      const rawImg = r.imagen ? String(r.imagen) : null;
      currentItem = {
        id: `MED_${r.id}`,
        producto: String(r.producto),
        categoria: String(r.categoria || 'Medicamentos'),
        macroCategoria: 'farmacia',
        unidad_medida: String(r.presentacion || '1 Unidad'),
        precio_bs: Number(r.precio_bs),
        precio_anterior_bs: r.precio_anterior_bs != null ? Number(r.precio_anterior_bs) : null,
        descuento_pct: r.descuento_pct != null ? Number(r.descuento_pct) : null,
        cadena: String(r.cadena),
        departamento: String(r.departamento),
        imagen: resolveProductImage(String(r.producto), rawImg, 'farmacia'),
        rawImagen: rawImg,
        isS3: Boolean(rawImg && rawImg.startsWith('farmacias/')),
        enlace: r.enlace ? String(r.enlace) : null,
        laboratorio: r.laboratorio ? String(r.laboratorio) : null,
        fecha: String(r.fecha).slice(0, 10),
        sector: 'farmacia',
      };
    }
  } else {
    const canastaRows = await neonQuery<Record<string, unknown>>(
      `SELECT id, fecha::text, departamento, producto, categoria, unidad_medida,
              precio_bs::float, fuente, enlace, imagen
       FROM canasta_precios
       WHERE id = $1`,
      [Number(cleanId)]
    );
    if (canastaRows.length > 0) {
      const r = canastaRows[0];
      const rawImg = r.imagen ? String(r.imagen) : null;
      const cat = String(r.categoria || '');
      let macro = 'canasta';
      if (/hogar|limpieza/i.test(cat)) macro = 'limpieza';
      else if (/bebida|licor|cerveza|vino/i.test(cat)) macro = 'licores';
      else if (/personal|bebe|belleza/i.test(cat)) macro = 'personal';
      else if (/bazar|juguet|textil/i.test(cat)) macro = 'otros';

      currentItem = {
        id: String(r.id),
        producto: String(r.producto),
        categoria: cat,
        macroCategoria: macro,
        unidad_medida: String(r.unidad_medida || '1 Unidad'),
        precio_bs: Number(r.precio_bs),
        precio_anterior_bs: null,
        descuento_pct: null,
        cadena: String(r.fuente || 'Hipermaxi'),
        departamento: String(r.departamento),
        imagen: resolveProductImage(String(r.producto), rawImg, 'supermercado'),
        rawImagen: rawImg,
        isS3: Boolean(rawImg && rawImg.startsWith('canasta/')),
        enlace: r.enlace ? String(r.enlace) : null,
        laboratorio: null,
        fecha: String(r.fecha).slice(0, 10),
        sector: String(r.fuente).toLowerCase().includes('oap') ? 'oap' : 'supermercado',
      };
    }
  }

  if (!currentItem) {
    return null;
  }

  const prodName = productoNombre || currentItem.producto;

  // 1. Obtener Sucursales disponibles donde existe este producto
  let sucursales: Array<{
    cadena: string;
    departamento: string;
    precio_bs: number;
    fecha: string;
    enlace: string | null;
  }> = [];

  if (isMed) {
    const sucRows = await neonQuery<Record<string, unknown>>(
      `SELECT DISTINCT cadena, departamento, precio_bs::float, fecha::text, enlace
       FROM medicamentos_precios
       WHERE producto ILIKE $1
       ORDER BY precio_bs ASC`,
      [prodName]
    );
    sucursales = sucRows.map((s) => ({
      cadena: String(s.cadena),
      departamento: String(s.departamento),
      precio_bs: Number(s.precio_bs),
      fecha: String(s.fecha).slice(0, 10),
      enlace: s.enlace ? String(s.enlace) : null,
    }));
  } else {
    const sucRows = await neonQuery<Record<string, unknown>>(
      `SELECT DISTINCT fuente AS cadena, departamento, precio_bs::float, fecha::text, enlace
       FROM canasta_precios
       WHERE producto ILIKE $1
       ORDER BY precio_bs ASC`,
      [prodName]
    );
    sucursales = sucRows.map((s) => ({
      cadena: String(s.cadena),
      departamento: String(s.departamento),
      precio_bs: Number(s.precio_bs),
      fecha: String(s.fecha).slice(0, 10),
      enlace: s.enlace ? String(s.enlace) : null,
    }));
  }

  // 2. Obtener Histórico de Precios
  const skuPattern = `%${prodName.replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase()}%`;
  const histRows = await neonQuery<Record<string, unknown>>(
    `SELECT fecha::text, precio_actual_bs::float AS precio_bs,
            COALESCE(delta_precio_bs, 0)::float AS delta_bs,
            COALESCE(delta_porcentaje, 0)::float AS delta_pct
     FROM precios_historico
     WHERE sku_id ILIKE $1
     ORDER BY fecha DESC
     LIMIT 12`,
    [skuPattern]
  );

  let historicoPrecios: Array<{
    fecha: string;
    precio_bs: number;
    delta_bs: number;
    delta_pct: number;
    fuente?: string;
  }> = [];

  if (histRows.length > 0) {
    historicoPrecios = histRows.map((h) => ({
      fecha: String(h.fecha).slice(0, 10),
      precio_bs: Number(h.precio_bs),
      delta_bs: Number(h.delta_bs),
      delta_pct: Number(h.delta_pct),
    }));
  } else {
    // Si aún no hay suficientes datos en la partición histórica, inferir de registros de captura
    const fallbackHist = isMed
      ? await neonQuery<Record<string, unknown>>(
          `SELECT fecha::text, precio_bs::float, cadena AS fuente
           FROM medicamentos_precios
           WHERE producto ILIKE $1
           ORDER BY fecha DESC LIMIT 6`,
          [prodName]
        )
      : await neonQuery<Record<string, unknown>>(
          `SELECT fecha::text, precio_bs::float, fuente
           FROM canasta_precios
           WHERE producto ILIKE $1
           ORDER BY fecha DESC LIMIT 6`,
          [prodName]
        );

    historicoPrecios = fallbackHist.map((f, idx, arr) => {
      const nextP = arr[idx + 1] ? Number(arr[idx + 1].precio_bs) : Number(f.precio_bs);
      const currP = Number(f.precio_bs);
      const delta = currP - nextP;
      const pct = nextP > 0 ? (delta / nextP) * 100 : 0;
      return {
        fecha: String(f.fecha).slice(0, 10),
        precio_bs: currP,
        delta_bs: Math.round(delta * 100) / 100,
        delta_pct: Math.round(pct * 10) / 10,
        fuente: String(f.fuente || currentItem?.cadena),
      };
    });
  }

  // 3. Comparativa con otras tiendas o farmacias competidoras
  const comparativas: Array<{
    tienda: string;
    departamento: string;
    producto: string;
    precio_bs: number;
    diferencia_bs: number;
    diferencia_pct: number;
    tipo: 'ahorro' | 'mas_caro' | 'igual';
    enlace: string | null;
  }> = [];

  const basePrice = currentItem.precio_bs;

  if (isMed) {
    // Si es farmacia, buscar en la otra cadena (Farmacorp vs Chavez)
    const otherChainRows = await neonQuery<Record<string, unknown>>(
      `SELECT cadena, departamento, producto, precio_bs::float, enlace
       FROM medicamentos_precios
       WHERE cadena <> $1 AND (producto ILIKE $2 OR categoria ILIKE $3)
       ORDER BY precio_bs ASC
       LIMIT 4`,
      [currentItem.cadena, `%${prodName.split(' ')[0]}%`, currentItem.categoria]
    );

    for (const oc of otherChainRows) {
      const pComp = Number(oc.precio_bs);
      const diffBs = Math.round((pComp - basePrice) * 100) / 100;
      const diffPct = basePrice > 0 ? Math.round(((pComp - basePrice) / basePrice) * 1000) / 10 : 0;
      comparativas.push({
        tienda: String(oc.cadena),
        departamento: String(oc.departamento),
        producto: String(oc.producto),
        precio_bs: pComp,
        diferencia_bs: diffBs,
        diferencia_pct: diffPct,
        tipo: diffBs < 0 ? 'ahorro' : diffBs > 0 ? 'mas_caro' : 'igual',
        enlace: oc.enlace ? String(oc.enlace) : null,
      });
    }
  } else {
    // Si es supermercado, buscar cotejo en OAP Bolivia o productos similares
    const oapRows = await neonQuery<Record<string, unknown>>(
      `SELECT fuente, departamento, producto, precio_bs::float, enlace
       FROM canasta_precios
       WHERE (fuente ILIKE '%OAP%' OR fuente <> $1) AND producto ILIKE $2
       ORDER BY precio_bs ASC
       LIMIT 4`,
      [currentItem.cadena, `%${prodName.split(' ')[0]}%`]
    );

    for (const oc of oapRows) {
      const pComp = Number(oc.precio_bs);
      const diffBs = Math.round((pComp - basePrice) * 100) / 100;
      const diffPct = basePrice > 0 ? Math.round(((pComp - basePrice) / basePrice) * 1000) / 10 : 0;
      comparativas.push({
        tienda: String(oc.fuente),
        departamento: String(oc.departamento),
        producto: String(oc.producto),
        precio_bs: pComp,
        diferencia_bs: diffBs,
        diferencia_pct: diffPct,
        tipo: diffBs < 0 ? 'ahorro' : diffBs > 0 ? 'mas_caro' : 'igual',
        enlace: oc.enlace ? String(oc.enlace) : null,
      });
    }
  }

  return {
    item: currentItem,
    isS3: currentItem.isS3 ?? false,
    s3Key: currentItem.isS3 ? (currentItem.rawImagen ?? null) : null,
    rawImagen: currentItem.rawImagen ?? null,
    enlace: currentItem.enlace ?? null,
    sucursales,
    historicoPrecios,
    comparativas,
  };
}


