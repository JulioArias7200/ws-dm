'use client';

import { useState, useEffect, useCallback, useTransition } from 'react';
import { CanastaCard } from '@/components/canasta/canasta-card';
import { ProductDetailModal } from '@/components/canasta/product-detail-modal';
import type { UnifiedProductItem } from '@/lib/canasta-salud';

const MACRO_CATEGORIAS = [
  { id: 'todas', label: 'Todos los Productos', icon: 'apps' },
  { id: 'canasta', label: 'Canasta Familiar', icon: 'shopping_basket' },
  { id: 'limpieza', label: 'Limpieza & Hogar', icon: 'cleaning_services' },
  { id: 'licores', label: 'Licores & Bebidas', icon: 'liquor' },
  { id: 'farmacia', label: 'Farmacia & Salud', icon: 'local_pharmacy' },
  { id: 'personal', label: 'Cuidado Personal', icon: 'spa' },
  { id: 'otros', label: 'Bazar & Otros', icon: 'category' },
];

const CADENAS = [
  { id: 'TODAS', label: 'Todas las Tiendas' },
  { id: 'Hipermaxi', label: 'Hipermaxi' },
  { id: 'Farmacorp', label: 'Farmacorp' },
  { id: 'Chavez', label: 'Farmacias Chávez' },
  { id: 'OAP', label: 'Mercado OAP' },
];

const CIUDADES = [
  { id: 'TODAS', label: 'Todas las Ciudades' },
  { id: 'La Paz', label: 'La Paz' },
  { id: 'Cochabamba', label: 'Cochabamba' },
  { id: 'Santa Cruz', label: 'Santa Cruz' },
];

const ORDENES = [
  { id: 'precio_asc', label: '💰 Precio: Menor a Mayor' },
  { id: 'precio_desc', label: '💎 Precio: Mayor a Menor' },
  { id: 'nombre', label: '🔤 Nombre (A - Z)' },
  { id: 'descuento', label: '🏷️ Mayor Descuento %' },
];

