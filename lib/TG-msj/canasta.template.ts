import { escHtml, formatPriceBs } from './formatters';
import { BACK_TO_HOME_ROW, BACK_TO_CANASTA_ROW } from './buttons';
import { TemplateResult, ReplyMarkup, InlineKeyboardButton } from './types';
import type { CanastaItem } from '../canasta-salud';

export interface CanastaComparisonItem {
  producto: string;
  unidad: string;
  fecha: string;
  laPaz?: number;
  cbba?: number;
  scz?: number;
}

/**
 * Plantillas visuales para el Módulo Canasta Familiar y Catálogo Multi-Tienda (OAP e Hipermaxi)
 */

export function renderCanastaMenu(city = 'La Paz', fuente = 'Todas'): TemplateResult {
  const text =
    `🛒 <b>Catálogo Comercial & Canasta Familiar — Eje Central Bolivia 🇧🇴</b>\n\n` +
    `<blockquote><b>Fuentes y Comercios Monitoreados:</b>\n` +
    `1. 🏪 <b>Observatorio Agroambiental (OAP):</b> Mercados populares.\n` +
    `2. 🛒 <b>Hipermaxi S.A.:</b> Todas las sucursales (La Paz, Cochabamba, Santa Cruz).\n\n` +
    `📍 <b>Ciudad:</b> <b>${escHtml(city)}</b> | 🏬 <b>Fuente:</b> <b>${escHtml(fuente)}</b></blockquote>\n\n` +
    `⬇️ <b>Selecciona una categoría o herramienta:</b>`;

  const replyMarkup: ReplyMarkup = {
    inline_keyboard: [
      [{ text: '📈 Comparar Eje Troncal (LPZ vs CBB vs SCZ)', callback_data: 'canasta_comparar' }],
      [
        { text: '🧺 Canasta & Alimentos', callback_data: 'canasta_macro:canasta' },
        { text: '🧼 Limpieza & Hogar', callback_data: 'canasta_macro:limpieza' },
      ],
      [
        { text: '🍷 Licores & Bebidas', callback_data: 'canasta_macro:licores' },
        { text: '🧴 Cuidado Personal', callback_data: 'canasta_macro:personal' },
      ],
      [
        { text: '🥔 Verduras', callback_data: 'canasta_cat_verduras' },
        { text: '🍗 Carnes', callback_data: 'canasta_cat_carnes' },
      ],
      [
        { text: `🏬 Fuente [${fuente} ▾]`, callback_data: 'canasta_menu_fuente' },
        { text: `🌆 Ciudad [${city} ▾]`, callback_data: 'canasta_menu_city' },
      ],
      [
        { text: '🔎 Buscar Producto (/canasta)', callback_data: 'canasta_buscar_hint' },
        { text: '🔄 Actualizar OAP', callback_data: 'canasta_sync' },
      ],
      BACK_TO_HOME_ROW,
    ],
  };

  return { text, replyMarkup };
}

export function renderCanastaCityMenu(): TemplateResult {
  const text =
    `🏙️ <b>Selecciona la Ciudad para Canasta Familiar:</b>\n\n` +
    `Monitorea y compara precios en las capitales y mercados del país:`;

  const replyMarkup: ReplyMarkup = {
    inline_keyboard: [
      [
        { text: '🔵 La Paz', callback_data: 'canasta_city:La Paz' },
        { text: '🟢 Santa Cruz', callback_data: 'canasta_city:Santa Cruz' },
      ],
      [
        { text: '🔴 Cochabamba', callback_data: 'canasta_city:Cochabamba' },
        { text: '⚪ El Alto', callback_data: 'canasta_city:El Alto' },
      ],
      [
        { text: '🇧🇴 Todas las Plazas (Eje)', callback_data: 'canasta_city:ALL' },
        { text: '📈 Comparar Eje Troncal', callback_data: 'canasta_comparar' },
      ],
      BACK_TO_CANASTA_ROW,
    ],
  };

  return { text, replyMarkup };
}

export function renderCanastaFuenteMenu(): TemplateResult {
  const text =
    `🏬 <b>Selecciona la Fuente de Precios:</b>\n\n` +
    `Alterna entre mercados populares y cadenas de supermercados:`;

  const replyMarkup: ReplyMarkup = {
    inline_keyboard: [
      [{ text: '🏬 Todas (OAP Mercados + Hipermaxi)', callback_data: 'canasta_fuente:all' }],
      [
        { text: '🏪 Solo OAP (Mercados)', callback_data: 'canasta_fuente:oap' },
        { text: '🛒 Solo Hipermaxi (Super)', callback_data: 'canasta_fuente:hipermaxi' },
      ],
      BACK_TO_CANASTA_ROW,
    ],
  };

  return { text, replyMarkup };
}

