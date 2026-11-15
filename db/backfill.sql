-- ==============================================================================
-- IN-ENGINE BACKFILL SCRIPT (NEON POSTGRESQL)
-- Migra retroactivamente los datos existentes en medicamentos_precios y canasta_precios
-- hacia catalogo_productos_master y precios_historico en una sola transacción interna.
-- ==============================================================================

-- 1. Poblar catálogo maestro desde medicamentos_precios
INSERT INTO catalogo_productos_master (
    sku_id, producto, cadena, departamento, categoria, laboratorio, presentacion, unidad_medida, enlace_canonica, imagen
)
SELECT DISTINCT ON (SUBSTRING(LOWER(REGEXP_REPLACE(cadena, '[^a-zA-Z0-9]+', '-', 'g')) || '-' || LOWER(REGEXP_REPLACE(producto, '[^a-zA-Z0-9]+', '-', 'g')), 1, 180))
    SUBSTRING(LOWER(REGEXP_REPLACE(cadena, '[^a-zA-Z0-9]+', '-', 'g')) || '-' || LOWER(REGEXP_REPLACE(producto, '[^a-zA-Z0-9]+', '-', 'g')), 1, 180) AS sku_id,
    producto, cadena, departamento, categoria, laboratorio, presentacion, 'Unidad', enlace, imagen
FROM medicamentos_precios
ORDER BY SUBSTRING(LOWER(REGEXP_REPLACE(cadena, '[^a-zA-Z0-9]+', '-', 'g')) || '-' || LOWER(REGEXP_REPLACE(producto, '[^a-zA-Z0-9]+', '-', 'g')), 1, 180), fecha DESC
ON CONFLICT (sku_id) DO NOTHING;

-- 2. Poblar catálogo maestro desde canasta_precios (Hipermaxi / OAP)
INSERT INTO catalogo_productos_master (
    sku_id, producto, cadena, departamento, categoria, laboratorio, presentacion, unidad_medida, enlace_canonica, imagen
)
SELECT DISTINCT ON (SUBSTRING('hipermaxi-' || LOWER(REGEXP_REPLACE(producto, '[^a-zA-Z0-9]+', '-', 'g')), 1, 180))
    SUBSTRING('hipermaxi-' || LOWER(REGEXP_REPLACE(producto, '[^a-zA-Z0-9]+', '-', 'g')), 1, 180) AS sku_id,
    producto, COALESCE(fuente, 'Hipermaxi'), departamento, categoria, 'Supermercado', unidad_medida, unidad_medida, enlace, imagen
FROM canasta_precios
ORDER BY SUBSTRING('hipermaxi-' || LOWER(REGEXP_REPLACE(producto, '[^a-zA-Z0-9]+', '-', 'g')), 1, 180), fecha DESC
ON CONFLICT (sku_id) DO NOTHING;

-- 3. Poblar histórico diario desde medicamentos_precios
INSERT INTO precios_historico (sku_id, fecha, precio_actual_bs, precio_anterior_bs, descuento_pct, disponible)
SELECT 
    SUBSTRING(LOWER(REGEXP_REPLACE(cadena, '[^a-zA-Z0-9]+', '-', 'g')) || '-' || LOWER(REGEXP_REPLACE(producto, '[^a-zA-Z0-9]+', '-', 'g')), 1, 180) AS sku_id,
    fecha, precio_bs, precio_anterior_bs, descuento_pct, disponible
FROM medicamentos_precios
ON CONFLICT (sku_id, fecha) DO NOTHING;

-- 4. Poblar histórico diario desde canasta_precios
INSERT INTO precios_historico (sku_id, fecha, precio_actual_bs, disponible)
SELECT 
    SUBSTRING('hipermaxi-' || LOWER(REGEXP_REPLACE(producto, '[^a-zA-Z0-9]+', '-', 'g')), 1, 180) AS sku_id,
    fecha, precio_bs, TRUE
FROM canasta_precios
ON CONFLICT (sku_id, fecha) DO NOTHING;

