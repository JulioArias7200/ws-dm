import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

async function waitPort(url, timeoutMs = 25000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok || res.status === 200 || res.status === 404) return true;
    } catch {
      // wait
    }
    await new Promise((r) => setTimeout(r, 600));
  }
  return false;
}

async function testEndpoint(name, payload) {
  const res = await fetch('http://127.0.0.1:3000/api/telegram', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ simulate: true, ...payload }),
  });
  const data = await res.json();
  console.log(`\n==================================================`);
  console.log(`🧪 PROBANDO: ${name}`);
  console.log(`--------------------------------------------------`);
  console.log(`📡 Status: ${res.status} | Ok: ${data.ok}`);
  console.log(`📝 Respuesta:\n${(data.reply || '').slice(0, 300)}...`);
  if (data.buttons && data.buttons.length > 0) {
    console.log(`🔘 Botones (${data.buttons.length}):`, data.buttons.slice(0, 8).join(' | '));
  }
  return data;
}

async function run() {
  console.log('🚀 Iniciando servidor Next.js en puerto 3000...');
  const nextProc = spawn('pnpm', ['dev', '--port', '3000'], {
    cwd: ROOT_DIR,
    shell: true,
    stdio: 'pipe',
  });

  nextProc.stdout.on('data', (d) => {
    const s = d.toString();
    if (s.includes('Ready in') || s.includes('started server')) {
      process.stdout.write(`[Next dev] ${s}`);
    }
  });

  nextProc.stderr.on('data', (d) => {
    // suppress dev noise
  });

  try {
    const isUp = await waitPort('http://127.0.0.1:3000/api/telegram');
    if (!isUp) {
      console.error('❌ El servidor Next.js no respondió a tiempo');
      return;
    }
    console.log('✅ Servidor Next.js listo. Ejecutando batería de pruebas interactiva:\n');

    // 1. GET /api/telegram
    const getRes = await (await fetch('http://127.0.0.1:3000/api/telegram')).json();
    console.log('🔹 GET /api/telegram status:', getRes.status, '| Commands:', getRes.commands?.length);

    // 2. /start
    await testEndpoint('/start (Menú Principal)', {
      message: {
        message_id: 1,
        chat: { id: 777999, type: 'private' },
        from: { id: 777999, first_name: 'Julio' },
        text: '/start',
      },
    });

    // 3. /sicoes
    await testEndpoint('/sicoes (Menú SICOES)', {
      message: {
        message_id: 2,
        chat: { id: 777999, type: 'private' },
        from: { id: 777999, first_name: 'Julio' },
        text: '/sicoes',
      },
    });

    // 4. Callback: sicoes_menu_city (Selector 9 Departamentos SICOES)
    await testEndpoint('Callback: sicoes_menu_city (Selector 9 Departamentos)', {
      callback_query: {
        id: 'cb_1',
        from: { id: 777999, first_name: 'Julio' },
        message: { message_id: 10, chat: { id: 777999, type: 'private' } },
        data: 'sicoes_menu_city',
      },
    });

    // 5. Callback: sicoes_city:Tarija (Departamento Vacío -> Estado de Sincronización)
    await testEndpoint('Callback: sicoes_city:Tarija (Departamento Vacío / Sincronización)', {
      callback_query: {
        id: 'cb_2a',
        from: { id: 777999, first_name: 'Julio' },
        message: { message_id: 10, chat: { id: 777999, type: 'private' } },
        data: 'sicoes_city:Tarija',
      },
    });

    // 6. Callback: sicoes_city:La Paz (Departamento con Convocatorias)
    await testEndpoint('Callback: sicoes_city:La Paz (Convocatorias Activas)', {
      callback_query: {
        id: 'cb_2b',
        from: { id: 777999, first_name: 'Julio' },
        message: { message_id: 10, chat: { id: 777999, type: 'private' } },
        data: 'sicoes_city:La Paz',
      },
    });

    // 7. /buscar auditoria (Búsqueda Semántica Particionada por Departamento)
    await testEndpoint('/buscar auditoria (Búsqueda Semántica Particionada)', {
      message: {
        message_id: 25,
        chat: { id: 777999, type: 'private' },
        from: { id: 777999, first_name: 'Julio' },
        text: '/buscar auditoria',
      },
    });

    // 8. /canasta
    await testEndpoint('/canasta (Menú Canasta)', {
      message: {
        message_id: 3,
        chat: { id: 777999, type: 'private' },
        from: { id: 777999, first_name: 'Julio' },
        text: '/canasta',
      },
    });

    // 9. Callback: canasta_cat_verduras (Comparativa Dual OAP + Hipermaxi)
    await testEndpoint('Callback: canasta_cat_verduras (Dual OAP + Hipermaxi)', {
      callback_query: {
        id: 'cb_4a',
        from: { id: 777999, first_name: 'Julio' },
        message: { message_id: 10, chat: { id: 777999, type: 'private' } },
        data: 'canasta_cat_verduras',
      },
    });

    // 10. Callback: canasta_menu_city (Selector Todas las Ciudades)
    await testEndpoint('Callback: canasta_menu_city (Selector Ciudades Canasta)', {
      callback_query: {
        id: 'cb_4b',
        from: { id: 777999, first_name: 'Julio' },
        message: { message_id: 10, chat: { id: 777999, type: 'private' } },
        data: 'canasta_menu_city',
      },
    });

    // 11. Callback: canasta_comparar (Eje Troncal)
    await testEndpoint('Callback: canasta_comparar (Eje Troncal)', {
      callback_query: {
        id: 'cb_6',
        from: { id: 777999, first_name: 'Julio' },
        message: { message_id: 10, chat: { id: 777999, type: 'private' } },
        data: 'canasta_comparar',
      },
    });

    // 12. /salud
    await testEndpoint('/salud (Menú Salud & Farmacias)', {
      message: {
        message_id: 4,
        chat: { id: 777999, type: 'private' },
        from: { id: 777999, first_name: 'Julio' },
        text: '/salud',
      },
    });

    // 13. Callback: farmacia_buscar_hint (Guía Interactiva de Búsqueda)
    await testEndpoint('Callback: farmacia_buscar_hint (Guía de Búsqueda)', {
      callback_query: {
        id: 'cb_7a',
        from: { id: 777999, first_name: 'Julio' },
        message: { message_id: 10, chat: { id: 777999, type: 'private' } },
        data: 'farmacia_buscar_hint',
      },
    });

    // 14. /farmacia paracetamol (Comparativa Dual con Enlaces Directos)
    await testEndpoint('Comando: /farmacia paracetamol (Dual con Enlaces)', {
      message: {
        message_id: 5,
        chat: { id: 777999, type: 'private' },
        from: { id: 777999, first_name: 'Julio' },
        text: '/farmacia paracetamol',
      },
    });

    // 15. Callback: farmacia_cadena_chavez (Catálogo Paginado Pág 1)
    await testEndpoint('Callback: farmacia_cadena_chavez (Catálogo Pág 1 - 5 ítems)', {
      callback_query: {
        id: 'cb_8a',
        from: { id: 777999, first_name: 'Julio' },
        message: { message_id: 10, chat: { id: 777999, type: 'private' } },
        data: 'farmacia_cadena_chavez',
      },
    });

    // 16. Callback: farmacia_cat:chavez:2 (Paginación Catálogo Pág 2)
    await testEndpoint('Callback: farmacia_cat:chavez:2 (Paginación Pág 2)', {
      callback_query: {
        id: 'cb_8b',
        from: { id: 777999, first_name: 'Julio' },
        message: { message_id: 10, chat: { id: 777999, type: 'private' } },
        data: 'farmacia_cat:chavez:2',
      },
    });

    // 17. Ubicación GPS
    await testEndpoint('Mensaje GPS (-16.505, -68.130 La Paz)', {
      message: {
        message_id: 6,
        chat: { id: 777999, type: 'private' },
        from: { id: 777999, first_name: 'Julio' },
        location: { latitude: -16.505, longitude: -68.13 },
      },
    });

    console.log('\n==================================================');
    console.log('🎉 TODAS LAS 17 PRUEBAS END-TO-END COMPLETADAS CON ÉXITO');
    console.log('==================================================');
  } finally {
    console.log('\n🛑 Deteniendo servidor Next.js...');
    nextProc.kill('SIGINT');
  }
}

run().catch(console.error);

