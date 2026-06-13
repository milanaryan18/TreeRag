import Parser from 'web-tree-sitter';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let parserInitialized = false;
let parser = null;

// Map file extensions to Tree-sitter languages
const EXTENSION_TO_LANG = {
  '.js': 'javascript',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.jsx': 'javascript',
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.py': 'python',
};

/**
 * Initializes the web-tree-sitter parser.
 */
export async function initializeParser() {
  if (parserInitialized) return;
  await Parser.init();
  parser = new Parser();
  parserInitialized = true;
}

/**
 * Loads a language grammar WASM file.
 * @param {string} langName - Name of the language (e.g., 'javascript', 'python')
 */
export async function getLanguage(langName) {
  await initializeParser();
  
  // Resolve node_modules path relative to project root
  const wasmPath = path.join(__dirname, '..', 'node_modules', 'tree-sitter-wasms', 'out', `tree-sitter-${langName}.wasm`);
  
  if (!fs.existsSync(wasmPath)) {
    throw new Error(`WASM grammar for language "${langName}" not found at path: ${wasmPath}`);
  }
  
  return await Parser.Language.load(wasmPath);
}

/**
 * Helper to extract name from a node (class, function, method).
 */
function getNodeName(node) {
  // If node has 'name' or 'id' fields
  const nameNode = node.childForFieldName('name') || node.childForFieldName('id');
  if (nameNode) return nameNode.text;

  // Search children for identifier
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child.type === 'identifier' || child.type === 'property_identifier') {
      return child.text;
    }
  }

  // Handle arrow functions assigned to variables: const foo = () => {}
  if (node.type === 'arrow_function' && node.parent) {
    let p = node.parent;
    // variable_declarator has name/id as first child or identifier
    if (p.type === 'variable_declarator') {
      const idNode = p.childForFieldName('id') || p.child(0);
      if (idNode) return idNode.text;
    }
  }

  return 'anonymous';
}

/**
 * Traverses the AST recursively and extracts semantic blocks.
 */
function extractSemanticNodes(node, sourceCode, filePath, parentContext = {}) {
  const chunks = [];
  const type = node.type;
  
  let isSemantic = false;
  let chunkType = '';
  let name = '';
  let nextParentContext = { ...parentContext };

  // JS/TS and Python mapping of functions and classes
  if (type === 'class_declaration' || type === 'class_definition' || type === 'class') {
    isSemantic = true;
    chunkType = 'class';
    name = getNodeName(node);
    nextParentContext.className = name;
  } else if (type === 'function_declaration' || type === 'function_definition' || type === 'generator_function_declaration') {
    isSemantic = true;
    chunkType = 'function';
    name = getNodeName(node);
  } else if (type === 'method_definition' || type === 'function_declarator') {
    isSemantic = true;
    chunkType = 'method';
    name = getNodeName(node);
  } else if (type === 'arrow_function' && node.parent && node.parent.type === 'variable_declarator') {
    isSemantic = true;
    chunkType = 'function';
    name = getNodeName(node);
  }

  if (isSemantic) {
    const startRow = node.startPosition.row + 1; // 1-indexed
    const endRow = node.endPosition.row + 1;
    
    // Construct context summary
    let contextStr = '';
    if (chunkType === 'method' && parentContext.className) {
      contextStr = `Method of class ${parentContext.className}`;
    } else if (chunkType === 'function' && parentContext.className) {
      contextStr = `Enclosed in class ${parentContext.className}`;
    }

    chunks.push({
      filePath,
      name,
      type: chunkType,
      startLine: startRow,
      endLine: endRow,
      content: sourceCode.slice(node.startIndex, node.endIndex),
      context: contextStr,
      range: [node.startIndex, node.endIndex]
    });
  }

  // Recursively process children
  for (let i = 0; i < node.childCount; i++) {
    const childChunks = extractSemanticNodes(node.child(i), sourceCode, filePath, nextParentContext);
    chunks.push(...childChunks);
  }

  return chunks;
}

/**
 * Parses a code file and chunks it using the Tree-sitter AST.
 * @param {string} filePath - Absolute path to the file.
 * @param {string} relativePath - Relative path for display in metadata.
 */
