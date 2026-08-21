import type { Parser, Language } from "web-tree-sitter";
import * as ParserNS from "web-tree-sitter";
import path from "path";
import fs from "fs";

let isInitialized = false;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const TSParser = (ParserNS as any).Parser || ParserNS;
export let tsLanguage: Language;
const languageCache: Record<string, Language> = {};

export async function getParser(wasmFilename: string): Promise<{ parser: Parser, language: Language }> {
  if (!isInitialized) {
    await TSParser.init();
    isInitialized = true;
  }

  const parser = new TSParser();
  
  // Cache languages to avoid reloading same wasm
  if (!languageCache[wasmFilename]) {
    const wasmPath = path.join(process.cwd(), "public", "tree-sitter", wasmFilename);
    if (!fs.existsSync(wasmPath)) {
      throw new Error("Tree-sitter WASM file not found at: " + wasmPath);
    }
    const wasmBuffer = fs.readFileSync(wasmPath);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    languageCache[wasmFilename] = await (ParserNS as any).Language.load(wasmBuffer);
  }

  const Lang = languageCache[wasmFilename];
  
  // For backwards compatibility where people imported tsLanguage directly
  if (wasmFilename.includes("typescript")) {
    tsLanguage = Lang;
  }
  
  parser.setLanguage(Lang);
  
  return { parser, language: Lang };
}
