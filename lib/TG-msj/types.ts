/**
 * Tipos e interfaces canónicas para el protocolo de Telegram y templates de mensajes
 */

export interface InlineKeyboardButton {
  text: string;
  callback_data?: string;
  url?: string;
}

export interface ReplyMarkup {
  inline_keyboard?: InlineKeyboardButton[][];
}

export interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    from?: {
      id: number;
      is_bot: boolean;
      first_name: string;
      username?: string;
    };
    chat: {
      id: number;
      first_name?: string;
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
    from?: {
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

export interface TemplateResult {
  text: string;
  replyMarkup?: ReplyMarkup;
  matchedCuce?: string;
}

