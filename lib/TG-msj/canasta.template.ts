import { escHtml } from './formatters';
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
 * Plantillas visuales para el Módulo Canasta Familiar (OAP Mercados Populares e Hipermaxi Supermercados)
 */

export function renderCanastaMenu(city = 'La Paz', fuente = 'Todas'): TemplateResult {
  const text =
    `🛒 <b>Módulo Canasta Familiar — Eje Central Bolivia 🇧🇴</b>\n\n` +
    `<blockquote><b>Fuentes integradas en paralelo:</b>\n` +
    `1. 🏪 <b>Observatorio Agroambiental (OAP):</b> Mercados populares.\n` +
    `2. 🛒 <b>Hipermaxi S.A.:</b> Supermercados en Calacoto, Cañoto y Blanco Galindo.\n\n` +
    `📍 <b>Ciudad activa:</b> <b>${escHtml(city)}</b> | 🏬 <b>Fuente:</b> <b>${escHtml(fuente)}</b></blockquote>\n\n` +
    `⬇️ <b>Selecciona una categoría o herramienta:</b>`;

  const replyMarkup: ReplyMarkup = {
    inline_keyboard: [
      [{ text: '📈 Comparar Eje Troncal (LPZ vs CBB vs SCZ)', callback_data: 'canasta_comparar' }],
      [
        { text: '🥔 Verduras y Tubérculos', callback_data: 'canasta_cat_verduras' },
        { text: '🍗 Carnes y Pollo', callback_data: 'canasta_cat_carnes' },
      ],
      [
        { text: '🌾 Abarrotes y Aceite', callback_data: 'canasta_cat_abarrotes' },
        { text: '🥛 Lácteos y Derivados', callback_data: 'canasta_cat_lacteos' },
      ],
      [
        { text: `🏬 Fuente [${fuente} ▾]`, callback_data: 'canasta_menu_fuente' },
        { text: `🌆 Ciudad [${city} ▾]`, callback_data: 'canasta_menu_city' },
      ],
      [
        { text: '🔄 Actualizar OAP', callback_data: 'canasta_sync' },
        { text: '🔎 Buscar Alimento (/canasta)', callback_data: 'canasta_buscar_hint' },
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
        `🔎 No se encontraron precios para <i>"${escHtml(options.searchTerm || '')}"</i>.\n` +
        `Prueba con <code>/canasta papa</code>, <code>/canasta arroz</code> o <code>/canasta pollo</code>.`,
      replyMarkup: { inline_keyboard: [BACK_TO_CANASTA_ROW] },
    };
  }

  // Agrupación dual por producto base para contrastar OAP vs Hipermaxi
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

  let list = '';
  for (const [, pair] of productMap.entries()) {
    const mainItem = pair.oap || pair.hipermaxi;
    if (!mainItem) continue;

    const depto = mainItem.departamento ? ` (${escHtml(mainItem.departamento)})` : '';
    list += `• <b>${escHtml(mainItem.producto)}</b>${depto}\n`;
    if (pair.oap) {
      list += `  🏪 <b>OAP Mercados:</b> Bs ${pair.oap.precio_bs.toFixed(2)} / ${escHtml(pair.oap.unidad_medida)}\n`;
    }
    if (pair.hipermaxi) {
      list += `  🛒 <b>Hipermaxi:</b>    Bs ${pair.hipermaxi.precio_bs.toFixed(2)} / ${escHtml(pair.hipermaxi.unidad_medida)}\n`;
    }
    if (pair.oap && pair.hipermaxi) {
      const diff = pair.hipermaxi.precio_bs - pair.oap.precio_bs;
      const pct = ((diff / pair.oap.precio_bs) * 100).toFixed(1);
      const sign = diff >= 0 ? '+' : '';
      list += `  📊 <i>Brecha: ${sign}Bs ${diff.toFixed(2)} (${sign}${pct}% en supermercado)</i>\n`;
    }
    list += '\n';
  }

  if (!list.trim()) {
    list = items
      .map((p) => {
        const isHiper = p.fuente && p.fuente.toLowerCase().includes('hipermaxi');
        const icon = isHiper ? '🛒' : '🏪';
        const src = p.fuente ? ` <i>[${escHtml(p.fuente)}]</i>` : '';
        const depto = p.departamento ? ` (${escHtml(p.departamento)})` : '';
        return `• ${icon} <b>${escHtml(p.producto)}</b>${depto}\n  💵 <b>Bs ${p.precio_bs.toFixed(2)}</b> / ${escHtml(p.unidad_medida)}${src}`;
      })
      .join('\n\n');
  }

  let extraKeyboard: InlineKeyboardButton[][] = [];
  if (options.cityLabel) {
    extraKeyboard = [
      [
        { text: '📈 Comparar Eje Troncal', callback_data: 'canasta_comparar' },
        { text: '🌆 Otra Ciudad', callback_data: 'canasta_menu_city' },
      ],
    ];
  } else if (options.fuenteLabel) {
    extraKeyboard = [
      [
        { text: '🏬 Cambiar Fuente', callback_data: 'canasta_menu_fuente' },
        { text: '📈 Comparar Eje', callback_data: 'canasta_comparar' },
      ],
    ];
  } else {
    extraKeyboard = [
      [
        { text: '📈 Comparar Eje Troncal', callback_data: 'canasta_comparar' },
        { text: '🌆 Cambiar Ciudad', callback_data: 'canasta_menu_city' },
      ],
    ];
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
