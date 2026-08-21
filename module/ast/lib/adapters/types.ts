import type { Tree, Language } from "web-tree-sitter";

export type RawSymbol = {
  name: string;
  qualifiedName: string; // e.g. ClassName.methodName
  kind: string; // class, function, method, interface, type, etc.
  startLine: number; // 1-indexed (Prisma expects 1-indexed lines generally, Tree-sitter is 0-indexed)
  endLine: number; // 1-indexed
  signature: string | null;
  codeBody: string;
  isExported: boolean;
  isTest: boolean;
};

export type RawImport = {
  source: string; // e.g. "./payment" or "react"
  names: string[]; // e.g. ["PaymentService", "charge"]. Empty for side-effect imports like `import "./style.css"`
  startLine: number; // 1-indexed
};

export type RawCall = {
  identifier: string; // The caller identifier e.g. "calculate", "PaymentService.calculate", "this.service.doThing"
  startLine: number; // 1-indexed
};

export interface LanguageAdapter {
  /** The language identifier (e.g. "typescript", "python") */
  language: string;
  
  /** File extensions supported by this adapter (e.g. [".ts", ".tsx"]) */
  extensions: string[];

  /** 
   * The name of the WASM file for this grammar (e.g. "tree-sitter-typescript.wasm")
   * This file must be placed in the public/ tree-sitter/ directory.
   */
  getWasmFileName(): string; 

  /** Extract symbols (nodes) from the parsed AST */
  extractSymbols(tree: Tree, language: Language, sourceCode: string, path: string): RawSymbol[];
  
  /** Extract import statements from the parsed AST */
  extractImports(tree: Tree, language: Language, sourceCode: string, path: string): RawImport[];
  
  /** Extract function/method calls from the parsed AST */
  extractCalls(tree: Tree, language: Language, sourceCode: string, path: string): RawCall[];
}
