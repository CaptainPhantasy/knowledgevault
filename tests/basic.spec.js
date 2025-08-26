const { test, expect } = require("@playwright/test");

test("should load the application", async ({ page }) => {
  await page.goto("http://localhost:8080");
  const title = await page.title();
  expect(title).toBe("KnowledgeVault");
});
