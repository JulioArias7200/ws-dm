import { escHtml, formatPriceBs } from './formatters';
import { BACK_TO_HOME_ROW, BACK_TO_CANASTA_ROW, BACK_TO_SALUD_ROW } from './buttons';
import { TemplateResult, ReplyMarkup, InlineKeyboardButton } from './types';
import type { ProductDetailResult } from '../canasta-salud';

export type { ProductDetailResult };

export interface ProductTemplateResult extends TemplateResult {
  photoUrl?: string | null;
}

/**
 * Plantilla para Ficha Técnica Completa de Producto en Telegram
 * Presenta disponibilidad omnicanal en todas las sucursales, histórico y enlaces oficiales.
 */
export function renderProductDetail(detail: ProductDetailResult): ProductTemplateResult {
  const p = detail.item;
  const isMed = p.sector === 'farmacia';
  const sectorIcon = isMed ? '💊' : p.sector === 'oap' ? '🏪' : '🛒';

  let text = `${sectorIcon} <b>${escHtml(p.producto)}</b>\n\n`;

  const promo =
    p.precio_anterior_bs && p.precio_anterior_bs > p.precio_bs
      ? ` <s>${formatPriceBs(p.precio_anterior_bs)}</s>${p.descuento_pct ? ` (🔥 -${p.descuento_pct}% OFF)` : ''}`
      : '';

  text += `💵 <b>Precio Vigente:</b> <b>${formatPriceBs(p.precio_bs)}</b>${promo}\n`;
  text += `🏬 <b>Tienda / Fuente:</b> ${escHtml(p.cadena)} (${escHtml(p.departamento)})\n`;
  text += `📦 <b>Presentación / Medida:</b> ${escHtml(p.unidad_medida)}\n`;
  text += `🏷️ <b>Categoría:</b> ${escHtml(p.categoria)}\n`;
  if (p.laboratorio && p.laboratorio !== 'No especificado') {
    text += `🏭 <b>Laboratorio:</b> ${escHtml(p.laboratorio)}\n`;
  }
  text += `🗓️ <b>Fecha de Registro:</b> ${escHtml(p.fecha)}\n\n`;

  // 1. Disponibilidad en Todas las Sucursales
  if (detail.sucursales && detail.sucursales.length > 0) {
    text += `🏢 <b>Disponibilidad en Sucursales (${detail.sucursales.length}):</b>\n`;
    for (const suc of detail.sucursales) {
      const sucLink = suc.enlace ? ` — <a href="${escHtml(suc.enlace)}">🔗 Enlace</a>` : '';
      text += `• <b>${escHtml(suc.cadena)}</b> [${escHtml(suc.departamento)}]: <b>${formatPriceBs(suc.precio_bs)}</b>${sucLink}\n`;
    }
    text += '\n';
  }

  // 2. Histórico de Precios
  if (detail.historicoPrecios && detail.historicoPrecios.length > 0) {
    text += `📈 <b>Histórico de Precios Registrado:</b>\n`;
    for (const h of detail.historicoPrecios.slice(0, 5)) {
      let deltaIndicator = '⚪';
      let deltaText = '';
      if (h.delta_bs > 0) {
        deltaIndicator = '🔴 Subió';
        deltaText = ` (+${formatPriceBs(h.delta_bs)} | +${h.delta_pct}%)`;
      } else if (h.delta_bs < 0) {
        deltaIndicator = '🟢 Bajó';
        deltaText = ` (${formatPriceBs(h.delta_bs)} | ${h.delta_pct}%)`;
      }
      text += `• ${escHtml(h.fecha)}: <b>${formatPriceBs(h.precio_bs)}</b> ${deltaIndicator}${deltaText}\n`;
    }
    text += '\n';
  }

  // 3. Comparativa con Otras Cadenas / Tiendas
  if (detail.comparativas && detail.comparativas.length > 0) {
    text += `⚖️ <b>Comparativa en Otras Tiendas:</b>\n`;
    for (const c of detail.comparativas.slice(0, 4)) {
      const compLink = c.enlace ? ` — <a href="${escHtml(c.enlace)}">🔗 Ver</a>` : '';
      const diffSign = c.diferencia_bs > 0 ? '+' : '';
      const diffLabel = c.tipo === 'ahorro' ? '🟢 Más económico' : c.tipo === 'mas_caro' ? '🔴 Más caro' : '⚪ Similar';
      text += `• <b>${escHtml(c.tienda)}</b> (${escHtml(c.departamento)}): <b>${formatPriceBs(c.precio_bs)}</b>\n`;
      text += `  <i>${diffLabel} (${diffSign}${formatPriceBs(c.diferencia_bs)})</i>${compLink}\n`;
    }
    text += '\n';
  }

  const actionButtons: InlineKeyboardButton[][] = [];

  // Botón directo a tienda oficial si existe enlace web
  if (p.enlace) {
    actionButtons.push([
      { text: `🔗 Ver en Tienda Oficial (${p.cadena})`, url: p.enlace }
    ]);
  }

  const backRow = isMed ? BACK_TO_SALUD_ROW : BACK_TO_CANASTA_ROW;
  actionButtons.push(backRow);

  // Determinación de URL de foto para sendPhoto
  let photoUrl: string | null = null;
  if (p.imagen && p.imagen.startsWith('http')) {
    photoUrl = p.imagen;
  } else if (p.rawImagen && p.rawImagen.startsWith('http')) {
    photoUrl = p.rawImagen;
  }

  return {
    text: text.trim(),
    photoUrl,
    replyMarkup: { inline_keyboard: actionButtons }
  };
}
