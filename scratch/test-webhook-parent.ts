// Unit test for Phase 2: Webhook Parent Comment Context Resolution

async function resolveParentContext(comment: {
  body: string;
  in_reply_to_id?: number;
  line?: number;
  original_line?: number;
  start_line?: number;
  original_start_line?: number;
}, mockFetchParent?: (id: number) => Promise<{ body: string; line: number; start_line?: number }>) {
  let findingText = comment.body.replace("@codelens fix", "").trim() || "User requested Auto-Fix via comment mention.";
  let targetEndLine = comment.original_line || comment.line || 1;
  let targetStartLine = comment.original_start_line || comment.start_line || targetEndLine;

  if (comment.in_reply_to_id && mockFetchParent) {
    try {
      const parentComment = await mockFetchParent(comment.in_reply_to_id);
      if (parentComment?.body) {
        findingText = `Original Bug Finding:\n${parentComment.body}`;
        targetEndLine = parentComment.line || targetEndLine;
        targetStartLine = parentComment.start_line || targetEndLine;
      }
    } catch (err) {
      console.warn("Failed to fetch parent context", err);
    }
  }

  return { findingText, targetStartLine, targetEndLine };
}

async function runTests() {
  console.log("=== Testing Phase 2: Webhook Parent Comment Context Resolution ===");

  // Test 1: Direct comment without reply
  const directComment = {
    body: "@codelens fix",
    line: 31,
    start_line: 31,
  };
  const res1 = await resolveParentContext(directComment);
  console.log("\n[Test 1] Direct Comment Resolution:");
  console.log(res1);
  if (res1.targetStartLine === 31 && res1.targetEndLine === 31 && res1.findingText.includes("User requested")) {
    console.log("✅ PASS: Direct comment resolution fallback working.");
  } else {
    console.error("❌ FAIL: Direct comment failed", res1);
    process.exit(1);
  }

  // Test 2: Reply to CodeLens finding
  const replyComment = {
    body: "@codelens fix please check this",
    in_reply_to_id: 12345,
    line: 58, // User highlighted lines 30-58 in GitHub UI
    start_line: 30,
  };

  const mockParent = async (id: number) => ({
    body: "### 🚨 [bug] CRITICAL\n**Issue:** Returns 1 instead of false\n**Suggestion:** Change return 1 to return false",
    line: 31,
    start_line: 31,
  });

  const res2 = await resolveParentContext(replyComment, mockParent);
  console.log("\n[Test 2] Reply Comment Resolution:");
  console.log(res2);
  if (res2.targetStartLine === 31 && res2.targetEndLine === 31 && res2.findingText.includes("Original Bug Finding")) {
    console.log("✅ PASS: Reply comment correctly resolved parent claim and line 31.");
  } else {
    console.error("❌ FAIL: Reply comment resolution failed", res2);
    process.exit(1);
  }

  console.log("\n🎉 Phase 2 All Tests Passed Successfully!");
}

runTests();
