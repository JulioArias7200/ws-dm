-- ==============================================================================
-- SICOES-MINER LA PAZ: ESQUEMA DE BASE DE DATOS (NEON POSTGRESQL + PGVECTOR)
-- Solo definición estructural (DDL). Los datos se ingieren mediante Web Scraping real.
-- ==============================================================================

-- 1. Habilitar extensión vectorial en Neon PostgreSQL
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. Tabla Principal de Convocatorias (Web Content Mining + Embeddings)
CREATE TABLE IF NOT EXISTS sicoes_convocatorias (
    cuce VARCHAR(60) PRIMARY KEY,              -- Código Único de Contrataciones Estatales
    entidad VARCHAR(255) NOT NULL,             -- Entidad pública convocante
    tipo_entidad VARCHAR(50) DEFAULT 'Entidad Estatal', -- 'Ministerio', 'Municipio', 'Empresa Pública', etc.
    tipo_contratacion VARCHAR(80),             -- 'Bienes', 'Obras', 'Servicios Generales', 'Consultoria'
    objeto TEXT NOT NULL,                      -- Objeto de contratación / descripción
    modalidad VARCHAR(50) DEFAULT 'ANPE',      -- 'ANPE', 'LP', 'CM', 'CND1', etc.
    subasta BOOLEAN DEFAULT FALSE,             -- ¿Con subasta electrónica?
    departamento VARCHAR(50) DEFAULT 'La Paz',

    -- Valores económicos (opcional si el listado público no incluye monto sin descarga de ficha)
    monto_referencial_bs NUMERIC(14, 2),
    monto_adjudicado_bs NUMERIC(14, 2),

    -- Fechas críticas del ciclo de vida
    fecha_publicacion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    fecha_presentacion TIMESTAMP,
    fecha_adjudicacion TIMESTAMP,

    -- Estado real de la licitación
    estado VARCHAR(40) NOT NULL DEFAULT 'VIGENTE', -- 'VIGENTE', 'ADJUDICADA', 'CONTRATADA', 'DESIERTA', 'CANCELADA'
    adjudicatario VARCHAR(255),

    -- Metadatos adicionales públicos de SICOES
    formularios VARCHAR(120),
    contacto VARCHAR(255),
    normativa VARCHAR(180),

    -- Enlaces oficiales de referencia
    pliego_url TEXT,
    formulario_500_url TEXT,

    -- Vector de Embedding para búsqueda semántica densa (NVIDIA NIM nv-embedqa-e5-v5, 1024 dims)
    embedding vector(1024),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Índice HNSW para búsqueda vectorial por similitud de coseno
CREATE INDEX IF NOT EXISTS sicoes_embedding_hnsw_idx
ON sicoes_convocatorias USING hnsw (embedding vector_cosine_ops);

-- Índices relacionales para filtros y consultas rápidas
CREATE INDEX IF NOT EXISTS sicoes_estado_idx ON sicoes_convocatorias (estado);
CREATE INDEX IF NOT EXISTS sicoes_fecha_pres_idx ON sicoes_convocatorias (fecha_presentacion);
CREATE INDEX IF NOT EXISTS sicoes_entidad_idx ON sicoes_convocatorias (entidad);
CREATE INDEX IF NOT EXISTS sicoes_departamento_idx ON sicoes_convocatorias (departamento);

-- 3. Topología de Grafo (Web Structure Mining: PageRank & HITS)
CREATE TABLE IF NOT EXISTS sicoes_graph_edges (
    id SERIAL PRIMARY KEY,
    source_node VARCHAR(255) NOT NULL,         -- Entidad convocante
    target_node VARCHAR(255) NOT NULL,         -- Rubro / Área técnica o Tipo de Contratación
    edge_type VARCHAR(50) NOT NULL DEFAULT 'CONVOCA_RUBRO', -- 'CONVOCA_RUBRO', 'ADJUDICA_A'
    weight FLOAT DEFAULT 1.0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT sicoes_graph_edges_uniq UNIQUE (source_node, target_node, edge_type)
);

CREATE TABLE IF NOT EXISTS sicoes_node_metrics (
    node_name VARCHAR(255) PRIMARY KEY,
    node_type VARCHAR(50) DEFAULT 'Entidad',
    in_degree INT DEFAULT 0,
    out_degree INT DEFAULT 0,
    pagerank_score FLOAT DEFAULT 0.0,
    hub_score FLOAT DEFAULT 0.0,
    authority_score FLOAT DEFAULT 0.0,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 4. Registro de Consultas y Telemetría (Web Usage Mining)
CREATE TABLE IF NOT EXISTS sicoes_usage_logs (
    id SERIAL PRIMARY KEY,
    telegram_user_id BIGINT,
    username VARCHAR(100),
    query_text TEXT NOT NULL,
    matched_cuce VARCHAR(60),
    response_time_ms INT DEFAULT 0,
    queried_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 5. Precios Reales de Canasta Familiar (Observatorio Agroambiental OAP Bolivia)
CREATE TABLE IF NOT EXISTS canasta_precios (
    id SERIAL PRIMARY KEY,
    fecha DATE NOT NULL,
    departamento VARCHAR(50) NOT NULL,
    producto VARCHAR(180) NOT NULL,
    categoria VARCHAR(60),
    unidad_medida VARCHAR(50) NOT NULL,
    precio_bs NUMERIC(10, 2) NOT NULL,
    fuente VARCHAR(120) DEFAULT 'OAP Bolivia',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT canasta_precios_uniq UNIQUE (fecha, departamento, producto)
);

CREATE INDEX IF NOT EXISTS canasta_depto_fecha_idx ON canasta_precios (departamento, fecha DESC);

-- 6. Centros de Salud Georreferenciados en La Paz (OpenStreetMap)
CREATE TABLE IF NOT EXISTS centros_salud (
    osm_id VARCHAR(60) PRIMARY KEY,
    nombre VARCHAR(255) NOT NULL,
    tipo VARCHAR(40) NOT NULL,
    departamento VARCHAR(50) DEFAULT 'La Paz',
    direccion TEXT,
    lat DOUBLE PRECISION NOT NULL,
    lon DOUBLE PRECISION NOT NULL,
    telefono VARCHAR(100),
    horario VARCHAR(180),
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS centros_salud_tipo_idx ON centros_salud (tipo);
