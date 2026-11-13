import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  processTelegramMessage,
  processTelegramCallback,
  type TelegramUpdate,
} from '../lib/telegram-service';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

// Cargar variables de entorno desde .env
const envPath = path.resolve(ROOT_DIR, '.env');
if (fs.existsSync(envPath)) {
  const raw = fs.readFileSync(envPath, 'utf-8');
  for (const line of raw.split(/\r?\n/)) {
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
    if (!match) continue;
    const k = match[1];
    let v = (match[2] || '').trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (!process.env[k]) {
      process.env[k] = v;
    }
  }
}

function fakeMessageUpdate(text?: string, location?: { latitude: number; longitude: number }): TelegramUpdate {
  return {
    update_id: 10001,
    message: {
      message_id: 1,
      from: { id: 99999, is_bot: false, first_name: 'Julio', username: 'julio_dev' },
      chat: { id: 99999, type: 'private', first_name: 'Julio' },
      date: Math.floor(Date.now() / 1000),
      text,
      location,
    },
  };
}

function fakeCallbackUpdate(callbackData: string): TelegramUpdate {
  return {
    update_id: 10002,
    callback_query: {
      id: 'cb_test_01',
      from: { id: 99999, is_bot: false, first_name: 'Julio', username: 'julio_dev' },
      message: {
        message_id: 123,
        chat: { id: 99999, type: 'private' },
      },
      data: callbackData,
    },
  };
}

interface TestReply {
  text: string;
  replyMarkup?: {
    inline_keyboard?: Array<Array<{ text: string; callback_data?: string; url?: string }>>;
  };
}

function logResult(step: string, reply: TestReply) {
  console.log(`\n==================================================`);
  console.log(`🧪 PASO: ${step}`);
  console.log(`--------------------------------------------------`);
  console.log(`📝 TEXTO:\n${reply.text.slice(0, 350)}...`);
  if (reply.replyMarkup?.inline_keyboard) {
    console.log(`\n🔘 BOTONES INLINE:`);
    reply.replyMarkup.inline_keyboard.forEach((row, i) => {
      const labels = row.map((b) => `[${b.text} -> ${b.callback_data || b.url}]`).join(' ');
      console.log(`  Fila ${i + 1}: ${labels}`);
    });
  }
}

async function runTests() {
  console.log('🚀 INICIANDO BATERÍA DE PRUEBAS END-TO-END TELEGRAM BOT');

  // 1. /start
  const rStart = await processTelegramMessage(fakeMessageUpdate('/start'));
  logResult('/start (Menú Principal)', rStart);

  // 2. /sicoes
  const rSicoes = await processTelegramMessage(fakeMessageUpdate('/sicoes'));
  logResult('/sicoes (Menú SICOES con Filtros)', rSicoes);

  // 3. Callback: sicoes_menu_city
  const rSicoesCityMenu = await processTelegramCallback(fakeCallbackUpdate('sicoes_menu_city'));
  logResult('Callback: sicoes_menu_city', rSicoesCityMenu);

  // 4. Callback: sicoes_city:La Paz
  const rSicoesCity = await processTelegramCallback(fakeCallbackUpdate('sicoes_city:La Paz'));
  logResult('Callback: sicoes_city:La Paz', rSicoesCity);

  // 5. Callback: sicoes_desiertas
  const rSicoesDesiertas = await processTelegramCallback(fakeCallbackUpdate('sicoes_desiertas'));
  logResult('Callback: sicoes_desiertas', rSicoesDesiertas);

  // 6. Callback: sicoes_menu_tipo
  const rSicoesTipoMenu = await processTelegramCallback(fakeCallbackUpdate('sicoes_menu_tipo'));
  logResult('Callback: sicoes_menu_tipo', rSicoesTipoMenu);

  // 7. /canasta
  const rCanasta = await processTelegramMessage(fakeMessageUpdate('/canasta'));
  logResult('/canasta (Menú Canasta con Fuentes)', rCanasta);

  // 8. Callback: canasta_menu_fuente
  const rCanastaFuenteMenu = await processTelegramCallback(fakeCallbackUpdate('canasta_menu_fuente'));
  logResult('Callback: canasta_menu_fuente', rCanastaFuenteMenu);

  // 9. Callback: canasta_fuente:hipermaxi
  const rCanastaHipermaxi = await processTelegramCallback(fakeCallbackUpdate('canasta_fuente:hipermaxi'));
  logResult('Callback: canasta_fuente:hipermaxi', rCanastaHipermaxi);

  // 10. Callback: canasta_comparar
  const rCanastaComparar = await processTelegramCallback(fakeCallbackUpdate('canasta_comparar'));
  logResult('Callback: canasta_comparar (Eje Troncal)', rCanastaComparar);

  // 11. /salud
  const rSalud = await processTelegramMessage(fakeMessageUpdate('/salud'));
  logResult('/salud (Menú Salud & Farmacias)', rSalud);

  // 12. Callback: farmacia_cmp_paracetamol
  const rParacetamol = await processTelegramCallback(fakeCallbackUpdate('farmacia_cmp_paracetamol'));
  logResult('Callback: farmacia_cmp_paracetamol (Comparativa Farmacorp vs Chávez)', rParacetamol);

  // 13. Comando: /farmacia ibuprofeno
  const rIbuprofeno = await processTelegramMessage(fakeMessageUpdate('/farmacia ibuprofeno'));
  logResult('Comando: /farmacia ibuprofeno (Comparativa en vivo)', rIbuprofeno);

  // 14. Callback: farmacia_cadena_chavez
  const rChavezCat = await processTelegramCallback(fakeCallbackUpdate('farmacia_cadena_chavez'));
  logResult('Callback: farmacia_cadena_chavez (Catálogo Chávez con Laboratorios)', rChavezCat);

  // 15. Ubicación GPS
  const rGps = await processTelegramMessage(fakeMessageUpdate(undefined, { latitude: -16.505, longitude: -68.13 }));
  logResult('Ubicación GPS (-16.505, -68.130)', rGps);

  console.log('\n==================================================');
  console.log('✅ TODAS LAS PRUEBAS END-TO-END COMPLETADAS EXITOSAMENTE');
  console.log('==================================================');
}

runTests().catch(console.error);
