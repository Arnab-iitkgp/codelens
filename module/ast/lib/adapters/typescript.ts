import type { Node as SyntaxNode, QueryCapture } from "web-tree-sitter";
import * as ParserNS from "web-tree-sitter";
import { LanguageAdapter, RawSymbol, RawImport, RawCall } from "./types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const TSQuery = (ParserNS as any).Query || (ParserNS as any).Parser.Query;

export const typescriptAdapter: LanguageAdapter = {
  language: "typescript",
  extensions: [".ts", ".tsx", ".js", ".jsx"],

  getWasmFileName() {
    return "tree-sitter-typescript.wasm";
  },

  extractSymbols(tree, language, sourceCode, path) {
    const symbols: RawSymbol[] = [];
    const isTestFile = path.includes(".test.") || path.includes(".spec.");

    const queryString = "(function_declaration name: (identifier) @name) @def.function (class_declaration name: (type_identifier) @name) @def.class (interface_declaration name: (type_identifier) @name) @def.interface (type_alias_declaration name: (type_identifier) @name) @def.type (method_definition name: (property_identifier) @name) @def.method (lexical_declaration (variable_declarator name: (identifier) @name value: (arrow_function))) @def.arrow";

    try {
      const query = new TSQuery(language, queryString);
      const matches = query.matches(tree.rootNode);

      for (const match of matches) {
        let nameNode: SyntaxNode | null = null;
        let defNode: SyntaxNode | null = null;
        let kind = "unknown";

        for (const capture of match.captures) {
          if (capture.name === "name") {
            nameNode = capture.node;
          } else if (capture.name.startsWith("def.")) {
            defNode = capture.node;
            kind = capture.name.replace("def.", "");
          }
        }

        if (nameNode && defNode) {
          const name = nameNode.text;
          const isExported = defNode.parent?.type === "export_statement";
          
          let qualifiedName = name;
          if (kind === "method") {
            const classNode = defNode.parent?.parent; 
            if (classNode && classNode.type === "class_declaration") {
              const classNameNode = classNode.childForFieldName("name");
              if (classNameNode) {
                qualifiedName = classNameNode.text + "." + name;
              }
            }
          }

          symbols.push({
            name,
            qualifiedName,
            kind,
            startLine: defNode.startPosition.row + 1, 
            endLine: defNode.endPosition.row + 1,
            signature: null, 
            codeBody: defNode.text,
            isExported,
            isTest: isTestFile,
          });
        }
      }
    } catch (e) {
      console.error("[ast:typescript] Error extracting symbols from " + path, e);
    }

    return symbols;
  },

  extractImports(tree, language, sourceCode, path) {
    const imports: RawImport[] = [];
    const queryString = "(import_statement source: (string (string_fragment) @source)) @import";

    try {
      const query = new TSQuery(language, queryString);
      const matches = query.matches(tree.rootNode);

      for (const match of matches) {
        const importNode = match.captures.find((c: QueryCapture) => c.name === "import")?.node;
        const sourceNode = match.captures.find((c: QueryCapture) => c.name === "source")?.node;

        if (importNode && sourceNode) {
          const names: string[] = [];
          const importClause = importNode.childForFieldName("import");
          if (importClause) {
            const descendants = importClause.descendantsOfType("identifier");
            for (const desc of descendants) {
              names.push(desc.text);
            }
          }

          imports.push({
            source: sourceNode.text,
            names,
            startLine: importNode.startPosition.row + 1,
          });
        }
      }
    } catch (e) {
      console.error("[ast:typescript] Error extracting imports from " + path, e);
    }

    return imports;
  },

  extractCalls(tree, language, sourceCode, path) {
    const calls: RawCall[] = [];
    const queryString = "(call_expression function: [(identifier) @func.name (member_expression property: (property_identifier) @func.name)]) @call";

    try {
      const query = new TSQuery(language, queryString);
      const matches = query.matches(tree.rootNode);

      for (const match of matches) {
        const callNode = match.captures.find((c: QueryCapture) => c.name === "call")?.node;
        
        if (callNode) {
          const functionNode = callNode.childForFieldName("function");
          if (functionNode) {
            calls.push({
              identifier: functionNode.text, 
              startLine: callNode.startPosition.row + 1,
            });
          }
        }
      }
    } catch (e) {
      console.error("[ast:typescript] Error extracting calls from " + path, e);
    }

    return calls;
  },
};
