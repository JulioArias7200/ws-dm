import { escHtml } from './formatters';
import { BACK_TO_HOME_ROW, BACK_TO_SALUD_ROW } from './buttons';
import { TemplateResult, ReplyMarkup, InlineKeyboardButton } from './types';
import type { CentroSaludItem, MedicamentoItem, ComparativaMedicamento } from '../canasta-salud';

/**
 * Plantillas visuales para el Módulo Salud & Precios Farmacéuticos (OSM GPS, Farmacorp y Farmacias Chávez)
 */

export function renderSaludMenu(): TemplateResult {
  const text =
    `🏥 <b>Módulo Salud & Precios Farmacéuticos — Bolivia 🇧🇴</b>\n\n` +
    `<blockquote><b>Servicios integrados en tiempo real:</b>\n` +
    `1. 🗺️ <b>Directorio OSM:</b> Hospitales, postas y farmacias georreferenciadas con cálculo de distancia GPS.\n` +
    `2. 💊 <b>Precios Farmacéuticos:</b> Catálogo y comparador en vivo de <b>Farmacorp</b> y <b>Farmacias Chávez</b>.\n\n` +
    `⚡ <b>Atajos rápidos:</b>\n` +
    `• <code>/farmacia paracetamol</code> | <code>/farmacia amoxicilina</code>\n` +
    `• <code>/salud Miraflores</code> | <code>/salud hospital</code>\n` +
    `• Envía tu <b>ubicación GPS (📎 → Ubicación)</b> para ver centros cercanos.</blockquote>\n\n` +
    `⬇️ <b>Selecciona un servicio médico o farmacéutico:</b>`;

  const replyMarkup: ReplyMarkup = {
    inline_keyboard: [
      [{ text: '🧭 Centros de Salud Cercanos (GPS)', callback_data: 'salud_buscar_hint' }],
      [
        { text: '🏥 Hospitales y Clínicas', callback_data: 'salud_tipo_hospital' },
        { text: '📍 Farmacias Físicas (OSM)', callback_data: 'salud_tipo_pharmacy' },
      ],
      [{ text: '🔍 Buscar Medicamento (/farmacia)', callback_data: 'farmacia_buscar_hint' }],
      [
        { text: '🟢 Catálogo Farmacorp', callback_data: 'farmacia_cadena_farmacorp' },
        { text: '🔵 Catálogo Chávez', callback_data: 'farmacia_cadena_chavez' },
      ],
      BACK_TO_HOME_ROW,
    ],
  };

  return { text, replyMarkup };
}

export function renderFarmaciaBuscarHint(): TemplateResult {
  return {
    text:
      `🔍 <b>Búsqueda de Medicamentos — Comparador Farmacéutico</b>\n\n` +
      `Compara precios en tiempo real entre <b>Farmacorp</b> y <b>Farmacias Chávez</b>.\n\n` +
      `<blockquote>💡 <b>¿Cómo realizar una búsqueda?</b>\n` +
      `1. Escribe el comando seguido del medicamento:\n` +
      `   • <code>/farmacia paracetamol</code>\n` +
      `   • <code>/farmacia amoxicilina 500</code>\n` +
      `   • <code>/farmacia ibuprofeno 400</code>\n` +
      `   • <code>/farmacia losartan</code>\n\n` +
      `2. O escribe directamente el nombre en el chat.\n` +
      `Obtendrás precios, laboratorios, presentaciones y enlaces directos de compra.</blockquote>`,
    replyMarkup: { inline_keyboard: [BACK_TO_SALUD_ROW] },
  };
}

