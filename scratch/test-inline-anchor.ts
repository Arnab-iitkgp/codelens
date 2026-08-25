import { type ReviewOutput } from "../module/review/lib/engine";

// Helper function to test payload generation logic from postInlineReview
function generateGitHubCommentsPayload(findings: ReviewOutput["findings"]) {
  return findings.map(finding => {
    const emoji = finding.severity === "critical" ? "🚨" : finding.severity === "warning" ? "⚠️" : "💡";
    let commentBody = `### ${emoji} [${finding.category}] ${finding.severity.toUpperCase()}\n`;
    commentBody += `**Issue:** ${finding.claim}\n\n`;
    commentBody += `**Evidence:** ${finding.evidence}\n\n`;
    commentBody += `**Suggestion:** ${finding.suggestion}`;

    const isMultiLine = finding.startLine !== finding.endLine && finding.startLine > 0;

    return {
      path: finding.file,
      line: finding.endLine,
      ...(isMultiLine ? { start_line: finding.startLine } : {}),
      body: commentBody
    };
  });
}

function runTests() {
  console.log("=== Testing Phase 1: GitHub Inline Comment Anchor Mapping ===");

  const singleLineFinding: ReviewOutput["findings"][number] = {
    file: "src/server/server.cpp",
    startLine: 31,
    endLine: 31,
    severity: "critical",
    category: "bug",
    claim: "Returns 1 instead of false",
    evidence: "return 1;",
    suggestion: "return false;",
    affects: [],
    confidence: "3/3"
  };

  const multiLineFinding: ReviewOutput["findings"][number] = {
    file: "src/server/server.cpp",
    startLine: 28,
    endLine: 31,
    severity: "critical",
    category: "bug",
    claim: "Entire socket init returns 1 on failure",
    evidence: "if(serverSocket == INVALID_SOCKET) { ... return 1; }",
    suggestion: "Change return 1 to return false",
    affects: [],
    confidence: "3/3"
  };

  const payload = generateGitHubCommentsPayload([singleLineFinding, multiLineFinding]);

  // Test 1: Single Line Comment
  const single = payload[0];
  console.log("\n[Test 1] Single Line Comment Payload:");
  console.log(single);
  if (single.line === 31 && single.start_line === undefined) {
    console.log("✅ PASS: Single-line comment targets line 31 without start_line.");
  } else {
    console.error("❌ FAIL: Single-line payload incorrect", single);
    process.exit(1);
  }

  // Test 2: Multi-Line Comment
  const multi = payload[1];
  console.log("\n[Test 2] Multi-Line Comment Payload:");
  console.log(multi);
  if (multi.line === 31 && multi.start_line === 28) {
    console.log("✅ PASS: Multi-line comment targets line 31 with start_line 28.");
  } else {
    console.error("❌ FAIL: Multi-line payload incorrect", multi);
    process.exit(1);
  }

  console.log("\n🎉 Phase 1 All Tests Passed Successfully!");
}

runTests();