export async function chunkFile(filePath, relativePath) {
  const ext = path.extname(filePath).toLowerCase();
  const langName = EXTENSION_TO_LANG[ext];
  
  const sourceCode = fs.readFileSync(filePath, 'utf-8');
  
  if (!langName) {
    // Fallback chunking: just split by line blocks if not a supported language
    return fallbackLineChunking(sourceCode, relativePath);
  }

  // Load language grammar and parse
  const language = await getLanguage(langName);
  parser.setLanguage(language);
  
  const tree = parser.parse(sourceCode);
  const rootNode = tree.rootNode;
  
  // Extract all semantic nodes (classes, functions, methods)
  const semanticChunks = extractSemanticNodes(rootNode, sourceCode, relativePath);
  
  // Determine lines covered by semantic chunks to find "left-overs"
  const lines = sourceCode.split('\n');
  const totalLines = lines.length;
  const lineCoverage = new Array(totalLines).fill(false);
  
  for (const chunk of semanticChunks) {
    // Mark covered lines (0-indexed matching row numbers)
    for (let r = chunk.startLine - 1; r < chunk.endLine; r++) {
      if (r >= 0 && r < totalLines) {
        lineCoverage[r] = true;
      }
    }
  }
  
  // Group non-covered lines into module-level chunks (e.g., imports, top-level scripts)
  const leftoverChunks = [];
  let currentChunkLines = [];
  let chunkStartLine = -1;
  
  for (let r = 0; r < totalLines; r++) {
    if (!lineCoverage[r]) {
      if (chunkStartLine === -1) {
        chunkStartLine = r + 1;
      }
      currentChunkLines.push(lines[r]);
      
      // If current leftover chunk gets big (e.g. 30 lines) or we hit a blank line after content, save it
      if (currentChunkLines.length >= 35) {
        leftoverChunks.push({
          filePath: relativePath,
          name: 'module_level',
          type: 'module_level',
          startLine: chunkStartLine,
          endLine: r + 1,
          content: currentChunkLines.join('\n'),
          context: 'Module top-level statements/imports'
        });
        currentChunkLines = [];
        chunkStartLine = -1;
      }
    } else {
      // We hit a covered section, save any ongoing leftover chunk
      if (currentChunkLines.length > 0) {
        leftoverChunks.push({
          filePath: relativePath,
          name: 'module_level',
          type: 'module_level',
          startLine: chunkStartLine,
          endLine: r, // previous line
          content: currentChunkLines.join('\n'),
          context: 'Module top-level statements/imports'
        });
        currentChunkLines = [];
        chunkStartLine = -1;
      }
    }
  }
  
  if (currentChunkLines.length > 0) {
    leftoverChunks.push({
      filePath: relativePath,
      name: 'module_level',
      type: 'module_level',
      startLine: chunkStartLine,
      endLine: totalLines,
      content: currentChunkLines.join('\n'),
      context: 'Module top-level statements/imports'
    });
  }

  // Combine and clean up chunks
  const allChunks = [...semanticChunks, ...leftoverChunks]
    .filter(chunk => chunk.content.trim().length > 10) // Filter out trivial whitespace
    .map(chunk => {
      // Remove raw byte range before returning to keep output clean
      const { range, ...cleanChunk } = chunk;
      return cleanChunk;
    });

  return allChunks;
}

/**
 * Fallback parser that splits code into fixed-size line blocks.
 */
function fallbackLineChunking(sourceCode, relativePath) {
  const lines = sourceCode.split('\n');
  const chunks = [];
  const chunkSize = 40;
  const overlap = 5;
  
  for (let i = 0; i < lines.length; i += (chunkSize - overlap)) {
    const chunkLines = lines.slice(i, i + chunkSize);
    if (chunkLines.length === 0) break;
    
    chunks.push({
      filePath: relativePath,
      name: 'file_segment',
      type: 'text_segment',
      startLine: i + 1,
      endLine: Math.min(i + chunkLines.length, lines.length),
      content: chunkLines.join('\n'),
      context: 'Fallback line chunking'
    });
    
    if (i + chunkSize >= lines.length) break;
  }
  return chunks;
}
