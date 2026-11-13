import { escHtml, formatDateBo } from './formatters';
import { BACK_TO_SICOES_ROW } from './buttons';
import { TemplateResult, ReplyMarkup, InlineKeyboardButton } from './types';
import type { Convocatoria, getDashboardMetrics } from '../db';
import type { GraphAnalysisResult, NodeMetrics } from '../graph-mining';

export type DashboardMetrics = Awaited<ReturnType<typeof getDashboardMetrics>>;

/**
 * Plantillas visuales para el Módulo SICOES (Licitaciones, Fichas CUCE, IA Vectorial y Grafos)
 */

export function renderSicoesMenu(city = 'La Paz', tipo = 'Todos'): TemplateResult {
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

export function renderSicoesCityMenu(): TemplateResult {
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

export function renderSicoesTipoMenu(): TemplateResult {
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

export function renderConvocatoriasList(
  items: Convocatoria[],
  options: {
    title: string;
    emptyMessage?: string;
    cityLabel?: string;
    tipoLabel?: string;
  }
): TemplateResult {
  if (items.length === 0) {
    return {
      text: options.emptyMessage || `No se encontraron licitaciones registradas con ese criterio.`,
      replyMarkup: { inline_keyboard: [BACK_TO_SICOES_ROW] },
    };
  }

  let text = `${options.title} (${items.length}):\n\n`;
  for (const item of items) {
    const estadoBadge = item.estado ? ` [<b>${escHtml(item.estado)}</b>]` : '';
    const fechas =
      item.fecha_publicacion && item.fecha_presentacion
        ? ` | 📅 ${formatDateBo(item.fecha_publicacion)} → ⏳ ${formatDateBo(item.fecha_presentacion)}`
        : '';
    const rubroDepto = `🏷️ ${escHtml(item.tipo_contratacion || item.modalidad)}${item.departamento ? ` | 📍 ${escHtml(item.departamento)}` : ''}`;

    text +=
      `📄 <code>${escHtml(item.cuce)}</code>${estadoBadge}\n` +
      `🏢 ${escHtml(item.entidad)}\n` +
      `${rubroDepto}${fechas}\n` +
      `📝 ${escHtml(item.objeto.slice(0, 105))}${item.objeto.length > 105 ? '...' : ''}\n` +
      `🔗 <a href="${escHtml(item.pliego_url)}">Ver Ficha SICOES</a>\n\n`;
  }

  let extraRows: InlineKeyboardButton[][] = [];
  if (options.cityLabel) {
    extraRows = [
      [
        { text: '🌆 Cambiar Ciudad', callback_data: 'sicoes_menu_city' },
        { text: '📋 Tipo de Contrato', callback_data: 'sicoes_menu_tipo' },
      ],
    ];
  } else if (options.tipoLabel) {
    extraRows = [
      [
        { text: '📋 Cambiar Rubro', callback_data: 'sicoes_menu_tipo' },
        { text: '🌆 Filtrar Ciudad', callback_data: 'sicoes_menu_city' },
      ],
    ];
  }

  return {
    text,
    replyMarkup: {
      inline_keyboard: [...extraRows, BACK_TO_SICOES_ROW],
    },
    matchedCuce: items[0]?.cuce,
  };
}

export function renderCuceFicha(item: Convocatoria): TemplateResult {
  const montoStr =
    item.monto_referencial_bs != null
      ? `Bs ${Number(item.monto_referencial_bs).toLocaleString('es-BO')}`
      : 'Ver Ficha PDF SICOES';

  const text =
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
    `🌐 <a href="${escHtml(item.pliego_url)}">Abrir Ficha Oficial</a>`;

  return {
    matchedCuce: item.cuce,
    text,
    replyMarkup: { inline_keyboard: [BACK_TO_SICOES_ROW] },
  };
}

export function renderSicoesSemanticResults(
  querySearch: string,
  llamaSummary: string,
  results: Convocatoria[]
): TemplateResult {
  if (results.length === 0) {
    return {
      text:
        `🔍 No se encontraron licitaciones para <i>"${escHtml(querySearch)}"</i>.\n` +
        `Prueba también <code>/canasta ${escHtml(querySearch)}</code> o <code>/salud ${escHtml(querySearch)}</code>.`,
      replyMarkup: { inline_keyboard: [BACK_TO_SICOES_ROW] },
    };
  }

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

export function renderGraphMetrics(
  metrics: { topHubs: NodeMetrics[]; topPageRank: NodeMetrics[]; topAuthorities: NodeMetrics[] },
  mode: 'pagerank' | 'hits'
): TemplateResult {
  let text = '';
  if (mode === 'pagerank') {
    text = `🏆 <b>Top Entidades y Rubros PageRank (La Paz):</b>\n\n`;
    text += `🏛️ <b>Entidades Convocantes (Hub Score):</b>\n`;
    metrics.topHubs.slice(0, 5).forEach((node: NodeMetrics, idx: number) => {
      text += `${idx + 1}. <b>${escHtml(node.label)}</b> — Hub: <code>${node.hubScore}</code>\n`;
    });
    text += `\n🎯 <b>Rubros por PageRank (d=0.85):</b>\n`;
    metrics.topPageRank
      .filter((n: NodeMetrics) => n.type === 'Rubro')
      .slice(0, 5)
      .forEach((node: NodeMetrics, idx: number) => {
        text += `${idx + 1}. <b>${escHtml(node.label)}</b> — PR: <code>${node.pageRank}</code>\n`;
      });
  } else {
    text = `🌟 <b>Análisis HITS de Kleinberg:</b>\n\n🏢 <b>Top Hubs (Entidades):</b>\n`;
    metrics.topHubs.slice(0, 4).forEach((n: NodeMetrics, i: number) => {
      text += `${i + 1}. ${escHtml(n.label)} (<code>${n.hubScore}</code>)\n`;
    });
    text += `\n🎯 <b>Top Authorities (Rubros):</b>\n`;
    metrics.topAuthorities.slice(0, 4).forEach((n: NodeMetrics, i: number) => {
      text += `${i + 1}. ${escHtml(n.label)} (<code>${n.authorityScore}</code>)\n`;
    });
  }

  return { text, replyMarkup: { inline_keyboard: [BACK_TO_SICOES_ROW] } };
}

export function renderSicoesStats(metrics: DashboardMetrics): TemplateResult {
  const text =
    `📊 <b>Estadísticas en Vivo (Neon PostgreSQL):</b>\n\n` +
    `📂 <b>Convocatorias SICOES:</b> ${metrics.totalConvocatorias}\n` +
    `🟢 Vigentes: ${metrics.vigentes} | 🔵 Adj.: ${metrics.adjudicadas} | 🤝 Contr.: ${metrics.contratadas} | ⚪ Des.: ${metrics.desiertas}\n` +
    `🕸️ <b>Grafo:</b> ${metrics.totalNodosGrafo} nodos • ${metrics.totalAristasGrafo} aristas (<code>${metrics.graphDensity} Δ</code>)\n` +
    `💬 <b>Consultas Usage Mining:</b> ${metrics.totalConsultasTelegram}`;

  return { text, replyMarkup: { inline_keyboard: [BACK_TO_SICOES_ROW] } };
}

export function renderSicoesBuscarHint(): TemplateResult {
  return {
    text:
      `🔍 <b>Búsqueda Semántica en SICOES</b>\n\n` +
      `Escribe directamente lo que buscas o usa:\n` +
      `<code>/buscar medicamentos insumos hospital</code>\n` +
      `<code>/buscar electrificacion obras</code>`,
    replyMarkup: { inline_keyboard: [BACK_TO_SICOES_ROW] },
  };
}

export function renderSicoesCuceHint(sampleCuce: string): TemplateResult {
  return {
    text:
      `🆔 <b>Consultar Ficha Oficial por CUCE</b>\n\n` +
      `Envía <code>/cuce</code> seguido del código CUCE de la convocatoria.\n\n` +
      `📌 <b>Ejemplo real en base:</b>\n<code>/cuce ${escHtml(sampleCuce)}</code>`,
    replyMarkup: { inline_keyboard: [BACK_TO_SICOES_ROW] },
  };
}
