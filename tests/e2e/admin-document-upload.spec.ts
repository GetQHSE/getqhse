import { expect, test, type Page } from "@playwright/test";

const adminBaseUrl = process.env["E2E_ADMIN_BASE_URL"] ?? "http://localhost:5174";
const email = process.env["E2E_ADMIN_USER_EMAIL"] ?? process.env["BOOTSTRAP_SUPER_ADMIN_EMAIL"];
const password =
  process.env["E2E_ADMIN_USER_PASSWORD"] ?? process.env["BOOTSTRAP_SUPER_ADMIN_PASSWORD"];

async function completeUploadWizard(page: Page, versionLabel = "1") {
  await page.getByRole("button", { name: "Continue" }).dispatchEvent("click");
  await expect(page.getByLabel("Title")).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).dispatchEvent("click");
  await expect(page.getByLabel("Document type")).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).dispatchEvent("click");
  await expect(page.getByLabel("Version label")).toBeVisible();
  await page.getByLabel("Version label").fill(versionLabel);
}

test.describe("admin document upload", () => {
  test.skip(!email || !password, "Set E2E admin credentials or bootstrap credentials");

  test.beforeEach(async ({ page }) => {
    await page.goto(`${adminBaseUrl}/login`);
    await page.getByLabel("Email").fill(email!);
    await page.getByLabel("Password").fill(password!);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(`${adminBaseUrl}/`);
  });

  test("uploads a version on the first attempt and detects a confirmed duplicate", async ({
    page,
  }) => {
    const runId = `${Date.now()}-${test.info().parallelIndex}`;
    const file = {
      name: `upload-e2e-${runId}.txt`,
      mimeType: "text/plain",
      buffer: Buffer.from(`QHSE document upload E2E ${runId}\n`),
    };

    await page.goto(`${adminBaseUrl}/documents/upload`);
    await page.locator('input[type="file"]').setInputFiles(file);
    await completeUploadWizard(page);
    const firstUpload = page.getByRole("button", { name: "Upload and process" });
    await expect(firstUpload).toBeEnabled();
    await firstUpload.dispatchEvent("click");
    await page.waitForURL((url) => {
      const segments = url.pathname.split("/").filter(Boolean);
      return segments.length === 2 && segments[0] === "documents" && segments[1] !== "upload";
    });

    await expect(page.getByRole("alert")).toHaveCount(0);
    const documentId = new URL(page.url()).pathname.split("/").at(-1)!;
    await expect(page.getByRole("button", { name: "Processing…" })).toBeDisabled();
    await page.getByRole("tab", { name: "files" }).click();
    await expect(page.getByText(file.name)).toBeVisible();

    await expect
      .poll(
        async () => {
          await page.reload();
          return page.getByRole("button", { name: "Reprocess" }).isVisible();
        },
        { timeout: 60_000 },
      )
      .toBe(true);
    await page.getByRole("tab", { name: "extracted" }).click();
    await expect(page.getByText(`QHSE document upload E2E ${runId}`)).toBeVisible();
    await page.getByRole("tab", { name: "structure" }).click();
    await expect(page.getByText("Section 1")).toBeVisible();
    await page.getByRole("tab", { name: "classification" }).click();
    await expect(page.getByText(/suggestion$/).first()).toBeVisible();
    await page.getByRole("tab", { name: "relationships" }).click();
    await expect(
      page.getByText("No references to another indexed document were detected"),
    ).toBeVisible();

    await page.goto(`${adminBaseUrl}/documents/upload?document=${documentId}`);
    await page.locator('input[type="file"]').setInputFiles(file);
    await completeUploadWizard(page, "2");
    const duplicateUpload = page.getByRole("button", { name: "Upload and process" });
    await expect(duplicateUpload).toBeEnabled();
    await duplicateUpload.dispatchEvent("click");

    await expect(page.getByRole("alert")).toContainText("Duplicate file detected");
    await expect(page).toHaveURL(`${adminBaseUrl}/documents/upload?document=${documentId}`);

    await page.goto(`${adminBaseUrl}/documents/${documentId}`);
    await page.getByRole("button", { name: "Accept" }).click();
    await expect(page.getByRole("button", { name: "Accept" })).toHaveCount(0);
    await page.getByRole("tab", { name: "classification" }).click();
    await page.getByRole("button", { name: "Approve", exact: true }).first().click();
    await expect(page.getByText("Approved").first()).toBeVisible();
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Validate" }).click();
    await expect(page.getByRole("button", { name: "Publish" })).toBeVisible();
  });
});
