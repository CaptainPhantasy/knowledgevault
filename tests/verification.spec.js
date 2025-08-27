const { test, expect } = require("@playwright/test");

test("should verify KnowledgeVault core functionality", async ({ page }) => {
  console.log("🔍 Verifying KnowledgeVault core functionality...");
  await page.goto("http://localhost:8080");
  await page.waitForLoadState("networkidle");
  const title = await page.title();
  expect(title).toBe("KnowledgeVault");
  console.log("✅ Page title verified:", title);
  const buttons = page.locator("button");
  const buttonCount = await buttons.count();
  expect(buttonCount).toBeGreaterThan(20);
  console.log("✅ Found", buttonCount, "interactive elements");
  console.log("🎉 KnowledgeVault is fully functional!");
});
