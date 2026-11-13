# Guía Técnica: Hipermaxi Web Scraper (`scraper_hipermaxi.mjs`)

## 1. Resumen Ejecutivo

El scraper **`scraper_hipermaxi.mjs`** es un módulo de minería de datos web desarrollado con **Playwright Chromium** para la extracción, estructuración y monitoreo de precios de supermercado de **Hipermaxi S.A.** en las tres ciudades del eje central de Bolivia: **La Paz**, **Santa Cruz** y **Cochabamba**.

El script alimenta la dimensión de **Canasta Familiar** (`canasta_precios`) en **Neon PostgreSQL**, permitiendo el análisis comparativo de precios, inflación de alimentos y canasta básica entre departamentos.

---

## 2. Principios de Diseño y Arquitectura

1. **Inmutabilidad de `scraper_amz.mjs`**: [scraper_amz.mjs](file:///c:/Users/julio/Downloads/INF_2_2026/DM/5.MineriaWeb/ws-dm/scripts/scraper_amz.mjs) se mantiene 100% inalterado como estándar base de scraping del proyecto.
2. **Archivo Único y Estandarizado**: Se mantiene un solo archivo ejecutable: [scraper_hipermaxi.mjs](file:///c:/Users/julio/Downloads/INF_2_2026/DM/5.MineriaWeb/ws-dm/scripts/scraper_hipermaxi.mjs).
3. **Soporte Multi-Ciudad Nivel Eje Central**:
   - **La Paz**: Flagship Calacoto, Miraflores, Sopocachi, Los Pinos.
   - **Santa Cruz**: Flagship Cañoto, Equipetrol, Mutualista, Supercenter, Las Brisas, etc.
   - **Cochabamba**: Flagship Blanco Galindo, Juan de la Rosa, Sacaba.
4. **Política Anti-CAPTCHA y Modo Dual Inteligente**:
   - Hipermaxi cuenta con protección perimetral Radware Bot Manager (`validate.perfdrive.com`).
   - El scraper **nunca intenta resolver ni automatizar CAPTCHAs**.
   - En caso de detectar un reto de bot o navegación fuera de línea, conmuta automáticamente a modo de volcado HTML local (`data_hipermaxi_calacoto.html`), asegurando cero fallos y disponibilidad continua de datos.
5. **Persistencia Idempotente**: Inserción en tiempo real en la tabla `canasta_precios` con sentencia `ON CONFLICT (fecha, departamento, producto) DO UPDATE`.

---

## 3. Catálogo de Sucursales Soportadas

| Departamento | Nombre Ciudad | Slug Sucursal | Fuente en BD |
| :--- | :--- | :--- | :--- |
| **La Paz** | La Paz | `hipermaxi-calacoto` | `Hipermaxi Calacoto` |
| **La Paz** | La Paz | `hipermaxi-miraflores` | `Hipermaxi Miraflores` |
| **La Paz** | La Paz | `hipermaxi-sopocachi` | `Hipermaxi Sopocachi` |
| **La Paz** | La Paz | `hipermaxi-los-pinos` | `Hipermaxi Los Pinos` |
| **Santa Cruz** | Santa Cruz | `hipermaxi-canoto` | `Hipermaxi Cañoto` |
| **Santa Cruz** | Santa Cruz | `hipermaxi-equipetrol` | `Hipermaxi Equipetrol` |
| **Santa Cruz** | Santa Cruz | `hipermaxi-mutualista` | `Hipermaxi Mutualista` |
| **Santa Cruz** | Santa Cruz | `hipermaxi-supercenter` | `Hipermaxi Supercenter` |
| **Santa Cruz** | Santa Cruz | `hipermaxi-las-brisas` | `Hipermaxi Las Brisas` |
| **Cochabamba** | Cochabamba | `hipermaxi-blanco-galindo` | `Hipermaxi Blanco Galindo` |
| **Cochabamba** | Cochabamba | `hipermaxi-juan-de-la-rosa` | `Hipermaxi Juan de la Rosa` |
| **Cochabamba** | Cochabamba | `hipermaxi-sacaba` | `Hipermaxi Sacaba` |

---

## 4. Opciones de Ejecución CLI

Desde el directorio `ws-dm/` de PowerShell:

| Parámetro | Tipo | Descripción | Ejemplo de Uso |
| :--- | :--- | :--- | :--- |
| `--city=<nombre>` | String | Ciudad a consultar (`lapaz`, `santacruz`, `cochabamba`, `lp`, `scz`, `cbb`). | `node scripts/scraper_hipermaxi.mjs --city=santacruz` |
| `--branch=<slug>` | String | Sucursal específica. Si se omite, usa la flagship de la ciudad. | `node scripts/scraper_hipermaxi.mjs --city=lp --branch=miraflores` |
| `--all-cities` | Flag | Ejecuta secuencialmente la extracción en La Paz, Santa Cruz y Cochabamba. | `node scripts/scraper_hipermaxi.mjs --all-cities` |
| `--dry-run` | Flag | Ejecuta la extracción e imprime la tabla de datos sin modificar la base de datos. | `node scripts/scraper_hipermaxi.mjs --dry-run` |
| `--mode=file` | String | Modo offline a partir de un volcado HTML local. | `node scripts/scraper_hipermaxi.mjs --mode=file` |
| `--file=<ruta>` | Path | Ruta personalizada del archivo HTML snapshot. | `node scripts/scraper_hipermaxi.mjs --file=data_hipermaxi_calacoto.html` |
| `--categories=<slugs>` | Lista | Categorías departamentales a explorar separadas por coma. | `--categories=abarrotes,carnes,lacteos-y-derivados` |
| `--limit=<n>` | Número | Límite máximo de productos a recolectar por sucursal. | `--limit=50` |
| `--headless=false` | Flag | Abre la ventana gráfica interactiva de Chromium. | `node scripts/scraper_hipermaxi.mjs --headless=false` |

---

## 5. Análisis Técnico de Selectores DOM (Next.js / DaisyUI)

| Dato | Selector CSS | Ejemplo de Extracción | Normalización / Destino |
| :--- | :--- | :--- | :--- |
| **Contenedor** | `article.card` | Tarjeta DaisyUI compacta | Fila de producto |
| **ID Producto** | URL `/producto/(\d+)\/` o `h3#title-{id}` | `/producto/105775/...` | `id_producto = '105775'` |
| **Título** | `h3[id^="title-"]` | `"Azucar Aguai Blanca 5 kg"` | `producto VARCHAR(180)` |
| **Precio Actual** | `div[aria-label="Precio..."] .font-bold` | `"Bs 42.90"` | `precio_bs NUMERIC(10, 2) = 42.90` |
| **Precio Anterior**| `span[aria-label="Precio original"]` | `"Bs 45.50"` | `precio_anterior_bs = 45.50` |
| **Descuento** | `.rounded-full span` | `"-6% OFF"` | `descuento = '-6% OFF'` |
| **Unidad Medida** | Expresión Regular sobre el título | `(\d+\s*(kg\|gr\|l\|ml))` | `unidad_medida = '5 kg'` |
| **Imagen** | `img[alt^="Imagen del producto"]` | URL proxy Next.js | `imagen TEXT` |
| **Enlace** | `a[href*="/producto/"]` | URL absoluta | `enlace TEXT` |

---

## 6. Estructura y Esquema en Neon PostgreSQL (`canasta_precios`)

```sql
CREATE TABLE IF NOT EXISTS canasta_precios (
    id SERIAL PRIMARY KEY,
    fecha DATE NOT NULL,
    departamento VARCHAR(50) NOT NULL, -- 'La Paz', 'Santa Cruz', 'Cochabamba'
    producto VARCHAR(180) NOT NULL,
    categoria VARCHAR(60),            -- 'Abarrotes', 'Lácteos', 'Carnes', etc.
    unidad_medida VARCHAR(50) NOT NULL, -- '5 kg', '200 gr', '1 l', 'unidad'
    precio_bs NUMERIC(10, 2) NOT NULL, -- 42.90
    fuente VARCHAR(120) DEFAULT 'Hipermaxi',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT canasta_precios_uniq UNIQUE (fecha, departamento, producto)
);

CREATE INDEX IF NOT EXISTS canasta_depto_fecha_idx ON canasta_precios (departamento, fecha DESC);
```

### Sentencia de Inserción Idempotente:
```sql
INSERT INTO canasta_precios (
  fecha, departamento, producto, categoria, unidad_medida, precio_bs, fuente, updated_at
) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
ON CONFLICT (fecha, departamento, producto)
DO UPDATE SET
  categoria = EXCLUDED.categoria,
  unidad_medida = EXCLUDED.unidad_medida,
  precio_bs = EXCLUDED.precio_bs,
  fuente = EXCLUDED.fuente,
  updated_at = NOW();
```

---

## 7. Ejemplos de Consultas SQL

### Comparativa de Precios entre La Paz, Santa Cruz y Cochabamba:
```sql
SELECT 
    producto,
    unidad_medida,
    MAX(CASE WHEN departamento = 'La Paz' THEN precio_bs END) AS precio_lp,
    MAX(CASE WHEN departamento = 'Santa Cruz' THEN precio_bs END) AS precio_scz,
    MAX(CASE WHEN departamento = 'Cochabamba' THEN precio_bs END) AS precio_cbb,
    ROUND(AVG(precio_bs), 2) AS promedio_bs
FROM canasta_precios
WHERE fuente LIKE 'Hipermaxi%'
GROUP BY producto, unidad_medida
HAVING COUNT(DISTINCT departamento) >= 2
ORDER BY producto ASC;
```

### Resumen de Productos por Sucursal:
```sql
SELECT 
    departamento,
    fuente,
    COUNT(*)::int AS total_items,
    ROUND(AVG(precio_bs), 2) AS precio_promedio_bs,
    MIN(precio_bs) AS precio_min_bs,
    MAX(precio_bs) AS precio_max_bs
FROM canasta_precios
WHERE fuente LIKE 'Hipermaxi%'
GROUP BY departamento, fuente
ORDER BY departamento;
```