export function renderCanastaItems(
  items: CanastaItem[],
  options: {
    title: string;
    searchTerm?: string;
    cityLabel?: string;
    fuenteLabel?: string;
  }
): TemplateResult {
  if (items.length === 0) {
    return {
      text:
        `🔎 No se encontraron precios para <i>"${escHtml(options.searchTerm || '')}"</i> en ninguna tienda o sucursal.\n` +
        `Prueba con <code>/canasta leche</code>, <code>/canasta arroz</code> o <code>/canasta paneton</code>.`,
      replyMarkup: { inline_keyboard: [BACK_TO_CANASTA_ROW] },
    };
  }

  const detailButtons: InlineKeyboardButton[] = [];
  let list = '';

  // Si es una búsqueda específica, mostrar el desglose omnicanal de todas las sucursales y fuentes
  if (options.searchTerm) {
    list = items
      .slice(0, 10)
      .map((p, idx) => {
        const isHiper = p.fuente && p.fuente.toLowerCase().includes('hipermaxi');
        const icon = isHiper ? '🛒' : p.fuente && p.fuente.toLowerCase().includes('oap') ? '🏪' : '🏬';
        const depto = p.departamento ? ` [${escHtml(p.departamento)}]` : '';
        const src = p.fuente ? ` <i>(${escHtml(p.fuente)})</i>` : '';
        const link = p.enlace ? ` — <a href="${escHtml(p.enlace)}">🔗 Ver</a>` : '';

        if (p.id && detailButtons.length < 4) {
          detailButtons.push({
            text: `🔍 #${idx + 1} Ficha: ${formatPriceBs(p.precio_bs)}`,
            callback_data: `prod_${p.id}`,
          });
        }

        return `• ${icon} <b>${escHtml(p.producto)}</b>${depto}${src}\n  💵 <b>${formatPriceBs(p.precio_bs)}</b> / ${escHtml(p.unidad_medida)}${link}`;
      })
      .join('\n\n');
  } else {
    // Agrupación dual por producto base para contrastar OAP vs Hipermaxi en vistas de categoría
    const productMap = new Map<string, { oap?: CanastaItem; hipermaxi?: CanastaItem }>();
    for (const item of items) {
      const norm = item.producto.trim().toLowerCase();
      if (!productMap.has(norm)) {
        productMap.set(norm, {});
      }
      const entry = productMap.get(norm)!;
      const isHipermaxi = item.fuente && item.fuente.toLowerCase().includes('hipermaxi');
      if (isHipermaxi) {
        if (!entry.hipermaxi) entry.hipermaxi = item;
      } else {
        if (!entry.oap) entry.oap = item;
      }
    }

    for (const [, pair] of productMap.entries()) {
      const mainItem = pair.oap || pair.hipermaxi;
      if (!mainItem) continue;

      const depto = mainItem.departamento ? ` (${escHtml(mainItem.departamento)})` : '';
      list += `• <b>${escHtml(mainItem.producto)}</b>${depto}\n`;
      if (pair.oap) {
        list += `  🏪 <b>OAP Mercados:</b> ${formatPriceBs(pair.oap.precio_bs)} / ${escHtml(pair.oap.unidad_medida)}\n`;
      }
      if (pair.hipermaxi) {
        const suc = pair.hipermaxi.fuente ? ` [${escHtml(pair.hipermaxi.fuente)}]` : '';
        list += `  🛒 <b>Hipermaxi:</b>    ${formatPriceBs(pair.hipermaxi.precio_bs)} / ${escHtml(pair.hipermaxi.unidad_medida)}${suc}\n`;
      }
      if (pair.oap && pair.hipermaxi) {
        const diff = pair.hipermaxi.precio_bs - pair.oap.precio_bs;
        const pct = ((diff / pair.oap.precio_bs) * 100).toFixed(1);
        const sign = diff >= 0 ? '+' : '';
        list += `  📊 <i>Brecha: ${sign}${formatPriceBs(diff)} (${sign}${pct}% en supermercado)</i>\n`;
      }
      list += '\n';

      if (mainItem.id && detailButtons.length < 4) {
        detailButtons.push({
          text: `🔍 ${mainItem.producto.slice(0, 12)}...`,
          callback_data: `prod_${mainItem.id}`,
        });
      }
    }
  }

  if (!list.trim()) {
    list = items
      .slice(0, 10)
      .map((p) => {
        const isHiper = p.fuente && p.fuente.toLowerCase().includes('hipermaxi');
        const icon = isHiper ? '🛒' : '🏪';
        const src = p.fuente ? ` <i>[${escHtml(p.fuente)}]</i>` : '';
        const depto = p.departamento ? ` (${escHtml(p.departamento)})` : '';
        return `• ${icon} <b>${escHtml(p.producto)}</b>${depto}\n  💵 <b>${formatPriceBs(p.precio_bs)}</b> / ${escHtml(p.unidad_medida)}${src}`;
      })
      .join('\n\n');
  }

  let extraKeyboard: InlineKeyboardButton[][] = [];
  if (detailButtons.length > 0) {
    extraKeyboard.push(detailButtons.slice(0, 2));
    if (detailButtons.length > 2) {
      extraKeyboard.push(detailButtons.slice(2, 4));
    }
  }

  if (options.cityLabel) {
    extraKeyboard.push([
      { text: '📈 Comparar Eje Troncal', callback_data: 'canasta_comparar' },
      { text: '🌆 Otra Ciudad', callback_data: 'canasta_menu_city' },
    ]);
  } else if (options.fuenteLabel) {
    extraKeyboard.push([
      { text: '🏬 Cambiar Fuente', callback_data: 'canasta_menu_fuente' },
      { text: '📈 Comparar Eje', callback_data: 'canasta_comparar' },
    ]);
  } else {
    extraKeyboard.push([
      { text: '📈 Comparar Eje Troncal', callback_data: 'canasta_comparar' },
      { text: '🌆 Cambiar Ciudad', callback_data: 'canasta_menu_city' },
    ]);
  }

  return {
    text: `${options.title}\n\n${list.trim()}`,
    replyMarkup: {
      inline_keyboard: [...extraKeyboard, BACK_TO_CANASTA_ROW],
    },
  };
}

