import { escHtml } from './formatters';
import { BACK_TO_HOME_ROW } from './buttons';
import { TemplateResult } from './types';

/**
 * Plantillas visuales para el Menú Principal, bienvenida y comandos de ayuda
 */

export function renderMainMenu(firstName: string): TemplateResult {
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

  const replyMarkup = {
    inline_keyboard: [
      [
        { text: '🏛️ SICOES — Licitaciones e IA', callback_data: 'menu_sicoes' },
      ],
      [
        { text: '🛒 Canasta Familiar', callback_data: 'menu_canasta' },
        { text: '🏥 Centros de Salud', callback_data: 'menu_salud' },
      ],
      [{ text: '🌐 Abrir Plataforma Web', url: 'https://ws-dm.vercel.app' }],
    ],
  };

  return { text, replyMarkup };
}

export function renderHelpMessage(): TemplateResult {
  const text =
    `❓ <b>Guía Rápida de Comandos — Antigravity WS-DM</b> 🇧🇴\n\n` +
    `<b>🏛️ Módulo SICOES:</b>\n` +
    `• <code>/sicoes</code> — Panel interactivo de contrataciones\n` +
    `• <code>/vigentes</code> | <code>/cerradas</code> | <code>/desiertas</code>\n` +
    `• <code>/cuce &lt;código&gt;</code> — Ficha técnica oficial\n` +
    `• <code>/buscar &lt;texto&gt;</code> — Búsqueda semántica con IA pgvector\n` +
    `• <code>/stats</code> — Estadísticas en vivo de la base de datos\n\n` +
    `<b>🛒 Canasta Familiar:</b>\n` +
    `• <code>/canasta</code> — Menú de precios por rubros\n` +
    `• <code>/canasta &lt;producto&gt;</code> — Ej: <code>/canasta arroz</code>\n\n` +
    `<b>🏥 Salud & Farmacias:</b>\n` +
    `• <code>/salud</code> — Menú médico y GPS\n` +
    `• <code>/farmacia &lt;fármaco&gt;</code> — Comparador Farmacorp vs Chávez\n` +
    `• Envía tu 📍 <b>ubicación GPS</b> para ver centros cercanos.`;

  return { text, replyMarkup: { inline_keyboard: [BACK_TO_HOME_ROW] } };
}

export function renderUnknownCommand(cmd: string): TemplateResult {
  return {
    text: `❓ Comando <code>${escHtml(cmd)}</code> no reconocido. Usa <code>/start</code> para abrir el menú principal.`,
    replyMarkup: { inline_keyboard: [BACK_TO_HOME_ROW] },
  };
}

