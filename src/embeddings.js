import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';

// Load environment variables from .env
dotenv.config();

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.warn("Warning: GEMINI_API_KEY is not defined in the environment or .env file.");
}

// Initialize the Gemini SDK
const ai = new GoogleGenAI({ apiKey });

/**
 * Generates an embedding vector for a given piece of text.
 * @param {string} text - The input text or code.
 * @param {boolean} isQuery - Set to true if generating an embedding for a query, false for indexing documents.
 * @returns {Promise<number[]>} - The embedding vector.
 */
export async function getEmbedding(text, isQuery = false) {
  try {
    const taskType = isQuery ? 'RETRIEVAL_QUERY' : 'RETRIEVAL_DOCUMENT';
    const response = await ai.models.embedContent({
      model: 'gemini-embedding-001',
      contents: text,
      config: {
        taskType: taskType,
      }
    });

    if (response && response.embedding && response.embedding.values) {
      return response.embedding.values;
    } else if (response && response.embeddings && response.embeddings[0] && response.embeddings[0].values) {
      return response.embeddings[0].values;
    } else {
      console.error("Invalid Response Received:", response);
      throw new Error("Invalid embedding response structure: " + JSON.stringify(response));
    }
  } catch (error) {
    console.error(`Error generating embedding (isQuery=${isQuery}):`, error.message);
    throw error;
  }
}

/**
 * Generates embedding vectors for an array of texts.
 * Processes them in batches of 20 to prevent rate-limit or payload size issues.
 * @param {string[]} texts - Array of texts to embed.
 * @returns {Promise<number[][]>} - Array of embedding vectors.
 */
export async function getEmbeddingsBatch(texts) {
  if (!texts || texts.length === 0) return [];
  
  const batchSize = 20;
  const allVectors = [];
  
  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    
    try {
      const response = await ai.models.embedContent({
        model: 'gemini-embedding-001',
        contents: batch,
        config: {
          taskType: 'RETRIEVAL_DOCUMENT',
        }
      });
      
      // If we passed an array, response.embeddings contains the list of embeddings
      if (response && response.embeddings) {
        allVectors.push(...response.embeddings.map(emb => emb.values));
      } else if (response && response.embedding) {
        // Fallback for single-item responses
        allVectors.push(response.embedding.values);
      } else {
        throw new Error("Unexpected embedding response structure.");
      }
    } catch (error) {
      console.error(`Error in batch embedding (index range ${i} to ${i + batch.length}):`, error.message);
      throw error;
    }
  }
  
  return allVectors;
}

/**
 * Generates content using the Gemini model.
 * @param {string} prompt - The prompt to send.
 * @returns {Promise<string>} - The model's response.
 */
export async function generateAnswer(prompt) {
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });
    
    return response.text;
  } catch (error) {
    console.error("Error generating content from Gemini:", error.message);
    throw error;
  }
}
export { ai };