export default function CanastaPage() {
  const [, startTransition] = useTransition();

  const [query, setQuery] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [macroCategoria, setMacroCategoria] = useState('todas');
  const [subcategoria, setSubcategoria] = useState('TODAS');
  const [cadena, setCadena] = useState('TODAS');
  const [ciudad, setCiudad] = useState('TODAS');
  const [sortBy, setSortBy] = useState('precio_asc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(24);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [items, setItems] = useState<UnifiedProductItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProduct, setSelectedProduct] = useState<UnifiedProductItem | null>(null);

  const [macroCounts, setMacroCounts] = useState<Record<string, number>>({
    todas: 0,
    canasta: 0,
    limpieza: 0,
    licores: 0,
    farmacia: 0,
    personal: 0,
    otros: 0,
  });

  const [subcategoriasList, setSubcategoriasList] = useState<string[]>([]);

  // Fetch unificado del catálogo
  const fetchCatalog = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (searchTerm.trim()) params.set('q', searchTerm.trim());
      if (macroCategoria && macroCategoria !== 'todas') params.set('macro', macroCategoria);
      if (subcategoria && subcategoria !== 'TODAS') params.set('subcategoria', subcategoria);
      if (cadena && cadena !== 'TODAS') params.set('cadena', cadena);
      if (ciudad && ciudad !== 'TODAS') params.set('ciudad', ciudad);
      if (sortBy) params.set('sortBy', sortBy);
      params.set('page', String(page));
      params.set('pageSize', String(pageSize));

      const res = await fetch(`/api/canasta?${params.toString()}`);
      const data = await res.json();

      if (data.success && data.items) {
        setItems(data.items);
        setTotalPages(data.totalPages || 1);
        setTotalItems(data.total || 0);
      }
      if (data.macroCounts) {
        setMacroCounts(data.macroCounts);
      }
      if (data.filtrosDisponibles?.subcategorias?.length) {
        setSubcategoriasList(data.filtrosDisponibles.subcategorias);
      }
    } catch (err) {
      console.error('Error cargando catálogo unificado:', err);
    } finally {
      setLoading(false);
    }
  }, [searchTerm, macroCategoria, subcategoria, cadena, ciudad, sortBy, page, pageSize]);

  useEffect(() => {
    fetchCatalog();
  }, [fetchCatalog]);

  const handleMacroChange = (mId: string) => {
    startTransition(() => {
      setMacroCategoria(mId);
      setSubcategoria('TODAS');
      setPage(1);
    });
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSearchTerm(query);
    setPage(1);
  };

  const handleClearSearch = () => {
    setQuery('');
    setSearchTerm('');
    setPage(1);
  };

  const resetAllFilters = () => {
    setQuery('');
    setSearchTerm('');
    setMacroCategoria('todas');
    setSubcategoria('TODAS');
    setCadena('TODAS');
    setCiudad('TODAS');
    setSortBy('precio_asc');
    setPage(1);
  };

  return (
    <div className="flex flex-col gap-6 max-w-7xl mx-auto px-2 sm:px-4">
      {/* Header Ejecutivo */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-5 border-b border-[#e0e2eb]">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-md bg-[#005cb8]/10 text-[#005cb8] text-[11px] font-mono font-bold uppercase tracking-wider">
              CATÁLOGO UNIFICADO // EJE CENTRAL
            </span>
            <span className="text-[12px] text-[#717785]">• Supermercados & Cadenas Farmacéuticas</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-[#181c22] tracking-tight">
            Monitor de Precios: Canasta, Limpieza, Licores y Farmacias
          </h1>
          <p className="text-[14px] text-[#414753] max-w-3xl">
            Monitoreo en tiempo real de más de <strong>28,000 productos</strong> en Bolivia. Compara precios y ahorros entre Hipermaxi, Farmacorp, Farmacias Chávez y Mercados Populares OAP.
          </p>
        </div>

        {/* Resumen de Métricas en Vivo */}
        <div className="flex items-center gap-3 bg-white p-3 rounded-2xl border border-[#e0e2eb] shadow-xs self-start lg:self-center">
          <div className="text-right">
            <div className="text-[10px] font-mono text-[#717785] uppercase">Total Productos</div>
            <div className="text-xl font-mono font-black text-[#005cb8]">
              {macroCounts.todas > 0 ? macroCounts.todas.toLocaleString() : totalItems.toLocaleString()}
            </div>
          </div>
          <div className="h-8 w-px bg-gray-200" />
          <div className="text-right">
            <div className="text-[10px] font-mono text-[#717785] uppercase">Filtrados</div>
            <div className="text-xl font-mono font-bold text-emerald-600">
              {totalItems.toLocaleString()}
            </div>
          </div>
        </div>
      </div>

      {/* Barra de Píldoras de Macro-Categorías */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-thin">
        {MACRO_CATEGORIAS.map((macro) => {
          const isActive = macroCategoria === macro.id;
          const count = macroCounts[macro.id] ?? 0;
          return (
            <button
              key={macro.id}
              onClick={() => handleMacroChange(macro.id)}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-[13px] font-bold transition-all whitespace-nowrap cursor-pointer border ${
                isActive
                  ? 'bg-[#005cb8] text-white border-[#005cb8] shadow-sm'
                  : 'bg-white text-[#414753] border-[#e0e2eb] hover:bg-[#f1f3fc] hover:border-gray-300'
              }`}
            >
              <span className="material-symbols-outlined text-[18px]">
                {macro.icon}
              </span>
              <span>{macro.label}</span>
              {count > 0 && (
                <span
                  className={`text-[11px] px-2 py-0.2 rounded-full font-mono ${
                    isActive ? 'bg-white/25 text-white' : 'bg-gray-100 text-[#717785]'
                  }`}
                >
                  {count.toLocaleString()}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Buscador Principal y Controles Facetados */}
      <div className="flex flex-col gap-3 bg-white p-4 rounded-2xl border border-[#e0e2eb] shadow-xs">
        {/* Fila 1: Buscador de Texto Universal */}
        <form onSubmit={handleSearchSubmit} className="flex flex-col sm:flex-row gap-2.5">
          <div className="relative flex-1">
            <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 text-[20px]">
              search
            </span>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por producto, marca o laboratorio (ej. Lavandina, Arroz, Paracetamol, Whisky, Aceite, Leche)..."
              className="w-full pl-11 pr-10 py-2.5 bg-[#f8fafd] border border-[#e0e2eb] rounded-xl text-[14px] text-[#181c22] placeholder-gray-400 focus:outline-none focus:border-[#005cb8] focus:bg-white transition-all"
            />
            {query && (
              <button
                type="button"
                onClick={handleClearSearch}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1"
                title="Limpiar búsqueda"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            )}
          </div>
          <button
            type="submit"
            className="bg-[#005cb8] hover:bg-[#004b98] text-white px-6 py-2.5 rounded-xl text-[13px] font-bold transition-all shadow-xs flex items-center justify-center gap-1.5 shrink-0 cursor-pointer"
          >
            <span className="material-symbols-outlined text-[18px]">search</span>
            <span>Buscar</span>
          </button>
        </form>

        {/* Fila 2: Filtros Facetados (Tienda, Ciudad, Subcategoría, Orden) */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-2 border-t border-gray-100 text-[12px]">
          {/* Filtro Tienda / Cadena */}
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-mono font-bold text-[#717785] uppercase">Tienda / Cadena</label>
            <select
              value={cadena}
              onChange={(e) => {
                setCadena(e.target.value);
                setPage(1);
              }}
              className="w-full px-2.5 py-1.5 bg-[#f8fafd] border border-[#e0e2eb] rounded-lg text-[#181c22] font-medium focus:outline-none focus:border-[#005cb8]"
            >
              {CADENAS.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>

          {/* Filtro Ciudad / Departamento */}
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-mono font-bold text-[#717785] uppercase">Ciudad / Región</label>
            <select
              value={ciudad}
              onChange={(e) => {
                setCiudad(e.target.value);
                setPage(1);
              }}
              className="w-full px-2.5 py-1.5 bg-[#f8fafd] border border-[#e0e2eb] rounded-lg text-[#181c22] font-medium focus:outline-none focus:border-[#005cb8]"
            >
              {CIUDADES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>

          {/* Filtro Subcategoría */}
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-mono font-bold text-[#717785] uppercase">Subcategoría</label>
            <select
              value={subcategoria}
              onChange={(e) => {
                setSubcategoria(e.target.value);
                setPage(1);
              }}
              className="w-full px-2.5 py-1.5 bg-[#f8fafd] border border-[#e0e2eb] rounded-lg text-[#181c22] font-medium focus:outline-none focus:border-[#005cb8]"
            >
              <option value="TODAS">Todas las Subcategorías</option>
              {subcategoriasList.map((sc) => (
                <option key={sc} value={sc}>
                  {sc}
                </option>
              ))}
            </select>
          </div>

          {/* Ordenamiento */}
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-mono font-bold text-[#717785] uppercase">Ordenar por</label>
            <select
              value={sortBy}
              onChange={(e) => {
                setSortBy(e.target.value);
                setPage(1);
              }}
              className="w-full px-2.5 py-1.5 bg-[#f8fafd] border border-[#e0e2eb] rounded-lg text-[#181c22] font-medium focus:outline-none focus:border-[#005cb8]"
            >
              {ORDENES.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Grid de Productos */}
      {loading ? (
        <div className="p-16 text-center text-[#717785] bg-white rounded-2xl border border-[#e0e2eb]">
          <span className="material-symbols-outlined text-4xl animate-spin text-[#005cb8]">sync</span>
          <p className="mt-3 text-[14px] font-medium">Consultando catálogo unificado en Neon PostgreSQL...</p>
          <p className="text-[12px] text-gray-400 mt-1">Paginación SQL nativa de alta velocidad</p>
        </div>
      ) : items.length === 0 ? (
        <div className="bg-white p-14 text-center rounded-2xl border border-[#e0e2eb] flex flex-col items-center">
          <span className="material-symbols-outlined text-5xl text-gray-300">search_off</span>
          <p className="text-[17px] font-bold text-[#181c22] mt-3">No se encontraron productos con estos criterios</p>
          <p className="text-[13px] text-[#717785] mt-1 max-w-md">
            Intenta cambiando la categoría o limpiando los filtros de búsqueda para explorar el catálogo completo.
          </p>
          <button
            onClick={resetAllFilters}
            className="mt-4 px-4 py-2 bg-[#005cb8] text-white text-[12px] font-bold rounded-xl hover:bg-[#004b98] transition-colors"
          >
            Restablecer Todos los Filtros
          </button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {items.map((item, idx) => (
              <CanastaCard
                key={`${item.id}-${idx}`}
                item={item}
                onSelect={(selected) => setSelectedProduct(selected)}
              />
            ))}
          </div>

          {/* Barra de Paginación SQL */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-4 p-4 bg-white rounded-2xl border border-[#e0e2eb] shadow-xs">
            <div className="flex items-center gap-3">
              <span className="text-[12px] text-[#414753] font-mono">
                Mostrando <strong className="text-[#181c22]">{(page - 1) * pageSize + 1}</strong> a{' '}
                <strong className="text-[#181c22]">{Math.min(page * pageSize, totalItems)}</strong> de{' '}
                <strong className="text-[#005cb8]">{totalItems.toLocaleString()}</strong> productos
              </span>

              <div className="h-4 w-px bg-gray-200 hidden sm:block" />

              <div className="flex items-center gap-1.5 text-[11px] font-mono text-[#717785]">
                <span>Por pág:</span>
                {[12, 24, 48, 96].map((sz) => (
                  <button
                    key={sz}
                    onClick={() => {
                      setPageSize(sz);
                      setPage(1);
                    }}
                    className={`px-2 py-0.5 rounded text-[11px] font-bold cursor-pointer ${
                      pageSize === sz
                        ? 'bg-[#005cb8] text-white'
                        : 'bg-[#f1f3fc] text-[#414753] hover:bg-[#e4e8f7]'
                    }`}
                  >
                    {sz}
                  </button>
                ))}
              </div>
            </div>

            {totalPages > 1 && (
              <div className="flex items-center gap-2">
                <button
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="px-3 py-1.5 rounded-lg border border-[#e0e2eb] bg-white text-[#181c22] text-[12px] font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50 flex items-center gap-1 transition-colors cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[16px]">chevron_left</span>
                  <span>Anterior</span>
                </button>

                <div className="flex items-center gap-1 px-2 font-mono text-[12px] text-[#414753]">
                  Página <strong className="text-[#005cb8]">{page}</strong> de{' '}
                  <strong className="text-[#181c22]">{totalPages}</strong>
                </div>

                <button
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className="px-3 py-1.5 rounded-lg border border-[#e0e2eb] bg-white text-[#181c22] text-[12px] font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50 flex items-center gap-1 transition-colors cursor-pointer"
                >
                  <span>Siguiente</span>
                  <span className="material-symbols-outlined text-[16px]">chevron_right</span>
                </button>
              </div>
            )}
          </div>
        </>
      )}

      {/* Modal de Detalle Profundo, Sucursales, Sincronización e Histórico */}
      <ProductDetailModal
        isOpen={Boolean(selectedProduct)}
        onClose={() => setSelectedProduct(null)}
        product={selectedProduct}
      />
    </div>
  );
}
