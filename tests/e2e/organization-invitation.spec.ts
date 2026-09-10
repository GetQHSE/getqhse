import { expect, test } from "@playwright/test";

const ownerEmail = process.env["E2E_OWNER_EMAIL"];
const ownerPassword = process.env["E2E_OWNER_PASSWORD"];
const invitationEmailConfigured = process.env["E2E_INVITATION_TEMPLATE_CONFIGURED"] === "true";
const enabled = Boolean(ownerEmail && ownerPassword && invitationEmailConfigured);
const fakeBrevoUrl = process.env["FAKE_BREVO_URL"] ?? "http://127.0.0.1:4179";

test.describe("organization invitation lifecycle", () => {
  test.skip(!enabled, "Set owner credentials and configure the invitation template for E2E");
  test.describe.configure({ mode: "serial" });

  test("owner invitation, recipient signup, acceptance, role change, and suspension", async ({
    browser,
    page,
    request,
  }) => {
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const recipientEmail = `e2e-member-${suffix}@example.test`;
    const recipientName = `E2E Member ${suffix}`;
    const recipientPassword = "E2e-member-password-123!";
    await request.delete(`${fakeBrevoUrl}/__messages`);

    await page.goto("/login");
    await page.getByLabel("Adresse e-mail").fill(ownerEmail!);
    await page.getByLabel("Mot de passe").fill(ownerPassword!);
    await page.getByRole("button", { name: "Se connecter" }).click();
    await page.goto("/team");
    await page.getByLabel("Adresse e-mail à inviter").fill(recipientEmail);
    await page.getByRole("button", { name: "Inviter" }).click();
    await expect(page.getByText(recipientEmail)).toBeVisible();

    await expect
      .poll(async () => {
        const response = await request.get(`${fakeBrevoUrl}/__messages`);
        const messages = (await response.json()) as Array<{ params?: { recipientEmail?: string } }>;
        return messages.some((message) => message.params?.recipientEmail === recipientEmail);
      })
      .toBe(true);
    const response = await request.get(`${fakeBrevoUrl}/__messages`);
    const messages = (await response.json()) as Array<{
      params?: { recipientEmail?: string; invitationUrl?: string };
    }>;
    const invitationUrl = messages.find(
      (message) => message.params?.recipientEmail === recipientEmail,
    )?.params?.invitationUrl;
    expect(invitationUrl).toBeTruthy();

    const recipientContext = await browser.newContext();
    const recipientPage = await recipientContext.newPage();
    await recipientPage.goto(invitationUrl!);
    await recipientPage.getByRole("link", { name: "Créer un compte" }).click();
    await recipientPage.getByLabel("Nom complet").fill(recipientName);
    await recipientPage.getByLabel("Adresse e-mail").fill(recipientEmail);
    await recipientPage.getByLabel("Mot de passe").fill(recipientPassword);
    await recipientPage.getByRole("button", { name: "S’inscrire" }).click();
    await expect(recipientPage).toHaveURL(/\/accept-invitation\//);
    await recipientPage.getByRole("button", { name: "Accepter et rejoindre" }).click();
    await expect(recipientPage).toHaveURL("/");

    await page.reload();
    await page.goto("/team");
    await page.getByLabel(`Rôle de ${recipientName}`).selectOption("admin");
    await expect(page.getByLabel(`Rôle de ${recipientName}`)).toHaveValue("admin");
    page.once("dialog", (dialog) => dialog.accept());
    const recipientRow = page
      .getByText(recipientEmail)
      .locator("xpath=ancestor::div[contains(@class,'lg:flex-row')]");
    await recipientRow.getByRole("button", { name: "Suspendre" }).click();
    await expect(page.getByRole("heading", { name: /Membres suspendus \(1\)/ })).toBeVisible();
    await recipientContext.close();
  });
});
