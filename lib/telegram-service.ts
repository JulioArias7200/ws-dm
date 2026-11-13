/**
 * ==============================================================================
 * TELEGRAM SERVICE — ROUTER Y CONTROLADOR DE MENSAJES Y WEBHOOKS (BOT CIUDADANO)
 * ==============================================================================
 * Maneja los comandos, callbacks y mensajes entrantes del bot @ChatDM7200bot.
 * Toda la presentación visual, formateo HTML y teclados en línea están modularizados
 * en la carpeta `lib/TG-msj/`.
 */

import {
  hybridSearch,
  getConvocatorias,
  getConvocatoriaByCuce,
  getDashboardMetrics,
  logUsage,
} from './db';
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

import {
  // Tipos y formatters
  type TelegramUpdate,
  type BotReply,
  type ReplyMarkup,
  type InlineKeyboardButton,
  type TemplateResult,
  escHtml,
  htmlToPlainText,
  formatDateBo,
  parseCommand,
  // Botones de retorno
  BACK_TO_HOME_ROW,
  // Templates principales
  renderMainMenu,
  renderHelpMessage,
  renderUnknownCommand,
  // Templates SICOES
  renderSicoesMenu,
  renderSicoesCityMenu,
  renderSicoesTipoMenu,
  renderConvocatoriasList,
  renderCuceFicha,
  renderSicoesSemanticResults,
  renderGraphMetrics,
  renderSicoesStats,
  renderSicoesBuscarHint,
  renderSicoesCuceHint,
  renderSicoesCuceMissing,
  renderSicoesCuceNotFound,
  renderSicoesRubroMissing,
  // Templates Canasta
  renderCanastaMenu,
  renderCanastaCityMenu,
  renderCanastaFuenteMenu,
  renderCanastaItems,
  renderCanastaEjeComparativa,
  renderCanastaSyncResult,
  renderCanastaBuscarHint,
  // Templates Salud y Farmacias
  renderSaludMenu,
  renderCentrosSaludList,
  renderMedicamentosComparativa,
  renderMedicamentosCatalogo,
  renderSaludBuscarHint,
} from './TG-msj';

// Re-exportar tipos para consumidores externos (API routes, tests, etc.)
export type { TelegramUpdate, BotReply, ReplyMarkup, InlineKeyboardButton, TemplateResult };

export const TELEGRAM_COMMANDS_MENU = [
  { command: 'start', description: 'Información del bot y guía de comandos' },
  { command: 'sicoes', description: 'Módulo SICOES: licitaciones La Paz e IA' },
  { command: 'canasta', description: 'Módulo Canasta Familiar (OAP e Hipermaxi)' },
  { command: 'salud', description: 'Módulo Centros de Salud y GPS' },
  { command: 'farmacia', description: 'Precios de medicamentos (Farmacorp & Chávez)' },
];

/**
 * Sub-controlador de Farmacias & Medicamentos
 */
async function handleFarmaciaCommand(query?: string, action?: string): Promise<TemplateResult> {
  const searchTerm = query?.trim() || '';

  // Modo catálogo por cadena
  if (action === 'farmacia_cadena_farmacorp' || action === 'farmacia_cadena_chavez') {
    const cadena = action.includes('farmacorp') ? 'Farmacorp' : 'Farmacias Chavez';
    const items = await getMedicamentosPrecios({ cadena, limit: 6 });
    return renderMedicamentosCatalogo(cadena, items);
  }

  // Si no se proporcionó término de búsqueda
  if (!searchTerm) {
    return renderMedicamentosComparativa();
  }

  // Comparativa Farmacorp vs Farmacias Chávez
  const comp = await compareMedicamentos(searchTerm);
  return renderMedicamentosComparativa(searchTerm, comp);
}

/**
 * Sub-controlador de Canasta Familiar
 */
