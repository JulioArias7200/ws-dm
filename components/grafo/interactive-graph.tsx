'use client';

import { useState, useMemo, useRef, useCallback } from 'react';
import { NodeMetrics, GraphEdge } from '@/lib/graph-mining';

interface InteractiveGraphProps {
  nodes: NodeMetrics[];
  edges: GraphEdge[];
}

interface Point {
  x: number;
  y: number;
}

export function InteractiveGraph({ nodes, edges }: InteractiveGraphProps) {
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [hoveredNode, setHoveredNode] = useState<NodeMetrics | null>(null);
  const [filterType, setFilterType] = useState<'ALL' | 'Entidad' | 'Rubro'>('ALL');
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState<Point>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<Point>({ x: 0, y: 0 });

  const width = 800;
  const height = 520;

  // Calcular posiciones circulares o radiales para distribución de red
  const nodePositions = useMemo(() => {
    const posMap = new Map<string, Point>();
    if (nodes.length === 0) return posMap;

    const entidades = nodes.filter((n) => n.type === 'Entidad');
    const rubros = nodes.filter((n) => n.type === 'Rubro');

    const centerX = width / 2;
    const centerY = height / 2;

    // Distribuir Entidades en un radio interior/izquierdo
    const rEntidades = Math.min(width, height) * 0.32;
    entidades.forEach((n, idx) => {
      const angle = (idx / Math.max(entidades.length, 1)) * 2 * Math.PI - Math.PI / 2;
      posMap.set(n.id, {
        x: centerX + Math.cos(angle) * rEntidades,
        y: centerY + Math.sin(angle) * rEntidades * 0.82,
      });
    });

    // Distribuir Rubros en un radio exterior
    const rRubros = Math.min(width, height) * 0.44;
    rubros.forEach((n, idx) => {
      const angle = (idx / Math.max(rubros.length, 1)) * 2 * Math.PI - Math.PI / 2;
      posMap.set(n.id, {
        x: centerX + Math.cos(angle) * rRubros,
        y: centerY + Math.sin(angle) * rRubros * 0.9,
      });
    });

    return posMap;
  }, [nodes]);

  // Aristas conectadas al nodo seleccionado
  const connectedEdgeIndices = useMemo(() => {
    if (!selectedNodeId) return null;
    const set = new Set<number>();
    edges.forEach((e, idx) => {
      if (e.source === selectedNodeId || e.target === selectedNodeId) {
        set.add(idx);
      }
    });
    return set;
  }, [selectedNodeId, edges]);

  // Nodos vecinos del seleccionado
  const connectedNodeIds = useMemo(() => {
    if (!selectedNodeId) return null;
    const set = new Set<string>();
    set.add(selectedNodeId);
    edges.forEach((e) => {
      if (e.source === selectedNodeId) set.add(e.target);
      if (e.target === selectedNodeId) set.add(e.source);
    });
    return set;
  }, [selectedNodeId, edges]);

  // Manejo de drag and drop para mover el canvas SVG
  const handleMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).tagName === 'circle') return;
    setIsDragging(true);
    dragStartRef.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setPan({
      x: e.clientX - dragStartRef.current.x,
      y: e.clientY - dragStartRef.current.y,
    });
  };

  const handleMouseUp = () => setIsDragging(false);

  const handleZoomIn = useCallback(() => setZoom((z) => Math.min(z + 0.25, 2.5)), []);
  const handleZoomOut = useCallback(() => setZoom((z) => Math.max(z - 0.25, 0.5)), []);
  const handleResetZoom = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setSelectedNodeId(null);
  }, []);

  const visibleNodes = useMemo(() => {
    if (filterType === 'ALL') return nodes;
    return nodes.filter((n) => n.type === filterType);
  }, [nodes, filterType]);

  return (
    <div className="bg-white rounded-2xl border border-[#e0e2eb] p-5 shadow-sm flex flex-col gap-4">
      {/* Barra de Controles y Filtros */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#f1f3fc]">
        <div className="flex items-center gap-3">
          <span className="material-symbols-outlined text-[#005cb8]">hub</span>
          <div>
            <h2 className="text-[15px] font-bold text-[#181c22]">
              Grafo Topológico Interactivo (PageRank & HITS)
            </h2>
            <p className="text-[11px] text-[#717785]">
              Haz clic en un nodo para resaltar sus conexiones. Arrastra para explorar la red.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Selector de Tipo */}
          <div className="flex items-center bg-[#f1f3fc] p-1 rounded-xl text-[11px] font-medium">
            {(['ALL', 'Entidad', 'Rubro'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setFilterType(t)}
                className={`px-2.5 py-1 rounded-lg transition-colors ${
                  filterType === t
                    ? 'bg-white text-[#005cb8] font-bold shadow-xs'
                    : 'text-[#414753] hover:text-[#181c22]'
                }`}
              >
                {t === 'ALL' ? 'Todos' : t === 'Entidad' ? '🏛️ Entidades' : '📋 Rubros'}
              </button>
            ))}
          </div>

          {/* Controles de Zoom */}
          <div className="flex items-center gap-1 bg-[#f1f3fc] p-1 rounded-xl">
            <button
              onClick={handleZoomIn}
              className="p-1 rounded-lg hover:bg-white text-[#414753] hover:text-[#005cb8] transition-colors"
              title="Aumentar Zoom"
            >
              <span className="material-symbols-outlined text-[16px]">zoom_in</span>
            </button>
            <button
              onClick={handleZoomOut}
              className="p-1 rounded-lg hover:bg-white text-[#414753] hover:text-[#005cb8] transition-colors"
              title="Reducir Zoom"
            >
              <span className="material-symbols-outlined text-[16px]">zoom_out</span>
            </button>
            <button
              onClick={handleResetZoom}
              className="px-2 py-0.5 rounded-lg hover:bg-white text-[11px] font-mono text-[#414753] transition-colors"
              title="Restablecer Vista"
            >
              1:1
            </button>
          </div>
        </div>
      </div>

      {/* Canvas SVG */}
      <div
        className="relative w-full h-[500px] bg-[#f8fafd] rounded-xl border border-[#e0e2eb] overflow-hidden select-none cursor-grab active:cursor-grabbing"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-full"
          preserveAspectRatio="xMidYMid meet"
        >
          <g
            transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}
            style={{ transformOrigin: 'center' }}
          >
            {/* Aristas (Edges) */}
            <g className="edges">
              {edges.map((edge, idx) => {
                const sourcePos = nodePositions.get(edge.source);
                const targetPos = nodePositions.get(edge.target);
                if (!sourcePos || !targetPos) return null;

                const isConnected =
                  connectedEdgeIndices === null || connectedEdgeIndices.has(idx);

                return (
                  <line
                    key={`${edge.source}-${edge.target}-${idx}`}
                    x1={sourcePos.x}
                    y1={sourcePos.y}
                    x2={targetPos.x}
                    y2={targetPos.y}
                    stroke={isConnected && selectedNodeId ? '#005cb8' : '#c1c6d5'}
                    strokeWidth={isConnected && selectedNodeId ? 2 : 0.8}
                    strokeOpacity={isConnected ? (selectedNodeId ? 0.9 : 0.4) : 0.08}
                  />
                );
              })}
            </g>

            {/* Nodos (Circles) */}
            <g className="nodes">
              {visibleNodes.map((node) => {
                const pos = nodePositions.get(node.id);
                if (!pos) return null;

                const isSelected = selectedNodeId === node.id;
                const isNeighbor =
                  connectedNodeIds === null || connectedNodeIds.has(node.id);

                // Radio dinámico proporcional a PageRank
                const radius = Math.min(Math.max(8 + node.pageRank * 240, 9), 28);
                const isEntidad = node.type === 'Entidad';
                const fillColor = isEntidad ? '#005cb8' : '#d97706';

                return (
                  <g
                    key={node.id}
                    className="cursor-pointer transition-transform"
                    transform={`translate(${pos.x}, ${pos.y})`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedNodeId(selectedNodeId === node.id ? null : node.id);
                    }}
                    onMouseEnter={() => setHoveredNode(node)}
                    onMouseLeave={() => setHoveredNode(null)}
                  >
                    {/* Anillo de selección */}
                    {isSelected && (
                      <circle
                        r={radius + 5}
                        fill="none"
                        stroke="#005cb8"
                        strokeWidth={2.5}
                        strokeDasharray="4 2"
                        className="animate-spin"
                        style={{ transformOrigin: '0 0' }}
                      />
                    )}

                    {/* Nodo principal */}
                    <circle
                      r={radius}
                      fill={fillColor}
                      opacity={isNeighbor ? 1 : 0.2}
                      stroke="#ffffff"
                      strokeWidth={2}
                      className="transition-all hover:scale-110"
                    />

                    {/* Etiqueta corta de texto para nodos con alto PageRank */}
                    {(node.pageRank > 0.04 || isSelected) && (
                      <text
                        y={radius + 12}
                        textAnchor="middle"
                        className="text-[9px] font-sans font-medium fill-[#181c22] pointer-events-none select-none"
                        style={{ opacity: isNeighbor ? 1 : 0.2 }}
                      >
                        {node.label.length > 18
                          ? node.label.slice(0, 16) + '...'
                          : node.label}
                      </text>
                    )}
                  </g>
                );
              })}
            </g>
          </g>
        </svg>

        {/* Tooltip Flotante */}
        {hoveredNode && (
          <div className="absolute bottom-4 left-4 bg-white/95 backdrop-blur-md p-3.5 rounded-xl border border-[#e0e2eb] shadow-lg max-w-xs pointer-events-none animate-in fade-in flex flex-col gap-1.5 z-20">
            <div className="flex items-center justify-between gap-2">
              <span
                className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono uppercase ${
                  hoveredNode.type === 'Entidad'
                    ? 'bg-blue-50 text-blue-700 border border-blue-200'
                    : 'bg-amber-50 text-amber-700 border border-amber-200'
                }`}
              >
                {hoveredNode.type}
              </span>
              <span className="text-[11px] font-mono text-[#717785]">
                ID: {hoveredNode.id.slice(0, 12)}
              </span>
            </div>

            <div className="text-[13px] font-bold text-[#181c22] leading-tight">
              {hoveredNode.label}
            </div>

            <div className="grid grid-cols-3 gap-2 mt-1 pt-1.5 border-t border-[#f1f3fc] text-[10px] font-mono">
              <div>
                <span className="text-[#717785] block">PageRank</span>
                <span className="font-bold text-[#005cb8]">{hoveredNode.pageRank}</span>
              </div>
              <div>
                <span className="text-[#717785] block">HITS Hub</span>
                <span className="font-bold text-purple-700">{hoveredNode.hubScore}</span>
              </div>
              <div>
                <span className="text-[#717785] block">HITS Auth</span>
                <span className="font-bold text-amber-700">{hoveredNode.authorityScore}</span>
              </div>
            </div>
          </div>
        )}

        {/* Leyenda de Ayuda */}
        <div className="absolute top-3 right-3 bg-white/90 backdrop-blur-xs p-2 rounded-xl border border-[#e0e2eb] text-[11px] flex flex-col gap-1 shadow-xs">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#005cb8]"></span>
            <span className="text-[#414753]">Entidad Estatal</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#d97706]"></span>
            <span className="text-[#414753]">Rubro de Servicio</span>
          </div>
          <div className="text-[9px] font-mono text-[#717785] pt-0.5 border-t border-[#f1f3fc]">
            Tamaño = PageRank
          </div>
        </div>
      </div>
    </div>
  );
}
