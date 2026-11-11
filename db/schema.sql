-- ==============================================================================
-- SICOES-MINER LA PAZ: ESQUEMA DE BASE DE DATOS (NEON POSTGRESQL + PGVECTOR)
-- ==============================================================================

-- 1. Habilitar extensión vectorial en Neon PostgreSQL
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. Tabla Principal de Convocatorias (Web Content Mining + Embeddings)
CREATE TABLE IF NOT EXISTS sicoes_convocatorias (
    cuce VARCHAR(60) PRIMARY KEY,              -- Código Único de Contrataciones Estatales
    entidad VARCHAR(255) NOT NULL,             -- Ej: Ministerio de Obras Públicas, GAMLP
    tipo_entidad VARCHAR(50) DEFAULT 'Entidad Estatal', -- 'Ministerio', 'Municipio', 'Empresa Pública'
    objeto TEXT NOT NULL,                      -- Objeto de contratación / descripción
    modalidad VARCHAR(50) DEFAULT 'ANPE',      -- 'ANPE', 'Licitación Pública', 'CIL', 'Menor'
    subasta BOOLEAN DEFAULT FALSE,             -- ¿Con subasta electrónica?
    departamento VARCHAR(50) DEFAULT 'La Paz',
    
    -- Valores económicos
    monto_referencial_bs NUMERIC(14, 2) NOT NULL DEFAULT 0.00, -- Presupuesto base en Bolivianos
    monto_adjudicado_bs NUMERIC(14, 2),        -- Monto final de adjudicación (cerradas)
    
    -- Fechas críticas del ciclo de vida
    fecha_publicacion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, -- FECHA DE INICIO
    fecha_presentacion TIMESTAMP NOT NULL,     -- FECHA DE FIN / Límite de propuestas
    fecha_adjudicacion TIMESTAMP,              -- Fecha de resolución de adjudicación
    
    -- Estado de la licitación
    estado VARCHAR(40) NOT NULL DEFAULT 'VIGENTE', -- 'VIGENTE', 'ADJUDICADA', 'DESIERTA', 'CANCELADA'
    adjudicatario VARCHAR(255),                -- Nombre del proveedor adjudicado (cerradas)
    
    -- Documentos oficiales
    pliego_url TEXT,                           -- Enlace al DBC / Formulario 100 / TDR
    formulario_500_url TEXT,                   -- Enlace a la adjudicación oficial
    
    -- Vector de Embedding para búsqueda semántica densa (NVIDIA NIM 1024 dims)
    embedding vector(1024),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Índices HNSW para búsqueda vectorial acelerada
CREATE INDEX IF NOT EXISTS sicoes_embedding_hnsw_idx 
ON sicoes_convocatorias USING hnsw (embedding vector_cosine_ops);

-- Índices relacionales para consultas de alta velocidad
CREATE INDEX IF NOT EXISTS sicoes_estado_idx ON sicoes_convocatorias (estado);
CREATE INDEX IF NOT EXISTS sicoes_fecha_pres_idx ON sicoes_convocatorias (fecha_presentacion);
CREATE INDEX IF NOT EXISTS sicoes_entidad_idx ON sicoes_convocatorias (entidad);

-- 3. Topología de Grafo (Web Structure Mining: PageRank & HITS)
CREATE TABLE IF NOT EXISTS sicoes_graph_edges (
    id SERIAL PRIMARY KEY,
    source_node VARCHAR(255) NOT NULL,         -- Entidad convocante
    target_node VARCHAR(255) NOT NULL,         -- Rubro / Área técnica o Proveedor
    edge_type VARCHAR(50) NOT NULL DEFAULT 'CONVOCA_RUBRO', -- 'CONVOCA_RUBRO', 'ADJUDICA_A'
    weight FLOAT DEFAULT 1.0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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

-- 5. Semilla inicial de datos para verificación inmediata (Datos Paceños Reales)
INSERT INTO sicoes_convocatorias 
(cuce, entidad, tipo_entidad, objeto, modalidad, monto_referencial_bs, fecha_publicacion, fecha_presentacion, estado, pliego_url)
VALUES
('24-0412-00-149021-1-1', 'Ministerio de Planificación del Desarrollo', 'Ministerio', 'Servicio de Consultoría para Auditoría Forense Informática y Pentesting a la Infraestructura de Servidores del Sistema Nacional de Inversión Pública (SNIP)', 'ANPE con Subasta', 180000.00, '2026-11-01 09:00:00', '2026-11-20 18:00:00', 'VIGENTE', 'https://www.sicoes.gob.bo'),
('24-0105-00-148810-1-1', 'Gobierno Autónomo Municipal de La Paz (GAMLP)', 'Municipio', 'Adquisición e Instalación de Red Dorsal de Fibra Óptica Monomodo y Enlaces Inalámbricos para el Centro de Monitoreo Urbano La Paz', 'Licitación Pública', 750000.00, '2026-10-25 10:00:00', '2026-11-18 16:30:00', 'VIGENTE', 'https://www.sicoes.gob.bo'),
('24-0230-00-147900-1-2', 'Yacimientos Petrolíferos Fiscales Bolivianos (YPFB)', 'Empresa Pública', 'Servicio Especializado de Desarrollo de Software para el Módulo de Trazabilidad y Asignación de Combustibles en Plantas La Paz', 'ANPE', 240000.00, '2026-10-15 08:30:00', '2026-11-05 17:00:00', 'ADJUDICADA', 'https://www.sicoes.gob.bo'),
('24-0012-00-146520-1-1', 'Universidad Mayor de San Andrés (UMSA)', 'Universidad', 'Consultoría de Línea para Especialista en Base de Datos PostgreSQL, Alta Disponibilidad y Migración de Sistemas Académicos', 'CIL', 72000.00, '2026-11-02 08:00:00', '2026-11-15 15:00:00', 'VIGENTE', 'https://www.sicoes.gob.bo'),
('24-0550-00-145110-1-1', 'Ministerio de Salud y Deportes', 'Ministerio', 'Mantenimiento Preventivo y Correctivo de Servidores Centrales y Sistema Único de Información en Salud (SUIS) para La Paz', 'ANPE', 125000.00, '2026-09-20 09:00:00', '2026-10-10 18:00:00', 'DESIERTA', 'https://www.sicoes.gob.bo')
ON CONFLICT (cuce) DO NOTHING;

-- Aristas iniciales del grafo de contrataciones
INSERT INTO sicoes_graph_edges (source_node, target_node, edge_type, weight)
VALUES
('Ministerio de Planificación del Desarrollo', 'Auditoría Forense & Ciberseguridad', 'CONVOCA_RUBRO', 1.0),
('Gobierno Autónomo Municipal de La Paz (GAMLP)', 'Fibra Óptica & Telecomunicaciones', 'CONVOCA_RUBRO', 1.0),
('Yacimientos Petrolíferos Fiscales Bolivianos (YPFB)', 'Desarrollo de Software', 'CONVOCA_RUBRO', 1.0),
('Universidad Mayor de San Andrés (UMSA)', 'Bases de Datos & DBA', 'CONVOCA_RUBRO', 1.0),
('Ministerio de Salud y Deportes', 'Infraestructura & Servidores', 'CONVOCA_RUBRO', 1.0),
('Gobierno Autónomo Municipal de La Paz (GAMLP)', 'Desarrollo de Software', 'CONVOCA_RUBRO', 1.0),
('Ministerio de Planificación del Desarrollo', 'Bases de Datos & DBA', 'CONVOCA_RUBRO', 1.0)
ON CONFLICT DO NOTHING;
