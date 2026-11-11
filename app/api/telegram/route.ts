import { NextRequest, NextResponse } from 'next/server';
import { processTelegramMessage, sendTelegramResponse, TelegramUpdate } from '@/lib/telegram-service';
import { getAppConfig } from '@/lib/config';

export async function POST(req: NextRequest) {
  try {
    const update = (await req.json()) as TelegramUpdate;

    if (!update || !update.message) {
      return NextResponse.json({ ok: true, note: 'No message payload' });
    }

    const { chatId, text } = await processTelegramMessage(update);

    if (chatId && text) {
      // Intentar enviar respuesta directamente
      await sendTelegramResponse(chatId, text);
    }

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error('[API TELEGRAM] Error en webhook:', errorMsg);
    return NextResponse.json({ ok: false, error: errorMsg }, { status: 500 });
  }
}

export async function GET() {
  const { telegramBotToken } = getAppConfig();
  const configured = Boolean(telegramBotToken);

  return NextResponse.json({
    status: 'online',
    service: 'SICOES-Miner Telegram Webhook',
    bot_configured: configured,
    instructions:
      'Para vincular este webhook con Vercel, ejecuta: https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://<TU-DOMINIO-VERCEL>/api/telegram',
  });
}
