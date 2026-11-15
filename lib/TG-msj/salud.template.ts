import { escHtml, formatPriceBs } from './formatters';
import { BACK_TO_HOME_ROW, BACK_TO_SALUD_ROW } from './buttons';
import { TemplateResult, ReplyMarkup, InlineKeyboardButton } from './types';
import type { CentroSaludItem, MedicamentoItem, ComparativaMedicamento } from '../canasta-salud';

/**
 * Plantillas visuales para el Módulo Salud & Precios Farmacéuticos (OSM GPS, Farmacorp, Farmacias Chávez e Hipermaxi)
 */

export function renderSaludMenu(): TemplateResult {
  const text =
    `🏥 <b>Módulo Salud & Precios Farmacéuticos — Bolivia 🇧🇴</b>\n\n` +
    `<blockquote><b>Servicios integrados en tiempo real:</b>\n` +
    `1. 🗺️ <b>Directorio OSM:</b> Hospitales, postas y farmacias georreferenciadas con cálculo de distancia GPS.\n` +
    `2. 💊 <b>Precios Farmacéuticos:</b> Catálogo y comparador tri-cadena en vivo de <b>Farmacorp</b>, <b>Farmacias Chávez</b> e <b>Hipermaxi Farmacia</b>.\n\n` +
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
      [
        { text: '🟢 Catálogo Farmacorp', callback_data: 'farmacia_cadena_farmacorp' },
        { text: '🔵 Catálogo Chávez', callback_data: 'farmacia_cadena_chavez' },
      ],
      [
        { text: '🟣 Catálogo Hipermaxi Farmacia', callback_data: 'farmacia_cadena_hipermaxi' },
        { text: '🔍 Buscar Fármaco (/farmacia)', callback_data: 'farmacia_buscar_hint' },
      ],
      BACK_TO_HOME_ROW,
    ],
  };

  return { text, replyMarkup };
}

