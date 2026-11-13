import { hybridSearch, getConvocatorias, getConvocatoriaByCuce, getDashboardMetrics, logUsage } from './db';
import {
  getCanastaPrecios,
  compareCanastaEje,
  syncCanastaOapToNeon,
  searchCentrosSalud,
  getMedicamentosPrecios,
  compareMedicamentos,
} from './canasta-salud';
import { askLlama } from './nvidia-ai';
import { getAppConfig } from './config';

export interface InlineKeyboardButton {
  text: string;
  callback_data?: string;
  url?: string;
}

export interface ReplyMarkup {
  inline_keyboard: InlineKeyboardButton[][];
}

export interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    from: {
      id: number;
      is_bot: boolean;
      first_name: string;
      username?: string;
    };
    chat: {
      id: number;
      first_name: string;
      username?: string;
      type: string;
    };
    date: number;
    text?: string;
    location?: {
      latitude: number;
      longitude: number;
    };
  };
  callback_query?: {
    id: string;
    from: {
      id: number;
      is_bot: boolean;
      first_name: string;
      username?: string;
    };
    message?: {
      message_id: number;
      chat: {
        id: number;
        type: string;
      };
    };
    data?: string;
  };
}

export interface BotReply {
  chatId: number;
  messageId?: number;
  text: string;
  plainText: string;
  replyMarkup?: ReplyMarkup;
}

export const TELEGRAM_COMMANDS_MENU = [
  { command: 'start', description: 'Información del bot y guía de comandos' },
  { command: 'sicoes', description: 'Módulo SICOES: licitaciones La Paz e IA' },
  { command: 'canasta', description: 'Módulo Canasta Familiar (OAP e Hipermaxi)' },
  { command: 'salud', description: 'Módulo Centros de Salud y GPS' },
  { command: 'farmacia', description: 'Precios de medicamentos (Farmacorp & Chávez)' },
];

const BACK_TO_HOME_ROW: InlineKeyboardButton[] = [{ text: '⬅️ Menú Principal', callback_data: 'menu_home' }];
const BACK_TO_SICOES_ROW: InlineKeyboardButton[] = [
  { text: '⬅️ SICOES', callback_data: 'menu_sicoes' },
  { text: '🏠 Menú', callback_data: 'menu_home' },
];
const BACK_TO_CANASTA_ROW: InlineKeyboardButton[] = [
  { text: '⬅️ Canasta', callback_data: 'menu_canasta' },
  { text: '🏠 Menú', callback_data: 'menu_home' },
];
const BACK_TO_SALUD_ROW: InlineKeyboardButton[] = [
  { text: '⬅️ Salud', callback_data: 'menu_salud' },
  { text: '🏠 Menú', callback_data: 'menu_home' },
];

