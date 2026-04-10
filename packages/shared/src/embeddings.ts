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
  model: string = "text-embedding-3-small"
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

/**
 * Reset the OpenAI client singleton (useful for testing).
 */
export function resetClient(): void {
  client = null
}
