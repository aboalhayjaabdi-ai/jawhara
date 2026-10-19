// Drives the Sello.bio "Add product -> Sell your own product" flow and publishes one
// listing from an export produced by export-product.ts.
//
// Usage: tsx scripts/sello/create-listing.ts <listingDir> [screenshotDir]
//   tsx scripts/sello/create-listing.ts data/sello-export/h-armband-3
//
// Logs in fresh each run (password auth). Screenshots of each step go to screenshotDir
// (default /tmp/sello-bot/screenshots/<handle>) so a human can review before a batch run.
import { config } from "dotenv";
import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { chromium, type Page } from "playwright";

config({ path: ".env.local" });

const EMAIL = process.env.SELLO_EMAIL;
const PASSWORD = process.env.SELLO_PASSWORD;
if (!EMAIL || !PASSWORD) throw new Error("Missing SELLO_EMAIL / SELLO_PASSWORD env vars");

type SelloListing = {
  sourceProductId: string;
  handle: string;
  title: string;
  description: string;
  singlePrice: number | null;
  images: { url: string; localPath: string; alt: string | null }[];
  variants: {
    title: string;
    option1: string | null;
    option2: string | null;
    option3: string | null;
    price: number;
    compareAtPrice: number | null;
    sku: string | null;
  }[];
  freeShipping: true;
};

// Clicks the deepest element whose trimmed textContent exactly equals `text`.
// Used for plain clickable rows/buttons where Playwright's own locator is ambiguous
// across this single-page app's many off-screen, simultaneously-mounted panels.
async function clickExactText(page: Page, text: string): Promise<boolean> {
  return page.evaluate((t) => {
    const candidates = Array.from(document.querySelectorAll("body *")).filter(
      (el) => el.textContent?.trim() === t
    );
    const el = candidates.sort((a, b) => b.querySelectorAll("*").length - a.querySelectorAll("*").length).pop();
    if (!el) return false;
    (el as HTMLElement).click();
    return true;
  }, text);
}

// Toggles a switch identified by its adjacent label text (label span + sibling <button>).
async function clickToggleByLabel(page: Page, label: string): Promise<boolean> {
  return page.evaluate((t) => {
    const candidates = Array.from(document.querySelectorAll("body *")).filter(
      (el) => el.textContent?.trim() === t
    );
    const span = candidates.sort((a, b) => b.querySelectorAll("*").length - a.querySelectorAll("*").length).pop();
    if (!span) return false;
    const btn = span.nextElementSibling;
    if (!btn || btn.tagName !== "BUTTON") return false;
    (btn as HTMLElement).click();
    return true;
  }, label);
}

// Tags the element matched by `finder` (run in page context) with a unique data attribute
// so a Playwright locator can address it unambiguously afterwards.
async function tagUnique(page: Page, tag: string, finder: string): Promise<boolean> {
  return page.evaluate(
    ({ tag, finder }) => {
      // eslint-disable-next-line no-new-func
      const fn = new Function(`return (${finder})`)();
      const el = fn();
      if (!el) return false;
      el.setAttribute(`data-sello-bot-${tag}`, "1");
      return true;
    },
    { tag, finder }
  );
}

