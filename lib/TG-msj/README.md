# 📱 Documentación de Arquitectura y Plantillas: `ws-dm/lib/TG-msj/`

Este directorio encapsula de forma modular y desacoplada **toda la capa de presentación visual, formateo de texto HTML y diseño de teclados en línea (Inline Keyboards)** para el bot de Telegram `@ChatDM7200bot` de la plataforma **Antigravity WS-DM (Minería Web Bolivia)**.

---

## 1. 🏛️ Principios de Arquitectura e Ingeniería de Software

### 1.1. Separación Estricta de Responsabilidades (SRP & MVC Pattern)
* **Capa de Control / Enrutamiento (`telegram-service.ts`):** Actúa como el **Controlador**. Recibe los webhooks de Telegram, extrae comandos o callbacks, consulta la base de datos o APIs externas y delega la construcción de la respuesta a las plantillas. **No contiene cadenas HTML ni arrays de botones inline embebidos.**
* **Capa de Presentación (`lib/TG-msj/`):** Actúa como la **Vista**. Contiene funciones puras que reciben datos tipados y devuelven un objeto `TemplateResult` (`{ text: string, replyMarkup?: ReplyMarkup }`).
* **Capa de Modelo / Datos (`lib/db.ts` y `lib/canasta-salud.ts`):** Gestiona la conexión y consultas a Neon PostgreSQL, vectores semánticos con NVIDIA NIM y georreferenciación.

### 1.2. Principio de Consulta y Muestreo Rápido (Read-Only Fast Sampling)
El bot de Telegram opera estrictamente como una interfaz de **consulta y muestreo ultrarrápido (< 100 ms)**. **Jamás ejecuta scrapers ni navegadores headless Chromium en tiempo real** dentro de los webhooks de Telegram, evitando timeouts en serverless (Vercel) y peticiones duplicadas. Todo el scraping se realiza de forma desacoplada desde el entorno local/ETL hacia Neon PostgreSQL.

---

## 2. 📁 Estructura y Distribución de Archivos

```
ws-dm/lib/TG-msj/
├── index.ts              # Barrel exporter: re-exporta toda la API pública de plantillas
├── types.ts              # Tipos canónicos de la API de Telegram y resultados de templates
├── formatters.ts         # Sanitización HTML, fechas bolivianas y parseo de comandos
├── buttons.ts            # Teclados y filas de navegación/retorno compartidas
├── main.template.ts      # Pantallas de bienvenida (/start), ayuda (/help) y comandos desconocidos
├── sicoes.template.ts    # Licitaciones SICOES, selector de 9 departamentos, IA semántica y grafos
├── canasta.template.ts   # Canasta familiar dual (OAP vs Hipermaxi), selector de ciudades y Eje Troncal
├── salud.template.ts     # Directorio OSM, guía de búsqueda, comparador con enlaces y catálogo paginado
└── README.md             # Esta documentación técnica
```

---

## 3. 🧩 Detalle por Componente

### 3.1. `types.ts`
Define los contratos de interfaz necesarios para interactuar con la Bot API de Telegram sin dependencias externas pesadas:
* `InlineKeyboardButton`: Representa un botón en línea con texto y `callback_data` o `url`.
* `ReplyMarkup`: Contenedor de la matriz de botones (`inline_keyboard: InlineKeyboardButton[][]`).
* `TelegramUpdate`: Estructura del payload JSON recibido en el webhook de Telegram (mensajes, callback queries, coordenadas GPS).
* `BotReply`: Respuesta despachada al usuario (`chatId`, `text`, `replyMarkup`, `parseMode`).
* `TemplateResult`: Salida estándar de cada función de plantilla (`text`, `replyMarkup?`, `matchedCuce?`).

### 3.2. `formatters.ts`
Provee utilidades de seguridad y parseo:
* `escHtml(str: string): string`: Sanitiza caracteres especiales (`&`, `<`, `>`, `"`) para evitar errores de parseo en el motor HTML de Telegram (`parse_mode: 'HTML'`).
* `htmlToPlainText(html: string): string`: Elimina etiquetas HTML preservando saltos de línea para logs limpios en consola.
* `formatDateBo(dateStr, fallback?): string`: Formatea fechas ISO a formato boliviano legible (`DD/MM/AAAA`).
* `parseCommand(text: string)`: Extrae limpiamente el comando (`/sicoes`, `/canasta`, `/farmacia`) y sus argumentos ignorando menciones de bots (`@ChatDM7200bot`).

