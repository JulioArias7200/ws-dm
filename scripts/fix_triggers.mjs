import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const envPath = path.resolve(ROOT_DIR, '.env');
const envContent = fs.readFileSync(envPath, 'utf-8');
let neonUrl = '';
for (const line of envContent.split(/\r?\n/)) {
  const trimmed = line.trim();
  if (trimmed.startsWith('#') || !trimmed) continue;
  const eqIdx = trimmed.indexOf('=');
  if (eqIdx > 0) {
    const k = trimmed.slice(0, eqIdx).trim();
    let v = trimmed.slice(eqIdx + 1).trim().replace(/^['"]|['"]$/g, '');
    if (k === 'NEON_DB' || k === 'DATABASE_URL') {
      neonUrl = v;
    }
  }
}

const u = new URL(neonUrl);
const endpoint = `https://${u.host}/sql`;

async function runQuery(query) {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Neon-Connection-String': neonUrl
    },
    body: JSON.stringify({ query })
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`HTTP ${res.status}: ${errText}`);
  }
  return await res.json();
}

console.log('🔧 Aplicando corrección de triggers especializados en Neon PostgreSQL...');

const statements = [
  `DROP TRIGGER IF EXISTS trg_medicamentos_replicate ON medicamentos_precios;`,
  `DROP TRIGGER IF EXISTS trg_canasta_replicate ON canasta_precios;`,
  `DROP FUNCTION IF EXISTS fn_replicate_to_master_and_history();`,

  `CREATE OR REPLACE FUNCTION fn_replicate_canasta_to_master()
RETURNS TRIGGER AS $$
DECLARE
    v_sku VARCHAR(180);
    v_cadena VARCHAR(100);
    v_last_price NUMERIC(10, 2);
    v_delta_bs NUMERIC(10, 2) := 0.00;
    v_delta_pct NUMERIC(6, 2) := 0.00;
BEGIN
    v_cadena := COALESCE(NEW.fuente, 'Hipermaxi');
    v_sku := SUBSTRING('hipermaxi-' || LOWER(REGEXP_REPLACE(NEW.producto, '[^a-zA-Z0-9]+', '-', 'g')), 1, 180);

    INSERT INTO catalogo_productos_master (
        sku_id, producto, cadena, departamento, categoria, laboratorio,
        presentacion, unidad_medida, enlace_canonica, imagen, updated_at
    ) VALUES (
        v_sku, NEW.producto, v_cadena, NEW.departamento, NEW.categoria, 'Supermercado',
        NEW.unidad_medida, NEW.unidad_medida, NEW.enlace, NEW.imagen, CURRENT_TIMESTAMP
    )
    ON CONFLICT (sku_id) DO UPDATE SET
        categoria = COALESCE(EXCLUDED.categoria, catalogo_productos_master.categoria),
        unidad_medida = COALESCE(EXCLUDED.unidad_medida, catalogo_productos_master.unidad_medida),
        enlace_canonica = COALESCE(EXCLUDED.enlace_canonica, catalogo_productos_master.enlace_canonica),
        imagen = CASE
            WHEN catalogo_productos_master.imagen LIKE 'canasta/%' THEN catalogo_productos_master.imagen
            ELSE COALESCE(EXCLUDED.imagen, catalogo_productos_master.imagen)
        END,
        updated_at = CURRENT_TIMESTAMP;

    SELECT precio_actual_bs INTO v_last_price
    FROM precios_historico
    WHERE sku_id = v_sku AND fecha < NEW.fecha
    ORDER BY fecha DESC LIMIT 1;

    IF v_last_price IS NOT NULL AND v_last_price > 0 THEN
        v_delta_bs := NEW.precio_bs - v_last_price;
        v_delta_pct := ROUND(((NEW.precio_bs - v_last_price) / v_last_price) * 100, 2);
    END IF;

    INSERT INTO precios_historico (
        sku_id, fecha, precio_actual_bs, precio_anterior_bs, descuento_pct,
        delta_precio_bs, delta_porcentaje, disponible
    ) VALUES (
        v_sku, NEW.fecha, NEW.precio_bs, NULL, NULL,
        v_delta_bs, v_delta_pct, TRUE
    )
    ON CONFLICT (sku_id, fecha) DO UPDATE SET
        precio_actual_bs = EXCLUDED.precio_actual_bs,
        delta_precio_bs = EXCLUDED.delta_precio_bs,
        delta_porcentaje = EXCLUDED.delta_porcentaje,
        disponible = TRUE;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;`,

  `CREATE OR REPLACE FUNCTION fn_replicate_medicamento_to_master()
RETURNS TRIGGER AS $$
DECLARE
    v_sku VARCHAR(180);
    v_last_price NUMERIC(10, 2);
    v_delta_bs NUMERIC(10, 2) := 0.00;
    v_delta_pct NUMERIC(6, 2) := 0.00;
BEGIN
    v_sku := SUBSTRING(LOWER(REGEXP_REPLACE(NEW.cadena, '[^a-zA-Z0-9]+', '-', 'g')) || '-' ||
             LOWER(REGEXP_REPLACE(NEW.producto, '[^a-zA-Z0-9]+', '-', 'g')), 1, 180);

    INSERT INTO catalogo_productos_master (
        sku_id, producto, cadena, departamento, categoria, laboratorio,
        presentacion, unidad_medida, enlace_canonica, imagen, updated_at
    ) VALUES (
        v_sku, NEW.producto, NEW.cadena, NEW.departamento, NEW.categoria, NEW.laboratorio,
        NEW.presentacion, 'Unidad', NEW.enlace, NEW.imagen, CURRENT_TIMESTAMP
    )
    ON CONFLICT (sku_id) DO UPDATE SET
        categoria = COALESCE(EXCLUDED.categoria, catalogo_productos_master.categoria),
        laboratorio = COALESCE(EXCLUDED.laboratorio, catalogo_productos_master.laboratorio),
        presentacion = COALESCE(EXCLUDED.presentacion, catalogo_productos_master.presentacion),
        enlace_canonica = COALESCE(EXCLUDED.enlace_canonica, catalogo_productos_master.enlace_canonica),
        imagen = CASE
            WHEN catalogo_productos_master.imagen LIKE 'farmacias/%' THEN catalogo_productos_master.imagen
            ELSE COALESCE(EXCLUDED.imagen, catalogo_productos_master.imagen)
        END,
        updated_at = CURRENT_TIMESTAMP;

    SELECT precio_actual_bs INTO v_last_price
    FROM precios_historico
    WHERE sku_id = v_sku AND fecha < NEW.fecha
    ORDER BY fecha DESC LIMIT 1;

    IF v_last_price IS NOT NULL AND v_last_price > 0 THEN
        v_delta_bs := NEW.precio_bs - v_last_price;
        v_delta_pct := ROUND(((NEW.precio_bs - v_last_price) / v_last_price) * 100, 2);
    ELSIF NEW.precio_anterior_bs IS NOT NULL AND NEW.precio_anterior_bs > 0 THEN
        v_delta_bs := NEW.precio_bs - NEW.precio_anterior_bs;
        v_delta_pct := ROUND(((NEW.precio_bs - NEW.precio_anterior_bs) / NEW.precio_anterior_bs) * 100, 2);
    END IF;

    INSERT INTO precios_historico (
        sku_id, fecha, precio_actual_bs, precio_anterior_bs, descuento_pct,
        delta_precio_bs, delta_porcentaje, disponible
    ) VALUES (
        v_sku, NEW.fecha, NEW.precio_bs, NEW.precio_anterior_bs, NEW.descuento_pct,
        v_delta_bs, v_delta_pct, NEW.disponible
    )
    ON CONFLICT (sku_id, fecha) DO UPDATE SET
        precio_actual_bs = EXCLUDED.precio_actual_bs,
        precio_anterior_bs = EXCLUDED.precio_anterior_bs,
        descuento_pct = EXCLUDED.descuento_pct,
        delta_precio_bs = EXCLUDED.delta_precio_bs,
        delta_porcentaje = EXCLUDED.delta_porcentaje,
        disponible = EXCLUDED.disponible;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;`,

  `CREATE TRIGGER trg_medicamentos_replicate
AFTER INSERT OR UPDATE ON medicamentos_precios
FOR EACH ROW EXECUTE FUNCTION fn_replicate_medicamento_to_master();`,

  `CREATE TRIGGER trg_canasta_replicate
AFTER INSERT OR UPDATE ON canasta_precios
FOR EACH ROW EXECUTE FUNCTION fn_replicate_canasta_to_master();`
];

for (const stmt of statements) {
  const firstLine = stmt.split('\n')[0].substring(0, 60);
  process.stdout.write(`⏳ Ejecutando: ${firstLine}... `);
  await runQuery(stmt);
  console.log('✅ OK');
}

console.log('\n🎉 Triggers especializados aplicados y listos en Neon PostgreSQL.');

