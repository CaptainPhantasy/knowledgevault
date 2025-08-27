const { test, expect } = require("@playwright/test");

test("should test KnowledgeVault functionality", async ({ page }) => {
  console.log("🚀 Starting KnowledgeVault testing...");
  await page.goto("http://localhost:8080");
  await page.waitForLoadState("networkidle");
  console.log("✅ Page loaded successfully");
});
  // Test page title
  const title = await page.title();
  expect(title).toBe("KnowledgeVault");
  console.log("✅ Page title verified:", title);
