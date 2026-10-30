// Fixes a real bug in 10-amarenti-import.ts: it uploaded only the original image bytes via the
// generic scripts/supabase/storage.ts uploadFile() helper, never generating the pre-sized WebP
// width-tier siblings (<path>.w480.webp / .w960.webp / .w1600.webp) that lib/image-loader.ts (the
// site's custom next/image loader -- see that file's own comment) rewrites every requested width
// to. Every other real image on the site gets those siblings from
// lib/supabase/upload-with-variants.ts at upload time; this backfills them for the paths this
// import already uploaded (imports/amarenti/*.ext and imports/amarenti/_collections/*.ext),
// without touching the already-uploaded originals (upsert: false on those would just error, so
// this re-reads the same local files and uploads only the derived variants, upsert: true).
import { readFileSync, readdirSync } from "node:fs";
import { join, extname } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { generateWebpVariants } from "../../../lib/image-processing.ts";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

const DATA_DIR = join(process.cwd(), "data/exports/amarenti");
const log = (...a: unknown[]) => console.log(...a);

async function processOne(localFile: string, storagePath: string) {
  const buffer = readFileSync(localFile);
  const variants = await generateWebpVariants(storagePath, buffer);
  for (const v of variants) {
    const { error } = await supabase.storage.from("product-media").upload(v.path, v.buffer, { contentType: "image/webp", upsert: true, cacheControl: "31536000" });
    if (error) throw new Error(`${v.path}: ${error.message}`);
  }
  log(`  ✓ ${storagePath} -> ${variants.length} variants`);
}

async function main() {
  // Product images: data/exports/amarenti/images/<handle>/01.<ext> -> imports/amarenti/<handle>.<ext>
  const productDirs = readdirSync(join(DATA_DIR, "images"));
  log(`== Product image variants (${productDirs.length}) ==`);
  for (const handle of productDirs) {
    const dir = join(DATA_DIR, "images", handle);
    const file = readdirSync(dir)[0];
    const ext = extname(file);
    await processOne(join(dir, file), `imports/amarenti/${handle}${ext}`);
  }

  // Collection-specific local images -- only these 6 collections were uploaded under _collections/
  // by 10-amarenti-import.ts (the other 6 reuse a product's own image path, already covered above
  // by the product image loop, since USE_EXPORTED_PRODUCT_IMAGE routed them there instead).
  log(`\n== Collection image variants ==`);
  const USES_OWN_LOCAL_IMAGE = ["lv-vaskor", "gg-vaskor", "miu-vaskor", "jacq-vaskor", "gift-sets", "cc-planbocker"];
  for (const handle of USES_OWN_LOCAL_IMAGE) {
    const file = readdirSync(join(DATA_DIR, "collections-images")).find((f) => f.startsWith(handle + "."));
    if (!file) throw new Error(`No local collections-images file found for ${handle}`);
    await processOne(join(DATA_DIR, "collections-images", file), `imports/amarenti/_collections/${handle}${extname(file)}`);
  }

  log("\nKlart.");
}

main().catch((e) => {
  console.error(`\nFEL: ${e.message}`);
  process.exit(1);
});
