import { getAppConfig } from './config';

const NVIDIA_BASE_URL = 'https://integrate.api.nvidia.com/v1';

/**
 * Genera embeddings vectoriales de 1024 dimensiones para búsqueda semántica
 * Utiliza la API de NVIDIA NIM (nv-embedqa o bge-m3). Si no hay red, genera un vector determinista de respaldo.
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const { nvidiaApiKey } = getAppConfig();

  if (!nvidiaApiKey || nvidiaApiKey.includes('PLACEHOLDER')) {
    return generateFallbackEmbedding(text, 1024);
  }

  try {
    const res = await fetch(`${NVIDIA_BASE_URL}/embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${nvidiaApiKey}`,
      },
      body: JSON.stringify({
        input: [text.slice(0, 2048)],
        model: 'nvidia/nemotron-3.5-embed-1b',
        input_type: 'query',
        encoding_format: 'float',
        dimensions: 1024,
      }),
    });

    if (!res.ok) {
      console.warn(`[NVIDIA AI] Error HTTP ${res.status} en embeddings, usando fallback.`);
      return generateFallbackEmbedding(text, 1024);
    }

    const data = await res.json();
    if (data.data && data.data[0]?.embedding) {
      return data.data[0].embedding;
    }
    return generateFallbackEmbedding(text, 1024);
  } catch (err) {
    console.warn('[NVIDIA AI] No se pudo conectar a NVIDIA NIM (entorno offline), usando embedding determinista:', err);
    return generateFallbackEmbedding(text, 1024);
  }
}

/**
 * Consulta a un LLM de código abierto (Llama 3.1 70B Instruct en NVIDIA NIM)
 * para resumir pliegos, orientar sobre requisitos y responder dudas del postulante.
 */
export async function askLlama(prompt: string, context: string): Promise<string> {
  const { nvidiaApiKey } = getAppConfig();

  if (!nvidiaApiKey) {
    return `📋 **Resumen de Licitaciones:**\n${context}\n\n💡 *Nota: Para análisis en lenguaje natural avanzado, asegúrate de configurar tu clave de NVIDIA NIM.*`;
  }

  try {
    const systemPrompt = `Eres SICOES-Bot, un asistente experto en contrataciones estatales, licitaciones y consultorías del Estado Plurinacional de Bolivia.
Responde de manera ejecutiva, clara y precisa fundamentándote en las convocatorias provistas en el contexto.
Indica siempre el Código CUCE, la entidad convocante, el rubro/modalidad, el estado de la licitación (Vigente, Contratada, Adjudicada o Desierta) y una breve síntesis de pertinencia con la búsqueda del usuario. Si el monto o fecha de presentación figura como "Consultar Pliego PDF" o proceso concluido, oríentalo a revisar el enlace oficial de la ficha.`;

    const userContent = `Contexto de Convocatorias Oficiales:\n${context}\n\nPregunta del Usuario: ${prompt}`;

    const res = await fetch(`${NVIDIA_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${nvidiaApiKey}`,
      },
      body: JSON.stringify({
        model: 'nvidia/nemotron-3.5-bolt-e4b',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userContent },
        ],
        temperature: 0.2,
        max_tokens: 600,
      }),
    });

    if (!res.ok) {
      const errTxt = await res.text();
      console.warn(`[NVIDIA AI] Error ${res.status}:`, errTxt);
      return `📋 **Convocatorias Relevantes Encontradas:**\n\n${context}`;
    }

    const data = await res.json();
    return data.choices?.[0]?.message?.content || `📋 **Convocatorias Encontradas:**\n\n${context}`;
  } catch (err) {
    console.warn('[NVIDIA AI] Excepción al invocar Llama 3:', err);
    return `📋 **Convocatorias Encontradas:**\n\n${context}`;
  }
}

/**
 * Generador de embedding determinista normalizado (L2) para pruebas locales offline
 */
function generateFallbackEmbedding(text: string, dimensions = 1024): number[] {
  const vec = new Array(dimensions).fill(0);
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = (hash << 5) - hash + text.charCodeAt(i);
    hash |= 0;
    const idx = Math.abs((hash + i * 31) % dimensions);
    vec[idx] += 1.0;
  }

  // Normalización Euclidiana (L2) para que el producto punto equivalga a la similitud de coseno
  const norm = Math.sqrt(vec.reduce((sum, v) => sum + v * v, 0)) || 1.0;
  return vec.map((v) => Number((v / norm).toFixed(6)));
}

