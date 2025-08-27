const { test, expect } = require("@playwright/test");

test("should explore all buttons on KnowledgeVault page", async ({ page }) => {
  console.log("🔍 Exploring KnowledgeVault buttons...");
  await page.goto("http://localhost:8080");
  await page.waitForLoadState("networkidle");
  const buttons = page.locator("button");
  const buttonCount = await buttons.count();
  console.log("Found", buttonCount, "buttons on the page");
  for (let i = 0; i < buttonCount; i++) {
    const button = buttons.nth(i);
    const buttonText = await button.textContent();
    console.log("Button", i + 1, ":", buttonText);
  }
});
