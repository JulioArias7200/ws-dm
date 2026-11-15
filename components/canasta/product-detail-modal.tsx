'use client';

import { useEffect, useState } from 'react';
import type { UnifiedProductItem } from '@/lib/canasta-salud';
import type { ProductDetailResult } from '@/lib/canasta-salud';

interface ProductDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  product: UnifiedProductItem | null;
}

export function ProductDetailModal({ isOpen, onClose, product }: ProductDetailModalProps) {
  const [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState<ProductDetailResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'resumen' | 'sucursales' | 'historico' | 'comparativa'>('resumen');

  // Cerrar con tecla ESC
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose]);

  // Cargar detalles desde la API al abrir
  useEffect(() => {
    if (!isOpen || !product) {
      setDetail(null);
      setError(null);
      return;
    }

    let isMounted = true;
    setLoading(true);
    setError(null);

    const fetchDetail = async () => {
      try {
        const queryParams = new URLSearchParams({
          id: String(product.id),
          producto: product.producto,
          cadena: product.cadena,
        });

        const res = await fetch(`/api/canasta/detalle?${queryParams.toString()}`);
        if (!res.ok) {
          throw new Error(`Error ${res.status}: No se pudo cargar el detalle del producto`);
        }
        const data = await res.json();
        if (isMounted) {
          if (data.success && data.detail) {
            setDetail(data.detail);
          } else {
            setError(data.error || 'No se encontraron datos complementarios.');
          }
        }
      } catch (err: unknown) {
        if (isMounted) {
          const msg = err instanceof Error ? err.message : 'Error al conectar con la base de datos';
          setError(msg);
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchDetail();

    return () => {
      isMounted = false;
    };
  }, [isOpen, product]);

  if (!isOpen || !product) return null;

  const isS3 = detail ? detail.isS3 : Boolean(product.isS3);
  const storeLink = detail?.enlace || product.enlace;
  const currentPrice = product.precio_bs ?? 0;
  const prevPrice = product.precio_anterior_bs;
  const discount = product.descuento_pct;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-950/70 backdrop-blur-md animate-in fade-in duration-200"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="relative w-full max-w-4xl max-h-[92vh] bg-white rounded-3xl shadow-2xl border border-stone-200 overflow-hidden flex flex-col animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cabecera del Modal */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-stone-100 bg-[#f8fafd]">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider bg-blue-100 text-[#005cb8] border border-blue-200">
              {product.cadena}
            </span>
            <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-stone-100 text-stone-700 border border-stone-200">
              📍 {product.departamento}
            </span>
            {/* Badge de Imagen */}
            {isS3 ? (
              <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center gap-1">
                <span>✓</span>
                <span>Catálogo Verificado</span>
              </span>
            ) : (
              <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-100 text-amber-900 border border-amber-300 flex items-center gap-1">
                <span>📸</span>
                <span>Imagen de Tienda</span>
              </span>
            )}
          </div>

          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-white hover:bg-stone-100 border border-stone-200 flex items-center justify-center text-stone-500 hover:text-stone-900 transition-colors cursor-pointer"
            aria-label="Cerrar modal"
          >
            ✕
          </button>
        </div>

        {/* Contenido Scrolleable */}
        <div className="overflow-y-auto p-6 space-y-6 flex-1">
          {/* Bloque Superior: Imagen + Datos Clave */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
            {/* Columna Izquierda: Imagen del Producto */}
            <div className="md:col-span-5 bg-[#f8fafd] rounded-2xl border border-stone-200 p-4 flex flex-col items-center justify-center">
              <div className="relative w-full aspect-square flex items-center justify-center overflow-hidden rounded-xl bg-white p-2">
                <img
                  src={product.imagen || '/images/canasta/alimentos.svg'}
                  alt={product.producto}
                  className="w-full h-full object-contain"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = '/images/canasta/alimentos.svg';
                  }}
                />
              </div>

              {/* Detalle de Registro */}
              <div className="w-full mt-3 p-2.5 bg-white rounded-xl border border-stone-200 text-[11px] text-stone-600 space-y-1">
                <div className="flex justify-between">
                  <span className="font-semibold text-stone-500">Fotografía:</span>
                  <span className="text-stone-800 font-medium">
                    {isS3 ? 'Catálogo Digital Optimizado' : 'Servidor de Tienda'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="font-semibold text-stone-500">Último cotejo:</span>
                  <span className="font-mono text-stone-800">{product.fecha || 'Reciente'}</span>
                </div>
              </div>
            </div>

            {/* Columna Derecha: Información Principal & Precios */}
            <div className="md:col-span-7 flex flex-col justify-between space-y-4">
              <div>
                <div className="text-[11px] font-mono uppercase tracking-wider text-stone-500 font-bold mb-1">
                  {product.macroCategoria?.toUpperCase()} // {product.categoria || 'Catálogo General'}
                </div>
                <h2 className="text-xl sm:text-2xl font-black text-stone-900 leading-snug">
                  {product.producto}
                </h2>
                {product.laboratorio && (
                  <p className="text-xs font-semibold text-purple-700 mt-1">
                    Laboratorio / Fabricante: <span className="text-stone-800">{product.laboratorio}</span>
                  </p>
                )}
              </div>

              {/* Caja de Precio Destacado */}
              <div className="bg-[#f0fdf4] border border-emerald-200 rounded-2xl p-4 flex items-baseline justify-between">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800 block">
                    Precio Vigente de Venta
                  </span>
                  <div className="flex items-baseline gap-2 mt-1">
                    <span className="text-3xl sm:text-4xl font-black font-mono text-emerald-700">
                      Bs {currentPrice.toFixed(2)}
                    </span>
                    {prevPrice != null && prevPrice > currentPrice && (
                      <span className="text-base font-mono text-stone-400 line-through">
                        Bs {prevPrice.toFixed(2)}
                      </span>
                    )}
                  </div>
                </div>

                {discount && discount > 0 ? (
                  <span className="px-3 py-1 rounded-full text-xs font-black bg-rose-600 text-white shadow-xs">
                    -{discount}% DESCUENTO
                  </span>
                ) : (
                  <span className="text-xs font-mono font-medium text-emerald-800 bg-emerald-100 px-2.5 py-1 rounded-lg">
                    Por: {product.unidad_medida}
                  </span>
                )}
              </div>

              {/* Botón de Enlace a la Tienda Oficial */}
              <div className="space-y-2">
                {storeLink ? (
                  <a
                    href={storeLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full bg-[#005cb8] hover:bg-[#004b98] text-white font-bold py-3 px-4 rounded-xl transition-all shadow-sm hover:shadow flex items-center justify-center gap-2 text-sm group"
                  >
                    <span>Ver Producto en Tienda Oficial ({product.cadena})</span>
                    <span className="material-symbols-outlined text-base transform transition-transform group-hover:translate-x-1">
                      open_in_new
                    </span>
                  </a>
                ) : (
                  <div className="p-3 bg-stone-100 border border-stone-200 text-stone-600 rounded-xl text-center text-xs font-medium">
                    Enlace web directo no publicado por la entidad emisora
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Navegación por Pestañas de Análisis */}
          <div className="border-b border-stone-200 flex gap-2">
            <button
              onClick={() => setActiveTab('resumen')}
              className={`pb-2.5 px-3 text-xs font-bold border-b-2 transition-colors cursor-pointer ${
                activeTab === 'resumen'
                  ? 'border-[#005cb8] text-[#005cb8]'
                  : 'border-transparent text-stone-500 hover:text-stone-900'
              }`}
            >
              📊 Resumen y Ficha
            </button>
            <button
              onClick={() => setActiveTab('sucursales')}
              className={`pb-2.5 px-3 text-xs font-bold border-b-2 transition-colors cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'sucursales'
                  ? 'border-[#005cb8] text-[#005cb8]'
                  : 'border-transparent text-stone-500 hover:text-stone-900'
              }`}
            >
              <span>🏢 Sucursales</span>
              {detail?.sucursales && (
                <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-stone-200 text-stone-800 font-mono">
                  {detail.sucursales.length}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('historico')}
              className={`pb-2.5 px-3 text-xs font-bold border-b-2 transition-colors cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'historico'
                  ? 'border-[#005cb8] text-[#005cb8]'
                  : 'border-transparent text-stone-500 hover:text-stone-900'
              }`}
            >
              <span>📈 Histórico de Precios</span>
              {detail?.historicoPrecios && (
                <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-stone-200 text-stone-800 font-mono">
                  {detail.historicoPrecios.length}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('comparativa')}
              className={`pb-2.5 px-3 text-xs font-bold border-b-2 transition-colors cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'comparativa'
                  ? 'border-[#005cb8] text-[#005cb8]'
                  : 'border-transparent text-stone-500 hover:text-stone-900'
              }`}
            >
              <span>⚖️ Comparativa de Precios</span>
              {detail?.comparativas && (
                <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-stone-200 text-stone-800 font-mono">
                  {detail.comparativas.length}
                </span>
              )}
            </button>
          </div>

          {/* Contenido de Pestañas */}
          {loading ? (
            <div className="py-12 flex flex-col items-center justify-center text-stone-500 space-y-2">
              <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin" />
              <p className="text-xs font-medium">Consultando registros históricos en Neon PostgreSQL...</p>
            </div>
          ) : error ? (
            <div className="p-4 bg-amber-50 border border-amber-200 text-amber-800 rounded-2xl text-xs">
              ⚠️ {error}
            </div>
          ) : (
            <>
              {/* Pestaña: Resumen */}
              {activeTab === 'resumen' && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="p-4 bg-stone-50 rounded-2xl border border-stone-200">
                    <span className="text-[10px] font-bold uppercase text-stone-500 block mb-1">
                      Sucursales Detectadas
                    </span>
                    <span className="text-xl font-bold font-mono text-stone-900">
                      {detail?.sucursales?.length || 1} sucursales
                    </span>
                    <p className="text-[11px] text-stone-500 mt-1">
                      Presente en La Paz, Santa Cruz o Cochabamba.
                    </p>
                  </div>

                  <div className="p-4 bg-stone-50 rounded-2xl border border-stone-200">
                    <span className="text-[10px] font-bold uppercase text-stone-500 block mb-1">
                      Puntos Históricos
                    </span>
                    <span className="text-xl font-bold font-mono text-stone-900">
                      {detail?.historicoPrecios?.length || 1} registros
                    </span>
                    <p className="text-[11px] text-stone-500 mt-1">
                      Monitoreo de variación y estabilidad de precios.
                    </p>
                  </div>

                  <div className="p-4 bg-stone-50 rounded-2xl border border-stone-200">
                    <span className="text-[10px] font-bold uppercase text-stone-500 block mb-1">
                      Competencia / Alternativas
                    </span>
                    <span className="text-xl font-bold font-mono text-stone-900">
                      {detail?.comparativas?.length || 0} cotejos
                    </span>
                    <p className="text-[11px] text-stone-500 mt-1">
                      Cotejos automáticos en OAP y farmacias.
                    </p>
                  </div>
                </div>
              )}

              {/* Pestaña: Sucursales Disponibles */}
              {activeTab === 'sucursales' && (
                <div className="space-y-3">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-stone-600">
                    Disponibilidad y Precio por Sucursal / Departamento
                  </h3>
                  {detail?.sucursales && detail.sucursales.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {detail.sucursales.map((suc, i) => (
                        <div
                          key={i}
                          className="p-3.5 bg-white rounded-2xl border border-stone-200 hover:border-blue-300 transition-colors flex flex-col justify-between"
                        >
                          <div>
                            <div className="flex items-center justify-between text-[11px] mb-1">
                              <span className="font-bold text-stone-800">{suc.departamento}</span>
                              <span className="font-mono text-stone-400">{suc.fecha}</span>
                            </div>
                            <p className="text-xs font-semibold text-stone-700 line-clamp-1">{suc.cadena}</p>
                          </div>
                          <div className="mt-3 flex items-baseline justify-between pt-2 border-t border-stone-100">
                            <span className="text-sm font-black font-mono text-emerald-700">
                              Bs {suc.precio_bs.toFixed(2)}
                            </span>
                            {suc.enlace && (
                              <a
                                href={suc.enlace}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[10px] font-bold text-blue-600 hover:underline flex items-center gap-0.5"
                              >
                                Ver sucursal ↗
                              </a>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-stone-500 italic">
                      Producto registrado en sucursal única: {product.cadena} ({product.departamento}).
                    </p>
                  )}
                </div>
              )}

              {/* Pestaña: Histórico de Precios */}
              {activeTab === 'historico' && (
                <div className="space-y-3">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-stone-600">
                    Evolución Temporal de Precios en Neon PostgreSQL
                  </h3>
                  {detail?.historicoPrecios && detail.historicoPrecios.length > 0 ? (
                    <div className="overflow-x-auto rounded-2xl border border-stone-200">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-[#f8fafd] border-b border-stone-200 text-stone-600 font-bold uppercase text-[10px]">
                          <tr>
                            <th className="py-2.5 px-4">Fecha</th>
                            <th className="py-2.5 px-4">Fuente / Cadena</th>
                            <th className="py-2.5 px-4 text-right">Precio</th>
                            <th className="py-2.5 px-4 text-right">Variación (Δ)</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-stone-100">
                          {detail.historicoPrecios.map((h, idx) => (
                            <tr key={idx} className="hover:bg-stone-50">
                              <td className="py-2.5 px-4 font-mono font-medium text-stone-800">{h.fecha}</td>
                              <td className="py-2.5 px-4 text-stone-600">{h.fuente || product.cadena}</td>
                              <td className="py-2.5 px-4 font-mono font-bold text-stone-900 text-right">
                                Bs {h.precio_bs.toFixed(2)}
                              </td>
                              <td className="py-2.5 px-4 font-mono font-semibold text-right">
                                {h.delta_bs > 0 ? (
                                  <span className="text-rose-600">+Bs {h.delta_bs.toFixed(2)} (+{h.delta_pct}%)</span>
                                ) : h.delta_bs < 0 ? (
                                  <span className="text-emerald-600">-Bs {Math.abs(h.delta_bs).toFixed(2)} ({h.delta_pct}%)</span>
                                ) : (
                                  <span className="text-stone-400">Estable (0%)</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="text-xs text-stone-500 italic">
                      Precio de alta reciente registrado el {product.fecha}.
                    </p>
                  )}
                </div>
              )}

              {/* Pestaña: Comparativa de Precios con Competidores */}
              {activeTab === 'comparativa' && (
                <div className="space-y-3">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-stone-600">
                    Cotejo de Precios con Otras Tiendas y Farmacias
                  </h3>
                  {detail?.comparativas && detail.comparativas.length > 0 ? (
                    <div className="space-y-2.5">
                      {detail.comparativas.map((comp, idx) => (
                        <div
                          key={idx}
                          className="p-3.5 bg-white rounded-2xl border border-stone-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3"
                        >
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-stone-100 text-stone-700">
                                {comp.tienda}
                              </span>
                              <span className="text-xs text-stone-400">• {comp.departamento}</span>
                            </div>
                            <p className="text-xs font-bold text-stone-800 mt-1 line-clamp-1">{comp.producto}</p>
                          </div>

                          <div className="flex items-center gap-4 shrink-0">
                            <div className="text-right">
                              <div className="text-sm font-mono font-bold text-stone-900">
                                Bs {comp.precio_bs.toFixed(2)}
                              </div>
                              <div className="text-[10px] font-mono font-semibold">
                                {comp.tipo === 'ahorro' ? (
                                  <span className="text-emerald-600">
                                    Ahorro de Bs {Math.abs(comp.diferencia_bs).toFixed(2)} ({comp.diferencia_pct}%)
                                  </span>
                                ) : comp.tipo === 'mas_caro' ? (
                                  <span className="text-rose-600">
                                    +Bs {comp.diferencia_bs.toFixed(2)} más caro ({comp.diferencia_pct}%)
                                  </span>
                                ) : (
                                  <span className="text-stone-400">Mismo precio</span>
                                )}
                              </div>
                            </div>

                            {comp.enlace && (
                              <a
                                href={comp.enlace}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="px-3 py-1.5 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-700 text-xs font-bold transition-colors"
                              >
                                Ver ↗
                              </a>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-4 bg-stone-50 rounded-2xl border border-stone-200 text-xs text-stone-500">
                      No se detectaron productos competidores idénticos en otras tiendas para este ítem específico.
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

