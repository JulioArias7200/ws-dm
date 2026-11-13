import { escHtml } from './formatters';
import { BACK_TO_HOME_ROW } from './buttons';
import { TemplateResult } from './types';

/**
 * Plantillas visuales para el Menú Principal, bienvenida y comandos de ayuda
 */

export function renderMainMenu(firstName: string): TemplateResult {
  const text =
    `🏛️ <b>Antigravity WS-DM — Minería Web Bolivia 🇧🇴</b>\n` +
    `<i>Plataforma ciudadana de datos públicos en tiempo real</i>\n\n` +
    `Hola <b>${escHtml(firstName || 'Ciudadano')}</b> 👋\n\n` +
    `<blockquote>📌 <b>4 Módulos de Información Oficial:</b>\n` +
    `• SICOES: Licitaciones públicas e IA vectorial (pgvector)\n` +
    `• Canasta: Precios OAP Bolivia vs Supermercados Hipermaxi\n` +
    `• Salud: Hospitales, clínicas y farmacias georreferenciadas (OSM)\n` +
    `• Farmacias: Comparador en vivo Farmacorp vs Farmacias Chávez</blockquote>\n\n` +
    `⬇️ <b>Selecciona el módulo que deseas consultar:</b>`;

  const replyMarkup = {
    inline_keyboard: [
      [
        { text: '🏛️ SICOES Licitaciones', callback_data: 'menu_sicoes' },
        { text: '🛒 Canasta Familiar', callback_data: 'menu_canasta' },
      ],
      [
        { text: '🏥 Centros de Salud (OSM)', callback_data: 'menu_salud' },
        { text: '💊 Farmacias & Precios', callback_data: 'farmacia_buscar_hint' },
      ],
      [{ text: '🌐 Abrir Plataforma Web (Dashboard en Vivo)', url: 'https://ws-dm.vercel.app' }],
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

