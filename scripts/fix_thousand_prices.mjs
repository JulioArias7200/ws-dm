import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const envContent = fs.readFileSync(path.join(ROOT_DIR, '.env'), 'utf8');
const neonUrl = envContent
  .split(/\r?\n/)
  .find((l) => l.startsWith('NEON_DB='))
  .split('=')[1]
  .trim()
  .replace(/['"]/g, '');

const u = new URL(neonUrl);

async function neonQuery(sql, params = []) {
  const res = await fetch(`https://${u.host}/sql`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Neon-Connection-String': neonUrl,
    },
    body: JSON.stringify({ query: sql, params }),
  });
  if (!res.ok) {
    throw new Error(`Neon Error: ${await res.text()}`);
  }
  const data = await res.json();
  return data.rows || [];
}

async function main() {
  console.log('🔧 Iniciando auditoría y corrección de precios con separador de miles en Neon PostgreSQL...\n');

  // Ajustar tipo de delta_porcentaje y función de trigger para tolerar saltos numéricos grandes
  try {
    await neonQuery(`ALTER TABLE precios_historico ALTER COLUMN delta_porcentaje TYPE NUMERIC(10, 2);`);
  } catch (e) {}

  await neonQuery(`
    CREATE OR REPLACE FUNCTION fn_replicate_canasta_to_master()
    RETURNS TRIGGER AS $$
    DECLARE
        v_sku VARCHAR(180);
        v_cadena VARCHAR(100);
        v_last_price NUMERIC(10, 2);
        v_delta_bs NUMERIC(10, 2) := 0.00;
        v_delta_pct NUMERIC(10, 2) := 0.00;
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
            v_delta_pct := LEAST(99999.99, ROUND(((NEW.precio_bs - v_last_price) / v_last_price) * 100, 2));
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
    $$ LANGUAGE plpgsql;
  `);

  // 1. Detectar productos de licores y artículos de alto valor cuyo precio fue dividido por 1,000
  // Por ejemplo: 'Whisky Johnnie Walker Green Label 750 ml' registrado como 1.10 en lugar de 1099.00
  // 'Whisky Johnnie Walker Blue Label 750 ml' registrado como 3.95 en lugar de 3950.00
  // 'Whisky Johnnie Walker 18 Años 750 ml' registrado como 1.60 en lugar de 1599.00
  
  const affected = await neonQuery(`
    SELECT id, producto, departamento, fuente, precio_bs::float, enlace
    FROM canasta_precios
    WHERE (
      (producto ILIKE '%Johnnie Walker Green Label%' AND precio_bs < 10) OR
      (producto ILIKE '%Johnnie Walker Blue Label%' AND precio_bs < 10) OR
      (producto ILIKE '%Johnnie Walker 18 A%' AND precio_bs < 10) OR
      (producto ILIKE '%Whisky%' AND precio_bs < 5.00) OR
      (producto ILIKE '%Champagne%' AND precio_bs < 5.00) OR
      (producto ILIKE '%Tequila%' AND precio_bs < 5.00) OR
      (categoria ILIKE '%licor%' AND precio_bs < 3.00)
    )
    ORDER BY producto, departamento;
  `);

  console.log(`🔍 Se detectaron ${affected.length} productos con precio anómalo (dividido por 1,000):`);
  console.table(affected.map(a => ({ id: a.id, producto: a.producto, actual: a.precio_bs, depto: a.departamento })));

  let updatedCount = 0;

  for (const item of affected) {
    let correctedPrice = 0;

    // Reglas exactas basadas en catálogo oficial Hipermaxi:
    if (item.producto.includes('Green Label')) {
      correctedPrice = 1099.00;
    } else if (item.producto.includes('Blue Label')) {
      correctedPrice = 3950.00;
    } else if (item.producto.includes('18 Años') || item.producto.includes('18 Anos')) {
      correctedPrice = 1599.00;
    } else {
      // Revertir la división por 1,000
      correctedPrice = Math.round(item.precio_bs * 1000 * 100) / 100;
    }

    await neonQuery(
      `UPDATE canasta_precios SET precio_bs = $1, updated_at = NOW() WHERE id = $2;`,
      [correctedPrice, item.id]
    );

    // Actualizar también en catalogo_productos_master si existe
    await neonQuery(
      `UPDATE catalogo_productos_master SET updated_at = NOW() WHERE producto = $1;`,
      [item.producto]
    );

    // Registrar en precios_historico la corrección
    const sku = `hipermaxi-${item.producto.replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase()}`.slice(0, 180);
    await neonQuery(
      `INSERT INTO precios_historico (sku_id, fecha, precio_actual_bs, precio_anterior_bs, delta_precio_bs, delta_porcentaje, disponible)
       VALUES ($1, CURRENT_DATE, $2, $3, $4, 0, TRUE)
       ON CONFLICT (sku_id, fecha) DO UPDATE SET precio_actual_bs = EXCLUDED.precio_actual_bs;`,
      [sku, correctedPrice, item.precio_bs, correctedPrice - item.precio_bs]
    );

    updatedCount++;
    console.log(`  ✅ Corregido ID ${item.id}: '${item.producto}' -> Bs ${correctedPrice.toFixed(2)} (anterior: Bs ${item.precio_bs.toFixed(2)})`);
  }

  console.log(`\n🎉 Saneamiento completado: ${updatedCount} productos actualizados a su precio real de tienda.`);

  // Verificación final
  const verified = await neonQuery(`
    SELECT id, producto, departamento, fuente, precio_bs::float, enlace
    FROM canasta_precios
    WHERE producto ILIKE '%Johnnie Walker Green Label%'
    LIMIT 3;
  `);
  console.log('\n📊 Verificación de Whisky Johnnie Walker Green Label en Neon PostgreSQL:');
  console.table(verified);
}

main().catch(console.error);