async function loginAndGetToOwnInventoryForm(page: Page, shotDir: string) {
  await page.goto("https://sello.bio/web/?auth=login", { waitUntil: "networkidle" });
  await page.getByPlaceholder(/email/i).or(page.getByLabel(/email/i)).first().fill(EMAIL!);
  await page.getByText("Continue with a password", { exact: false }).click();
  await page.waitForTimeout(500);
  await page.getByPlaceholder(/password/i).or(page.getByLabel(/password/i)).first().fill(PASSWORD!);
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${shotDir}/01-logged-in.png` });

  const acceptAll = page.getByRole("button", { name: "Accept all" });
  if (await acceptAll.isVisible().catch(() => false)) await acceptAll.click();

  await page.getByRole("button", { name: "Add product" }).first().click();
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${shotDir}/02-add-product-menu.png` });

  await page.getByText("Sell your own product", { exact: true }).click();
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${shotDir}/03-own-inventory-blank.png` });
}

function guessOptionLabel(values: string[]): string {
  const joined = values.join(" ").toLowerCase();
  if (/\b(cm|mm|xs|xl|xxl|^s$|^m$|^l$|small|medium|large|size)\b/.test(joined)) return "Size";
  const colorWords = ["red", "blue", "green", "black", "white", "gold", "silver", "pink", "yellow", "purple", "grey", "gray", "brown", "beige"];
  if (colorWords.some((c) => joined.includes(c))) return "Color";
  return "Option";
}

async function main() {
  const listingDir = process.argv[2];
  if (!listingDir) {
    console.error("Usage: tsx scripts/sello/create-listing.ts <listingDir> [screenshotDir]");
    process.exit(1);
  }
  const listing: SelloListing = JSON.parse(readFileSync(path.join(listingDir, "listing.json"), "utf8"));
  const shotDir = process.argv[3] ?? `/tmp/sello-bot/screenshots/${listing.handle}`;
  mkdirSync(shotDir, { recursive: true });

  const browser = await chromium.launch({
    executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  });
  const page = await browser.newPage();

  let publishFailed: string | null = null;
  page.on("console", (msg) => {
    if (msg.type() === "error" && /product creation failed/i.test(msg.text())) publishFailed = msg.text();
  });
  page.on("response", (res) => {
    if (res.url().includes("/products") && res.request().method() === "POST" && !res.ok()) {
      publishFailed = `POST ${res.url()} -> ${res.status()}`;
    }
  });

  try {
    await loginAndGetToOwnInventoryForm(page, shotDir);

    // --- Title ---
    await page.getByPlaceholder("e.g. Linen tote bag").fill(listing.title);

    // --- Price / discount (scoped to the Title input's own card to avoid the
    // off-screen "0.00" input that belongs to an unrelated hidden dialog) ---
    const allSamePrice = listing.variants.every((v) => v.price === listing.variants[0].price);
    const allSameCompareAt = listing.variants.every((v) => v.compareAtPrice === listing.variants[0].compareAtPrice);
    const sellPrice = listing.singlePrice ?? listing.variants[0].price;
    const compareAt =
      allSamePrice && allSameCompareAt && listing.variants[0].compareAtPrice && listing.variants[0].compareAtPrice > sellPrice
        ? listing.variants[0].compareAtPrice
        : null;

    await tagUnique(
      page,
      "price",
      `() => { const t = document.querySelector('input[placeholder="e.g. Linen tote bag"]'); const card = t && t.parentElement; return card && card.querySelector('input[placeholder="0.00"]'); }`
    );
    await page.locator('input[data-sello-bot-price="1"]').fill(String(compareAt ?? sellPrice));

    if (compareAt) {
      const toggled = await clickToggleByLabel(page, "Discount this product");
      if (!toggled) console.warn("  WARN: could not find Discount toggle");
      await page.waitForTimeout(300);
      await tagUnique(
        page,
        "discounted-price",
        `() => document.querySelector('input[placeholder="Discounted price"]')`
      );
      await page.locator('input[data-sello-bot-discounted-price="1"]').fill(String(sellPrice));
    }

    // --- Description ---
    await page.getByPlaceholder("What's included, who it's for…").fill(listing.description);
    await page.screenshot({ path: `${shotDir}/04-basics-filled.png` });

    // --- Images ---
    const tagged = await tagUnique(
      page,
      "photos",
      `() => { const b = Array.from(document.querySelectorAll('button')).find(b => b.textContent?.includes('Add photos')); return b && b.previousElementSibling && b.previousElementSibling.tagName === 'INPUT' ? b.previousElementSibling : null; }`
    );
    if (!tagged) throw new Error("Could not find the product photos file input");
    const resolvedImagePaths = listing.images.map((img) => path.resolve(img.localPath));
    await page.locator('input[data-sello-bot-photos="1"]').setInputFiles(resolvedImagePaths);
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `${shotDir}/05-photos-added.png`, fullPage: true });

    // --- Variants ---
    if (listing.variants.length > 1) {
      await clickExactText(page, "Different variations");
      await page.waitForTimeout(400);

      // Which option dimensions are actually used (option1/2/3)?
      const dims: ("option1" | "option2" | "option3")[] = (["option1", "option2", "option3"] as const).filter((d) =>
        listing.variants.some((v) => v[d] !== null && v[d] !== "")
      );

      for (const dim of dims) {
        const values: string[] = [];
        for (const v of listing.variants) {
          const val = v[dim];
          if (val && !values.includes(val)) values.push(val);
        }
        const label = guessOptionLabel(values);

        await clickExactText(page, "+ Custom option");
        await page.waitForTimeout(300);

        // The newest option group is the last one in the DOM.
        await page.locator('input[placeholder="Option name (e.g. Size)"]').last().fill(label);
        const addValueInput = page.locator('input[placeholder="Add value"]').last();
        for (const val of values) {
          await addValueInput.fill(val);
          await addValueInput.press("Enter");
          await page.waitForTimeout(150);
        }
      }
      await page.waitForTimeout(400);
      await page.screenshot({ path: `${shotDir}/06-variant-options.png`, fullPage: true });

      if (!allSamePrice) {
        console.warn("  WARN: variant prices differ — enabling per-variant pricing (best effort)");
        await clickToggleByLabel(page, "Set a price per variant");
        await page.waitForTimeout(400);
        const priceInputs = page.locator('input[placeholder="0.00"]');
        const all = await priceInputs.all();
        let idx = 0;
        for (const input of all) {
          const box = await input.boundingBox();
          if (!box || box.y < 0 || box.y > 2000) continue; // skip off-screen decoy inputs from unrelated hidden dialogs
          if (idx < listing.variants.length) {
            await input.fill(String(listing.variants[idx].price));
            idx++;
          }
        }
        if (idx !== listing.variants.length) {
          console.warn(`  WARN: filled ${idx} per-variant price inputs but expected ${listing.variants.length} — review before publishing`);
        }
      }
      await page.screenshot({ path: `${shotDir}/07-variants-done.png`, fullPage: true });
    }

    // --- Shipping: Free shipping ---
    const shippingClicked = await clickExactText(page, "Free shipping");
    if (!shippingClicked) console.warn("  WARN: could not click Free shipping");
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${shotDir}/08-shipping-set.png`, fullPage: true });

    // --- Review before publish ---
    await page.screenshot({ path: `${shotDir}/09-before-publish.png`, fullPage: true });

    await page.getByRole("button", { name: "Publish product", exact: true }).click();
    await page.waitForTimeout(4000);
    await page.screenshot({ path: `${shotDir}/10-after-publish.png`, fullPage: true });

    if (publishFailed) {
      console.error(`PUBLISH FAILED: ${publishFailed}`);
      process.exitCode = 1;
    } else {
      console.log(`Done. Screenshots in ${shotDir}`);
    }
    console.log(`Current URL: ${page.url()}`);
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
