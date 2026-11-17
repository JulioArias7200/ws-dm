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
  hybridSearchPartitioned,
  checkConvocatoriasCountByDepartment,
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
  getMedicamentosPreciosPaginado,
  compareMedicamentos,
  getProductDetail,
} from './canasta-salud';
import { refreshProductItemById } from './item-updater';
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
  renderSicoesDepartmentEmpty,
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
  renderMedicamentosCatalogoPaginado,
  renderSaludBuscarHint,
  renderFarmaciaBuscarHint,
  // Templates Producto Ficha
  renderProductDetail,
} from './TG-msj';

// Re-exportar tipos para consumidores externos (API routes, tests, etc.)
export type { TelegramUpdate, BotReply, ReplyMarkup, InlineKeyboardButton, TemplateResult };

export const TELEGRAM_COMMANDS_MENU = [
  { command: 'start', description: 'Menú principal y módulos de información' },
  { command: 'sicoes', description: 'Módulo SICOES: licitaciones La Paz e IA' },
  { command: 'canasta', description: 'Canasta, alimentos y comercio (Hipermaxi & OAP)' },
  { command: 'salud', description: 'Módulo Centros de Salud y GPS' },
  { command: 'farmacia', description: 'Comparador tri-cadena: Farmacorp, Chávez e Hipermaxi' },
  { command: 'producto', description: 'Ficha detallada, sucursales e histórico por ID' },
];

/**
 * Sub-controlador de Ficha Detallada de Producto (Modal web trasladada a Telegram)
 */
async function handleProductDetailCommand(idStr: string): Promise<TemplateResult> {
  const cleanId = idStr.trim();
  if (!cleanId) {
    return {
      text: '⚠️ Debes indicar el identificador del producto.\nEjemplo: <code>/producto 2328</code> o pulsa el botón <b>🔍 Ver Detalle</b> de cualquier lista.',
      replyMarkup: { inline_keyboard: [BACK_TO_HOME_ROW] },
    };
  }

  try {
    // Actualización automática en vivo del producto (precios, ofertas e histórico)
    try {
      await Promise.race([
        refreshProductItemById(cleanId),
        new Promise((resolve) => setTimeout(resolve, 3500)),
      ]);
    } catch (refreshErr) {
      console.warn('[TELEGRAM] Fallback refreshProductItemById:', refreshErr);
    }

    const detail = await getProductDetail(cleanId);
    if (!detail) {
      return {
        text: `❌ No se encontró ningún producto con ID <code>${escHtml(cleanId)}</code> en la base de datos.`,
        replyMarkup: { inline_keyboard: [BACK_TO_HOME_ROW] },
      };
    }
    return renderProductDetail(detail);
  } catch (err) {
    console.error('[TELEGRAM] Error obteniendo ficha de producto:', err);
    return {
      text: '⚠️ Error al consultar la ficha técnica del producto.',
      replyMarkup: { inline_keyboard: [BACK_TO_HOME_ROW] },
    };
  }
}

/**
 * Sub-controlador de Farmacias & Medicamentos (Tri-Cadena)
 */