### 3.3. `buttons.ts`
Centraliza los botones de navegación estándar para mantener coherencia en toda la experiencia de usuario:
* `BACK_TO_HOME_ROW`: Fila interactiva para volver al inicio `[🏠 Menú Principal]`.
* `BACK_TO_SICOES_ROW`: `[⬅️ Volver a SICOES]` + `[🏠 Menú Principal]`.
* `BACK_TO_CANASTA_ROW`: `[⬅️ Volver a Canasta]` + `[🏠 Menú Principal]`.
* `BACK_TO_SALUD_ROW`: `[⬅️ Volver a Salud]` + `[🏠 Menú Principal]`.

### 3.4. `main.template.ts`
Gestiona la puerta de entrada al bot:
* `renderMainMenu(firstName)`:
  * **Ergonomía UI/UX:** Cuadrícula simétrica 2x2 para los 4 pilares temáticos:
    * `[🏛️ SICOES Licitaciones]` | `[🛒 Canasta Familiar]`
    * `[🏥 Centros de Salud (OSM)]` | `[💊 Farmacias & Precios]`
  * Botón extendido de ancho completo: `[🌐 Abrir Plataforma Web (Dashboard en Vivo)]`.
* `renderHelpMessage()`: Resumen contextual de todos los comandos disponibles por sector.
* `renderUnknownCommand(cmd)`: Notificación ergonómica ante comandos no registrados con atajo a `/start`.

### 3.5. `sicoes.template.ts`
Presentación de contrataciones públicas del Estado boliviano:
* `renderSicoesMenu(city, tipo)`:
  * **Hero CTA:** Botón superior de 100% de ancho `[🟢 Licitaciones Vigentes (Convocatorias Abiertas)]`.
  * Pares lógicos: `[🔴 Cerradas] [❌ Desiertas]`, `[🔍 Búsqueda IA] [🆔 Ficha CUCE]`, `[🌆 Ciudad ▾] [📋 Rubro ▾]`, `[🏆 PageRank] [📊 Estadísticas]`.
* `renderSicoesCityMenu()`: Selector con los **9 departamentos de Bolivia** (La Paz, Santa Cruz, Cochabamba, Oruro, Potosí, Chuquisaca, Tarija, Beni, Pando) + opción Nacional.
* `renderSicoesDepartmentEmpty(depto, deptoCode)`:
  * Se activa cuando un departamento tiene 0 registros locales.
  * Muestra una pantalla explicativa indicando que el departamento está en cola de sincronización central y ofrece botones directos para ver **Convocatorias Nacionales** o **Elegir otro Departamento**.
* `renderSicoesSemanticResults(query, summary, results)`:
  * **Particionamiento Geográfico:** Agrupa las convocatorias resultantes por departamento (`📍 LA PAZ (X convocatorias)`, `📍 SANTA CRUZ (Y convocatorias)`).
  * Incluye porcentaje de similitud coseno (`% cos`), objeto truncado a 90 caracteres y enlace directo a la Ficha Oficial en SICOES.
* `renderCuceFicha(item)`: Ficha técnica detallada con CUCE, entidad, monto referencial, fechas límites, pliego y contacto.
* `renderGraphMetrics(metrics, mode)`: Visualización de métricas de minería de grafos (PageRank y HITS de Kleinberg para entidades y rubros).

### 3.6. `canasta.template.ts`
Presentación del monitoreo de precios de alimentos:
* `renderCanastaMenu(city, fuente)`: Menú de categorías estructurado en pares simétricos (`[🥔 Verduras y Tubérculos] [🍗 Carnes y Pollo]`, `[🌾 Abarrotes y Aceite] [🥛 Lácteos y Derivados]`).
* `renderCanastaCityMenu()`: Selector con todas las plazas disponibles (La Paz, Santa Cruz, Cochabamba, El Alto, Eje Troncal).
* `renderCanastaItems(items, options)`:
  * **Integración Dual Obligatoria:** Agrupa automáticamente los productos para contrastar en una sola vista:
    * `🏪 OAP Mercados: Bs X.XX / Unidad`
    * `🛒 Hipermaxi Super: Bs Y.YY / Unidad`
    * `📊 Brecha: ±Bs Z.ZZ (±W.W% en supermercado)`