function escHtml(text: unknown): string {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function htmlToPlainText(html: string): string {
  return html
    .replace(/<a href="([^"]+)">([^<]+)<\/a>/gi, '$2 ($1)')
    .replace(/<\/?(?:b|strong|i|em|code|pre|blockquote)>/gi, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function parseCommand(rawText: string): { cmd: string | null; args: string } {
  const trimmed = rawText.trim();
  if (!trimmed.startsWith('/')) {
    return { cmd: null, args: trimmed };
  }
  const spaceIdx = trimmed.search(/\s/);
  const head = spaceIdx === -1 ? trimmed : trimmed.slice(0, spaceIdx);
  const args = spaceIdx === -1 ? '' : trimmed.slice(spaceIdx + 1).trim();
  const cmd = head.split('@')[0].toLowerCase();
  return { cmd, args };
}

function formatDateBo(iso: string | null | undefined, fallback = 'Por confirmar'): string {
  if (!iso) return fallback;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return fallback;
  return d.toLocaleDateString('es-BO', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function buildMainMenu(firstName: string): { text: string; replyMarkup: ReplyMarkup } {
  const text =
    `🏛️ <b>SICOES-Miner La Paz</b> ✨\n` +
    `<i>Bot ciudadano de Minería Web en tiempo real (Neon PostgreSQL + IA)</i>\n\n` +
    `Hola <b>${escHtml(firstName || 'Ciudadano')}</b> 👋\n\n` +
    `<blockquote>📌 <b>Comandos del Menú (≡):</b>\n` +
    `• <code>/start</code> — Información resumida y comandos del bot\n` +
    `• <code>/sicoes</code> — Licitaciones La Paz, IA pgvector y grafos PageRank/HITS\n` +
    `• <code>/canasta</code> — Precios Canasta Familiar OAP Bolivia (La Paz y Eje)\n` +
    `• <code>/salud</code> — Hospitales, clínicas y farmacias OSM + Google Maps\n\n` +
    `⚡ <b>Atajos directos por texto o GPS:</b>\n` +
    `• <code>/buscar &lt;tema&gt;</code> | <code>/cuce &lt;código&gt;</code>\n` +
    `• <code>/canasta &lt;producto&gt;</code> | <code>/farmacia &lt;medicamento&gt;</code>\n` +
    `• <code>/salud &lt;zona&gt;</code> | Envía tu 📍 <b>ubicación GPS</b></blockquote>\n\n` +
    `⬇️ <b>Selecciona un módulo o usa el menú inferior:</b>`;

  const replyMarkup: ReplyMarkup = {
    inline_keyboard: [
      [{ text: '🏛️ SICOES — Licitaciones e IA', callback_data: 'menu_sicoes' }],
      [
        { text: '🛒 Canasta Familiar', callback_data: 'menu_canasta' },
        { text: '🏥 Centros de Salud', callback_data: 'menu_salud' },
      ],
      [{ text: '🌐 Abrir Plataforma Web', url: 'https://ws-dm.vercel.app' }],
    ],
  };

  return { text, replyMarkup };
}

function buildSicoesMenu(city = 'La Paz', tipo = 'Todos'): { text: string; replyMarkup: ReplyMarkup } {
  const text =
    `🏛️ <b>Módulo SICOES — Contrataciones Estatales 🇧🇴</b>\n\n` +
    `<blockquote><b>Filtros activos:</b>\n` +
    `• Departamento: <b>${escHtml(city)}</b>\n` +
    `• Tipo de Contrato: <b>${escHtml(tipo)}</b>\n\n` +
    `Monitorea convocatorias públicas oficiales de <code>sicoes.gob.bo</code> indexadas con IA vectorial (<code>pgvector</code>) y minería de grafos (PageRank y HITS).</blockquote>\n\n` +
    `⬇️ <b>Elige una opción para consultar:</b>`;

  const replyMarkup: ReplyMarkup = {
    inline_keyboard: [
      [
        { text: '🟢 Vigentes', callback_data: 'sicoes_vigentes' },
        { text: '🔴 Cerradas', callback_data: 'sicoes_cerradas' },
        { text: '❌ Desiertas', callback_data: 'sicoes_desiertas' },
      ],
      [
        { text: '🆕 Recientes', callback_data: 'sicoes_recientes' },
        { text: '🔍 Buscar con IA', callback_data: 'sicoes_buscar_hint' },
        { text: '🆔 Ficha CUCE', callback_data: 'sicoes_cuce_hint' },
      ],
      [
        { text: `🌆 Ciudad [${city}]`, callback_data: 'sicoes_menu_city' },
        { text: `📋 Rubro [${tipo}]`, callback_data: 'sicoes_menu_tipo' },
      ],
      [
        { text: '🏆 Top PageRank', callback_data: 'sicoes_entidades' },
        { text: '🌟 Hubs & Auth (HITS)', callback_data: 'sicoes_hits' },
      ],
      [
        { text: '📊 Estadísticas', callback_data: 'sicoes_stats' },
        { text: '🏠 Menú Principal', callback_data: 'menu_home' },
      ],
    ],
  };

  return { text, replyMarkup };
}

function buildSicoesCityMenu(): { text: string; replyMarkup: ReplyMarkup } {
  const text =
    `🌆 <b>Selecciona el Departamento para SICOES:</b>\n\n` +
    `Filtra licitaciones públicas estatales por región geográfica:`;

  const replyMarkup: ReplyMarkup = {
    inline_keyboard: [
      [
        { text: '🔵 La Paz (02)', callback_data: 'sicoes_city:La Paz' },
        { text: '🟢 Santa Cruz (07)', callback_data: 'sicoes_city:Santa Cruz' },
      ],
      [
        { text: '🔴 Cochabamba (03)', callback_data: 'sicoes_city:Cochabamba' },
        { text: '🇧🇴 Todas / Nacional', callback_data: 'sicoes_city:ALL' },
      ],
      BACK_TO_SICOES_ROW,
    ],
  };

  return { text, replyMarkup };
}

function buildSicoesTipoMenu(): { text: string; replyMarkup: ReplyMarkup } {
  const text =
    `📋 <b>Selecciona el Tipo de Contratación:</b>\n\n` +
    `Filtra convocatorias según el rubro requerido:`;

  const replyMarkup: ReplyMarkup = {
    inline_keyboard: [
      [
        { text: '📦 Bienes', callback_data: 'sicoes_tipo:Bienes' },
        { text: '🏗️ Obras', callback_data: 'sicoes_tipo:Obras' },
      ],
      [
        { text: '🛠️ Servicios Generales', callback_data: 'sicoes_tipo:Servicios' },
        { text: '🧠 Consultorías', callback_data: 'sicoes_tipo:Consultoria' },
      ],
      [{ text: '📋 Todos los Tipos', callback_data: 'sicoes_tipo:ALL' }],
      BACK_TO_SICOES_ROW,
    ],
  };

  return { text, replyMarkup };
}

function buildCanastaMenu(city = 'La Paz', fuente = 'Todas'): { text: string; replyMarkup: ReplyMarkup } {
  const text =
    `🛒 <b>Módulo Canasta Familiar — Eje Central 🇧🇴</b>\n\n` +
    `<blockquote><b>Fuentes integradas:</b>\n` +
    `1. 🏪 <b>Observatorio Agroambiental (OAP):</b> Mercados populares.\n` +
    `2. 🛒 <b>Hipermaxi S.A.:</b> Calacoto (LP), Cañoto (SCZ), Blanco Galindo (CBB).\n\n` +
    `📍 <b>Ciudad activa:</b> <b>${escHtml(city)}</b> | 🏬 <b>Fuente:</b> <b>${escHtml(fuente)}</b></blockquote>\n\n` +
    `⬇️ <b>Elige una categoría o herramienta:</b>`;

  const replyMarkup: ReplyMarkup = {
    inline_keyboard: [
      [{ text: '📈 Comparar Eje Troncal (LP vs SCZ vs CBB)', callback_data: 'canasta_comparar' }],
      [
        { text: '🥔 Verduras y Tubérculos', callback_data: 'canasta_cat_verduras' },
        { text: '🍗 Carnes y Pollo', callback_data: 'canasta_cat_carnes' },
      ],
      [
        { text: '🌾 Abarrotes y Aceite', callback_data: 'canasta_cat_abarrotes' },
        { text: '🥛 Lácteos y Derivados', callback_data: 'canasta_cat_lacteos' },
      ],
      [
        { text: `🏬 Fuente [${fuente}]`, callback_data: 'canasta_menu_fuente' },
        { text: `🌆 Ciudad [${city}]`, callback_data: 'canasta_menu_city' },
      ],
      [
        { text: '🔄 Actualizar OAP', callback_data: 'canasta_sync' },
        { text: '🔎 Cómo buscar', callback_data: 'canasta_buscar_hint' },
      ],
      BACK_TO_HOME_ROW,
    ],
  };

  return { text, replyMarkup };
}

function buildCanastaCityMenu(): { text: string; replyMarkup: ReplyMarkup } {
  const text =
    `🏙️ <b>Selecciona la Ciudad para Canasta Familiar:</b>\n\n` +
    `Monitorea y compara precios en las capitales del Eje Central:`;

  const replyMarkup: ReplyMarkup = {
    inline_keyboard: [
      [
        { text: '🔵 La Paz', callback_data: 'canasta_city:La Paz' },
        { text: '🟢 Santa Cruz', callback_data: 'canasta_city:Santa Cruz' },
      ],
      [
        { text: '🔴 Cochabamba', callback_data: 'canasta_city:Cochabamba' },
        { text: '📈 Comparar Eje Troncal', callback_data: 'canasta_comparar' },
      ],
      BACK_TO_CANASTA_ROW,
    ],
  };

  return { text, replyMarkup };
}

function buildCanastaFuenteMenu(): { text: string; replyMarkup: ReplyMarkup } {
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

function buildSaludMenu(): { text: string; replyMarkup: ReplyMarkup } {
  const text =
    `🏥 <b>Módulo Salud & Precios Farmacéuticos — Bolivia</b>\n\n` +
    `<blockquote><b>Descripción del módulo:</b>\n` +
    `1. 🗺️ <b>Directorio Médico OSM:</b> Hospitales, clínicas y farmacias georreferenciadas con enlace a Google Maps y distancia GPS.\n` +
    `2. 💊 <b>Precios de Medicamentos:</b> Catálogo y comparador de precios en vivo entre <b>Farmacorp</b> y <b>Farmacias Chávez</b>.\n\n` +
    `⚡ <b>Atajos rápidos:</b>\n` +
    `• <code>/farmacia paracetamol</code> | <code>/farmacia ibuprofeno</code>\n` +
    `• <code>/salud Miraflores</code> | <code>/salud hospital</code>\n` +
    `• Envía tu <b>ubicación GPS (📎 → Ubicación)</b> para ver centros cercanos.</blockquote>\n\n` +
    `⬇️ <b>Selecciona una opción:</b>`;

  const replyMarkup: ReplyMarkup = {
    inline_keyboard: [
      [
        { text: '🏥 Hospitales La Paz', callback_data: 'salud_tipo_hospital' },
        { text: '🩺 Clínicas y Postas', callback_data: 'salud_tipo_clinic' },
      ],
      [
        { text: '📍 Farmacias Físicas (OSM)', callback_data: 'salud_tipo_pharmacy' },
        { text: '🧭 Buscar por GPS', callback_data: 'salud_buscar_hint' },
      ],
      [
        { text: '💊 Paracetamol (Comparar)', callback_data: 'farmacia_cmp_paracetamol' },
        { text: '💊 Ibuprofeno (Comparar)', callback_data: 'farmacia_cmp_ibuprofeno' },
      ],
      [
        { text: '🏢 Catálogo Farmacorp', callback_data: 'farmacia_cadena_farmacorp' },
        { text: '🏢 Catálogo Chávez', callback_data: 'farmacia_cadena_chavez' },
      ],
      BACK_TO_HOME_ROW,
    ],
  };

  return { text, replyMarkup };
}

async function handleFarmaciaCommand(
  query?: string,
  action?: string
): Promise<{ text: string; replyMarkup: ReplyMarkup }> {
  const searchTerm = query?.trim() || '';

  // Modo catálogo por cadena
  if (action === 'farmacia_cadena_farmacorp' || action === 'farmacia_cadena_chavez') {
    const cadena = action.includes('farmacorp') ? 'Farmacorp' : 'Farmacias Chavez';
    const items = await getMedicamentosPrecios({ cadena, limit: 6 });

    if (items.length === 0) {
      return {
        text: `💊 No hay medicamentos registrados aún para <b>${escHtml(cadena)}</b>.\nEjecuta el scraper respectivo o busca con <code>/farmacia paracetamol</code>.`,
        replyMarkup: { inline_keyboard: [BACK_TO_SALUD_ROW] },
      };
    }

    let text = `🏢 <b>Catálogo ${escHtml(cadena)} — Muestra de Precios:</b>\n\n`;
    for (const m of items) {
      const desc = m.descuento_pct ? ` 🏷️ <i>-${m.descuento_pct}%</i>` : '';
      const lab = m.laboratorio && m.laboratorio !== 'No especificado' ? ` | 🏭 ${escHtml(m.laboratorio)}` : '';
      const link = m.enlace ? ` — <a href="${escHtml(m.enlace)}">Ver online</a>` : '';
      text +=
        `• <b>${escHtml(m.producto)}</b>\n` +
        `  💵 <b>Bs ${m.precio_bs.toFixed(2)}</b>${desc}${lab}\n` +
        `  📦 Presentación: ${escHtml(m.presentacion || 'Unidad')}${link}\n\n`;
    }

    return { text, replyMarkup: { inline_keyboard: [BACK_TO_SALUD_ROW] } };
  }

  // Si no se proporcionó término de búsqueda
  if (!searchTerm) {
    return {
      text:
        `💊 <b>Comparador de Medicamentos — Farmacorp vs Farmacias Chávez</b>\n\n` +
        `Escribe el nombre del medicamento o principio activo para comparar precios:\n` +
        `• <code>/farmacia paracetamol</code>\n` +
        `• <code>/farmacia ibuprofeno</code>\n` +
        `• <code>/farmacia amoxicilina</code>\n` +
        `• <code>/farmacia aspirina</code>`,
      replyMarkup: { inline_keyboard: [BACK_TO_SALUD_ROW] },
    };
  }

  // Comparativa Farmacorp vs Farmacias Chávez
  const comp = await compareMedicamentos(searchTerm);

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
      `• Rango de precios: <b>Bs ${precioMin.toFixed(2)}</b> — <b>Bs ${precioMax.toFixed(2)}</b>\n` +
      (ahorroBs > 0 ? `• Diferencia / Ahorro potencial: <b>Bs ${ahorroBs.toFixed(2)}</b>\n` : '') +
      `</blockquote>\n\n`;
  }

  text += `📋 <b>Opciones encontradas (${comp.items.length}):</b>\n\n`;
  for (const item of comp.items) {
    const icon = item.cadena.toLowerCase().includes('farmacorp') ? '🟢' : '🔵';
    const desc = item.descuento_pct ? ` (🏷️ -${item.descuento_pct}%)` : '';
    const lab = item.laboratorio && item.laboratorio !== 'No especificado' ? ` [${escHtml(item.laboratorio)}]` : '';
    const link = item.enlace ? ` — <a href="${escHtml(item.enlace)}">Ver</a>` : '';

    text +=
      `${icon} <b>${escHtml(item.cadena)}</b>: Bs <b>${item.precio_bs.toFixed(2)}</b>${desc}\n` +
      `   📝 ${escHtml(item.nombre)}${lab}\n` +
      `   📦 ${escHtml(item.presentacion || 'Unidad')}${link}\n\n`;
  }

  return { text, replyMarkup: { inline_keyboard: [BACK_TO_SALUD_ROW] } };
}

async function handleCanastaCommand(
  args: string,
  action?: string
): Promise<{ text: string; replyMarkup: ReplyMarkup }> {
  if (action === 'canasta_menu_city') {
    return buildCanastaCityMenu();
  }
  if (action === 'canasta_menu_fuente') {
    return buildCanastaFuenteMenu();
  }

  // Filtrado por Ciudad
  if (action?.startsWith('canasta_city:')) {
    const city = action.replace('canasta_city:', '');
    const items = await getCanastaPrecios({ departamento: city, limit: 8 });
    let text = `🏙️ <b>Precios Canasta Familiar — ${escHtml(city)} (OAP & Hipermaxi):</b>\n\n`;
    for (const p of items) {
      const src = p.fuente ? ` <i>[${escHtml(p.fuente)}]</i>` : '';
      text += `• <b>${escHtml(p.producto)}</b>\n  💵 <b>Bs ${p.precio_bs.toFixed(2)}</b> / ${escHtml(p.unidad_medida)}${src}\n\n`;
    }
    return {
      text,
      replyMarkup: {
        inline_keyboard: [
          [
            { text: '📈 Comparar Eje Troncal', callback_data: 'canasta_comparar' },
            { text: '🌆 Otra Ciudad', callback_data: 'canasta_menu_city' },
          ],
          BACK_TO_CANASTA_ROW,
        ],
      },
    };
  }

  // Filtrado por Fuente
  if (action?.startsWith('canasta_fuente:')) {
    const src = action.replace('canasta_fuente:', '');
    const fuenteFilter = src === 'all' ? undefined : src === 'oap' ? 'OAP' : 'Hipermaxi';
    const items = await getCanastaPrecios({ fuente: fuenteFilter, limit: 8 });
    const label = src === 'all' ? 'Todas (OAP + Hipermaxi)' : src === 'oap' ? 'Solo OAP (Mercados)' : 'Solo Hipermaxi (Supermercado)';
    let text = `🏬 <b>Precios por Fuente — ${escHtml(label)}:</b>\n\n`;
    for (const p of items) {
      const fuenteTag = p.fuente ? ` <i>[${escHtml(p.fuente)}]</i>` : '';
      text += `• <b>${escHtml(p.producto)}</b> (${escHtml(p.departamento)})\n  💵 <b>Bs ${p.precio_bs.toFixed(2)}</b> / ${escHtml(p.unidad_medida)}${fuenteTag}\n\n`;
    }
    return {
      text,
      replyMarkup: {
        inline_keyboard: [
          [
            { text: '🏬 Cambiar Fuente', callback_data: 'canasta_menu_fuente' },
            { text: '📈 Comparar Eje', callback_data: 'canasta_comparar' },
          ],
          BACK_TO_CANASTA_ROW,
        ],
      },
    };
  }

  if (action === 'canasta_sync') {
    const sync = await syncCanastaOapToNeon();
    return {
      text: `🔄 <b>Precios OAP actualizados en Neon PostgreSQL</b>\n\n📦 Registros procesados: <b>${sync.inserted}</b>\n📅 Última fecha oficial: <b>${escHtml(sync.latestDate || 'Hoy')}</b>`,
      replyMarkup: { inline_keyboard: [BACK_TO_CANASTA_ROW] },
    };
  }

  if (action === 'canasta_comparar') {
    const comp = await compareCanastaEje();
    if (comp.length === 0) {
      return { text: `🛒 No hay datos comparativos disponibles.`, replyMarkup: { inline_keyboard: [BACK_TO_CANASTA_ROW] } };
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

  let categoria: string | undefined;
  let title = '🛒 <b>Precios Canasta Familiar — Eje Central</b>';
  if (action === 'canasta_cat_verduras') {
    categoria = 'Verduras y Tubérculos';
    title = '🥔 <b>Verduras y Tubérculos — Eje Central</b>';
  } else if (action === 'canasta_cat_carnes') {
    categoria = 'Carnes y Huevo';
    title = '🍗 <b>Carnes y Pollo — Eje Central</b>';
  } else if (action === 'canasta_cat_abarrotes') {
    categoria = 'Abarrotes y Frutas';
    title = '🌾 <b>Abarrotes y Aceite — Eje Central</b>';
  } else if (action === 'canasta_cat_lacteos') {
    categoria = 'Lácteos';
    title = '🥛 <b>Lácteos y Bebidas — Eje Central</b>';
  }

  const items = await getCanastaPrecios({
    categoria,
    query: args || undefined,
    limit: 10,
  });

  if (items.length === 0) {
    return {
      text: `🔎 No se encontraron precios para <i>"${escHtml(args)}"</i>.\nPrueba con <code>/canasta papa</code>, <code>/canasta arroz</code> o <code>/canasta pollo</code>.`,
      replyMarkup: { inline_keyboard: [BACK_TO_CANASTA_ROW] },
    };
  }

  const list = items
    .map(
      (p) => {
        const src = p.fuente ? ` <i>[${escHtml(p.fuente)}]</i>` : '';
        return `• <b>${escHtml(p.producto)}</b> (${escHtml(p.departamento)})\n  💵 <b>Bs ${p.precio_bs.toFixed(2)}</b> / ${escHtml(p.unidad_medida)}${src}`;
      }
    )
    .join('\n\n');

  return {
    text: `${title}\n\n${list}`,
    replyMarkup: { inline_keyboard: [BACK_TO_CANASTA_ROW] },
  };
}

async function handleSaludCommand(options: {
  tipo?: string;
  query?: string;
  nearLat?: number;
  nearLon?: number;
}): Promise<{ text: string; replyMarkup: ReplyMarkup }> {
  const items = await searchCentrosSalud({ ...options, limit: 6 });

  if (items.length === 0) {
    return {
      text: `🏥 No se encontraron centros de salud con ese criterio en La Paz.\nIntenta con <code>/salud hospital</code>, <code>/salud Miraflores</code> o envía tu ubicación GPS.`,
      replyMarkup: { inline_keyboard: [BACK_TO_SALUD_ROW] },
    };
  }

  const tipoEmoji: Record<string, string> = {
    hospital: '🏥',
    clinic: '🩺',
    pharmacy: '💊',
    doctors: '👨‍⚕️',
  };

  const title =
    options.nearLat != null
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

async function resolveAction(params: {
  cmd: string | null;
  args: string;
  callbackData?: string;
  firstName: string;
  location?: { latitude: number; longitude: number };
}): Promise<{ text: string; replyMarkup?: ReplyMarkup; matchedCuce?: string }> {
  const { cmd, args, callbackData, firstName, location } = params;

  // Ubicación GPS enviada directamente -> buscar centros de salud cercanos
  if (location) {
    return handleSaludCommand({ nearLat: location.latitude, nearLon: location.longitude });
  }

  // Menús y submenús principales (4 sectores)
  if (cmd === '/start' || cmd === '/help' || callbackData === 'menu_home' || callbackData === 'menu_help') {
    return buildMainMenu(firstName);
  }
  if (cmd === '/sicoes' || callbackData === 'menu_sicoes') {
    return buildSicoesMenu();
  }
  if ((cmd === '/canasta' && !args) || callbackData === 'menu_canasta') {
    return buildCanastaMenu();
  }
  if ((cmd === '/salud' && !args) || callbackData === 'menu_salud') {
    return buildSaludMenu();
  }

  // Hints interactivos para comandos con parámetros
  if (callbackData === 'sicoes_buscar_hint') {
    return {
      text: `🔍 <b>Búsqueda Semántica en SICOES</b>\n\nEscribe directamente lo que buscas o usa:\n<code>/buscar medicamentos insumos hospital</code>\n<code>/buscar electrificacion obras</code>`,
      replyMarkup: { inline_keyboard: [BACK_TO_SICOES_ROW] },
    };
  }
  if (callbackData === 'sicoes_cuce_hint') {
    const sample = await getConvocatorias({ limit: 1 });
    const sampleCuce = sample[0]?.cuce || '26-XXXX-00-XXXXXXX-1-1';
    return {
      text: `🆔 <b>Consultar Ficha Oficial por CUCE</b>\n\nEnvía <code>/cuce</code> seguido del código CUCE de la convocatoria.\n\n📌 <b>Ejemplo real en base:</b>\n<code>/cuce ${escHtml(sampleCuce)}</code>`,
      replyMarkup: { inline_keyboard: [BACK_TO_SICOES_ROW] },
    };
  }
  if (callbackData === 'canasta_buscar_hint') {
    return {
      text: `🔎 <b>Buscar Precio en Canasta Familiar</b>\n\nEscribe <code>/canasta</code> seguido del producto:\n• <code>/canasta arroz</code>\n• <code>/canasta pollo</code>\n• <code>/canasta aceite</code>\n• <code>/canasta papa</code>`,
      replyMarkup: { inline_keyboard: [BACK_TO_CANASTA_ROW] },
    };
  }
  if (callbackData === 'salud_buscar_hint') {
    return {
      text: `📍 <b>Buscar Centros de Salud Cercanos</b>\n\n1. Envía tu <b>ubicación GPS</b> (clip 📎 → Ubicación) para calcular distancia exacta.\n2. O escribe por nombre/zona:\n• <code>/salud Obrero</code>\n• <code>/salud Miraflores</code>\n• <code>/salud farmacia</code>`,
      replyMarkup: { inline_keyboard: [BACK_TO_SALUD_ROW] },
    };
  }

  // Acciones Canasta Familiar
  if (callbackData?.startsWith('canasta_') || cmd === '/canasta') {
    return handleCanastaCommand(args, callbackData);
  }

  // Acciones Centros de Salud
  if (callbackData?.startsWith('salud_') || cmd === '/salud') {
    const tipo = callbackData?.startsWith('salud_tipo_')
      ? callbackData.replace('salud_tipo_', '')
      : undefined;
    return handleSaludCommand({ tipo, query: args || undefined });
  }

  // Acciones Medicamentos & Farmacias (Farmacorp & Chávez)
  if (callbackData?.startsWith('farmacia_') || cmd === '/farmacia') {
    if (callbackData === 'farmacia_cmp_paracetamol') {
      return handleFarmaciaCommand('paracetamol');
    }
    if (callbackData === 'farmacia_cmp_ibuprofeno') {
      return handleFarmaciaCommand('ibuprofeno');
    }
    return handleFarmaciaCommand(args || undefined, callbackData);
  }

  // Acciones SICOES
  if (cmd === '/vigentes' || callbackData === 'sicoes_vigentes') {
    const items = await getConvocatorias({ estado: 'VIGENTE', limit: 4 });
    if (items.length === 0) {
      return { text: `🟢 No hay licitaciones VIGENTE registradas.`, replyMarkup: { inline_keyboard: [BACK_TO_SICOES_ROW] } };
    }
    let text = `🟢 <b>Licitaciones VIGENTES en SICOES (${items.length}):</b>\n\n`;
    for (const item of items) {
      text +=
        `📄 <code>${escHtml(item.cuce)}</code>\n` +
        `🏢 ${escHtml(item.entidad)}\n` +
        `🏷️ ${escHtml(item.tipo_contratacion || item.modalidad)} | 📅 ${formatDateBo(item.fecha_publicacion)} → ⏳ ${formatDateBo(item.fecha_presentacion)}\n` +
        `📝 ${escHtml(item.objeto.slice(0, 105))}${item.objeto.length > 105 ? '...' : ''}\n` +
        `🔗 <a href="${escHtml(item.pliego_url)}">Ver Ficha SICOES</a>\n\n`;
    }
    return { text, replyMarkup: { inline_keyboard: [BACK_TO_SICOES_ROW] }, matchedCuce: items[0]?.cuce };
  }

  if (cmd === '/desiertas' || callbackData === 'sicoes_desiertas') {
    const items = await getConvocatorias({ estado: 'DESIERTA', limit: 4 });
    if (items.length === 0) {
      return { text: `❌ No hay licitaciones DESIERTAS registradas.`, replyMarkup: { inline_keyboard: [BACK_TO_SICOES_ROW] } };
    }
    let text = `❌ <b>Licitaciones DESIERTAS en SICOES (${items.length}):</b>\n\n`;
    for (const item of items) {
      text +=
        `📄 <code>${escHtml(item.cuce)}</code>\n` +
        `🏢 ${escHtml(item.entidad)}\n` +
        `📍 ${escHtml(item.departamento)} | 🏷️ ${escHtml(item.tipo_contratacion || item.modalidad)}\n` +
        `📝 ${escHtml(item.objeto.slice(0, 105))}${item.objeto.length > 105 ? '...' : ''}\n` +
        `🔗 <a href="${escHtml(item.pliego_url)}">Ver Ficha</a>\n\n`;
    }
    return { text, replyMarkup: { inline_keyboard: [BACK_TO_SICOES_ROW] }, matchedCuce: items[0]?.cuce };
  }

  if (callbackData === 'sicoes_menu_city') {
    return buildSicoesCityMenu();
  }

  if (callbackData?.startsWith('sicoes_city:')) {
    const depto = callbackData.replace('sicoes_city:', '');
    const deptoFilter = depto === 'ALL' ? undefined : depto;
    const items = await getConvocatorias({ departamento: deptoFilter, limit: 4 });
    const label = depto === 'ALL' ? 'Nacional / Todas' : depto;
    let text = `🌆 <b>Convocatorias SICOES — ${escHtml(label)} (${items.length}):</b>\n\n`;
    if (items.length === 0) {
      text += `No hay licitaciones registradas aún para ${escHtml(label)}.`;
    } else {
      for (const item of items) {
        text +=
          `📄 <code>${escHtml(item.cuce)}</code> [<b>${escHtml(item.estado)}</b>]\n` +
          `🏢 ${escHtml(item.entidad)}\n` +
          `📍 ${escHtml(item.departamento)} | 🏷️ ${escHtml(item.tipo_contratacion || item.modalidad)}\n` +
          `📝 ${escHtml(item.objeto.slice(0, 105))}${item.objeto.length > 105 ? '...' : ''}\n` +
          `🔗 <a href="${escHtml(item.pliego_url)}">Ver Ficha</a>\n\n`;
      }
    }
    return {
      text,
      replyMarkup: {
        inline_keyboard: [
          [
            { text: '🌆 Cambiar Ciudad', callback_data: 'sicoes_menu_city' },
            { text: '📋 Tipo de Contrato', callback_data: 'sicoes_menu_tipo' },
          ],
          BACK_TO_SICOES_ROW,
        ],
      },
      matchedCuce: items[0]?.cuce,
    };
  }

  if (callbackData === 'sicoes_menu_tipo') {
    return buildSicoesTipoMenu();
  }

  if (callbackData?.startsWith('sicoes_tipo:')) {
    const tipo = callbackData.replace('sicoes_tipo:', '');
    const tipoFilter = tipo === 'ALL' ? undefined : tipo;
    const items = await getConvocatorias({ tipoContratacion: tipoFilter, limit: 4 });
    const label = tipo === 'ALL' ? 'Todos los Rubros' : tipo;
    let text = `📋 <b>Convocatorias SICOES — Rubro: ${escHtml(label)} (${items.length}):</b>\n\n`;
    if (items.length === 0) {
      text += `No hay licitaciones registradas aún para el rubro ${escHtml(label)}.`;
    } else {
      for (const item of items) {
        text +=
          `📄 <code>${escHtml(item.cuce)}</code> [<b>${escHtml(item.estado)}</b>]\n` +
          `🏢 ${escHtml(item.entidad)}\n` +
          `📍 ${escHtml(item.departamento)} | 🏷️ ${escHtml(item.tipo_contratacion || item.modalidad)}\n` +
          `📝 ${escHtml(item.objeto.slice(0, 105))}${item.objeto.length > 105 ? '...' : ''}\n` +
          `🔗 <a href="${escHtml(item.pliego_url)}">Ver Ficha</a>\n\n`;
      }
    }
    return {
      text,
      replyMarkup: {
        inline_keyboard: [
          [
            { text: '📋 Cambiar Rubro', callback_data: 'sicoes_menu_tipo' },
            { text: '🌆 Filtrar Ciudad', callback_data: 'sicoes_menu_city' },
          ],
          BACK_TO_SICOES_ROW,
        ],
      },
      matchedCuce: items[0]?.cuce,
    };
  }

  if (cmd === '/cerradas' || callbackData === 'sicoes_cerradas') {
    const argLower = args.toLowerCase();
    let estados = ['ADJUDICADA', 'CONTRATADA', 'DESIERTA'];
    if (argLower.includes('adjudic')) estados = ['ADJUDICADA'];
    else if (argLower.includes('contrat')) estados = ['CONTRATADA'];
    else if (argLower.includes('desiert')) estados = ['DESIERTA'];

    const items = await getConvocatorias({ estados, limit: 5 });
    if (items.length === 0) {
      return { text: `🔴 No se encontraron procesos cerrados.`, replyMarkup: { inline_keyboard: [BACK_TO_SICOES_ROW] } };
    }
    let text = `🔴 <b>Procesos CERRADOS en La Paz (${items.length}):</b>\n\n`;
    for (const item of items) {
      text +=
        `📄 <code>${escHtml(item.cuce)}</code> [<b>${escHtml(item.estado)}</b>]\n` +
        `🏢 ${escHtml(item.entidad)}\n` +
        `📝 ${escHtml(item.objeto.slice(0, 105))}${item.objeto.length > 105 ? '...' : ''}\n\n`;
    }
    return { text, replyMarkup: { inline_keyboard: [BACK_TO_SICOES_ROW] }, matchedCuce: items[0]?.cuce };
  }

  if (cmd === '/recientes' || callbackData === 'sicoes_recientes') {
    const items = await getConvocatorias({ limit: 5 });
    let text = `🆕 <b>Últimas Convocatorias (La Paz):</b>\n\n`;
    for (const item of items) {
      text +=
        `• <code>${escHtml(item.cuce)}</code> — <b>${escHtml(item.estado)}</b>\n` +
        `  ${escHtml(item.entidad)}\n` +
        `  <i>${escHtml(item.objeto.slice(0, 90))}${item.objeto.length > 90 ? '...' : ''}</i>\n\n`;
    }
    return { text, replyMarkup: { inline_keyboard: [BACK_TO_SICOES_ROW] }, matchedCuce: items[0]?.cuce };
  }

  if (cmd === '/rubro' || callbackData?.startsWith('sicoes_rubro_')) {
    const rubroArg = callbackData?.startsWith('sicoes_rubro_')
      ? callbackData.replace('sicoes_rubro_', '')
      : args;
    if (!rubroArg) {
      return {
        text: `⚠️ Indica un rubro. Ejemplo: <code>/rubro obras</code> o <code>/rubro medicamentos</code>`,
        replyMarkup: { inline_keyboard: [BACK_TO_SICOES_ROW] },
      };
    }
    const items = await getConvocatorias({ tipoContratacion: rubroArg, limit: 4 });
    if (items.length === 0) {
      return { text: `🔎 Sin resultados para rubro <i>"${escHtml(rubroArg)}"</i>.`, replyMarkup: { inline_keyboard: [BACK_TO_SICOES_ROW] } };
    }
    let text = `🏷️ <b>Convocatorias "${escHtml(rubroArg)}" (${items.length}):</b>\n\n`;
    for (const item of items) {
      text +=
        `📄 <code>${escHtml(item.cuce)}</code> [<b>${escHtml(item.estado)}</b>]\n` +
        `🏢 ${escHtml(item.entidad)}\n` +
        `📝 ${escHtml(item.objeto.slice(0, 105))}${item.objeto.length > 105 ? '...' : ''}\n` +
        `🔗 <a href="${escHtml(item.pliego_url)}">Ver Ficha</a>\n\n`;
    }
    return { text, replyMarkup: { inline_keyboard: [BACK_TO_SICOES_ROW] }, matchedCuce: items[0]?.cuce };
  }

  if (cmd === '/cuce') {
    const cuceTarget = args.split(/\s+/)[0];
    if (!cuceTarget) {
      return {
        text: `⚠️ Indica un CUCE. Ejemplo: <code>/cuce 26-1262-00-1708614-1-1</code>`,
        replyMarkup: { inline_keyboard: [BACK_TO_SICOES_ROW] },
      };
    }
    const item = await getConvocatoriaByCuce(cuceTarget);
    if (!item) {
      return {
        text: `❌ No se encontró el CUCE <code>${escHtml(cuceTarget)}</code>.`,
        replyMarkup: { inline_keyboard: [BACK_TO_SICOES_ROW] },
      };
    }
    const montoStr =
      item.monto_referencial_bs != null
        ? `Bs ${Number(item.monto_referencial_bs).toLocaleString('es-BO')}`
        : 'Ver Ficha PDF SICOES';
    return {
      matchedCuce: item.cuce,
      text:
        `📋 <b>FICHA OFICIAL SICOES</b>\n\n` +
        `🆔 <b>CUCE:</b> <code>${escHtml(item.cuce)}</code>\n` +
        `🏛️ <b>Entidad:</b> ${escHtml(item.entidad)}\n` +
        `📌 <b>Estado:</b> <b>${escHtml(item.estado)}</b>\n` +
        `🏷️ <b>Tipo / Modalidad:</b> ${escHtml(item.tipo_contratacion || '-')} / ${escHtml(item.modalidad)}\n` +
        `💰 <b>Monto:</b> ${escHtml(montoStr)}\n` +
        `📅 <b>Publicación:</b> ${formatDateBo(item.fecha_publicacion)} | ⏰ <b>Límite:</b> ${formatDateBo(item.fecha_presentacion, 'N/D')}\n` +
        (item.formularios ? `📑 <b>Formularios:</b> ${escHtml(item.formularios)}\n` : '') +
        (item.contacto ? `📞 <b>Contacto:</b> ${escHtml(item.contacto)}\n` : '') +
        `\n📝 <b>Objeto:</b>\n${escHtml(item.objeto)}\n\n` +
        `🌐 <a href="${escHtml(item.pliego_url)}">Abrir Ficha Oficial</a>`,
      replyMarkup: { inline_keyboard: [BACK_TO_SICOES_ROW] },
    };
  }

  if (cmd === '/entidades_top' || callbackData === 'sicoes_entidades') {
    const metrics = await getDashboardMetrics();
    let text = `🏆 <b>Top Entidades y Rubros PageRank (La Paz):</b>\n\n`;
    text += `🏛️ <b>Entidades Convocantes (Hub Score):</b>\n`;
    metrics.topHubs.slice(0, 5).forEach((node, idx) => {
      text += `${idx + 1}. <b>${escHtml(node.label)}</b> — Hub: <code>${node.hubScore}</code>\n`;
    });
    text += `\n🎯 <b>Rubros por PageRank (d=0.85):</b>\n`;
    metrics.topPageRank
      .filter((n) => n.type === 'Rubro')
      .slice(0, 5)
      .forEach((node, idx) => {
        text += `${idx + 1}. <b>${escHtml(node.label)}</b> — PR: <code>${node.pageRank}</code>\n`;
      });
    return { text, replyMarkup: { inline_keyboard: [BACK_TO_SICOES_ROW] } };
  }

  if (cmd === '/hubs_authorities' || callbackData === 'sicoes_hits') {
    const metrics = await getDashboardMetrics();
    let text = `🌟 <b>Análisis HITS de Kleinberg:</b>\n\n🏢 <b>Top Hubs (Entidades):</b>\n`;
    metrics.topHubs.slice(0, 4).forEach((n, i) => {
      text += `${i + 1}. ${escHtml(n.label)} (<code>${n.hubScore}</code>)\n`;
    });
    text += `\n🎯 <b>Top Authorities (Rubros):</b>\n`;
    metrics.topAuthorities.slice(0, 4).forEach((n, i) => {
      text += `${i + 1}. ${escHtml(n.label)} (<code>${n.authorityScore}</code>)\n`;
    });
    return { text, replyMarkup: { inline_keyboard: [BACK_TO_SICOES_ROW] } };
  }

  if (cmd === '/stats' || callbackData === 'sicoes_stats') {
    const metrics = await getDashboardMetrics();
    return {
      text:
        `📊 <b>Estadísticas en Vivo (Neon PostgreSQL):</b>\n\n` +
        `📂 <b>Convocatorias SICOES:</b> ${metrics.totalConvocatorias}\n` +
        `🟢 Vigentes: ${metrics.vigentes} | 🔵 Adj.: ${metrics.adjudicadas} | 🤝 Contr.: ${metrics.contratadas} | ⚪ Des.: ${metrics.desiertas}\n` +
        `🕸️ <b>Grafo:</b> ${metrics.totalNodosGrafo} nodos • ${metrics.totalAristasGrafo} aristas (<code>${metrics.graphDensity} Δ</code>)\n` +
        `💬 <b>Consultas Usage Mining:</b> ${metrics.totalConsultasTelegram}`,
      replyMarkup: { inline_keyboard: [BACK_TO_SICOES_ROW] },
    };
  }

  if (cmd !== null && cmd !== '/buscar') {
    return {
      text: `❓ Comando <code>${escHtml(cmd)}</code> no reconocido. Usa <code>/start</code> para abrir el menú.`,
      replyMarkup: { inline_keyboard: [BACK_TO_HOME_ROW] },
    };
  }

  // Búsqueda semántica pgvector (/buscar <texto> o mensaje libre)
  const querySearch = cmd === '/buscar' ? args : params.args;
  if (!querySearch) {
    return {
      text: `🔍 Escribe qué quieres buscar. Ejemplo: <code>/buscar medicamentos hospital</code>`,
      replyMarkup: { inline_keyboard: [BACK_TO_SICOES_ROW] },
    };
  }

  const results = await hybridSearch(querySearch, undefined, { limit: 3 });
  if (results.length === 0) {
    return {
      text: `🔍 No se encontraron licitaciones para <i>"${escHtml(querySearch)}"</i>.\nPrueba también <code>/canasta ${escHtml(querySearch)}</code> o <code>/salud ${escHtml(querySearch)}</code>.`,
      replyMarkup: { inline_keyboard: [BACK_TO_HOME_ROW] },
    };
  }

  const contextForLlama = results
    .map((r) => {
      const monto =
        r.monto_referencial_bs != null
          ? `Bs ${Number(r.monto_referencial_bs).toLocaleString('es-BO')}`
          : 'Consultar Pliego PDF';
      const fecha = r.fecha_presentacion
        ? formatDateBo(r.fecha_presentacion)
        : r.estado === 'VIGENTE'
        ? 'Fecha por confirmar'
        : `Proceso Concluido (${r.estado})`;
      return `- CUCE: ${r.cuce} | Entidad: ${r.entidad} | Estado: ${r.estado} | Rubro: ${r.tipo_contratacion || r.modalidad} | Monto: ${monto} | Presentación: ${fecha} | Objeto: ${r.objeto}`;
    })
    .join('\n');

  const llamaSummary = await askLlama(querySearch, contextForLlama);
  const listHtml = results
    .map(
      (r) =>
        `• <code>${escHtml(r.cuce)}</code> [<b>${escHtml(r.estado)}</b>] (${((r.similitud_semantica || 0) * 100).toFixed(1)}% cos)\n` +
        `  🏢 ${escHtml(r.entidad)}\n` +
        `  📝 <i>${escHtml(r.objeto.slice(0, 95))}${r.objeto.length > 95 ? '...' : ''}</i>\n` +
        `  🔗 <a href="${escHtml(r.pliego_url)}">Ver Ficha Oficial SICOES</a>`
    )
    .join('\n\n');

  const topCuce = results[0]?.cuce;
  const replyMarkup: ReplyMarkup = {
    inline_keyboard: [
      topCuce ? [{ text: `📋 Ficha Pliego: ${topCuce.slice(-10)}`, url: results[0].pliego_url }] : [],
      [
        { text: '🧠 Ver Consultorías', callback_data: 'sicoes_tipo:Consultoria' },
        { text: '🟢 Solo Vigentes', callback_data: 'sicoes_vigentes' },
      ],
      BACK_TO_SICOES_ROW,
    ].filter((row) => row.length > 0),
  };

  return {
    matchedCuce: topCuce,
    text:
      `🎯 <b>Resultados SICOES pgvector:</b> <i>"${escHtml(querySearch)}"</i>\n\n` +
      `${escHtml(llamaSummary)}\n\n` +
      `📌 <b>Coincidencias indexadas:</b>\n\n${listHtml}`,
    replyMarkup,
  };
}

/**
 * Procesa mensajes de texto, comandos y ubicaciones GPS entrantes
 */
export async function processTelegramMessage(update: TelegramUpdate): Promise<BotReply> {
  const startTime = Date.now();
  const msg = update.message;

  if (!msg || (!msg.text && !msg.location)) {
    return { chatId: 0, text: '', plainText: '' };
  }

  const chatId = msg.chat.id;
  const userId = msg.from?.id;
  const username = msg.from?.username || msg.from?.first_name || 'usuario';
  const firstName = msg.from?.first_name || username;
  const rawText = msg.text?.trim() || (msg.location ? `[GPS ${msg.location.latitude},${msg.location.longitude}]` : '');
  const { cmd, args } = parseCommand(msg.text || '');

  let result: { text: string; replyMarkup?: ReplyMarkup; matchedCuce?: string };
  try {
    result = await resolveAction({
      cmd,
      args,
      firstName,
      location: msg.location,
    });
  } catch (err) {
    console.error('[TELEGRAM SERVICE] Error procesando mensaje:', err);
    result = { text: '⚠️ Ocurrió un inconveniente al procesar tu solicitud. Intenta de nuevo.' };
  }

  let finalText = result.text;
  if (finalText.length > 4000) finalText = finalText.slice(0, 3980) + '\n...';

  await logUsage({
    telegram_user_id: userId,
    username,
    query_text: rawText,
    matched_cuce: result.matchedCuce,
    response_time_ms: Date.now() - startTime,
  });

  return {
    chatId,
    text: finalText,
    plainText: htmlToPlainText(finalText),
    replyMarkup: result.replyMarkup,
  };
}

/**
 * Procesa clics en botones del Inline Keyboard (`callback_query`)
 */
export async function processTelegramCallback(update: TelegramUpdate): Promise<BotReply> {
  const startTime = Date.now();
  const cb = update.callback_query;
  if (!cb || !cb.message || !cb.data) {
    return { chatId: 0, text: '', plainText: '' };
  }

  const chatId = cb.message.chat.id;
  const messageId = cb.message.message_id;
  const firstName = cb.from?.first_name || cb.from?.username || 'Usuario';
  const username = cb.from?.username || firstName;

  let result: { text: string; replyMarkup?: ReplyMarkup; matchedCuce?: string };
  try {
    result = await resolveAction({
      cmd: null,
      args: '',
      callbackData: cb.data,
      firstName,
    });
  } catch (err) {
    console.error('[TELEGRAM SERVICE] Error procesando callback:', err);
    result = { text: '⚠️ Error al abrir esa sección.', replyMarkup: { inline_keyboard: [BACK_TO_HOME_ROW] } };
  }

  let finalText = result.text;
  if (finalText.length > 4000) finalText = finalText.slice(0, 3980) + '\n...';

  await logUsage({
    telegram_user_id: cb.from?.id,
    username,
    query_text: `[btn:${cb.data}]`,
    matched_cuce: result.matchedCuce,
    response_time_ms: Date.now() - startTime,
  });

  return {
    chatId,
    messageId,
    text: finalText,
    plainText: htmlToPlainText(finalText),
    replyMarkup: result.replyMarkup,
  };
}

export async function answerCallbackQuery(callbackQueryId: string): Promise<void> {
  const { telegramBotToken } = getAppConfig();
  if (!telegramBotToken || !callbackQueryId) return;
  try {
    await fetch(`https://api.telegram.org/bot${telegramBotToken}/answerCallbackQuery`, {
      method: 'POST',
      signal: AbortSignal.timeout(5000),
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ callback_query_id: callbackQueryId }),
    });
  } catch {}
}

/**
 * Envía mensaje nuevo o edita el mensaje existente en Telegram con Inline Keyboard
 */
export async function sendTelegramResponse(
  chatId: number,
  text: string,
  replyMarkup?: ReplyMarkup,
  editMessageId?: number
): Promise<boolean> {
  const { telegramBotToken } = getAppConfig();
  if (!telegramBotToken || !chatId) return false;

  const method = editMessageId ? 'editMessageText' : 'sendMessage';
  const url = `https://api.telegram.org/bot${telegramBotToken}/${method}`;
  const payload: Record<string, unknown> = {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    ...(editMessageId ? { message_id: editMessageId } : {}),
    ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
  };

  try {
    const res = await fetch(url, {
      method: 'POST',
      signal: AbortSignal.timeout(10000),
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (res.ok) return true;

    const errTxt = await res.text();
    // Si Telegram dice "message is not modified", considerarlo válido
    if (errTxt.includes('message is not modified')) return true;

    console.warn(`[TELEGRAM SERVICE] HTTP ${res.status} en ${method}:`, errTxt);

    // Fallback a sendMessage en texto plano
    const fallbackRes = await fetch(`https://api.telegram.org/bot${telegramBotToken}/sendMessage`, {
      method: 'POST',
      signal: AbortSignal.timeout(10000),
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: htmlToPlainText(text),
        disable_web_page_preview: true,
        ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
      }),
    });
    return fallbackRes.ok;
  } catch (err) {
    console.warn('[TELEGRAM SERVICE] Error enviando respuesta a Telegram:', err);
    return false;
  }
}