export function renderCentrosSaludList(
  items: CentroSaludItem[],
  options: {
    tipo?: string;
    isGps?: boolean;
  }
): TemplateResult {
  if (items.length === 0) {
    return {
      text:
        `🏥 No se encontraron centros de salud con ese criterio en La Paz.\n` +
        `Intenta con <code>/salud hospital</code>, <code>/salud Miraflores</code> o envía tu ubicación GPS.`,
      replyMarkup: { inline_keyboard: [BACK_TO_SALUD_ROW] },
    };
  }

  const tipoEmoji: Record<string, string> = {
    hospital: '🏥',
    clinic: '🩺',
    pharmacy: '💊',
    doctors: '👨‍⚕️',
  };

  const title = options.isGps
    ? `📍 <b>Centros de Salud Más Cercanos a tu Ubicación</b>`
    : options.tipo === 'hospital'
    ? `🏥 <b>Hospitales en La Paz (OSM)</b>`
    : options.tipo === 'clinic'
    ? `🩺 <b>Clínicas y Postas en La Paz (OSM)</b>`
    : options.tipo === 'pharmacy'
    ? `💊 <b>Farmacias en La Paz (OSM)</b>`
    : `🏥 <b>Resultados de Salud — La Paz</b>`;

  const list = items
    .map((c) => {
      const mapsUrl = `https://maps.google.com/?q=${c.lat},${c.lon}`;
      const icon = tipoEmoji[c.tipo] || '🏥';
      const dist = c.distancia_km != null ? ` — <b>${c.distancia_km} km</b>` : '';
      return (
        `${icon} <b>${escHtml(c.nombre)}</b>${dist}\n` +
        (c.direccion ? `   📍 ${escHtml(c.direccion)}\n` : '') +
        (c.telefono ? `   📞 ${escHtml(c.telefono)}\n` : '') +
        (c.horario ? `   🕒 ${escHtml(c.horario)}\n` : '') +
        `   🗺️ <a href="${mapsUrl}">Abrir en Google Maps</a>`
      );
    })
    .join('\n\n');

  return {
    text: `${title}\n\n${list}`,
    replyMarkup: { inline_keyboard: [BACK_TO_SALUD_ROW] },
  };
}

export function renderMedicamentosComparativa(
  searchTerm?: string,
  comp?: ComparativaMedicamento
): TemplateResult {
  if (!searchTerm || !searchTerm.trim() || !comp) {
    return renderFarmaciaBuscarHint();
  }

  if (comp.items.length === 0) {
    return {
      text:
        `💊 No se encontraron medicamentos con el término <i>"${escHtml(searchTerm)}"</i> en la base de datos.\n\n` +
        `💡 Intenta con nombres genéricos como <code>paracetamol</code>, <code>ibuprofeno</code> o <code>vitamina</code>.`,
      replyMarkup: { inline_keyboard: [BACK_TO_SALUD_ROW] },
    };
  }

  let text = `💊 <b>Comparativa de Precios: "${escHtml(searchTerm)}"</b>\n\n`;

  if (comp.resumenAhorro) {
    const { mejorCadena, precioMin, precioMax, ahorroBs } = comp.resumenAhorro;
    text +=
      `<blockquote>🎯 <b>Resumen de Oportunidad:</b>\n` +
      `• Cadena con menor precio: <b>${escHtml(mejorCadena)}</b>\n` +
      `• Rango registrado: <b>Bs ${precioMin.toFixed(2)}</b> — <b>Bs ${precioMax.toFixed(2)}</b>\n` +
      (ahorroBs > 0 ? `• Diferencia / Ahorro potencial: <b>Bs ${ahorroBs.toFixed(2)}</b>\n` : '') +
      `</blockquote>\n\n`;
  }

  text += `📋 <b>Opciones encontradas (${comp.items.length}):</b>\n\n`;
  for (const item of comp.items) {
    const isFarmacorp = item.cadena.toLowerCase().includes('farmacorp');
    const icon = isFarmacorp ? '🟢' : '🔵';
    const linkText = isFarmacorp ? 'Ver en Farmacorp' : 'Ver en Farmacias Chávez';
    const desc = item.descuento_pct ? ` (🏷️ -${item.descuento_pct}%)` : '';
    const lab = item.laboratorio && item.laboratorio !== 'No especificado' ? ` [${escHtml(item.laboratorio)}]` : '';
    const link = item.enlace ? ` — 🔗 <a href="${escHtml(item.enlace)}">${linkText}</a>` : '';

    text +=
      `${icon} <b>${escHtml(item.cadena)}</b>: Bs <b>${item.precio_bs.toFixed(2)}</b>${desc}\n` +
      `   📝 ${escHtml(item.nombre)}${lab}\n` +
      `   📦 ${escHtml(item.presentacion || 'Unidad')}${link}\n\n`;
  }

  const replyMarkup: ReplyMarkup = {
    inline_keyboard: [
      [
        { text: '🔍 Buscar otro Medicamento', callback_data: 'farmacia_buscar_hint' },
        { text: '🧭 Farmacias Físicas (OSM)', callback_data: 'salud_tipo_pharmacy' },
      ],
      BACK_TO_SALUD_ROW,
    ],
  };

  return { text: text.trim(), replyMarkup };
}

