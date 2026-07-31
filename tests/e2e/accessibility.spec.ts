import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("login page has no detectable accessibility violations", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Se connecter" })).toBeVisible();
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});

for (const scenario of [
  { name: "dashboard", path: "/" },
  { name: "audit form", path: "/audits" },
  { name: "evidence page", path: "/evidence" },
]) {
  test.fixme(`${scenario.name} accessibility`, async ({ page }) => {
    await page.goto(scenario.path);
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });
}
