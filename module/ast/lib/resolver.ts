import { RawSymbol, RawImport, RawCall } from "./adapters/types";

export type ResolvedEdge = {
  sourceSymbolQualifiedName: string;
  sourceSymbolPath: string;
  targetSymbolQualifiedName: string;
  targetSymbolPath: string;
  kind: "CALLS" | "IMPORTS" | "EXTENDS" | "IMPLEMENTS" | "CONTAINS" | "TESTS" | "USES";
  provenance: "EXTRACTED" | "RESOLVED" | "INFERRED";
  weight: number;
  sourceLine: number;
};

type FileFacts = {
  path: string;
  symbols: RawSymbol[];
  imports: RawImport[];
  calls: RawCall[];
};

export function resolveGraphEdges(repoFacts: FileFacts[]): ResolvedEdge[] {
  const edges: ResolvedEdge[] = [];

  // Build lookup indexes for O(1) resolution
  const exportsByFile = new Map<string, Map<string, RawSymbol>>();
  
  for (const file of repoFacts) {
    const fileExports = new Map<string, RawSymbol>();
    for (const sym of file.symbols) {
      if (sym.isExported) {
        fileExports.set(sym.name, sym);
        fileExports.set(sym.qualifiedName, sym);
      }
    }
    exportsByFile.set(file.path, fileExports);
  }

  // Helper to resolve an import path relative to the current file
  const resolveImportPath = (sourcePath: string, importSource: string): string | null => {
    // Very basic naive resolution for relative paths (ignoring node_modules for now)
    if (!importSource.startsWith(".")) return null;

    const sourceParts = sourcePath.split("/");
    sourceParts.pop(); // remove filename
    const importParts = importSource.split("/");

    for (const part of importParts) {
      if (part === ".") continue;
      if (part === "..") {
        sourceParts.pop();
      } else {
        sourceParts.push(part);
      }
    }

    const resolvedPrefix = sourceParts.join("/");
    // We don't know the exact extension, so we just look for a file that starts with this prefix
    // In a real implementation, we'd check against the known filePaths
    for (const knownPath of exportsByFile.keys()) {
      // Remove extension from knownPath for comparison
      const knownPathNoExt = knownPath.replace(/\.[^/.]+$/, "");
      if (knownPathNoExt === resolvedPrefix || knownPathNoExt === resolvedPrefix + "/index") {
        return knownPath;
      }
    }
    
    return null;
  };

  // Process each file
  for (const file of repoFacts) {
    // TIER 1 (Deterministic): Resolve Imports
    const resolvedImports = new Map<string, { targetPath: string, targetName: string }>();

    for (const imp of file.imports) {
      const targetPath = resolveImportPath(file.path, imp.source);
      if (targetPath) {
        const targetExports = exportsByFile.get(targetPath);
        if (targetExports) {
          for (const name of imp.names) {
            const targetSymbol = targetExports.get(name);
            if (targetSymbol) {
              resolvedImports.set(name, { targetPath, targetName: targetSymbol.qualifiedName });
            }
          }
        }
      }
    }

    // TIER 1 & 2: Resolve Calls
    for (const call of file.calls) {
      // Which symbol in THIS file made the call? (Find the innermost symbol wrapping the line)
      let callerSymbol: RawSymbol | null = null;
      for (const sym of file.symbols) {
        if (sym.startLine <= call.startLine && sym.endLine >= call.startLine) {
          if (!callerSymbol || (sym.endLine - sym.startLine < callerSymbol.endLine - callerSymbol.startLine)) {
            callerSymbol = sym; // Pick the tightest enclosing symbol
          }
        }
      }

      if (!callerSymbol) continue; // Call outside of any known symbol (e.g. top-level script)

      // Split identifier, e.g. "PaymentService.charge" -> ["PaymentService", "charge"]
      const callParts = call.identifier.split(".");
      
      // Tier 1 (Deterministic): Was it directly imported?
      const baseName = callParts[0];
      if (resolvedImports.has(baseName)) {
        const resolved = resolvedImports.get(baseName)!;
        
        let targetQualified = resolved.targetName;
        if (callParts.length > 1) {
          // It's a method call on an imported class/namespace: PaymentService.charge
          targetQualified = resolved.targetName + "." + callParts.slice(1).join(".");
        }

        edges.push({
          sourceSymbolQualifiedName: callerSymbol.qualifiedName,
          sourceSymbolPath: file.path,
          targetSymbolQualifiedName: targetQualified,
          targetSymbolPath: resolved.targetPath,
          kind: "CALLS",
          provenance: "RESOLVED",
          weight: 1.0,
          sourceLine: call.startLine
        });
        continue;
      }

      // Tier 1 (Deterministic): Is it a call to a symbol in the SAME file?
      const localSymbol = file.symbols.find(s => s.name === call.identifier || s.qualifiedName === call.identifier);
      if (localSymbol) {
        edges.push({
          sourceSymbolQualifiedName: callerSymbol.qualifiedName,
          sourceSymbolPath: file.path,
          targetSymbolQualifiedName: localSymbol.qualifiedName,
          targetSymbolPath: file.path,
          kind: "CALLS",
          provenance: "EXTRACTED",
          weight: 1.0,
          sourceLine: call.startLine
        });
        continue;
      }

      // Tier 2 (Heuristic): e.g., this.service.doThing()
      if (baseName === "this" && callParts.length >= 2) {
        // We infer that this is a method call on an injected service.
        // We can't definitively link it without native analysis, but we record it.
        // The Investigator agent can use this semantic clue during retrieval.
        edges.push({
          sourceSymbolQualifiedName: callerSymbol.qualifiedName,
          sourceSymbolPath: file.path,
          targetSymbolQualifiedName: call.identifier, // Leaves "this.service.doThing"
          targetSymbolPath: "UNKNOWN", // Unresolved path
          kind: "CALLS",
          provenance: "INFERRED",
          weight: 0.5, // Lower weight because it's inferred
          sourceLine: call.startLine
        });
      }
    }
  }

  return edges;
}
