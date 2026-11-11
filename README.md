# SICOES-Miner La Paz — Minería Web de Contrataciones Estatales y Empleo Público

> **Materia:** Minería de Datos (DM) — Capítulo 5: Motores de Búsqueda y Minería Web  
> **Ámbito Geográfico:** Departamento de La Paz, Estado Plurinacional de Bolivia  
> **Stack:** Next.js 16 (App Router, React 19, TypeScript, TailwindCSS v4) + Neon Serverless PostgreSQL (`pgvector`) + NVIDIA NIM (LLaMA 3.1 & Embeddings) + Telegram Bot Webhook  
> **Despliegue:** Optimizado para Vercel Serverless

---

## 1. Visión General y Problema Real

El departamento de La Paz concentra el mayor aparato de contrataciones públicas del país (ministerios, empresas estratégicas del Estado, Alcaldía GAMLP y la UMSA). Cientos de profesionales y consultores dependen del portal oficial **SICOES (`sicoes.gob.bo`)** para postular a **Consultorías Individuales de Línea (CIL)** y licitaciones públicas (**ANPE**). 

Sin embargo, el portal tradicional:
- Presenta interfaces lentas basadas en ASP.NET WebForms difíciles de navegar desde dispositivos móviles.
- No cuenta con búsqueda semántica por perfiles profesionales o competencias en lenguaje natural.
- No ofrece métricas topológicas sobre la estabilidad de los convocantes ni canales interactivos directos.

**SICOES-Miner** resuelve esta problemática aplicando las **tres ramas canónicas de la Minería Web**:
1. **Web Content Mining:** Extracción automatizada de licitaciones abiertas (vigentes) y cerradas (adjudicadas o desiertas) con Playwright.
2. **Web Structure Mining:** Modelado de la red de entidades y rubros mediante **PageRank (d=0.85)** y **HITS de Kleinberg (Hubs & Authorities)** implementados en TypeScript puro (sin depender de R en producción).
3. **Web Usage Mining:** Registro analítico de las búsquedas de los ciudadanos en Telegram para identificar áreas y rubros con mayor demanda laboral insatisfecha.

---

## 2. Estructura del Proyecto (`ws-dm/`)

```
ws-dm/
├── .env                                  <- Credenciales: NEON_DB, TELEGRAM_BOT, nvidiaApiKey
├── package.json                          <- Next.js 16, React 19, TailwindCSS v4
├── tsconfig.json                         <- Configuración de TypeScript
├── next.config.ts                        <- Configuración de Next.js
│
├── db/
│   └── schema.sql                        <- DDL para Neon PostgreSQL con extensión pgvector
│
├── lib/
│   ├── config.ts                         <- Lector robusto de variables de entorno (.env)
│   ├── db.ts                             <- Capa de acceso a datos y búsqueda híbrida
│   ├── nvidia-ai.ts                      <- Cliente NVIDIA NIM (Embeddings y LLaMA 3.1)
│   ├── graph-mining.ts                   <- Algoritmos PageRank y HITS en TypeScript puro
│   └── telegram-service.ts               <- Lógica de comandos y respuestas del Bot
│
├── app/
│   ├── layout.tsx                        <- Sidebar unificado, Google Fonts y diseño responsive
│   ├── page.tsx                          <- Dashboard Overview & KPIs ejecutivos
│   ├── scraper/page.tsx                  <- Vista 1: Monitoreo y control del crawler Playwright
│   ├── licitaciones/page.tsx             <- Vista 2: Catálogo con búsqueda semántica y drawer CUCE
│   ├── grafo/page.tsx                    <- Vista 3: Topología de red interactiva, PageRank y HITS
│   ├── telemetria/page.tsx               <- Vista 4: Stream de consultas Telegram y Usage Mining
│   │
│   └── api/                              <- Route Handlers (Serverless en Vercel)
│       ├── search/route.ts               <- Búsqueda híbrida (pgvector + PageRank)
│       ├── graph/route.ts                <- Entrega de métricas topológicas de la red
│       ├── scraper-status/route.ts       <- Telemetría del scraper
│       └── telegram/route.ts             <- Webhook serverless para el Bot de Telegram
│
└── scripts/
    └── scraper-sicoes.mjs                <- Script de extracción dinámica con Playwright
```

---

## 3. Base de Datos: Inicialización en Neon PostgreSQL (`pgvector`)

El archivo **`db/schema.sql`** contiene la definición completa. Puedes ejecutarlo en la consola SQL de tu proyecto Neon (`ep-floral-art-bdadjsv5-pooler.c-8.us-east-2.aws.neon.tech`):

1. Habilita la extensión vectorial:
   ```sql
   CREATE EXTENSION IF NOT EXISTS vector;
   ```
2. Crea las tablas de convocatorias con la columna `embedding vector(1024)` e índice **HNSW**.
3. Inicializa las aristas del grafo de contrataciones paceñas en `sicoes_graph_edges`.

---

## 4. Algoritmos de Minería de Redes (Sin R, 100% TypeScript)

Los algoritmos requeridos por el **Capítulo 5** se ejecutan en `lib/graph-mining.ts`:

### A. Algoritmo PageRank ($d = 0.85$)
Calcula la importancia estacionaria de las instituciones públicas convocantes según el modelo del navegante aleatorio (*Random Surfer*):
$$PR(p) = \frac{1 - d}{N} + d \sum_{q \in M(p)} \frac{PR(q)}{L(q)}$$
*Convergencia garantizada mediante el método de las potencias ($\Delta < 10^{-6}$) con suma total igual a 1.0.*

### B. Algoritmo HITS de Kleinberg (Hubs & Authorities)
Identifica la relación de refuerzo mutuo:
- **Hubs:** Entidades del Estado que actúan como concentradores de licitaciones públicas (ej. GAMLP, Ministerio de Obras Públicas).
- **Authorities:** Rubros y perfiles profesionales clave referenciados transversalmente.
$$a_p^{(t+1)} = \sum_{q \to p} h_q^{(t)}, \quad h_p^{(t+1)} = \sum_{p \to q} a_q^{(t+1)}$$
*Normalización euclídea vectorial $L_2$ tras cada iteración.*

---

## 5. Bot de Telegram (Consulta en Línea 24/7)

El bot está diseñado como una función serverless en `app/api/telegram/route.ts`:

### Comandos del Bot:
- `/start` o `/help`: Menú interactivo de opciones.
- `/buscar <texto>`: Búsqueda semántica híbrida (Coseno `pgvector` + PageRank de la institución).
- `/vigentes`: Lista convocatorias abiertas con fecha límite próxima.
- `/cerradas`: Histórico de licitaciones adjudicadas, monto final y empresa ganadora.
- `/cuce <codigo>`: Ficha técnica completa con fechas oficiales y enlace al pliego DBC.
- `/entidades_top`: Ranking de instituciones según **PageRank**.
- `/hubs_authorities`: Comparativa de Hubs y Authorities según **HITS**.
- `/stats`: Métricas en tiempo real de minería de uso (*Web Usage Mining*).

### Vinculación del Webhook en Vercel:
Una vez desplegado el proyecto en Vercel, ejecuta en tu navegador:
```
https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook?url=https://<TU-DOMINIO-VERCEL>/api/telegram
```

---

## 6. Puesta en Marcha Local

```bash
# Entrar a la carpeta del proyecto
cd ws-dm

# Ejecutar el servidor de desarrollo Next.js
pnpm run dev
```

Abre en tu navegador: **`http://localhost:3000`** para explorar el Dashboard interactivo.