export function renderMedicamentosCatalogoPaginado(
  cadena: string,
  items: MedicamentoItem[],
  page: number,
  totalPages: number,
  totalCount?: number
): TemplateResult {
  if (items.length === 0) {
    return {
      text: `💊 No hay medicamentos registrados aún para <b>${escHtml(cadena)}</b>.\nEjecuta el scraper respectivo o busca con <code>/farmacia paracetamol</code>.`,
      replyMarkup: { inline_keyboard: [BACK_TO_SALUD_ROW] },
    };
  }

  const cadenaKey = cadena.toLowerCase().includes('farmacorp') ? 'farmacorp' : 'chavez';
  const icon = cadenaKey === 'farmacorp' ? '🟢' : '🔵';
  const countLabel = totalCount ? ` — ${totalCount} productos` : '';

  let text = `${icon} <b>Catálogo ${escHtml(cadena)} (Pág. ${page} de ${totalPages}${countLabel}):</b>\n\n`;

  items.forEach((m, idx) => {
    const itemNum = (page - 1) * 5 + idx + 1;
    const desc = m.descuento_pct ? ` 🏷️ <i>-${m.descuento_pct}%</i>` : '';
    const lab = m.laboratorio && m.laboratorio !== 'No especificado' ? ` | 🏭 ${escHtml(m.laboratorio)}` : '';
    const link = m.enlace ? ` — 🔗 <a href="${escHtml(m.enlace)}">Ver online</a>` : '';
    text +=
      `${itemNum}. <b>${escHtml(m.producto)}</b>\n` +
      `   💵 <b>Bs ${m.precio_bs.toFixed(2)}</b>${desc}${lab}\n` +
      `   📦 ${escHtml(m.presentacion || 'Unidad')}${link}\n\n`;
  });

  const navRow: InlineKeyboardButton[] = [];
  if (page > 1) {
    navRow.push({ text: '◀️ Anterior', callback_data: `farmacia_cat:${cadenaKey}:${page - 1}` });
  } else {
    navRow.push({ text: '◀️ Inicio', callback_data: `farmacia_cadena_${cadenaKey}` });
  }

  navRow.push({ text: `Pág ${page}/${totalPages}`, callback_data: 'noop' });

  if (page < totalPages) {
    navRow.push({ text: 'Siguiente ▶️', callback_data: `farmacia_cat:${cadenaKey}:${page + 1}` });
  }

  return {
    text: text.trim(),
    replyMarkup: {
      inline_keyboard: [navRow, BACK_TO_SALUD_ROW],
    },
  };
}

export function renderMedicamentosCatalogo(
  cadena: string,
  items: MedicamentoItem[]
): TemplateResult {
  return renderMedicamentosCatalogoPaginado(cadena, items, 1, 1, items.length);
}

export function renderSaludBuscarHint(): TemplateResult {
  return {
    text:
      `📍 <b>Buscar Centros de Salud Cercanos</b>\n\n` +
      `1. Envía tu <b>ubicación GPS</b> (clip 📎 → Ubicación) para calcular distancia exacta.\n` +
      `2. O escribe por nombre/zona:\n` +
      `• <code>/salud Obrero</code>\n` +
      `• <code>/salud Miraflores</code>\n` +
      `• <code>/salud farmacia</code>`,
    replyMarkup: { inline_keyboard: [BACK_TO_SALUD_ROW] },
  };
}
