import type { Node as SyntaxNode, QueryCapture } from "web-tree-sitter";
import * as ParserNS from "web-tree-sitter";
import { LanguageAdapter, RawSymbol, RawImport, RawCall } from "./types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const TSQuery = (ParserNS as any).Query || (ParserNS as any).Parser.Query;

export const pythonAdapter: LanguageAdapter = {
  language: "python",
  extensions: [".py"],

  getWasmFileName() {
    return "tree-sitter-python.wasm";
  },

  extractSymbols(tree, language, sourceCode, path) {
    const symbols: RawSymbol[] = [];
    const isTestFile = path.includes("test_") || path.includes("_test.py");

    const queryString = `
      (function_definition name: (identifier) @name) @def.function
      (class_definition name: (identifier) @name) @def.class
    `;

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
          // In python, everything is "exported" unless it starts with an underscore.
          const isExported = !name.startsWith("_");
          
          let qualifiedName = name;
          
          // Check if this function is inside a class (i.e., a method)
          if (kind === "function") {
            let parent = defNode.parent;
            while (parent) {
              if (parent.type === "class_definition") {
                const classNameNode = parent.childForFieldName("name");
                if (classNameNode) {
                  qualifiedName = classNameNode.text + "." + name;
                  kind = "method";
                }
                break;
              }
              parent = parent.parent;
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
      console.error("[ast:python] Error extracting symbols from " + path, e);
    }

    return symbols;
  },

  extractImports(tree, language, sourceCode, path) {
    const imports: RawImport[] = [];
    const queryString = `
      (import_statement name: (dotted_name) @source) @import
      (import_from_statement module_name: (dotted_name) @source) @import
    `;

    try {
      const query = new TSQuery(language, queryString);
      const matches = query.matches(tree.rootNode);

      for (const match of matches) {
        const importNode = match.captures.find((c: QueryCapture) => c.name === "import")?.node;
        const sourceNode = match.captures.find((c: QueryCapture) => c.name === "source")?.node;

        if (importNode && sourceNode) {
          const names: string[] = [];
          
          if (importNode.type === "import_statement") {
             // import x.y
             names.push(sourceNode.text);
          } else if (importNode.type === "import_from_statement") {
             // from x.y import a, b
             const aliases = importNode.descendantsOfType("dotted_name");
             for (const alias of aliases) {
                // skip the module_name itself which we already captured as source
                if (alias.id !== sourceNode.id) {
                    names.push(alias.text);
                }
             }
             // Handle 'import a' where a is an identifier (not dotted)
             const identifiers = importNode.descendantsOfType("identifier");
             for (const ident of identifiers) {
                if (ident.parent?.type === "aliased_import" || ident.parent?.type === "import_from_statement") {
                    names.push(ident.text);
                }
             }
          }

          imports.push({
            source: sourceNode.text,
            names: names.length > 0 ? names : [sourceNode.text],
            startLine: importNode.startPosition.row + 1,
          });
        }
      }
    } catch (e) {
      console.error("[ast:python] Error extracting imports from " + path, e);
    }

    return imports;
  },

  extractCalls(tree, language, sourceCode, path) {
    const calls: RawCall[] = [];
    const queryString = `
      (call function: [(identifier) @func.name (attribute attribute: (identifier) @func.name)]) @call
    `;

    try {
      const query = new TSQuery(language, queryString);
      const matches = query.matches(tree.rootNode);

      for (const match of matches) {
        const callNode = match.captures.find((c: QueryCapture) => c.name === "call")?.node;
        const nameNode = match.captures.find((c: QueryCapture) => c.name === "func.name")?.node;
        
        if (callNode && nameNode) {
          calls.push({
            identifier: nameNode.text, 
            startLine: callNode.startPosition.row + 1,
          });
        }
      }
    } catch (e) {
      console.error("[ast:python] Error extracting calls from " + path, e);
    }

    return calls;
  },
};
