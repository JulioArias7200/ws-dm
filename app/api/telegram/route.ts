import { NextRequest, NextResponse } from 'next/server';
import {
  answerCallbackQuery,
  processTelegramCallback,
  processTelegramMessage,
  sendTelegramResponse,
  TELEGRAM_COMMANDS_MENU,
  TelegramUpdate,
} from '@/lib/telegram-service';
import { getAppConfig } from '@/lib/config';

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as TelegramUpdate & { simulate?: boolean };
    const isSimulated = Boolean(body?.simulate);

    // 1. Clic en botón Inline Keyboard (`callback_query`)
    if (body?.callback_query) {
      if (!isSimulated) {
        await answerCallbackQuery(body.callback_query.id);
      }
      const reply = await processTelegramCallback(body);
      let delivered = false;
      if (reply.chatId && reply.text && !isSimulated && reply.chatId !== 777999) {
        delivered = await sendTelegramResponse(
          reply.chatId,
          reply.text,
          reply.replyMarkup,
          reply.messageId
        );
      }
      return NextResponse.json({
        ok: true,
        delivered,
        reply: reply.plainText,
        buttons: reply.replyMarkup?.inline_keyboard?.flat().map((b) => b.text) ?? [],
      });
    }

    // 2. Mensaje de texto, comando / o ubicación GPS (`message`)
    if (!body || !body.message) {
      return NextResponse.json({ ok: true, note: 'No message payload' });
    }

    const reply = await processTelegramMessage(body);
    let delivered = false;

    if (reply.chatId && reply.text && !isSimulated && reply.chatId !== 777999) {
      delivered = await sendTelegramResponse(reply.chatId, reply.text, reply.replyMarkup);
    }

    return NextResponse.json({
      ok: true,
      delivered,
      reply: reply.plainText,
      buttons: reply.replyMarkup?.inline_keyboard?.flat().map((b) => b.text) ?? [],
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error('[API TELEGRAM] Error en webhook:', errorMsg);
    return NextResponse.json({ ok: false, error: errorMsg }, { status: 500 });
  }
}

export async function GET() {
  const { telegramBotToken, neonDatabaseUrl } = getAppConfig();

  return NextResponse.json({
    status: 'online',
    service: 'SICOES-Miner Telegram Webhook',
    bot_configured: Boolean(telegramBotToken),
    neon_configured: Boolean(neonDatabaseUrl),
    commands: TELEGRAM_COMMANDS_MENU,
  });
}
