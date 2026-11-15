'use client';

import { useState } from 'react';
import type { MedicamentoItem } from '@/lib/canasta-salud';

function getMedImageUrl(rawImage?: string | null): string {
  if (!rawImage) return '/images/salud/medication.svg';
  if (rawImage.startsWith('http') || rawImage.startsWith('/api/')) return rawImage;
  return `/api/storage/${rawImage.replace(/^\/+/, '')}`;
}

export function MedicamentoCard({ med }: { med: MedicamentoItem }) {
  const [copied, setCopied] = useState(false);
  const [imgSrc, setImgSrc] = useState(getMedImageUrl(med.imagen));
  const isFarmacorp = med.cadena.toLowerCase().includes('farmacorp');
  const isHipermaxi = med.cadena.toLowerCase().includes('hipermaxi');
  const dotColor = isFarmacorp ? 'bg-emerald-500' : isHipermaxi ? 'bg-rose-500' : 'bg-blue-500';
  const cadenaLabel = isFarmacorp ? 'Farmacorp' : isHipermaxi ? 'Hipermaxi Farmacia' : 'Farmacias Chávez';

  const discount =
    med.descuento_pct && med.descuento_pct > 0
      ? Math.round(med.descuento_pct)
      : med.precio_anterior_bs && med.precio_anterior_bs > med.precio_bs
      ? Math.round(((med.precio_anterior_bs - med.precio_bs) / med.precio_anterior_bs) * 100)
      : null;

  const handleCopy = () => {
    const text = `${med.producto} (${med.cadena}) - Bs ${med.precio_bs.toFixed(2)}${
      med.laboratorio ? ` [Lab: ${med.laboratorio}]` : ''
    } - ${med.departamento}`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <article
      className="bg-white rounded-3xl p-6 shadow-luxury hover:shadow-subtle-hover border border-stone-200/60 transition-smooth flex flex-col justify-between group"
      data-purpose="product-card"
    >
      <div>
        {/* Frame de Imagen del Medicamento */}
        <div
          className="relative overflow-hidden rounded-2xl bg-[#EDEAE3] aspect-square mb-5 flex items-center justify-center p-6"
          data-purpose="image-frame"
        >
          {/* Badges Overlay */}
          <div className="absolute top-3.5 left-3.5 z-10 flex flex-wrap gap-1.5 max-w-[90%]">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] uppercase font-semibold tracking-wider bg-white/95 backdrop-blur-md text-stone-800 shadow-sm border border-stone-100">
              <span
                className={`w-2 h-2 rounded-full ${dotColor}`}
              />
              {cadenaLabel}
            </span>

            {discount && (
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] uppercase font-semibold tracking-wider bg-[#1A1918] text-white shadow-sm">
                {discount}% OFF
              </span>
            )}
          </div>

          {/* Imagen */}
          <img
            src={imgSrc}
            alt={med.producto}
            className="w-full h-full object-contain transform transition-smooth duration-700 ease-out group-hover:scale-105"
            loading="lazy"
            onError={() => {
              if (imgSrc !== '/images/salud/medication.svg') {
                setImgSrc('/images/salud/medication.svg');
              }
            }}
          />
          <div className="absolute inset-0 bg-gradient-to-tr from-black/5 via-transparent to-white/10 pointer-events-none" />
        </div>

        {/* Laboratorio y Título */}
        <header className="mb-2">
          <p className="text-[10px] font-semibold tracking-[0.2em] uppercase text-stone-400 mb-1">
            {med.laboratorio ? `LAB. ${med.laboratorio}` : 'FARMACÉUTICA'}
          </p>
          <h2 className="text-xl font-light tracking-tight text-[#1A1918] line-clamp-2" title={med.producto}>
            {med.producto}
          </h2>
        </header>

        {/* Píldora de Especificaciones (Quick Specs Pill) */}
        <div className="mb-4 py-2 px-3 bg-stone-50 rounded-xl border border-stone-100 flex items-center justify-between text-[11px] text-stone-600">
          <span className="font-medium text-stone-800 truncate max-w-[65%]">
            {med.presentacion || 'Formato Estándar'}
          </span>
          <span className="text-stone-300">•</span>
          <span className="shrink-0">{med.departamento}</span>
        </div>

        {/* Precio y Moneda */}
        <div className="flex items-center justify-between mb-5 pb-5 border-b border-stone-100">
          <div>
            <span className="text-[10px] uppercase tracking-wider text-stone-400 font-medium block">
              Precio Vigente
            </span>
            {med.precio_anterior_bs && med.precio_anterior_bs > med.precio_bs && (
              <span className="text-xs text-stone-400 line-through block mt-0.5">
                Bs {med.precio_anterior_bs.toFixed(2)}
              </span>
            )}
          </div>

          <div className="text-right">
            <span className="text-2xl font-normal text-stone-900">
              Bs {med.precio_bs.toFixed(2)}
            </span>
            <span className="text-[10px] uppercase tracking-wider text-stone-400 font-medium ml-1">
              BOB
            </span>
          </div>
        </div>
      </div>

      {/* Acciones */}
      <div className="flex items-center gap-2.5">
        {med.enlace ? (
          <a
            href={med.enlace}
            target="_blank"
            rel="noreferrer"
            className="flex-1 bg-[#1A1918] hover:bg-black text-white text-[11px] uppercase tracking-widest font-semibold py-3 px-4 rounded-full transition-smooth hover:shadow-md active:scale-[0.99] flex items-center justify-center gap-2 group/btn"
          >
            <span>Comprar en Línea</span>
            <svg
              className="w-3.5 h-3.5 transform transition-transform group-hover/btn:translate-x-1"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              viewBox="0 0 24 24"
            >
              <path d="M17.25 8.25L21 12m0 0l-3.75 3.75M21 12H3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </a>
        ) : (
          <div className="flex-1 bg-stone-100 text-stone-500 text-[11px] uppercase tracking-widest font-semibold py-3 px-4 rounded-full text-center">
            En Tienda Física
          </div>
        )}

        <button
          onClick={handleCopy}
          aria-label="Copiar ficha técnica"
          title={copied ? '¡Copiado!' : 'Copiar información'}
          className="w-10 h-10 flex-shrink-0 rounded-full border border-stone-200 hover:border-stone-400 flex items-center justify-center text-stone-600 hover:text-stone-900 transition-smooth hover:bg-stone-50 active:scale-95 cursor-pointer"
          type="button"
        >
          {copied ? (
            <svg className="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M4.5 12.75l6 6 9-13.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          ) : (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
              <path
                d="M7.217 10.907a2.25 2.25 0 100 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186l9.566-5.314m-9.566 7.5l9.566 5.314m0 0a2.25 2.25 0 103.935 2.186 2.25 2.25 0 00-3.935-2.186zm0-12.814a2.25 2.25 0 103.933-2.185 2.25 2.25 0 00-3.933 2.185z"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          )}
        </button>
      </div>
    </article>
  );
}

