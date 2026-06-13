import path from 'path';
import fs from 'fs';
import readline from 'readline';
import { glob } from 'glob';
import { chunkFile } from './parser.js';
import { getEmbeddingsBatch } from './embeddings.js';
import { VectorStore } from './vectorStore.js';
import { executeRAGQuery } from './rag.js';

const INDEX_FILE = path.join(process.cwd(), 'ast-rag-index.json');
const vectorStore = new VectorStore(INDEX_FILE);
/**
 * Handles the index command.
 * Scans a folder, chunks code using AST parser, generates embeddings, and saves vector index.
 */
async function handleIndex(targetDir) {
  if (!targetDir) {
    console.error("Error: Please provide a directory path to index.");
    console.log("Usage: npm run index -- <directory_path>");
    process.exit(1);
  }

  const absoluteDir = path.resolve(targetDir);
  if (!fs.existsSync(absoluteDir)) {
    console.error(`Error: Directory not found: ${absoluteDir}`);
    process.exit(1);
  }

  console.log(`Scanning codebase directory: ${absoluteDir}`);

  // Search for JavaScript, TypeScript, and Python source files
  const files = await glob('**/*.{js,jsx,ts,tsx,py}', {
    cwd: absoluteDir,
    absolute: true,
    ignore: ['**/node_modules/**', '**/dist/**', '**/.git/**', '**/build/**', '**/out/**']
  });

  if (files.length === 0) {
    console.log("No compatible source code files found (.js, .jsx, .ts, .tsx, .py).");
    process.exit(0);
  }

  console.log(`Found ${files.length} code files. Chunking by Abstract Syntax Tree...`);

  let allChunks = [];
  for (const file of files) {
    const relative = path.relative(absoluteDir, file);
    try {
      const chunks = await chunkFile(file, relative);
      allChunks.push(...chunks);
      console.log(`  [AST Chunker] parsed ${relative} - generated ${chunks.length} semantic chunks`);
    } catch (error) {
      console.error(`  [AST Chunker] failed to parse ${relative}:`, error.message);
    }
  }

  if (allChunks.length === 0) {
    console.log("Zero semantic chunks generated from the codebase. Indexing aborted.");
    process.exit(0);
  }

  console.log(`\nGenerated ${allChunks.length} chunks in total. Calculating embedding vectors using Google Gen AI...`);
  
  // Format chunk content to include metadata for rich context during vector matching
  const contentsToEmbed = allChunks.map(chunk => {
    const contextPrefix = chunk.context ? `[Context: ${chunk.context}] ` : '';
    return `${contextPrefix}File: ${chunk.filePath} (${chunk.type} "${chunk.name}")\n${chunk.content}`;
  });

  try {
    const vectors = await getEmbeddingsBatch(contentsToEmbed);
    
    // Clear and build new vector store index
    vectorStore.clear();
    for (let i = 0; i < allChunks.length; i++) {
      vectorStore.add(allChunks[i], vectors[i]);
    }
    
    // Save to file
    vectorStore.save();
    console.log(`Indexing completed! Vector store saved successfully.`);
  } catch (error) {
    console.error("Indexing failed during embedding generation:", error.message);
    process.exit(1);
  }
}

/**
 * Handles the query command.
 * Loads the index and either runs a single query or launches a REPL.
 */
async function handleQuery(cliQuery) {
  if (!vectorStore.exists()) {
    console.error(`Error: Index file not found at ${INDEX_FILE}.`);
    console.log("Please index a directory first: npm run index -- <directory_path>");
    process.exit(1);
  }

  // Load vectors and chunks
  vectorStore.load();

  if (cliQuery) {
    // Single Query Mode
    console.log(`\nQuestion: "${cliQuery}"`);
    try {
      const result = await executeRAGQuery(cliQuery, vectorStore);
      console.log("\n===================== ANSWER =====================");
      console.log(result.answer);
      console.log("==================================================\n");
      
      console.log("References (Sources):");
      result.sources.forEach((src, idx) => {
        console.log(`  ${idx + 1}. [${src.type.toUpperCase()}] ${src.filePath} (Lines ${src.startLine}-${src.endLine}) [Match Score: ${src.score.toFixed(4)}]`);
      });
    } catch (error) {
      console.error("Failed to run query:", error.message);
    }
  } else {
    // REPL Chat Mode
    console.log("\n=======================================================");
    console.log("         AST Code RAG Chat Assistant (Gemini)          ");
    console.log("=======================================================");
    console.log("Ask questions about the codebase. Type 'exit' to quit.\n");

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    const askQuestion = () => {
      rl.question('\nAsk about your code: ', async (userInput) => {
        const queryText = userInput.trim();
        if (queryText.toLowerCase() === 'exit' || queryText.toLowerCase() === 'quit') {
          rl.close();
          return;
        }

        if (queryText.length === 0) {
          askQuestion();
          return;
        }

        try {
          const result = await executeRAGQuery(queryText, vectorStore);
          console.log("\n--- Answer ---------------------------------------------");
          console.log(result.answer);
          console.log("--------------------------------------------------------");
          
          console.log("\nRetrieved Source Contexts:");
          result.sources.forEach((src, idx) => {
            console.log(`  [${idx + 1}] ${src.filePath} (L${src.startLine}-L${src.endLine}) - ${src.type} "${src.name}" (Score: ${src.score.toFixed(4)})`);
          });
        } catch (error) {
          console.error("Error executing search/generation:", error.message);
        }
        
        askQuestion();
      });
    };

    askQuestion();
  }
}

/**
 * CLI Entry point
 */
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (command === 'index') {
    const dir = args[1];
    await handleIndex(dir);
  } else if (command === 'query') {
    const queryStr = args.slice(1).join(' ');
    await handleQuery(queryStr);
  } else {
    console.log("AST Code RAG CLI");
    console.log("================\n");
    console.log("Commands:");
    console.log("  npm run index -- <directory>   Parse and index a codebase");
    console.log("  npm run query                  Start an interactive Q&A session");
    console.log("  npm run query -- <your query>  Query a codebase with a single question\n");
    process.exit(0);
  }
}

main().catch(error => {
  console.error("Unhandled CLI Exception:", error);
  process.exit(1);
});
