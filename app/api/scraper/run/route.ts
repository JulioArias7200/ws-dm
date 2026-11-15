import { NextRequest } from 'next/server';
import { spawn } from 'node:child_process';
import path from 'node:path';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { service, phase = 'test', city = 'lapaz', branch = 'calacoto' } = body;

    let scriptName = 'scraper_hipermaxi.mjs';
    const scriptArgs: string[] = [];

    // Mapeo seguro de servicios a scripts y argumentos (siempre en segundo plano / headless)
    switch (service) {
      case 'sicoes':
        scriptName = 'scraper_sicoes_v2.mjs';
        if (phase === 'test') {
          scriptArgs.push('--pages=1', '--limit=20');
        } else {
          scriptArgs.push('--all-departments', '--auto-sync');
        }
        break;

      case 'hipermaxi-supermercado':
        scriptName = 'scraper_hipermaxi.mjs';
        scriptArgs.push('--service=supermercado');
        if (phase === 'test') {
          scriptArgs.push(`--city=${city}`, `--branch=${branch}`, '--limit=25');
        } else {
          scriptArgs.push('--all-cities', '--all-categories', '--limit=0', '--delay=1500');
        }
        break;

      case 'hipermaxi-farmacia':
        scriptName = 'scraper_hipermaxi.mjs';
        scriptArgs.push('--service=farmacia');
        if (phase === 'test') {
          scriptArgs.push(`--city=${city}`, '--limit=25');
        } else {
          scriptArgs.push('--all-cities', '--all-categories', '--limit=0', '--delay=1500');
        }
        break;

      case 'farmacorp':
        scriptName = 'scraper_farmacorp.mjs';
        if (phase === 'test') {
          scriptArgs.push('--pages=1', '--collection=medicamentos');
        } else {
          scriptArgs.push('--all-pages', '--collection=medicamentos', '--delay=1500');
        }
        break;

      case 'chavez':
        scriptName = 'scraper_chavez.mjs';
        if (phase === 'test') {
          scriptArgs.push('--search=paracetamol', '--limit=20');
        } else {
          scriptArgs.push('--all-categories', '--essentials', '--limit=0', '--delay=1500');
        }
        break;

      case 's3-sync':
        scriptName = 'orchestrate_deep_scraping.mjs';
        scriptArgs.push('--skip-scraping', '--images-only');
        break;

      case 'orchestrator-full':
        scriptName = 'orchestrate_deep_scraping.mjs';
        scriptArgs.push(`--phase=${phase}`, '--target=all');
        break;

      default:
        return new Response(JSON.stringify({ error: `Servicio no reconocido: ${service}` }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
    }

    const scriptPath = path.resolve(process.cwd(), 'scripts', scriptName);

    // Crear un stream de texto SSE para transmitir stdout/stderr en tiempo real
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        const sendEvent = (data: Record<string, unknown>) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        };

        sendEvent({
          type: 'init',
          service,
          script: scriptName,
          args: scriptArgs,
          timestamp: new Date().toISOString(),
          message: `🚀 Iniciando proceso en segundo plano (headless): node scripts/${scriptName} ${scriptArgs.join(' ')}`,
        });

        const child = spawn(process.execPath, [scriptPath, ...scriptArgs], {
          cwd: process.cwd(),
          env: { ...process.env, NODE_ENV: 'production' },
        });

        child.stdout.on('data', (chunk) => {
          const text = chunk.toString();
          const lines = text.split(/\r?\n/).filter(Boolean);
          for (const line of lines) {
            sendEvent({
              type: 'log',
              stream: 'stdout',
              text: line,
              timestamp: new Date().toISOString(),
            });
          }
        });

        child.stderr.on('data', (chunk) => {
          const text = chunk.toString();
          const lines = text.split(/\r?\n/).filter(Boolean);
          for (const line of lines) {
            sendEvent({
              type: 'log',
              stream: 'stderr',
              text: line,
              timestamp: new Date().toISOString(),
            });
          }
        });

        child.on('error', (err) => {
          sendEvent({
            type: 'error',
            error: err.message,
            timestamp: new Date().toISOString(),
          });
          controller.close();
        });

        child.on('close', (exitCode) => {
          sendEvent({
            type: 'done',
            exitCode,
            success: exitCode === 0,
            timestamp: new Date().toISOString(),
            message:
              exitCode === 0
                ? '✅ [PROCESO REALIZADO CORRECTAMENTE] Scraping finalizado y persistido en Neon PostgreSQL.'
                : `⚠️ Proceso terminado con código de salida ${exitCode}.`,
          });
          controller.close();
        });
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
      },
    });
  } catch (err: unknown) {
    const errorAny = err as { digest?: string; message?: string };
    if (errorAny?.digest?.includes('BAILOUT') || String(errorAny?.message).includes('bail out of prerendering')) {
      throw err;
    }
    const message = err instanceof Error ? err.message : 'Error desconocido';
    return new Response(JSON.stringify({ success: false, error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