async function handleFarmaciaCommand(query?: string, action?: string): Promise<TemplateResult> {
  // Hint explicativo de cómo buscar medicamentos
  if (action === 'farmacia_buscar_hint') {
    return renderFarmaciaBuscarHint();
  }

  // Paginación de catálogo: farmacia_cat:<cadena>:<page>
  if (action?.startsWith('farmacia_cat:')) {
    const parts = action.split(':');
    const cadenaKey = parts[1] || 'farmacorp';
    const page = parseInt(parts[2] || '1', 10);
    const cadena =
      cadenaKey === 'hipermaxi'
        ? 'Hipermaxi'
        : cadenaKey === 'farmacorp'
        ? 'Farmacorp'
        : 'Farmacias Chavez';
    const paginated = await getMedicamentosPreciosPaginado({ cadena, page, pageSize: 5 });
    return renderMedicamentosCatalogoPaginado(
      cadena,
      paginated.items,
      paginated.page,
      paginated.totalPages,
      paginated.total
    );
  }

  // Modo catálogo inicial (Página 1 de 5 elementos)
  if (
    action === 'farmacia_cadena_farmacorp' ||
    action === 'farmacia_cadena_chavez' ||
    action === 'farmacia_cadena_hipermaxi'
  ) {
    const cadena = action.includes('hipermaxi')
      ? 'Hipermaxi'
      : action.includes('farmacorp')
      ? 'Farmacorp'
      : 'Farmacias Chavez';
    const paginated = await getMedicamentosPreciosPaginado({ cadena, page: 1, pageSize: 5 });
    return renderMedicamentosCatalogoPaginado(
      cadena,
      paginated.items,
      paginated.page,
      paginated.totalPages,
      paginated.total
    );
  }

  const searchTerm = query?.trim() || '';

  // Si no se proporcionó término de búsqueda, mostrar guía de búsqueda
  if (!searchTerm) {
    return renderFarmaciaBuscarHint();
  }

  // Comparativa Farmacorp vs Farmacias Chávez vs Hipermaxi Farmacia
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

  // Filtrado por Macro-Categorías del Catálogo Unificado
  if (action?.startsWith('canasta_macro:')) {
    const macro = action.replace('canasta_macro:', '');
    let macroTitle = '🧺 Canasta & Alimentos';
    let catFilter: string | undefined;
    if (macro === 'limpieza') {
      macroTitle = '🧼 Limpieza & Hogar';
      catFilter = 'Hogar';
    } else if (macro === 'licores') {
      macroTitle = '🍷 Licores & Bebidas';
      catFilter = 'Bebidas';
    } else if (macro === 'personal') {
      macroTitle = '🧴 Cuidado Personal';
      catFilter = 'Cuidado Personal';
    } else if (macro === 'otros') {
      macroTitle = '📦 Bazar & Textil';
      catFilter = 'Bazar';
    }
    const items = await getCanastaPrecios({ categoria: catFilter, limit: 12 });
    return renderCanastaItems(items, { title: `${macroTitle} — Eje Central` });
  }

  // Búsqueda por Texto libre (Omnicanal: todas las sucursales y comercios)
  if (args && args.trim()) {
    const q = args.trim();
    const canastaRows = await getCanastaPrecios({ query: q, limit: 20 });

    // También buscar en medicamentos/retail por si es un producto común (leche, pañales, suplementos, shampoo)
    let extraRetail: typeof canastaRows = [];
    try {
      const medRows = await getMedicamentosPrecios({ query: q, limit: 8 });
      extraRetail = medRows.map((m) => ({
        id: `MED_${m.id}`,
        fecha: m.fecha,
        departamento: m.departamento,
        producto: m.producto,
        categoria: m.categoria || 'Farmacia/Retail',
        unidad_medida: m.presentacion || '1 Unidad',
        precio_bs: m.precio_bs,
        fuente: m.cadena,
        enlace: m.enlace,
        precio_anterior_bs: m.precio_anterior_bs,
        descuento_pct: m.descuento_pct,
      }));
    } catch {
      // Ignorar fallback
    }

    const allMatches = [...canastaRows, ...extraRetail];

    // Actualización automática en segundo plano / tiempo real de los principales resultados con enlace web
    const candidatesToRefresh = allMatches.filter((p) => p.enlace && p.id).slice(0, 2);
    if (candidatesToRefresh.length > 0) {
      try {
        await Promise.race([
          Promise.allSettled(
            candidatesToRefresh.map(async (c) => {
              const res = await refreshProductItemById(String(c.id));
              if (res?.cambio_detectado) {
                c.precio_bs = res.precio_actual_bs;
                c.precio_anterior_bs = res.precio_anterior_bs;
                c.descuento_pct = res.descuento_pct;
              }
            })
          ),
          new Promise((resolve) => setTimeout(resolve, 3500)),
        ]);
      } catch (err) {
        console.warn('[TELEGRAM] Error en auto-refresh en demanda:', err);
      }
    }

    return renderCanastaItems(allMatches, {
      title: `🔎 <b>Disponibilidad de "${escHtml(q)}" en Todas las Tiendas y Sucursales:</b>`,
      searchTerm: q,
    });
  }

  // Búsqueda por Categoría
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
    limit: 10,
  });

  return renderCanastaItems(items, { title });
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

  // Ficha detallada de producto (Web Modal trasladada a Telegram)
  if (cmd === '/producto' || callbackData?.startsWith('prod_')) {
    const idTarget = callbackData?.startsWith('prod_')
      ? callbackData.replace('prod_', '')
      : args;
    return handleProductDetailCommand(idTarget);
  }

  // Acciones Canasta Familiar
  if (callbackData?.startsWith('canasta_') || cmd === '/canasta') {
    return handleCanastaCommand(args, callbackData);
  }

  // Acciones Centros de Salud & Fármacos (/salud)
  if (cmd === '/salud') {
    if (!args) {
      return renderSaludMenu();
    }
    // Si el término coincide con fármacos (ej. /salud paracetamol), desplegar comparador tri-cadena
    try {
      const medMatches = await getMedicamentosPrecios({ query: args.trim(), limit: 1 });
      if (medMatches.length > 0) {
        const comp = await compareMedicamentos(args.trim());
        // Actualización automática en segundo plano rápido de los candidatos principales
        const candidates = comp.items.filter((i) => i.enlace && i.id).slice(0, 2);
        if (candidates.length > 0) {
          try {
            await Promise.race([
              Promise.allSettled(
                candidates.map(async (c) => {
                  const refreshed = await refreshProductItemById(`MED_${c.id}`);
                  if (refreshed?.cambio_detectado) {
                    c.precio_bs = refreshed.precio_actual_bs;
                    c.descuento_pct = refreshed.descuento_pct;
                  }
                })
              ),
              new Promise((resolve) => setTimeout(resolve, 3500)),
            ]);
          } catch {}
        }
        return renderMedicamentosComparativa(args.trim(), comp);
      }
    } catch {}
    // Si no es fármaco, buscar en centros de salud OSM (ej. /salud hospital, /salud miraflores)
    return handleSaludCommand({ query: args.trim() });
  }

  if (callbackData?.startsWith('salud_')) {
    const tipo = callbackData.startsWith('salud_tipo_')
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

    if (deptoFilter) {
      const count = await checkConvocatoriasCountByDepartment(deptoFilter);
      if (count === 0) {
        return renderSicoesDepartmentEmpty(depto);
      }
    }

    const items = await getConvocatorias({ departamento: deptoFilter, limit: 4 });
    const label = depto === 'ALL' ? 'Nacional / Todas' : depto;
    if (items.length === 0 && deptoFilter) {
      return renderSicoesDepartmentEmpty(depto);
    }
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

  const results = await hybridSearchPartitioned(querySearch, { minSimilarity: 0.2, limitPerDept: 2, maxTotal: 8 });
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
    photoUrl: result.photoUrl,
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
    photoUrl: result.photoUrl,
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
 * Envía una fotografía oficial a Telegram con ficha técnica en caption y teclado interactivo.
 * Aplica fallback automático a sendTelegramResponse si la URL no es accesible o Telegram la rechaza.
 */
export async function sendTelegramPhoto(
  chatId: number,
  photoUrl: string,
  caption: string,
  replyMarkup?: ReplyMarkup
): Promise<boolean> {
  const { telegramBotToken } = getAppConfig();
  if (!telegramBotToken || !chatId) return false;

  const url = `https://api.telegram.org/bot${telegramBotToken}/sendPhoto`;
  const trimmedCaption = caption.length > 1020 ? caption.slice(0, 1010) + '...' : caption;

  try {
    const res = await fetch(url, {
      method: 'POST',
      signal: AbortSignal.timeout(8000),
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        photo: photoUrl,
        caption: trimmedCaption,
        parse_mode: 'HTML',
        ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
      }),
    });

    if (res.ok) return true;

    const errTxt = await res.text();
    console.warn(`[TELEGRAM SERVICE] Falló sendPhoto (HTTP ${res.status}): ${errTxt}. Aplicando fallback a mensaje regular.`);
  } catch (err) {
    console.warn('[TELEGRAM SERVICE] Excepción en sendPhoto, aplicando fallback a mensaje regular:', err);
  }

  return sendTelegramResponse(chatId, caption, replyMarkup);
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
