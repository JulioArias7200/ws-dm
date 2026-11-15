'use client';

import { useState } from 'react';
import type { UnifiedProductItem } from '@/lib/canasta-salud';

export interface ComparativaCanastaItem {
  id?: string | number;
  producto: string;
  categoria: string;
  macroCategoria?: string;
  unidad_medida: string;
  departamento: string;
  precio_bs?: number;
  precio_anterior_bs?: number | null;
  descuento_pct?: number | null;
  cadena?: string;
  laboratorio?: string | null;
  imagen?: string;
  rawImagen?: string | null;
  isS3?: boolean;
  enlace?: string | null;
  sector?: 'supermercado' | 'farmacia' | 'oap';
  fecha?: string;
  oap?: { precio_bs: number; fecha: string; fuente?: string };
  hipermaxi?: { precio_bs: number; fecha: string; fuente?: string; enlace?: string | null };
  diferencia_bs?: number;
  diferencia_pct?: number;
  ahorroFuente?: 'OAP' | 'Hipermaxi' | 'Igual';
}

function getStoreBadge(cadena?: string, sector?: string) {
  const c = (cadena || '').toLowerCase();
  if (c.includes('farmacorp')) {
    return {
      name: 'Farmacorp',
      color: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      dot: 'bg-emerald-500',
    };
  }
  if (c.includes('chavez')) {
    return {
      name: 'Farmacias Chávez',
      color: 'bg-indigo-50 text-indigo-700 border-indigo-200',
      dot: 'bg-indigo-500',
    };
  }
  if (c.includes('hipermaxi')) {
    return {
      name: cadena && cadena.includes(' ') ? cadena : 'Hipermaxi',
      color: 'bg-blue-50 text-blue-700 border-blue-200',
      dot: 'bg-blue-600',
    };
  }
  if (c.includes('oap')) {
    return {
      name: 'Mercado Popular OAP',
      color: 'bg-amber-50 text-amber-700 border-amber-200',
      dot: 'bg-amber-500',
    };
  }
  if (sector === 'farmacia') {
    return {
      name: 'Farmacia',
      color: 'bg-purple-50 text-purple-700 border-purple-200',
      dot: 'bg-purple-600',
    };
  }
  return {
    name: cadena || 'Supermercado',
    color: 'bg-stone-50 text-stone-700 border-stone-200',
    dot: 'bg-stone-500',
  };
}

