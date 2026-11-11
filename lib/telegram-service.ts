import { hybridSearch, getConvocatorias, getConvocatoriaByCuce, getDashboardMetrics, logUsage } from './db';
import { askLlama } from './nvidia-ai';
import { getAppConfig } from './config';

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
  };
}

/**
 * Procesa un mensaje entrante de Telegram y devuelve la respuesta
 */
export async function processTelegramMessage(update: TelegramUpdate): Promise<{ chatId: number; text: string }> {
  const startTime = Date.now();
  const msg = update.message;

  if (!msg || !msg.text) {
    return { chatId: 0, text: '' };
  }

  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const username = msg.from.username || msg.from.first_name;
  const rawText = msg.text.trim();

  let responseText = '';
  let matchedCuce: string | undefined = undefined;

  try {
    // 1. Comando /start o /help
    if (rawText === '/start' || rawText === '/help') {
      responseText = `🏛️ **¡Bienvenido a SICOES-Miner La Paz!**\n\n` +
        `Sistema inteligente de minería web, búsqueda semántica y seguimiento de contrataciones del Estado en La Paz.\n\n` +
        `📌 **Comandos Disponibles:**\n` +
        `🔍 \`/buscar <términos>\` - Búsqueda semántica por perfil o rubro (ej. \`/buscar bases de datos postgresql\`).\n` +
        `🟢 \`/vigentes\` - Licitaciones abiertas con fecha límite próxima.\n` +
        `🔴 \`/cerradas\` - Histórico de licitaciones adjudicadas o desiertas.\n` +
        `📋 \`/cuce <codigo>\` - Ficha completa de una convocatoria oficial.\n` +
        `🏆 \`/entidades_top\` - Ranking de instituciones públicas según **PageRank**.\n` +
        `🌟 \`/hubs_authorities\` - Análisis **HITS** (Grandes Contratadores vs Rubros Clave).\n` +
        `📊 \`/stats\` - Estadísticas de uso y telemetría en tiempo real.\n\n` +
        `💡 *También puedes escribir directamente en lenguaje natural qué trabajo o licitación buscas.*`;
    }
    // 2. Comando /vigentes
    else if (rawText === '/vigentes') {
      const items = await getConvocatorias({ estado: 'VIGENTE', limit: 4 });
      responseText = `🟢 **Licitaciones VIGENTES en La Paz (${items.length} encontradas):**\n\n`;
      for (const item of items) {
        const fechaFin = new Date(item.fecha_presentacion).toLocaleDateString('es-BO', {
          day: '2-digit',
          month: 'short',
          hour: '2-digit',
          minute: '2-digit',
        });
        responseText += `📄 **CUCE:** \`${item.cuce}\`\n` +
          `🏢 **Entidad:** ${item.entidad}\n` +
          `💰 **Presupuesto:** Bs ${Number(item.monto_referencial_bs).toLocaleString('es-BO')}\n` +
          `⏳ **Límite:** ${fechaFin}\n` +
          `📝 **Objeto:** ${item.objeto.slice(0, 110)}...\n` +
          `🔗 [Ver Pliego SICOES](${item.pliego_url})\n\n`;
      }
    }
    // 3. Comando /cerradas
    else if (rawText === '/cerradas') {
      const items = await getConvocatorias({ estado: 'ADJUDICADA', limit: 3 });
      responseText = `🔴 **Licitaciones CERRADAS / ADJUDICADAS Recientes:**\n\n`;
      for (const item of items) {
        responseText += `📄 **CUCE:** \`${item.cuce}\`\n` +
          `🏢 **Entidad:** ${item.entidad}\n` +
          `🏆 **Adjudicado a:** ${item.adjudicatario || 'Empresa Adjudicada'}\n` +
          `💵 **Monto Final:** Bs ${Number(item.monto_adjudicado_bs || item.monto_referencial_bs).toLocaleString('es-BO')}\n` +
          `📝 **Objeto:** ${item.objeto.slice(0, 100)}...\n\n`;
      }
    }
    // 4. Comando /cuce <codigo>
    else if (rawText.startsWith('/cuce')) {
      const parts = rawText.split(/\s+/);
      const cuceTarget = parts[1];
      if (!cuceTarget) {
        responseText = `⚠️ Por favor indica el código CUCE. Ejemplo: \`/cuce 24-0412-00-149021-1-1\``;
      } else {
        const item = await getConvocatoriaByCuce(cuceTarget);
        if (!item) {
          responseText = `❌ No se encontró ninguna convocatoria con el CUCE \`${cuceTarget}\`.`;
        } else {
          matchedCuce = item.cuce;
          const pub = new Date(item.fecha_publicacion).toLocaleDateString('es-BO');
          const pres = new Date(item.fecha_presentacion).toLocaleString('es-BO');
          responseText = `📋 **FICHA TÉCNICA OFICIAL SICOES**\n\n` +
            `🆔 **CUCE:** \`${item.cuce}\`\n` +
            `🏛️ **Entidad:** ${item.entidad} (${item.tipo_entidad})\n` +
            `📌 **Estado:** ${item.estado}\n` +
            `🏷️ **Modalidad:** ${item.modalidad} ${item.subasta ? '(Con Subasta)' : ''}\n` +
            `💰 **Monto Referencial:** Bs ${Number(item.monto_referencial_bs).toLocaleString('es-BO')}\n` +
            `📅 **Fecha Inicio (Publicación):** ${pub}\n` +
            `⏰ **Fecha Fin (Presentación):** ${pres}\n` +
            `📝 **Objeto de Contratación:**\n${item.objeto}\n\n` +
            (item.adjudicatario ? `🏆 **Ganador:** ${item.adjudicatario}\n` : '') +
            `🌐 [Descargar Pliego DBC / Formulario 100](${item.pliego_url})`;
        }
      }
    }
    // 5. Comando /entidades_top (PageRank)
    else if (rawText === '/entidades_top') {
      const metrics = await getDashboardMetrics();
      responseText = `🏆 **Top Entidades Estatales en La Paz (Ranking PageRank):**\n\n` +
        `El algoritmo **PageRank (d=0.85)** pondera la solvencia, centralidad y volumen de publicación en la red estatal:\n\n`;
      metrics.topPageRank.slice(0, 5).forEach((node, idx) => {
        responseText += `${idx + 1}. **${node.label}**\n` +
          `   ⭐ **PageRank:** \`${node.pageRank}\` | 📥 Entrantes: ${node.inDegree} | 📤 Salientes: ${node.outDegree}\n\n`;
      });
    }
    // 6. Comando /hubs_authorities (HITS)
    else if (rawText === '/hubs_authorities') {
      const metrics = await getDashboardMetrics();
      responseText = `🌟 **Análisis HITS de Kleinberg (Hubs vs Authorities):**\n\n` +
        `🏢 **Top Hubs (Entidades Concentradoras de Licitaciones):**\n`;
      metrics.topHubs.slice(0, 3).forEach((n, i) => {
        responseText += `${i + 1}. ${n.label} (Score: \`${n.hubScore}\`)\n`;
      });
      responseText += `\n🎯 **Top Authorities (Rubros Profesionales Más Demandados):**\n`;
      metrics.topAuthorities.slice(0, 3).forEach((n, i) => {
        responseText += `${i + 1}. ${n.label} (Score: \`${n.authorityScore}\`)\n`;
      });
    }
    // 7. Comando /stats
    else if (rawText === '/stats') {
      const metrics = await getDashboardMetrics();
      responseText = `📊 **Estadísticas de Minería Web y Telemetría:**\n\n` +
        `📂 **Total Convocatorias Indexadas:** ${metrics.totalConvocatorias}\n` +
        `🟢 **Vigentes:** ${metrics.vigentes} | 🔴 **Adjudicadas:** ${metrics.adjudicadas}\n` +
        `💵 **Monto Total Licitado:** Bs ${metrics.montoTotalLicitado.toLocaleString('es-BO')}\n` +
        `🕸️ **Nodos en el Grafo:** ${metrics.totalNodosGrafo} | 🔗 **Aristas:** ${metrics.totalAristasGrafo}\n` +
        `📈 **Densidad de la Red:** \`${metrics.graphDensity} Δ\`\n` +
        `💬 **Consultas Ciudadanas Registradas:** ${metrics.totalConsultasTelegram}`;
    }
    // 8. Búsqueda Semántica Híbrida (por defecto o /buscar)
    else {
      const querySearch = rawText.startsWith('/buscar') ? rawText.replace('/buscar', '').trim() : rawText;
      const results = await hybridSearch(querySearch, undefined, { limit: 3 });

      if (results.length === 0) {
        responseText = `🔍 No se encontraron licitaciones coincidentes con *"${querySearch}"*.\n\nIntenta con términos más generales como *sistemas, auditoría, consultoría o mantenimiento*.`;
      } else {
        matchedCuce = results[0]?.cuce;
        const contextForLlama = results
          .map(
            (r) =>
              `- CUCE: ${r.cuce} | Entidad: ${r.entidad} | Monto: Bs ${r.monto_referencial_bs} | Fin: ${new Date(r.fecha_presentacion).toLocaleDateString('es-BO')} | Objeto: ${r.objeto}`
          )
          .join('\n');

        const llamaSummary = await askLlama(querySearch, contextForLlama);

        responseText = `🎯 **Resultados para:** *"${querySearch}"*\n\n` +
          `${llamaSummary}\n\n` +
          `📌 *Tip: Usa \`/cuce <id>\` para ver el pliego completo o \`/vigentes\` para ver convocatorias abiertas.*`;
      }
    }
  } catch (err) {
    console.error('[TELEGRAM SERVICE] Error procesando mensaje:', err);
    responseText = `⚠️ Ocurrió un inconveniente al procesar tu solicitud. Por favor intenta de nuevo en unos momentos.`;
  }

  const duration = Date.now() - startTime;

  // Registrar en Web Usage Mining
  await logUsage({
    telegram_user_id: userId,
    username,
    query_text: rawText,
    matched_cuce: matchedCuce,
    response_time_ms: duration,
  });

  return { chatId, text: responseText };
}

/**
 * Enviar mensaje directo a Telegram mediante HTTP API
 */
export async function sendTelegramResponse(chatId: number, text: string): Promise<boolean> {
  const { telegramBotToken } = getAppConfig();
  if (!telegramBotToken || !chatId) return false;

  const url = `https://api.telegram.org/bot${telegramBotToken}/sendMessage`;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'Markdown',
        disable_web_page_preview: true,
      }),
    });
    return res.ok;
  } catch (err) {
    console.warn('[TELEGRAM SERVICE] Error al enviar mensaje a Telegram (posible sandbox offline):', err);
    return false;
  }
}

