import { trimPatchToDelta } from "../module/ai/lib/auto-fix";

function runTests() {
  console.log("=== Testing Phase 3: Deterministic Patch Trimming ===");

  const originalFileContent = [
    '#include <iostream>',
    '#include <winsock2.h>',
    '',
    'bool TCPServer::start() {',
    '    if (serverSocket == INVALID_SOCKET) {',
    '        std::cerr << "Error creating socket." << std::endl;',
    '        WSACleanup();',
    '        return 1;',
    '    }',
    '    std::cout << "socket created!\\n";',
    '    return true;',
    '}'
  ].join("\n");

  // Suppose agent received startLine: 5, endLine: 9 (lines 5-9)
  // Original lines 5-9:
  // 5:     if (serverSocket == INVALID_SOCKET) {
  // 6:         std::cerr << "Error creating socket." << std::endl;
  // 7:         WSACleanup();
  // 8:         return 1;
  // 9:     }

  // Agent output full 5 lines where only line 8 changed:
  const agentPatch = [
    '    if (serverSocket == INVALID_SOCKET) {',
    '        std::cerr << "Error creating socket." << std::endl;',
    '        WSACleanup();',
    '        return false;',
    '    }'
  ].join("\n");

  const result = trimPatchToDelta(originalFileContent, agentPatch, 5, 9);
  console.log("\n[Test 1] 5-Line Agent Patch Trimming Result:");
  console.log(result);

  if (
    result.patch === '        return false;' &&
    result.startLine === 8 &&
    result.endLine === 8
  ) {
    console.log("✅ PASS: Trimmer accurately stripped 3 leading context lines and 1 trailing line!");
    console.log("✅ PASS: Correctly narrowed range to L8-8!");
  } else {
    console.error("❌ FAIL: Trimmer output incorrect", result);
    process.exit(1);
  }

  // Test 2: Unchanged patch (no match)
  const agentPatch2 = '        return false;';
  const result2 = trimPatchToDelta(originalFileContent, agentPatch2, 8, 8);
  console.log("\n[Test 2] 1-Line Agent Patch Result:");
  console.log(result2);

  if (
    result2.patch === '        return false;' &&
    result2.startLine === 8 &&
    result2.endLine === 8
  ) {
    console.log("✅ PASS: Single-line patch passed through unchanged.");
  } else {
    console.error("❌ FAIL: Single-line patch failed", result2);
    process.exit(1);
  }

  console.log("\n🎉 Phase 3 All Tests Passed Successfully!");
}

runTests();