async function handleCanastaCommand(args: string, action?: string): Promise<TemplateResult> {
  if (action === 'canasta_menu_city') {
    return renderCanastaCityMenu();
  }
  if (action === 'canasta_menu_fuente') {
    return renderCanastaFuenteMenu();
  }

  // Filtrado por Ciudad
  if (action?.startsWith('canasta_city:')) {
    const city = action.replace('canasta_city:', '');
    const items = await getCanastaPrecios({ departamento: city, limit: 8 });
    return renderCanastaItems(items, {
      title: `🏙️ <b>Precios Canasta Familiar — ${escHtml(city)} (OAP & Hipermaxi)</b>`,
      cityLabel: city,
    });
  }

  // Filtrado por Fuente
  if (action?.startsWith('canasta_fuente:')) {
    const src = action.replace('canasta_fuente:', '');
    const fuenteFilter = src === 'all' ? undefined : src === 'oap' ? 'OAP' : 'Hipermaxi';
    const items = await getCanastaPrecios({ fuente: fuenteFilter, limit: 8 });
    const label =
      src === 'all'
        ? 'Todas (OAP + Hipermaxi)'
        : src === 'oap'
        ? 'Solo OAP (Mercados)'
        : 'Solo Hipermaxi (Supermercado)';
    return renderCanastaItems(items, {
      title: `🏬 <b>Precios por Fuente — ${escHtml(label)}</b>`,
      fuenteLabel: label,
    });
  }

  // Sincronización OAP
  if (action === 'canasta_sync') {
    const sync = await syncCanastaOapToNeon();
    return renderCanastaSyncResult(sync);
  }

  // Comparativa Eje Troncal
  if (action === 'canasta_comparar') {
    const comp = await compareCanastaEje();
    return renderCanastaEjeComparativa(comp);
  }

  // Búsqueda por Categoría o Texto libre
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

  return renderCanastaItems(items, { title, searchTerm: args });
}

/**
 * Sub-controlador de Centros de Salud (OSM & GPS)
 */
async function handleSaludCommand(options: {
  tipo?: string;
  query?: string;
  nearLat?: number;
  nearLon?: number;
}): Promise<TemplateResult> {
  const items = await searchCentrosSalud({ ...options, limit: 6 });
  return renderCentrosSaludList(items, {
    tipo: options.tipo,
    isGps: options.nearLat != null,
  });
}

/**
 * Router principal de acciones, comandos y callbacks
 */
