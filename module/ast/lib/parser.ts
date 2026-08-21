import type { Parser, Language } from "web-tree-sitter";
import * as ParserNS from "web-tree-sitter";
import path from "path";
import fs from "fs";

let isInitialized = false;
const TSParser = (ParserNS as any).Parser || ParserNS;
export let tsLanguage: Language;

export async function getParser(wasmFilename: string): Promise<Parser> {
  if (!isInitialized) {
    await TSParser.init();
    isInitialized = true;
  }

  const parser = new TSParser();
  
  // In Next.js/Inngest environments (Node.js backend), we can read the file directly
  // from the public directory where we copied the WASM binaries.
  const wasmPath = path.join(process.cwd(), "public", "tree-sitter", wasmFilename);
  
  if (!fs.existsSync(wasmPath)) {
    throw new Error("Tree-sitter WASM file not found at: " + wasmPath);
  }

  // Parser.Language.load() accepts a file path in Node environments, 
  // or a Uint8Array of the WASM file contents.
  const wasmBuffer = fs.readFileSync(wasmPath);
  const Lang = await (ParserNS as any).Language.load(wasmBuffer);
  tsLanguage = Lang;
  
  parser.setLanguage(Lang);
  
  return parser;
}