export function CanastaCard({
  item,
  onSelect,
}: {
  item: ComparativaCanastaItem | UnifiedProductItem;
  onSelect?: (item: UnifiedProductItem) => void;
}) {
  const [copied, setCopied] = useState(false);
  const [imgSrc, setImgSrc] = useState(item.imagen || '/images/canasta/alimentos.svg');

  const storeInfo = getStoreBadge(item.cadena, item.sector);
  const currentPrice = item.precio_bs ?? item.hipermaxi?.precio_bs ?? item.oap?.precio_bs ?? 0;
  const previousPrice = item.precio_anterior_bs;
  const discountPct = item.descuento_pct;

  const isS3 = Boolean(
    item.isS3 ||
      (item.imagen &&
        (item.imagen.startsWith('/api/storage/') ||
          item.imagen.startsWith('canasta/') ||
          item.imagen.startsWith('farmacias/')))
  );

  const hasDualComparison = Boolean(item.oap && item.hipermaxi && item.diferencia_pct !== 0);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    const text = `${item.producto} (${item.unidad_medida}) en ${item.departamento} | ${storeInfo.name}: Bs ${currentPrice.toFixed(2)}`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCardClick = () => {
    if (onSelect) {
      onSelect(item as UnifiedProductItem);
    }
  };

  const actionLink = item.enlace || item.hipermaxi?.enlace;

  return (
    <article
      onClick={handleCardClick}
      className="bg-white rounded-3xl p-5 sm:p-6 shadow-xs hover:shadow-lg border border-[#e0e2eb] hover:border-[#005cb8]/40 transition-all flex flex-col justify-between group cursor-pointer"
      data-purpose="product-card"
    >
      <div>
        {/* Frame de Imagen del Producto */}
        <div
          className="relative overflow-hidden rounded-2xl bg-[#f8fafd] aspect-square mb-4 flex items-center justify-center p-4 border border-[#e0e2eb]/50"
          data-purpose="image-frame"
        >
          {/* Badges Superiores (Izquierda) */}
          <div className="absolute top-3 left-3 z-10 flex flex-wrap gap-1.5 max-w-[85%]">
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] uppercase font-bold tracking-wider bg-white/95 backdrop-blur-md text-stone-800 shadow-xs border border-stone-200">
              {item.departamento}
            </span>

            {discountPct && discountPct > 0 ? (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] uppercase font-bold tracking-wider bg-rose-600 text-white shadow-xs">
                -{discountPct}% OFF
              </span>
            ) : null}

            {hasDualComparison && (
              <span
                className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] uppercase font-bold tracking-wider shadow-xs text-white ${
                  item.ahorroFuente === 'OAP' ? 'bg-emerald-700' : 'bg-blue-700'
                }`}
              >
                {item.ahorroFuente === 'OAP'
                  ? `Ahorro OAP -${Math.abs(item.diferencia_pct || 0)}%`
                  : `Ahorro Hipermaxi -${Math.abs(item.diferencia_pct || 0)}%`}
              </span>
            )}
          </div>

          {/* Badge de Tienda/Cadena Flotante (Derecha) */}
          <div className="absolute top-3 right-3 z-10">
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold border shadow-xs ${storeInfo.color}`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${storeInfo.dot}`}></span>
              <span>{storeInfo.name}</span>
            </span>
          </div>

          {/* Badge de Verificación / Imagen Oficial */}
          <div className="absolute bottom-2.5 left-2.5 z-10">
            {isS3 ? (
              <span
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold tracking-wider bg-emerald-50/95 backdrop-blur-md text-emerald-800 border border-emerald-300 shadow-xs"
                title="Fotografía oficial optimizada"
              >
                <span>✓</span>
                <span>Catálogo Verificado</span>
              </span>
            ) : (
              <span
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold tracking-wider bg-amber-50/95 backdrop-blur-md text-amber-900 border border-amber-300 shadow-xs"
                title="Imagen referencial de la tienda comercial"
              >
                <span>📸</span>
                <span>Foto de Tienda</span>
              </span>
            )}
          </div>

          {/* Imagen del Producto */}
          <img
            src={imgSrc}
            alt={item.producto}
            className="w-full h-full object-contain transform transition-transform duration-500 ease-out group-hover:scale-105"
            loading="lazy"
            onError={() => {
              if (imgSrc !== '/images/canasta/alimentos.svg') {
                setImgSrc('/images/canasta/alimentos.svg');
              }
            }}
          />
        </div>

        {/* Categoría y Título */}
        <header className="mb-2">
          <div className="flex items-center justify-between gap-2 mb-1">
            <span className="text-[10px] font-mono font-bold tracking-wider uppercase text-[#717785] truncate">
              {item.macroCategoria ? `${item.macroCategoria.toUpperCase()} // ` : ''}
              {item.categoria || 'Canasta Básica'}
            </span>
            {item.laboratorio && (
              <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded bg-purple-50 text-purple-700 border border-purple-200 shrink-0">
                Lab: {item.laboratorio}
              </span>
            )}
          </div>
          <h2 className="text-[16px] font-bold tracking-tight text-[#181c22] group-hover:text-[#005cb8] transition-colors line-clamp-2 leading-snug" title={item.producto}>
            {item.producto}
          </h2>
        </header>

        {/* Píldora de Especificaciones */}
        <div className="mb-4 py-1.5 px-3 bg-[#f8fafd] rounded-xl border border-[#e0e2eb] flex items-center justify-between text-[11px] text-[#414753]">
          <span className="font-medium text-[#181c22] truncate">Presentación: {item.unidad_medida}</span>
          <span className="text-gray-300">•</span>
          <span className="shrink-0 text-[10px] font-mono text-[#717785]">
            {item.fecha || 'Actualizado'}
          </span>
        </div>

        {/* Desglose de Precios */}
        {hasDualComparison ? (
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-[#e0e2eb] gap-2">
            <div>
              <span className="text-[10px] uppercase tracking-wider text-stone-500 font-medium block">
                Mercado OAP
              </span>
              <div className="text-[15px] font-bold text-stone-900 mt-0.5">
                Bs {item.oap?.precio_bs.toFixed(2)}
              </div>
            </div>
            <div className="h-6 w-px bg-stone-200" />
            <div className="text-right">
              <span className="text-[10px] uppercase tracking-wider text-stone-500 font-medium block">
                Hipermaxi
              </span>
              <div className="text-[15px] font-bold text-[#005cb8] mt-0.5">
                Bs {item.hipermaxi?.precio_bs.toFixed(2)}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex items-baseline justify-between mb-4 pb-3 border-b border-[#e0e2eb]">
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-black font-mono text-[#181c22]">
                Bs {currentPrice.toFixed(2)}
              </span>
              {previousPrice != null && previousPrice > currentPrice && (
                <span className="text-sm font-mono text-stone-400 line-through">
                  Bs {previousPrice.toFixed(2)}
                </span>
              )}
            </div>
            <span className="text-[10px] font-mono uppercase text-[#717785]">Precio Vigente</span>
          </div>
        )}
      </div>

      {/* Botones de Acción */}
      <div className="flex items-center gap-2 pt-1" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={handleCardClick}
          className="flex-1 bg-[#005cb8] hover:bg-[#004b98] text-white text-[12px] font-bold py-2.5 px-3 rounded-xl transition-all shadow-xs hover:shadow flex items-center justify-center gap-1.5 cursor-pointer"
          type="button"
        >
          <span>Ver Ficha y Sucursales</span>
          <span className="text-xs">↗</span>
        </button>

        {actionLink && (
          <a
            href={actionLink}
            target="_blank"
            rel="noopener noreferrer"
            title={`Abrir página en ${storeInfo.name}`}
            className="w-10 h-10 flex-shrink-0 rounded-xl border border-[#e0e2eb] hover:border-[#005cb8] flex items-center justify-center text-[#414753] hover:text-[#005cb8] transition-colors bg-white cursor-pointer"
          >
            <span className="material-symbols-outlined text-[18px]">open_in_new</span>
          </a>
        )}

        <button
          onClick={handleCopy}
          aria-label="Copiar datos del producto"
          title={copied ? '¡Copiado!' : 'Copiar cotización'}
          className="w-10 h-10 flex-shrink-0 rounded-xl border border-[#e0e2eb] hover:border-[#005cb8] flex items-center justify-center text-[#414753] hover:text-[#005cb8] transition-colors bg-white cursor-pointer"
          type="button"
        >
          <span className="material-symbols-outlined text-[18px]">
            {copied ? 'check' : 'share'}
          </span>
        </button>
      </div>
    </article>
  );
}
