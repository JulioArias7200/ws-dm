import { InlineKeyboardButton } from './types';

/**
 * Filas y botones estándar de navegación y retorno del bot
 */

export const BACK_TO_HOME_ROW: InlineKeyboardButton[] = [
  { text: '⬅️ Menú Principal', callback_data: 'menu_home' },
];

export const BACK_TO_SICOES_ROW: InlineKeyboardButton[] = [
  { text: '⬅️ SICOES', callback_data: 'menu_sicoes' },
  { text: '🏠 Menú', callback_data: 'menu_home' },
];

export const BACK_TO_CANASTA_ROW: InlineKeyboardButton[] = [
  { text: '⬅️ Canasta', callback_data: 'menu_canasta' },
  { text: '🏠 Menú', callback_data: 'menu_home' },
];

export const BACK_TO_SALUD_ROW: InlineKeyboardButton[] = [
  { text: '⬅️ Salud', callback_data: 'menu_salud' },
  { text: '🏠 Menú', callback_data: 'menu_home' },
];

