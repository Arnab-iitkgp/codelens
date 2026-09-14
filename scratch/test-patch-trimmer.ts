import { trimPatchToDelta } from "../module/ai/lib/auto-fix";

function runTests() {
  console.log("=== Testing Phase 3: Deterministic Patch Trimming (with CRLF & Bounds Fixes) ===");

  // Test 1: Standard LF trimming
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

  const agentPatch = [
    '    if (serverSocket == INVALID_SOCKET) {',
    '        std::cerr << "Error creating socket." << std::endl;',
    '        WSACleanup();',
    '        return false;',
    '    }'
  ].join("\n");

  const result = trimPatchToDelta(originalFileContent, agentPatch, 5, 9);
  console.log("\n[Test 1] Standard LF Trimming:");
  console.log(result);

  if (
    result.patch === '        return false;' &&
    result.startLine === 8 &&
    result.endLine === 8
  ) {
    console.log("✅ PASS: Trimmer accurately stripped leading & trailing context lines!");
  } else {
    console.error("❌ FAIL: Test 1 failed", result);
    process.exit(1);
  }

  // Test 2: CRLF (\r\n) line endings trimming
  const originalFileCRLF = originalFileContent.replace(/\n/g, "\r\n");
  const resultCRLF = trimPatchToDelta(originalFileCRLF, agentPatch, 5, 9);
  console.log("\n[Test 2] Windows CRLF (\\r\\n) Trimming:");
  console.log(resultCRLF);

  if (
    resultCRLF.patch === '        return false;' &&
    resultCRLF.startLine === 8 &&
    resultCRLF.endLine === 8
  ) {
    console.log("✅ PASS: CRLF line endings normalized and trimmed successfully!");
  } else {
    console.error("❌ FAIL: Test 2 CRLF failed", resultCRLF);
    process.exit(1);
  }

  // Test 3: startLine = 0 bounds clamping
  const resultBounds = trimPatchToDelta(originalFileContent, "    if (serverSocket == INVALID_SOCKET) {", 0, 5);
  console.log("\n[Test 3] Bounds Clamping (startLine = 0):");
  console.log(resultBounds);

  if (resultBounds.startLine >= 1) {
    console.log("✅ PASS: startLine = 0 safely clamped to safeStart = 1!");
  } else {
    console.error("❌ FAIL: Test 3 bounds failed", resultBounds);
    process.exit(1);
  }

  console.log("\n🎉 All Trimmer Edge Case Tests Passed Successfully!");
}

runTests();