export function renderCanastaEjeComparativa(comp: CanastaComparisonItem[]): TemplateResult {
  if (comp.length === 0) {
    return {
      text: `🛒 No hay datos comparativos disponibles en este momento.`,
      replyMarkup: { inline_keyboard: [BACK_TO_CANASTA_ROW] },
    };
  }

  const lines = comp
    .map(
      (c) =>
        `• <b>${escHtml(c.producto)}</b> (${escHtml(c.unidad)})\n` +
        `  LPZ: <b>${c.laPaz != null ? `Bs ${c.laPaz.toFixed(2)}` : '-'}</b> | CBBA: <b>${c.cbba != null ? `Bs ${c.cbba.toFixed(2)}` : '-'}</b> | SCZ: <b>${c.scz != null ? `Bs ${c.scz.toFixed(2)}` : '-'}</b>`
    )
    .join('\n\n');

  return {
    text: `📈 <b>Comparativa de Precios Eje Troncal (OAP & Hipermaxi):</b>\n\n${lines}`,
    replyMarkup: { inline_keyboard: [BACK_TO_CANASTA_ROW] },
  };
}

export function renderCanastaSyncResult(sync: { inserted: number; latestDate?: string | null }): TemplateResult {
  return {
    text:
      `🔄 <b>Precios OAP actualizados en Neon PostgreSQL</b>\n\n` +
      `📦 Registros procesados: <b>${sync.inserted}</b>\n` +
      `📅 Última fecha oficial: <b>${escHtml(sync.latestDate || 'Hoy')}</b>`,
    replyMarkup: { inline_keyboard: [BACK_TO_CANASTA_ROW] },
  };
}

export function renderCanastaBuscarHint(): TemplateResult {
  return {
    text:
      `🔎 <b>Buscar Precio en Canasta Familiar</b>\n\n` +
      `Escribe <code>/canasta</code> seguido del producto:\n` +
      `• <code>/canasta arroz</code>\n` +
      `• <code>/canasta pollo</code>\n` +
      `• <code>/canasta aceite</code>\n` +
      `• <code>/canasta papa</code>`,
    replyMarkup: { inline_keyboard: [BACK_TO_CANASTA_ROW] },
  };
}
