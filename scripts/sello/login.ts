// Logs into sello.bio with password auth and leaves a screenshot proving it worked.
// Usage: tsx scripts/sello/login.ts [screenshotDir] [authStatePath]
// Output (screenshots, session cookies) goes outside the repo by default — never commit auth state.
import { config } from "dotenv";
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

config({ path: ".env.local" });

const EMAIL = process.env.SELLO_EMAIL;
const PASSWORD = process.env.SELLO_PASSWORD;
if (!EMAIL || !PASSWORD) throw new Error("Missing SELLO_EMAIL / SELLO_PASSWORD env vars");

const shotDir = process.argv[2] ?? "/tmp/sello-bot/screenshots";
const authStatePath = process.argv[3] ?? "/tmp/sello-bot/auth-state.json";
mkdirSync(shotDir, { recursive: true });

async function main() {
  const browser = await chromium.launch({
    executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  });
  const page = await browser.newPage();

  await page.goto("https://sello.bio/web/?auth=login", { waitUntil: "networkidle" });
  await page.screenshot({ path: `${shotDir}/01-login-page.png` });

  await page.getByPlaceholder(/email/i).or(page.getByLabel(/email/i)).first().fill(EMAIL);
  await page.getByText("Continue with a password", { exact: false }).click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${shotDir}/02-password-step.png` });

  const passwordInput = page.getByPlaceholder(/password/i).or(page.getByLabel(/password/i)).first();
  await passwordInput.fill(PASSWORD);
  await page.getByRole("button", { name: "Log in", exact: true }).click();

  await page.waitForTimeout(3000);
  await page.screenshot({ path: `${shotDir}/03-after-login.png` });

  console.log("Current URL:", page.url());

  await page.context().storageState({ path: authStatePath });
  console.log(`Saved auth state to ${authStatePath}`);

  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
