const OPENROUTER_API_KEY = process.env.OPEN_ROUTER_API_KEY || process.env.OPENROUTER_API_KEY;
const EMBEDDING_MODEL = 'openai/text-embedding-3-small';
const EMBEDDING_DIMENSIONS = 768;
const EMBEDDING_URL = 'https://openrouter.ai/api/v1/embeddings';

if (!OPENROUTER_API_KEY) {
  console.warn('OPEN_ROUTER_API_KEY is not set. Embedding generation will fail.');
}

export async function generateEmbedding(text) {
  if (!text || typeof text !== 'string') return null;
  if (!OPENROUTER_API_KEY) return null;

  // Keep requests small so we do not waste bandwidth on verbose prompts.
  const cleanText = text.trim().slice(0, 8000);

  try {
    const response = await fetch(EMBEDDING_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://nodalpoint.io',
        'X-Title': 'Nodal Point CRM',
      },
      body: JSON.stringify({
        model: EMBEDDING_MODEL,
        input: cleanText,
        dimensions: EMBEDDING_DIMENSIONS,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      console.error('[embeddings] OpenRouter error:', response.status, errorBody);
      return null;
    }

    const result = await response.json();
    const embedding = result?.data?.[0]?.embedding;

    if (!Array.isArray(embedding)) {
      console.error('[embeddings] OpenRouter returned an invalid embedding payload:', result);
      return null;
    }

    if (embedding.length !== EMBEDDING_DIMENSIONS) {
      console.error(
        `[embeddings] Expected ${EMBEDDING_DIMENSIONS} dimensions, received ${embedding.length}`,
      );
      return null;
    }

    return embedding;
  } catch (error) {
    console.error('Error generating embedding:', error);
    return null;
  }
}
