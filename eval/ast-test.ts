import { getParser } from "../module/ast/lib/parser";
import { typescriptAdapter } from "../module/ast/lib/adapters/typescript";
import { resolveGraphEdges } from "../module/ast/lib/resolver";

const serviceCode = "export class PaymentService {\n  charge(amount: number) {\n    console.log('Charging ' + amount);\n    return true;\n  }\n}";

const controllerCode = "import { PaymentService } from './service';\n\nexport class CheckoutController {\n  constructor(private paymentService: PaymentService) {}\n\n  submitOrder() {\n    this.paymentService.charge(100);\n    const local = new PaymentService();\n    local.charge(50);\n  }\n}";

async function runTest() {
  console.log("Initializing Tree-sitter...");
  const { parser, language } = await getParser(typescriptAdapter.getWasmFileName());

  console.log("\\n--- Parsing service.ts ---");
  const tree1 = parser.parse(serviceCode);
  if (!tree1) return;
  const symbols1 = typescriptAdapter.extractSymbols(tree1, language, serviceCode, "src/service.ts");
  const imports1 = typescriptAdapter.extractImports(tree1, language, serviceCode, "src/service.ts");
  const calls1 = typescriptAdapter.extractCalls(tree1, language, serviceCode, "src/service.ts");
  console.log("Found " + symbols1.length + " symbols, " + imports1.length + " imports, " + calls1.length + " calls.");
  console.log("Symbols:", symbols1.map(s => s.qualifiedName));

  console.log("\\n--- Parsing controller.ts ---");
  const tree2 = parser.parse(controllerCode);
  if (!tree2) return;
  const symbols2 = typescriptAdapter.extractSymbols(tree2, language, controllerCode, "src/controller.ts");
  const imports2 = typescriptAdapter.extractImports(tree2, language, controllerCode, "src/controller.ts");
  const calls2 = typescriptAdapter.extractCalls(tree2, language, controllerCode, "src/controller.ts");
  console.log("Found " + symbols2.length + " symbols, " + imports2.length + " imports, " + calls2.length + " calls.");
  console.log("Imports:", imports2.map(i => i.names.join(",") + " from " + i.source));
  console.log("Calls:", calls2.map(c => c.identifier));

  console.log("\\n--- Running Resolver ---");
  const edges = resolveGraphEdges([
    { path: "src/service.ts", symbols: symbols1, imports: imports1, calls: calls1 },
    { path: "src/controller.ts", symbols: symbols2, imports: imports2, calls: calls2 }
  ]);

  console.log("\\nResolved Edges:");
  for (const edge of edges) {
    console.log("[" + edge.provenance + "] " + edge.sourceSymbolQualifiedName + " --(" + edge.kind + ")--> " + edge.targetSymbolQualifiedName);
    console.log("    From: " + edge.sourceSymbolPath + " (Line " + edge.sourceLine + ") To: " + edge.targetSymbolPath);
  }
}

runTest().catch(console.error);
