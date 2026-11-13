# Guía Técnica: Farmacorp Web Scraper (`scraper_farmacorp.mjs`)

## 1. Resumen Ejecutivo

El scraper **`scraper_farmacorp.mjs`** es un módulo de minería de datos web desarrollado con **Playwright Chromium** para la extracción, normalización y monitoreo de precios farmacéuticos de la cadena **Farmacorp** en Bolivia (`https://farmacorp.com`).

El script alimenta la dimensión de **Salud & Medicamentos** (`medicamentos_precios`) en **Neon PostgreSQL**, permitiendo al ciudadano comparar precios de principios activos, presentaciones médicas y alternativas genéricas vs de marca.

---

## 2. Principios de Diseño y Arquitectura

1. **Inmutabilidad de `scraper_amz.mjs`**: [scraper_amz.mjs](file:///c:/Users/julio/Downloads/INF_2_2026/DM/5.MineriaWeb/ws-dm/scripts/scraper_amz.mjs) se mantiene 100% inalterado como estándar base de scraping.
2. **Archivo Único y Estandarizado**: Se mantiene un solo archivo ejecutable con guion bajo: [scraper_farmacorp.mjs](file:///c:/Users/julio/Downloads/INF_2_2026/DM/5.MineriaWeb/ws-dm/scripts/scraper_farmacorp.mjs).
3. **Plataforma Shopify**:
   - Paginación soportada de hasta 685 páginas (`/collections/all?page=N&grid_list=grid-view`).
   - Soporte para colecciones específicas (`medicamentos`, `cuidado-personal`, `salud-y-bienestar`).
   - Búsqueda directa por principio activo o marca (`/search?type=product&q=...`).
4. **Selectores DOM y Normalización**:
   - Tarjeta: `.productitem`
   - Título: `.productitem--title a`
   - Laboratorio / Fabricante: `.productitem--vendor`
   - Precios: `.price--main` (precio actual) y `.price--compare-at` (precio de lista)
   - Extracción de presentación farmacéutica mediante expresiones regulares (`X 20 TABLETAS`, `100 MG`, `JARABE 120 ML`, etc.).
5. **Persistencia Idempotente**:
   - Inserción en `medicamentos_precios` con `ON CONFLICT (fecha, cadena, departamento, producto) DO UPDATE`.
   - Respaldo JSON local en `data_scraped_farmacorp.json`.

---

## 3. Opciones de Ejecución CLI

Desde el directorio `ws-dm/` de PowerShell:

| Parámetro | Tipo | Descripción | Ejemplo de Uso |
| :--- | :--- | :--- | :--- |
| `--pages=<n>` | Número | Cantidad de páginas a extraer (por defecto: 2). | `node scripts/scraper_farmacorp.mjs --pages=3` |
| `--collection=<slug>` | String | Colección Shopify (`all`, `medicamentos`, etc.). | `node scripts/scraper_farmacorp.mjs --collection=medicamentos` |
| `--search=<termino>` | String | Búsqueda directa por principio activo o marca. | `node scripts/scraper_farmacorp.mjs --search="paracetamol"` |
| `--city=<nombre>` | String | Departamento o ciudad de entrega (por defecto: `La Paz`). | `node scripts/scraper_farmacorp.mjs --city="Santa Cruz"` |
| `--dry-run` | Flag | Ejecuta la extracción y muestra tablas sin tocar la base de datos. | `node scripts/scraper_farmacorp.mjs --dry-run` |
| `--limit=<n>` | Número | Límite máximo de productos a recolectar. | `node scripts/scraper_farmacorp.mjs --limit=50` |
| `--no-headless` | Flag | Abre la ventana gráfica interactiva de Chromium. | `node scripts/scraper_farmacorp.mjs --no-headless` |

---

## 4. Ejemplos de Comandos

```powershell
# 1. Extracción de prueba (dry-run)
node scripts/scraper_farmacorp.mjs --pages=1 --dry-run

# 2. Búsqueda y sincronización de Paracetamol
node scripts/scraper_farmacorp.mjs --search="paracetamol"

# 3. Búsqueda de Ibuprofeno
node scripts/scraper_farmacorp.mjs --search="ibuprofeno"

# 4. Sincronización de catálogo de medicamentos
node scripts/scraper_farmacorp.mjs --collection=medicamentos --pages=2
```

---

## 5. Esquema en Base de Datos (`medicamentos_precios`)

```sql
CREATE TABLE IF NOT EXISTS medicamentos_precios (
    id SERIAL PRIMARY KEY,
    fecha DATE NOT NULL,
    departamento VARCHAR(50) NOT NULL,
    cadena VARCHAR(100) NOT NULL,       -- 'Farmacorp'
    producto VARCHAR(255) NOT NULL,
    laboratorio VARCHAR(120),
    categoria VARCHAR(100),
    presentacion VARCHAR(120),
    precio_bs NUMERIC(10, 2) NOT NULL,
    precio_anterior_bs NUMERIC(10, 2),
    descuento_pct NUMERIC(5, 2),
    enlace TEXT,
    imagen TEXT,
    disponible BOOLEAN DEFAULT TRUE,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT med_precios_uniq UNIQUE (fecha, cadena, departamento, producto)
);
```