async function resolveAction(params: {
  cmd: string | null;
  args: string;
  callbackData?: string;
  firstName: string;
  location?: { latitude: number; longitude: number };
}): Promise<TemplateResult> {
  const { cmd, args, callbackData, firstName, location } = params;

  // Ubicación GPS enviada directamente -> buscar centros de salud cercanos
  if (location) {
    return handleSaludCommand({ nearLat: location.latitude, nearLon: location.longitude });
  }

  // Menús y submenús principales (4 sectores)
  if (cmd === '/help' || callbackData === 'menu_help') {
    return renderHelpMessage();
  }
  if (cmd === '/start' || callbackData === 'menu_home') {
    return renderMainMenu(firstName);
  }
  if (cmd === '/sicoes' || callbackData === 'menu_sicoes') {
    return renderSicoesMenu();
  }
  if ((cmd === '/canasta' && !args) || callbackData === 'menu_canasta') {
    return renderCanastaMenu();
  }
  if ((cmd === '/salud' && !args) || callbackData === 'menu_salud') {
    return renderSaludMenu();
  }

  // Hints interactivos para comandos con parámetros
  if (callbackData === 'sicoes_buscar_hint') {
    return renderSicoesBuscarHint();
  }
  if (callbackData === 'sicoes_cuce_hint') {
    const sample = await getConvocatorias({ limit: 1 });
    const sampleCuce = sample[0]?.cuce || '26-XXXX-00-XXXXXXX-1-1';
    return renderSicoesCuceHint(sampleCuce);
  }
  if (callbackData === 'canasta_buscar_hint') {
    return renderCanastaBuscarHint();
  }
  if (callbackData === 'salud_buscar_hint') {
    return renderSaludBuscarHint();
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

  // Acciones SICOES: Vigentes
  if (cmd === '/vigentes' || callbackData === 'sicoes_vigentes') {
    const items = await getConvocatorias({ estado: 'VIGENTE', limit: 4 });
    return renderConvocatoriasList(items, {
      title: '🟢 <b>Licitaciones VIGENTES en SICOES</b>',
      emptyMessage: '🟢 No hay licitaciones VIGENTES registradas.',
    });
  }

  // Acciones SICOES: Desiertas
  if (cmd === '/desiertas' || callbackData === 'sicoes_desiertas') {
    const items = await getConvocatorias({ estado: 'DESIERTA', limit: 4 });
    return renderConvocatoriasList(items, {
      title: '❌ <b>Licitaciones DESIERTAS en SICOES</b>',
      emptyMessage: '❌ No hay licitaciones DESIERTAS registradas.',
    });
  }

  // Selector Ciudad SICOES
  if (callbackData === 'sicoes_menu_city') {
    return renderSicoesCityMenu();
  }

  if (callbackData?.startsWith('sicoes_city:')) {
    const depto = callbackData.replace('sicoes_city:', '');
    const deptoFilter = depto === 'ALL' ? undefined : depto;
    const items = await getConvocatorias({ departamento: deptoFilter, limit: 4 });
    const label = depto === 'ALL' ? 'Nacional / Todas' : depto;
    return renderConvocatoriasList(items, {
      title: `🌆 <b>Convocatorias SICOES — ${escHtml(label)}</b>`,
      cityLabel: label,
    });
  }

  // Selector Tipo/Rubro SICOES
  if (callbackData === 'sicoes_menu_tipo') {
    return renderSicoesTipoMenu();
  }

  if (callbackData?.startsWith('sicoes_tipo:')) {
    const tipo = callbackData.replace('sicoes_tipo:', '');
    const tipoFilter = tipo === 'ALL' ? undefined : tipo;
    const items = await getConvocatorias({ tipoContratacion: tipoFilter, limit: 4 });
    const label = tipo === 'ALL' ? 'Todos los Rubros' : tipo;
    return renderConvocatoriasList(items, {
      title: `📋 <b>Convocatorias SICOES — Rubro: ${escHtml(label)}</b>`,
      tipoLabel: label,
    });
  }

  // Acciones SICOES: Cerradas
  if (cmd === '/cerradas' || callbackData === 'sicoes_cerradas') {
    const argLower = args.toLowerCase();
    let estados = ['ADJUDICADA', 'CONTRATADA', 'DESIERTA'];
    if (argLower.includes('adjudic')) estados = ['ADJUDICADA'];
    else if (argLower.includes('contrat')) estados = ['CONTRATADA'];
    else if (argLower.includes('desiert')) estados = ['DESIERTA'];

    const items = await getConvocatorias({ estados, limit: 5 });
    return renderConvocatoriasList(items, {
      title: '🔴 <b>Procesos CERRADOS en La Paz</b>',
      emptyMessage: '🔴 No se encontraron procesos cerrados.',
    });
  }

  // Acciones SICOES: Recientes
  if (cmd === '/recientes' || callbackData === 'sicoes_recientes') {
    const items = await getConvocatorias({ limit: 5 });
    return renderConvocatoriasList(items, {
      title: '🆕 <b>Últimas Convocatorias (La Paz)</b>',
    });
  }

  // Acciones SICOES: Rubro específico
  if (cmd === '/rubro' || callbackData?.startsWith('sicoes_rubro_')) {
    const rubroArg = callbackData?.startsWith('sicoes_rubro_')
      ? callbackData.replace('sicoes_rubro_', '')
      : args;
    if (!rubroArg) {
      return renderSicoesRubroMissing();
    }
    const items = await getConvocatorias({ tipoContratacion: rubroArg, limit: 4 });
    return renderConvocatoriasList(items, {
      title: `🏷️ <b>Convocatorias "${escHtml(rubroArg)}"</b>`,
      emptyMessage: `🔎 Sin resultados para rubro <i>"${escHtml(rubroArg)}"</i>.`,
    });
  }

  // Ficha CUCE oficial
  if (cmd === '/cuce') {
    const cuceTarget = args.split(/\s+/)[0];
    if (!cuceTarget) {
      return renderSicoesCuceMissing();
    }
    const item = await getConvocatoriaByCuce(cuceTarget);
    if (!item) {
      return renderSicoesCuceNotFound(cuceTarget);
    }
    return renderCuceFicha(item);
  }

  // Grafo: PageRank
  if (cmd === '/entidades_top' || callbackData === 'sicoes_entidades') {
    const metrics = await getDashboardMetrics();
    return renderGraphMetrics(metrics, 'pagerank');
  }

  // Grafo: HITS
  if (cmd === '/hubs_authorities' || callbackData === 'sicoes_hits') {
    const metrics = await getDashboardMetrics();
    return renderGraphMetrics(metrics, 'hits');
  }

  // Estadísticas del sistema
  if (cmd === '/stats' || callbackData === 'sicoes_stats') {
    const metrics = await getDashboardMetrics();
    return renderSicoesStats(metrics);
  }

  // Comando no reconocido
  if (cmd !== null && cmd !== '/buscar') {
    return renderUnknownCommand(cmd);
  }

  // Búsqueda semántica pgvector (/buscar <texto> o mensaje libre)
  const querySearch = cmd === '/buscar' ? args : params.args;
  if (!querySearch) {
    return renderSicoesBuscarHint();
  }

  const results = await hybridSearch(querySearch, undefined, { limit: 3 });
  if (results.length === 0) {
    return renderSicoesSemanticResults(querySearch, '', []);
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
  return renderSicoesSemanticResults(querySearch, llamaSummary, results);
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

  let result: TemplateResult;
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

  let result: TemplateResult;
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

/**
 * Responde el evento callback de Telegram para desbloquear el botón en la app
 */
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
