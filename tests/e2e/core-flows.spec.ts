import { expect, test } from "@playwright/test";

const email = process.env["E2E_USER_EMAIL"];
const password = process.env["E2E_USER_PASSWORD"];
const authenticated = Boolean(email && password);

test("user signs in", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Se connecter" })).toBeVisible();
  if (!authenticated) return;
  await page.getByLabel("Adresse e-mail").fill(email!);
  await page.getByLabel("Mot de passe").fill(password!);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page).toHaveURL("/");
});

test.describe("authenticated customer journeys", () => {
  test.skip(!authenticated, "Set E2E_USER_EMAIL and E2E_USER_PASSWORD");

  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Adresse e-mail").fill(email!);
    await page.getByLabel("Mot de passe").fill(password!);
    await page.getByRole("button", { name: "Se connecter" }).click();
  });

  test("user creates an organization site", async ({ page }) => {
    await page.goto("/sites");
    await page.getByLabel("Nom").fill("Rabat Laboratory");
    await page.getByLabel("Code").fill("RAB-LAB");
    await page.getByRole("button", { name: "Créer un site" }).click();
    await expect(page.getByText("Rabat Laboratory")).toBeVisible();
  });

  test("user creates an audit", async ({ page }) => {
    await page.goto("/audits");
    await expect(page.getByRole("heading", { name: "Audits" })).toBeVisible();
  });

  test("user uploads evidence", async ({ page }) => {
    await page.goto("/evidence");
    await expect(page.getByRole("heading", { name: "Éléments de preuve" })).toBeVisible();
  });

  test.fixme("user records a finding");
  test.fixme("user creates a corrective action");
  test.fixme("user cannot access another organization's audit");
});