export function renderFarmaciaBuscarHint(): TemplateResult {
  return {
    text:
      `🔍 <b>Búsqueda de Medicamentos — Comparador Tri-Cadena</b>\n\n` +
      `Compara precios en tiempo real entre <b>Farmacorp</b>, <b>Farmacias Chávez</b> e <b>Hipermaxi Farmacia</b>.\n\n` +
      `<blockquote>💡 <b>¿Cómo realizar una búsqueda?</b>\n` +
      `1. Escribe el comando seguido del medicamento:\n` +
      `   • <code>/farmacia paracetamol</code>\n` +
      `   • <code>/farmacia amoxicilina 500</code>\n` +
      `   • <code>/farmacia ibuprofeno 400</code>\n` +
      `   • <code>/farmacia losartan</code>\n\n` +
      `2. O escribe directamente el nombre en el chat.\n` +
      `Obtendrás la disponibilidad, laboratorios, precios y enlaces directos de compra en todas las farmacias.</blockquote>`,
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

  let text = `💊 <b>Comparativa de Precios Tri-Cadena: "${escHtml(searchTerm)}"</b>\n\n`;

  if (comp.resumenAhorro) {
    const { mejorCadena, precioMin, precioMax, ahorroBs } = comp.resumenAhorro;
    text +=
      `<blockquote>🎯 <b>Resumen de Oportunidad:</b>\n` +
      `• Cadena con menor precio: <b>${escHtml(mejorCadena)}</b>\n` +
      `• Rango registrado: <b>${formatPriceBs(precioMin)}</b> — <b>${formatPriceBs(precioMax)}</b>\n` +
      (ahorroBs > 0 ? `• Diferencia / Ahorro potencial: <b>${formatPriceBs(ahorroBs)}</b>\n` : '') +
      `</blockquote>\n\n`;
  }

  // Agrupar por cadena para claridad omnicanal
  const farmacorpItems = comp.items.filter((i) => i.cadena.toLowerCase().includes('farmacorp'));
  const chavezItems = comp.items.filter((i) => i.cadena.toLowerCase().includes('chavez'));
  const hipermaxiItems = comp.items.filter((i) => i.cadena.toLowerCase().includes('hipermaxi'));

  const detailButtons: InlineKeyboardButton[] = [];

  const renderSection = (title: string, icon: string, list: typeof comp.items, linkLabel: string) => {
    if (list.length === 0) return '';
    let out = `${icon} <b>${title} (${list.length}):</b>\n`;
    for (const item of list) {
      const desc = item.descuento_pct ? ` (🏷️ -${item.descuento_pct}%)` : '';
      const lab = item.laboratorio && item.laboratorio !== 'No especificado' ? ` [${escHtml(item.laboratorio)}]` : '';
      const link = item.enlace ? ` — 🔗 <a href="${escHtml(item.enlace)}">${linkLabel}</a>` : '';
      out += `• <b>${escHtml(item.nombre)}</b>\n`;
      out += `  💵 <b>${formatPriceBs(item.precio_bs)}</b>${desc} | ${escHtml(item.presentacion || 'Unidad')}${lab}${link}\n`;

      if (item.id && detailButtons.length < 4) {
        detailButtons.push({
          text: `🔍 ${item.cadena.split(' ')[0]}: ${formatPriceBs(item.precio_bs)}`,
          callback_data: `prod_MED_${item.id}`,
        });
      }
    }
    return out + '\n';
  };

  text += renderSection('Farmacorp', '🟢', farmacorpItems, 'Ver en Farmacorp');
  text += renderSection('Farmacias Chávez', '🔵', chavezItems, 'Ver en Farmacias Chávez');
  text += renderSection('Hipermaxi Farmacia', '🟣', hipermaxiItems, 'Ver en Hipermaxi');

  const actionRows: InlineKeyboardButton[][] = [];
  if (detailButtons.length > 0) {
    actionRows.push(detailButtons.slice(0, 2));
    if (detailButtons.length > 2) {
      actionRows.push(detailButtons.slice(2, 4));
    }
  }

  actionRows.push([
    { text: '🔍 Buscar otro Fármaco', callback_data: 'farmacia_buscar_hint' },
    { text: '🧭 Farmacias Físicas (OSM)', callback_data: 'salud_tipo_pharmacy' },
  ]);
  actionRows.push(BACK_TO_SALUD_ROW);

  return { text: text.trim(), replyMarkup: { inline_keyboard: actionRows } };
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

  const isHipermaxi = cadena.toLowerCase().includes('hipermaxi');
  const isFarmacorp = cadena.toLowerCase().includes('farmacorp');
  const cadenaKey = isHipermaxi ? 'hipermaxi' : isFarmacorp ? 'farmacorp' : 'chavez';
  const icon = isHipermaxi ? '🟣' : isFarmacorp ? '🟢' : '🔵';
  const countLabel = totalCount ? ` — ${totalCount} productos` : '';

  let text = `${icon} <b>Catálogo ${escHtml(cadena)} (Pág. ${page} de ${totalPages}${countLabel}):</b>\n\n`;

  const itemButtons: InlineKeyboardButton[] = [];

  items.forEach((m, idx) => {
    const itemNum = (page - 1) * 5 + idx + 1;
    const desc = m.descuento_pct ? ` 🏷️ <i>-${m.descuento_pct}%</i>` : '';
    const lab = m.laboratorio && m.laboratorio !== 'No especificado' ? ` | 🏭 ${escHtml(m.laboratorio)}` : '';
    const link = m.enlace ? ` — 🔗 <a href="${escHtml(m.enlace)}">Ver online</a>` : '';
    text +=
      `${itemNum}. <b>${escHtml(m.producto)}</b>\n` +
      `   💵 <b>${formatPriceBs(m.precio_bs)}</b>${desc}${lab}\n` +
      `   📦 ${escHtml(m.presentacion || 'Unidad')}${link}\n\n`;

    if (itemButtons.length < 3) {
      itemButtons.push({
        text: `🔍 #${itemNum} Ficha`,
        callback_data: `prod_MED_${m.id}`,
      });
    }
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

  const keyboard: InlineKeyboardButton[][] = [];
  if (itemButtons.length > 0) keyboard.push(itemButtons);
  keyboard.push(navRow);
  keyboard.push(BACK_TO_SALUD_ROW);

  return {
    text: text.trim(),
    replyMarkup: {
      inline_keyboard: keyboard,
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
