/**
 * Registra el menú oficial de comandos (setMyCommands) y vincula el webhook de
 * Telegram (setWebhook) hacia Vercel (/api/telegram).
 *
 * Uso: node scripts/setup-telegram.mjs [https://tu-dominio.vercel.app]
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

function loadTelegramToken() {
  let token = process.env.TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_BOT || '';
  const envPath = path.join(ROOT_DIR, '.env');
  if (!token && fs.existsSync(envPath)) {
    const raw = fs.readFileSync(envPath, 'utf8');
    token = raw.match(/^(?:TELEGRAM_BOT_TOKEN|TELEGRAM_BOT)\s*=\s*(.+)$/m)?.[1]?.trim() || '';
    if ((token.startsWith('"') && token.endsWith('"')) || (token.startsWith("'") && token.endsWith("'"))) {
      token = token.slice(1, -1).trim();
    }
  }
  if (!token) throw new Error('TELEGRAM_BOT no configurado en .env o entorno.');
  return token;
}

const COMMANDS = [
  { command: 'start', description: 'Información del bot y guía de comandos' },
  { command: 'sicoes', description: 'Módulo SICOES: licitaciones La Paz e IA' },
  { command: 'canasta', description: 'Módulo Canasta Familiar (precios OAP)' },
  { command: 'salud', description: 'Módulo Centros de Salud y GPS (La Paz)' },
];

async function tgCall(token, method, body) {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: body ? 'POST' : 'GET',
    signal: AbortSignal.timeout(15000),
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
}

async function main() {
  const token = loadTelegramToken();
  const baseUrl = (process.argv[2] || 'https://ws-dm.vercel.app').replace(/\/+$/, '');
  const webhookUrl = `${baseUrl}/api/telegram`;

  const me = await tgCall(token, 'getMe');
  console.log('🤖 Bot:', me.result?.username, `(${me.result?.id})`);

  const cmdsRes = await tgCall(token, 'setMyCommands', { commands: COMMANDS });
  console.log('📌 setMyCommands:', cmdsRes);

  const menuBtnRes = await tgCall(token, 'setChatMenuButton', {
    menu_button: { type: 'commands' },
  });
  console.log('🍔 setChatMenuButton:', menuBtnRes);

  const currentMenuBtn = await tgCall(token, 'getChatMenuButton');
  console.log('ℹ️ getChatMenuButton:', currentMenuBtn);

  const hookRes = await tgCall(token, 'setWebhook', {
    url: webhookUrl,
    allowed_updates: ['message', 'callback_query'],
  });
  console.log('🔗 setWebhook:', hookRes);

  const info = await tgCall(token, 'getWebhookInfo');
  console.log('ℹ️ getWebhookInfo:', info.result);
}

main().catch((err) => {
  console.error('❌ Error configurando Telegram:', err);
  process.exit(1);
});

