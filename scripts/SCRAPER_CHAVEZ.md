# Guía Técnica: Farmacias Chávez Web Scraper (`scraper_chavez.mjs`)

## 1. Resumen Ejecutivo

El scraper **`scraper_chavez.mjs`** es un módulo de minería de datos web desarrollado con **Playwright Chromium** para la extracción, estructuración y monitoreo de precios farmacéuticos de la cadena nacional **Farmacias Chávez** en Bolivia (`https://www.farmaciaschavez.com.bo`).

Alimenta la tabla `medicamentos_precios` en **Neon PostgreSQL**, permitiendo al bot ciudadano de Telegram (`@ChatDM7200bot`) contrastar precios y alertar oportunidades de ahorro entre Farmacorp y Farmacias Chávez.

---

## 2. Principios de Diseño y Arquitectura

1. **Inmutabilidad de `scraper_amz.mjs`**: [scraper_amz.mjs](file:///c:/Users/julio/Downloads/INF_2_2026/DM/5.MineriaWeb/ws-dm/scripts/scraper_amz.mjs) permanece inalterado.
2. **Archivo Único y Estandarizado**: Se mantiene un solo script: [scraper_chavez.mjs](file:///c:/Users/julio/Downloads/INF_2_2026/DM/5.MineriaWeb/ws-dm/scripts/scraper_chavez.mjs).
3. **Plataforma Next.js + Instaleap/Wanda**:
   - Dominio canónico con prefijo `www.`: `https://www.farmaciaschavez.com.bo/`.
   - Búsqueda instantánea directa por URL: `/search?name={termino}` (hasta 50 productos por consulta).
   - Hidratación de cliente: Espera explícita a la carga de los componentes React/Ant-Design (`waitForSelector('a[href^="/p/"]')`).
4. **Selectores DOM y Normalización**:
   - Tarjetas: `a[href^="/p/"]`
   - Título y Descripción: `h3.prod__name` o `[class*="prod__name"]`
   - Precio actual: `p.base__price` (ej. `Bs 16,1` $\rightarrow$ `16.10`)
   - Precio tachado / anterior: `[class*="old__price"]`
   - Imagen oficial: CDN de catálogo Farmacias Chávez (`pedidosonline.farmaciaschavez.com.bo:8443`)
   - **Extracción de Laboratorios y Marcas desde la Descripción / Título**:
     A diferencia de otras cadenas, en Farmacias Chávez el fabricante o marca comercial viene integrado en la descripción/título del ítem (ej. `Crema Combinada Alfa X 15 Gr` $\rightarrow$ Lab: **ALFA**, `Sesderma Crema...` $\rightarrow$ Lab: **SESDERMA**, `Lecar Paracetamol...` $\rightarrow$ Lab: **LECAR**, `Sae Ibuprofeno...` $\rightarrow$ Lab: **SAE**, `Nivea Crema...` $\rightarrow$ Marca: **NIVEA**). Si el producto es principio activo puro sin marca (ej. `Ibuprofeno 100 Mg X 60 Ml`), se cataloga automáticamente como **Genérico**.
   - Flag `--details`: Permite navegación profunda opcional a `/p/{slug}` para extraer principios activos y acción terapéutica desde `[data-testid="description-content"]`.
5. **Persistencia Idempotente**:
   - Upsert en `medicamentos_precios` de Neon PostgreSQL.
   - Respaldo JSON local en `data_scraped_chavez.json`.

---

## 3. Opciones de Ejecución CLI

Desde el directorio `ws-dm/` de PowerShell:

| Parámetro | Tipo | Descripción | Ejemplo de Uso |
| :--- | :--- | :--- | :--- |
| `--search=<termino>` | String | Fármaco o principio activo a buscar. | `node scripts/scraper_chavez.mjs --search="paracetamol"` |
| `--essentials` | Flag | Ejecuta búsqueda masiva de 10 fármacos esenciales (paracetamol, ibuprofeno, amoxicilina, aspirina, etc.). | `node scripts/scraper_chavez.mjs --essentials` |
| `--city=<nombre>` | String | Ciudad de sucursal (por defecto: `La Paz`). | `node scripts/scraper_chavez.mjs --city="Santa Cruz"` |
| `--dry-run` | Flag | Ejecuta la extracción y muestra tablas sin modificar la base de datos. | `node scripts/scraper_chavez.mjs --dry-run` |
| `--limit=<n>` | Número | Límite máximo de productos a recolectar. | `node scripts/scraper_chavez.mjs --limit=50` |
| `--no-headless` | Flag | Abre la ventana gráfica interactiva de Chromium. | `node scripts/scraper_chavez.mjs --no-headless` |

---

## 4. Ejemplos de Comandos

```powershell
# 1. Extracción de prueba para Paracetamol
node scripts/scraper_chavez.mjs --search="paracetamol" --dry-run

# 2. Búsqueda y sincronización de Ibuprofeno
node scripts/scraper_chavez.mjs --search="ibuprofeno"

# 3. Búsqueda y sincronización de Amoxicilina
node scripts/scraper_chavez.mjs --search="amoxicilina"

# 4. Sincronización masiva de canasta médica esencial
node scripts/scraper_chavez.mjs --essentials
```

---

## 5. Integración con Telegram Bot (`/farmacia`)

Los datos sincronizados por `scraper_chavez.mjs` y `scraper_farmacorp.mjs` son consultados directamente en Telegram:
- Comando directo: `/farmacia <medicamento>` (ej. `/farmacia paracetamol`)
- Submenú de salud: `/salud` $\rightarrow$ Botones `💊 Paracetamol (Comparar)`, `💊 Ibuprofeno (Comparar)`, `🏢 Catálogo Farmacorp`, `🏢 Catálogo Chávez`.
- Calcula automáticamente el menor precio y el ahorro en Bolivianos para el ciudadano.

