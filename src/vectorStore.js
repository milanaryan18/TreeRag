import fs from 'fs';
import path from 'path';

/**
 * A simple in-memory vector store that persists chunks and embeddings to a JSON file.
 * Implements cosine similarity search.
 */
export class VectorStore {
  /**
   * @param {string} indexPath - Absolute path to save/load index JSON file.
   */
  constructor(indexPath) {
    this.indexPath = indexPath;
    this.items = []; // Array of { chunk, vector }
  }

  /**
   * Check if the index file exists on disk.
   * @returns {boolean}
   */
  exists() {
    return fs.existsSync(this.indexPath);
  }

  /**
   * Load the index from disk.
   */
  load() {
    if (!this.exists()) {
      this.items = [];
      return;
    }
    try {
      const rawData = fs.readFileSync(this.indexPath, 'utf-8');
      this.items = JSON.parse(rawData);
      console.log(`Successfully loaded ${this.items.length} indexed chunks from ${path.basename(this.indexPath)}.`);
    } catch (error) {
      console.error(`Failed to load vector store from ${this.indexPath}:`, error.message);
      this.items = [];
    }
  }

  /**
   * Save the current index to disk.
   */
  save() {
    try {
      const dir = path.dirname(this.indexPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.indexPath, JSON.stringify(this.items, null, 2), 'utf-8');
      console.log(`Successfully indexed and saved ${this.items.length} chunks to ${path.basename(this.indexPath)}.`);
    } catch (error) {
      console.error(`Failed to save vector store to ${this.indexPath}:`, error.message);
    }
  }

  /**
   * Add a chunk and its corresponding embedding vector.
   * @param {object} chunk - The parsed AST chunk metadata and text.
   * @param {number[]} vector - The embedding vector values.
   */
  add(chunk, vector) {
    this.items.push({ chunk, vector });
  }

  /**
   * Clear all items from the store.
   */
  clear() {
    this.items = [];
  }

  /**
   * Computes cosine similarity between two numeric vectors of the same dimension.
   * @param {number[]} vecA
   * @param {number[]} vecB
   * @returns {number}
   */
  cosineSimilarity(vecA, vecB) {
    if (vecA.length !== vecB.length) {
      throw new Error(`Dimension mismatch: vecA has length ${vecA.length}, vecB has length ${vecB.length}`);
    }
    
    let dotProduct = 0.0;
    let normA = 0.0;
    let normB = 0.0;
    
    for (let i = 0; i < vecA.length; i++) {
      dotProduct += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }
    
    if (normA === 0 || normB === 0) return 0;
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  /**
   * Query the index for the top K most similar chunks.
   * @param {number[]} queryVector - The embedding of the query.
   * @param {number} topK - Maximum number of results.
   * @returns {Array<{ chunk: object, score: number }>}
   */
  search(queryVector, topK = 4) {
    if (this.items.length === 0) return [];
    
    const scored = this.items.map(item => {
      try {
        const score = this.cosineSimilarity(queryVector, item.vector);
        return {
          chunk: item.chunk,
          score: score
        };
      } catch (err) {
        return { chunk: item.chunk, score: -1 };
      }
    });

    // Sort descending by similarity score
    scored.sort((a, b) => b.score - a.score);

    return scored.slice(0, topK);
  }
}
