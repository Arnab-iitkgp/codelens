// Unit test for Phase 4: Range Delta Preservation in Existence Checks

function performExistenceChecksSnapping(
  finding: { startLine: number; endLine: number; file: string },
  validLines: number[]
) {
  const closestLine = validLines.reduce((prev, curr) => 
    Math.abs(curr - finding.startLine) < Math.abs(prev - finding.startLine) ? curr : prev
  );

  if (Math.abs(closestLine - finding.startLine) <= 25) {
    const lineDelta = Math.max(0, finding.endLine - finding.startLine);
    finding.startLine = closestLine;
    finding.endLine = closestLine + lineDelta;
    return true;
  }
  return false;
}

function runTests() {
  console.log("=== Testing Phase 4: Range Delta Preservation in Existence Checks ===");

  const validLines = [10, 11, 12, 28, 29, 30, 31, 32];

  // Test 1: Single-line finding snapping (e.g. LLM said L33, valid is L32)
  const f1 = { startLine: 33, endLine: 33, file: "src/server/server.cpp" };
  performExistenceChecksSnapping(f1, validLines);
  console.log("\n[Test 1] Single-Line Snapping (33->32):");
  console.log(f1);
  if (f1.startLine === 32 && f1.endLine === 32) {
    console.log("✅ PASS: Single-line finding preserves delta 0 (32-32).");
  } else {
    console.error("❌ FAIL: Single-line snapping output incorrect", f1);
    process.exit(1);
  }

  // Test 2: Multi-line finding snapping (e.g. LLM said L26-29, valid is L28)
  const f2 = { startLine: 26, endLine: 29, file: "src/server/server.cpp" };
  performExistenceChecksSnapping(f2, validLines);
  console.log("\n[Test 2] Multi-Line Snapping (26-29 -> 28-31):");
  console.log(f2);
  if (f2.startLine === 28 && f2.endLine === 31) {
    console.log("✅ PASS: Multi-line finding preserves delta 3 (28-31).");
  } else {
    console.error("❌ FAIL: Multi-line snapping output incorrect", f2);
    process.exit(1);
  }

  console.log("\n🎉 Phase 4 All Tests Passed Successfully!");
}

runTests();
