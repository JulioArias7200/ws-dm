import { hybridSearch, getConvocatorias, getConvocatoriaByCuce, getDashboardMetrics, logUsage } from './db';
import {
  getCanastaPrecios,
  compareCanastaEje,
  syncCanastaOapToNeon,
  searchCentrosSalud,
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
  { command: 'canasta', description: 'Módulo Canasta Familiar (precios OAP)' },
  { command: 'salud', description: 'Módulo Centros de Salud y GPS (La Paz)' },
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
    `• <code>/canasta &lt;producto&gt;</code> | <code>/salud &lt;zona&gt;</code>\n` +
    `• Envía tu 📍 <b>ubicación GPS</b> (📎 → Ubicación) para ver centros cercanos</blockquote>\n\n` +
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

function buildSicoesMenu(): { text: string; replyMarkup: ReplyMarkup } {
  const text =
    `🏛️ <b>Módulo SICOES — La Paz</b>\n\n` +
    `<blockquote><b>Descripción del módulo:</b>\n` +
    `Monitorea contrataciones públicas reales del departamento de <b>La Paz</b> extraídas de <code>sicoes.gob.bo</code> e indexadas en Neon PostgreSQL (<code>pgvector</code>).\n\n` +
    `Permite revisar convocatorias abiertas o cerradas, buscar por similitud semántica con IA (<code>/buscar &lt;texto&gt;</code>), consultar fichas por código (<code>/cuce &lt;id&gt;</code>) y analizar la red con <b>PageRank</b> y <b>HITS</b>.</blockquote>\n\n` +
    `⬇️ <b>Elige una acción de SICOES:</b>`;

  const replyMarkup: ReplyMarkup = {
    inline_keyboard: [
      [
        { text: '🟢 Vigentes', callback_data: 'sicoes_vigentes' },
        { text: '🔴 Cerradas', callback_data: 'sicoes_cerradas' },
        { text: '🆕 Recientes', callback_data: 'sicoes_recientes' },
      ],
      [
        { text: '🔍 Buscar con IA', callback_data: 'sicoes_buscar_hint' },
        { text: '🆔 Ficha CUCE', callback_data: 'sicoes_cuce_hint' },
      ],
      [
        { text: '🏆 Top PageRank', callback_data: 'sicoes_entidades' },
        { text: '🌟 Hubs & Auth', callback_data: 'sicoes_hits' },
      ],
      [
        { text: '🏗️ Obras', callback_data: 'sicoes_rubro_Obras' },
        { text: '📦 Bienes', callback_data: 'sicoes_rubro_Bienes' },
        { text: '🛠️ Servicios', callback_data: 'sicoes_rubro_Servicios' },
      ],
      [
        { text: '📊 Estadísticas', callback_data: 'sicoes_stats' },
        { text: '🏠 Inicio', callback_data: 'menu_home' },
      ],
    ],
  };

  return { text, replyMarkup };
}

function buildCanastaMenu(): { text: string; replyMarkup: ReplyMarkup } {
  const text =
    `🛒 <b>Módulo Canasta Familiar — La Paz</b>\n\n` +
    `<blockquote><b>Descripción del módulo:</b>\n` +
    `Consulta precios referenciales diarios reales publicados por el <b>Observatorio Agroambiental y Productivo (OAP Bolivia)</b> en mercados de La Paz.\n\n` +
    `Permite explorar productos por categoría, comparar precios entre <b>La Paz, Cochabamba y Santa Cruz</b>, sincronizar la base OAP o buscar directo escribiendo <code>/canasta papa</code> o <code>/canasta pollo</code>.</blockquote>\n\n` +
    `⬇️ <b>Elige una categoría o herramienta:</b>`;

  const replyMarkup: ReplyMarkup = {
    inline_keyboard: [
      [
        { text: '🥔 Verduras y Tubérculos', callback_data: 'canasta_cat_verduras' },
        { text: '🍗 Carnes y Huevo', callback_data: 'canasta_cat_carnes' },
      ],
      [
        { text: '🌾 Arroz, Aceite y Frutas', callback_data: 'canasta_cat_abarrotes' },
        { text: '📈 Comparar Eje Troncal', callback_data: 'canasta_comparar' },
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

function buildSaludMenu(): { text: string; replyMarkup: ReplyMarkup } {
  const text =
    `🏥 <b>Módulo Centros de Salud — La Paz</b>\n\n` +
    `<blockquote><b>Descripción del módulo:</b>\n` +
    `Directorio georreferenciado real de hospitales, clínicas, centros médicos y farmacias en <b>La Paz</b> basado en <b>OpenStreetMap</b>.\n\n` +
    `Muestra dirección, teléfono/horario cuando están disponibles y enlace directo a <b>Google Maps</b>. También puedes escribir <code>/salud Obrero</code> o enviar tu <b>ubicación GPS (📎 → Ubicación)</b> para ordenar los más cercanos.</blockquote>\n\n` +
    `⬇️ <b>Elige un tipo de establecimiento:</b>`;

  const replyMarkup: ReplyMarkup = {
    inline_keyboard: [
      [
        { text: '🏥 Hospitales La Paz', callback_data: 'salud_tipo_hospital' },
        { text: '🩺 Clínicas y Postas', callback_data: 'salud_tipo_clinic' },
      ],
      [
        { text: '💊 Farmacias La Paz', callback_data: 'salud_tipo_pharmacy' },
        { text: '📍 Buscar por Zona / GPS', callback_data: 'salud_buscar_hint' },
      ],
      BACK_TO_HOME_ROW,
    ],
  };

  return { text, replyMarkup };
}

async function handleCanastaCommand(
  args: string,
  action?: string
): Promise<{ text: string; replyMarkup: ReplyMarkup }> {
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
          `  LPZ: <b>${c.laPaz != null ? `Bs ${c.laPaz.toFixed(2)}` : '-'}</b> | CBBA: ${c.cbba != null ? `Bs ${c.cbba.toFixed(2)}` : '-'} | SCZ: ${c.scz != null ? `Bs ${c.scz.toFixed(2)}` : '-'}`
      )
      .join('\n');
    return {
      text: `📈 <b>Comparativa Eje Troncal — OAP (${escHtml(comp[0].fecha)})</b>\n\n${lines}`,
      replyMarkup: { inline_keyboard: [BACK_TO_CANASTA_ROW] },
    };
  }

  let categoria: string | undefined;
  let title = '🛒 <b>Precios Canasta Familiar — La Paz (OAP)</b>';
  if (action === 'canasta_cat_verduras') {
    categoria = 'Verduras y Tubérculos';
    title = '🥔 <b>Verduras y Tubérculos — La Paz</b>';
  } else if (action === 'canasta_cat_carnes') {
    categoria = 'Carnes y Huevo';
    title = '🍗 <b>Carnes y Huevo — La Paz</b>';
  } else if (action === 'canasta_cat_abarrotes') {
    categoria = 'Abarrotes y Frutas';
    title = '🌾 <b>Abarrotes y Frutas — La Paz</b>';
  }

  const items = await getCanastaPrecios({
    categoria,
    query: args || undefined,
    departamento: 'LA PAZ',
    limit: 12,
  });

  if (items.length === 0) {
    return {
      text: `🔎 No se encontraron precios en La Paz para <i>"${escHtml(args)}"</i>.\nPrueba con <code>/canasta papa</code>, <code>/canasta arroz</code> o <code>/canasta pollo</code>.`,
      replyMarkup: { inline_keyboard: [BACK_TO_CANASTA_ROW] },
    };
  }

  const list = items
    .map(
      (p) =>
        `• <b>${escHtml(p.producto)}</b>\n  💵 <b>Bs ${p.precio_bs.toFixed(2)}</b> / ${escHtml(p.unidad_medida)} <i>(${escHtml(p.fecha)})</i>`
    )
    .join('\n');

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

  // Acciones SICOES
  if (cmd === '/vigentes' || callbackData === 'sicoes_vigentes') {
    const items = await getConvocatorias({ estado: 'VIGENTE', limit: 4 });
    if (items.length === 0) {
      return { text: `🟢 No hay licitaciones VIGENTE registradas.`, replyMarkup: { inline_keyboard: [BACK_TO_SICOES_ROW] } };
    }
    let text = `🟢 <b>Licitaciones VIGENTES en La Paz (${items.length}):</b>\n\n`;
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
    .map(
      (r) =>
        `- CUCE: ${r.cuce} | Entidad: ${r.entidad} | Estado: ${r.estado} | Tipo: ${r.tipo_contratacion || r.modalidad} | Fin: ${formatDateBo(r.fecha_presentacion, 'N/D')} | Objeto: ${r.objeto}`
    )
    .join('\n');

  const llamaSummary = await askLlama(querySearch, contextForLlama);
  const listHtml = results
    .map(
      (r) =>
        `• <code>${escHtml(r.cuce)}</code> [<b>${escHtml(r.estado)}</b>] (${((r.similitud_semantica || 0) * 100).toFixed(1)}% cos)\n  ${escHtml(r.entidad)} — <a href="${escHtml(r.pliego_url)}">Ficha</a>`
    )
    .join('\n');

  return {
    matchedCuce: results[0]?.cuce,
    text:
      `🎯 <b>Resultados SICOES pgvector:</b> <i>"${escHtml(querySearch)}"</i>\n\n` +
      `${escHtml(llamaSummary)}\n\n` +
      `📌 <b>Coincidencias:</b>\n${listHtml}`,
    replyMarkup: { inline_keyboard: [BACK_TO_SICOES_ROW] },
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
