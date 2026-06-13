import { getEmbedding, generateAnswer } from './embeddings.js';

/**
 * Orchestrates the Retrieval-Augmented Generation (RAG) query execution.
 * @param {string} query - The user's question about the codebase.
 * @param {VectorStore} vectorStore - The vector store containing index data.
 * @returns {Promise<{ answer: string, sources: Array }>}
 */
export async function executeRAGQuery(query, vectorStore) {
  // 1. Generate embedding vector for the user query (with taskType: RETRIEVAL_QUERY)
  console.log("Generating query embedding...");
  const queryVector = await getEmbedding(query, true);

  // 2. Perform cosine-similarity search in the vector store
  console.log("Searching vector database for relevant code chunks...");
  const searchResults = vectorStore.search(queryVector, 4);

  if (searchResults.length === 0) {
    return {
      answer: "No relevant code chunks found. Make sure you have run the indexer on a codebase first.",
      sources: []
    };
  }

  // 3. Format retrieved context for the LLM prompt
  let contextText = '';
  searchResults.forEach((res, index) => {
    const chunk = res.chunk;
    contextText += `---
[Chunk ${index + 1}]
File: ${chunk.filePath} (Lines ${chunk.startLine}-${chunk.endLine})
Symbol Name: "${chunk.name}"
Symbol Type: ${chunk.type}
Structural Context: ${chunk.context || 'None'}
Similarity Match Score: ${res.score.toFixed(4)}

Code Snippet:
\`\`\`
${chunk.content}
\`\`\`
\n`;
  });

  // 4. Construct the prompt for the generative Gemini model
  const systemPrompt = `You are a professional software engineering AI assistant specializing in codebase analysis.
Your goal is to answer the user's question about their source code using only the retrieved code snippets provided in the Context section below.

Instructions:
1. Be precise and refer to the specific files, classes, methods, or variables by name.
2. Reference the exact file names and line numbers when explaining how something is implemented.
3. If the answer cannot be found in the provided context, state that clearly, but try to use the context to help the user as much as possible.
4. Output your response in beautiful, structured GitHub Markdown.

Context:
${contextText}

Question:
${query}

Answer:`;

  // 5. Generate content using gemini-2.5-flash
  console.log("Generating response from Gemini model...");
  const answer = await generateAnswer(systemPrompt);

  return {
    answer,
    sources: searchResults.map(res => ({
      filePath: res.chunk.filePath,
      startLine: res.chunk.startLine,
      endLine: res.chunk.endLine,
      name: res.chunk.name,
      type: res.chunk.type,
      score: res.score
    }))
  };
}