* `renderCanastaEjeComparativa(comp)`: Matriz comparativa de precios entre las capitales del Eje Troncal (LPZ vs CBB vs SCZ).
* `renderCanastaSyncResult(sync)`: Reporte de ingesta del Observatorio Agroambiental y Productivo (OAP).

### 3.7. `salud.template.ts`
Presentación de centros de salud y precios de farmacias:
* `renderSaludMenu()`:
  * Erradicación de botones fijos irrelevantes (Paracetamol / Ibuprofeno).
  * Hero CTA de geolocalización: `[🧭 Centros de Salud Cercanos (GPS)]`.
  * Botón interactivo de búsqueda asistida: `[🔍 Buscar Medicamento (/farmacia)]`.
  * Acceso directo a catálogos por cadena: `[🟢 Catálogo Farmacorp] [🔵 Catálogo Chávez]`.
* `renderFarmaciaBuscarHint()`: Mensaje interactivo y formativo con ejemplos de sintaxis (`/farmacia paracetamol`, `/farmacia amoxicilina 500`).
* `renderCentrosSaludList(items, options)`: Despliega hospitales, postas y farmacias físicas (OSM) con cálculo de distancia geodésica (Haversine en km), dirección, horarios y enlace a Google Maps.
* `renderMedicamentosComparativa(query, comp)`:
  * Comparador en vivo entre **Farmacorp** y **Farmacias Chávez**.
  * Cuadro de resumen de oportunidad con cálculo de ahorro potencial.
  * Opciones encontradas con insignia de cadena, laboratorio/marca, presentación, precio en Bs y **enlaces directos oficiales de compra** (`🔗 Ver en Farmacorp` / `🔗 Ver en Farmacias Chávez`).
* `renderMedicamentosCatalogoPaginado(cadena, items, page, totalPages, totalCount)`:
  * **Paginación Antidesborde:** Despliega exactamente 5 ítems por página con enlaces y laboratorios.
  * Teclado interactivo de paginación: `[◀️ Anterior] [Pág X/Y] [Siguiente ▶️]`.

---

## 4. 🎨 Principios de Diseño Ergonómico (Fitts's Law)

1. **Evitar Truncamiento en Pantallas Móviles:** En pantallas de 360px a 390px (la media en Telegram Android/iOS), colocar 3 o más botones por fila provoca que Telegram recorte los textos con puntos suspensivos (`[🟢 Vigen...]`). Por ello, se estandarizó:
   * **Hero Buttons:** 1 botón de 100% de ancho para la acción principal.
   * **Grillas 2xN:** Filas de máximo 2 botones con textos directos y emojis semánticos.
2. **Jerarquía Visual con Bloques `<blockquote>`:** La información de contexto, filtros activos y resúmenes de ahorro se agrupa en citas visuales nativas de Telegram, guiando la atención del usuario sin fatiga visual.
3. **Consistencia de Navegación:** Todas las pantallas de resultados cuentan siempre con botones de retorno al módulo padre y al menú principal, garantizando que el usuario jamás quede atrapado en un callejón sin salida conversacional.

---

## 5. 🧪 Verificación y Pruebas Automatizadas

El funcionamiento de este módulo se valida integralmente mediante la suite de integración interactiva:
```powershell
# 1. Compilación estricta TypeScript (0 errores)
pnpm --dir ws-dm exec tsc --noEmit

# 2. Batería de 17 pruebas End-to-End en vivo
node ws-dm/scripts/probe_telegram_api.mjs
```

Ambas pruebas garantizan que el 100% de las plantillas renderizan HTML válido, que los botones emiten los callbacks correctos y que la experiencia de usuario es fluida y reactiva.
