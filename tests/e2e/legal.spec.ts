import { expect, test } from "@playwright/test";

test("privacy policy covers Google user data and is dated", async ({ page }) => {
  await page.goto("/privacy");
  await expect(page.getByRole("heading", { name: "Privacy Policy", level: 1 })).toBeVisible();
  await expect(page.getByText("Last updated 29 October 2026")).toBeVisible();
  await expect(page.getByText(/openid, email and profile/)).toBeVisible();
  await expect(page.getByText(/including the Limited Use requirements/)).toBeVisible();
  await expect(page.getByRole("link", { name: "Google API Services User Data Policy" })).toHaveAttribute(
    "href",
    "https://developers.google.com/terms/api-services-user-data-policy",
  );
  await expect(page.getByRole("link", { name: "contact us" }).first()).toHaveAttribute("href", "/contact");
  await expect(page.getByRole("link", { name: "Data Deletion" })).toHaveAttribute("href", "/data-deletion");
});

test("terms are dated and link the privacy policy", async ({ page }) => {
  await page.goto("/terms");
  await expect(page.getByRole("heading", { name: "Terms of Service", level: 1 })).toBeVisible();
  await expect(page.getByText("Last updated 14 November 2026")).toBeVisible();
  // The hosted service is not open, and the terms must not say it is free to use now.
  await expect(page.getByRole("main")).toContainText("not open to new accounts yet");
  await expect(page.getByRole("main")).not.toContainText("free for now");
  await expect(page.getByRole("link", { name: "Privacy Policy" })).toHaveAttribute("href", "/privacy");
});

test("landing footer links both pages", async ({ page }) => {
  await page.goto("/");
  const footer = page.getByRole("contentinfo");
  await expect(footer.getByRole("link", { name: "Privacy" })).toHaveAttribute("href", "/privacy");
  await expect(footer.getByRole("link", { name: "Terms" })).toHaveAttribute("href", "/terms");
  const sponsor = footer.getByRole("link", { name: "Sponsor" });
  await expect(sponsor).toHaveAttribute("href", "https://github.com/sponsors/HarunRRayhan");
  await expect(sponsor).toHaveAttribute("rel", "noopener noreferrer");
});

test("data deletion page explains how to delete data", async ({ page }) => {
  await page.goto("/data-deletion");
  await expect(page.getByRole("heading", { name: "Data Deletion", level: 1 })).toBeVisible();
  await expect(page.getByText(/token or app password is deleted at once/)).toBeVisible();
  await expect(page.getByRole("link", { name: "contact us" }).first()).toHaveAttribute("href", "/contact");
  await expect(page.getByRole("link", { name: "Privacy Policy" })).toHaveAttribute("href", "/privacy");
});
