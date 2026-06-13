import { VectorStore } from './src/vectorStore.js';
import { executeRAGQuery } from './src/rag.js';
import path from 'path';

async function verify() {
  const indexFile = path.resolve('./ast-rag-index.json');
  console.log("Loading vector store from:", indexFile);
  
  const store = new VectorStore(indexFile);
  store.load();
  
  if (store.items.length === 0) {
    console.error("Verification failed: Vector store has 0 items. Please index first.");
    process.exit(1);
  }
  
  const query = "How does the Calculator subtract numbers?";
  console.log(`\nExecuting verification query: "${query}"\n`);
  
  try {
    const result = await executeRAGQuery(query, store);
    console.log("\n=================== VERIFICATION ANSWER ===================");
    console.log(result.answer);
    console.log("===========================================================\n");
    
    console.log("Sources matched:");
    result.sources.forEach((src, idx) => {
      console.log(`  [${idx + 1}] ${src.filePath} (Lines ${src.startLine}-${src.endLine}) - ${src.type} "${src.name}"`);
    });
    
    const referencesCalculator = result.sources.some(src => src.filePath.includes('calculator.js') && src.name === 'subtract');
    if (referencesCalculator) {
      console.log("\nSUCCESS: Verification query retrieved the correct 'subtract' method from 'calculator.js'.");
    } else {
      console.warn("\nWARNING: Query completed but did not retrieve the 'subtract' method of calculator.js.");
    }
  } catch (error) {
    const fs = await import('fs');
    fs.writeFileSync('./verify_log.txt', `ERROR: ${error.message}\nSTACK: ${error.stack}\n`, 'utf-8');
    console.log("Error details written to verify_log.txt");
    process.exit(1);
  }
}

verify();
