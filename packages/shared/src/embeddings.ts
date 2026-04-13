import OpenAI from "openai"

let client: OpenAI | null = null

/**
 * Get or create the OpenAI client singleton.
 * Lazily initialized to avoid requiring the API key at import time.
 */
function getClient(apiKey: string): OpenAI {
  if (!client) {
    client = new OpenAI({ apiKey })
  }
  return client
}

/**
 * Generate an embedding vector for the given text.
 *
 * Uses the OpenAI embeddings API with the configured model
 * (default: text-embedding-3-small, 1536 dimensions).
 *
 * @param text - The text to embed (should be a short factual statement)
 * @param apiKey - OpenAI API key
 * @param model - Embedding model name (default: text-embedding-3-small)
 * @returns 1536-dimensional embedding vector
 * @throws Error if the API call fails
 */
export async function embed(
  text: string,
  apiKey: string,
  model: string = "text-embedding-3-small",
): Promise<number[]> {
  if (!text.trim()) {
    throw new Error("Cannot generate embedding for empty text")
  }

  const openai = getClient(apiKey)

  const response = await openai.embeddings.create({
    model,
    input: text,
  })

  const data = response.data[0]
  if (!data) {
    throw new Error("No embedding returned from OpenAI API")
  }

  return data.embedding
}

// ---------------------------------------------------------------------------
// Batch Embedding
// ---------------------------------------------------------------------------

/** Maximum number of texts per OpenAI embeddings API call. */
const BATCH_CHUNK_SIZE = 100

/**
 * Generate embedding vectors for multiple texts in batch.
 *
 * Uses the OpenAI embeddings API with array input for efficiency.
 * Automatically chunks large inputs into batches of {@link BATCH_CHUNK_SIZE}
 * to stay within API limits.
 *
 * @param texts - Array of texts to embed (each should be a short factual statement)
 * @param apiKey - OpenAI API key
 * @param model - Embedding model name (default: text-embedding-3-small)
 * @returns Array of embedding vectors in the same order as the input texts
 * @throws Error if any text is empty or the API call fails
 */
export async function embedBatch(
  texts: string[],
  apiKey: string,
  model: string = "text-embedding-3-small",
): Promise<number[][]> {
  if (texts.length === 0) {
    return []
  }

  for (let i = 0; i < texts.length; i++) {
    const text = texts[i]
    if (!text?.trim()) {
      throw new Error(`Cannot generate embedding for empty text at index ${i}`)
    }
  }

  const openai = getClient(apiKey)
  const allEmbeddings: number[][] = []

  // Process in chunks to stay within API limits
  for (let start = 0; start < texts.length; start += BATCH_CHUNK_SIZE) {
    const chunk = texts.slice(start, start + BATCH_CHUNK_SIZE)

    const response = await openai.embeddings.create({
      model,
      input: chunk,
    })

    // OpenAI returns embeddings sorted by index, but we sort explicitly
    // to be safe
    const sorted = response.data.sort((a, b) => a.index - b.index)

    for (const item of sorted) {
      allEmbeddings.push(item.embedding)
    }
  }

  return allEmbeddings
}

/**
 * Reset the OpenAI client singleton (useful for testing).
 */
export function resetClient(): void {
  client = null
}
