import fs from 'fs';
import path from 'path';

export interface AppConfig {
  telegramBotToken: string;
  neonDatabaseUrl: string;
  nvidiaApiKey: string;
  databaseName: string;
}

let cachedConfig: AppConfig | null = null;

export function getAppConfig(): AppConfig {
  if (cachedConfig) return cachedConfig;

  let telegramBotToken = process.env.TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_BOT || '';
  let neonDatabaseUrl = process.env.NEON_DB || process.env.DATABASE_URL || '';
  let nvidiaApiKey = process.env.nvidiaApiKey || process.env.NVIDIA_API_KEY || '';
  let databaseName = process.env.DB || 'WS-DM';

  // Si no están en process.env, leer de forma segura el archivo .env local
  try {
    const envPath = path.resolve(process.cwd(), '.env');
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf8');
      const lines = content.split('\n');

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;

        // Caso: TELEGRAM_BOT:token
        if (trimmed.startsWith('TELEGRAM_BOT:') && !telegramBotToken) {
          telegramBotToken = trimmed.replace('TELEGRAM_BOT:', '').trim();
        }

        // Caso: KEY = VALUE o KEY=VALUE
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx !== -1) {
          const key = trimmed.slice(0, eqIdx).trim();
          let val = trimmed.slice(eqIdx + 1).trim();
          // Remover comillas envolventes simples o dobles
          if ((val.startsWith("'") && val.endsWith("'")) || (val.startsWith('"') && val.endsWith('"'))) {
            val = val.slice(1, -1).trim();
          }

          if ((key === 'NEON_DB' || key === 'DATABASE_URL') && !neonDatabaseUrl) {
            neonDatabaseUrl = val;
          } else if ((key === 'nvidiaApiKey' || key === 'NVIDIA_API_KEY') && !nvidiaApiKey) {
            nvidiaApiKey = val;
          } else if (key === 'DB') {
            databaseName = val;
          } else if (key === 'TELEGRAM_BOT_TOKEN' && !telegramBotToken) {
            telegramBotToken = val;
          }
        }
      }
    }
  } catch (err) {
    console.warn('[CONFIG] Advertencia al leer .env:', err);
  }

  cachedConfig = {
    telegramBotToken,
    neonDatabaseUrl,
    nvidiaApiKey,
    databaseName,
  };

  return cachedConfig;
}

