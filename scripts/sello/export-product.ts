// Reads one Jawhara product out of Supabase and writes everything the Sello listing bot
// needs for it: title, price, description text, downloaded images, and variants.
//
// Usage: tsx scripts/sello/export-product.ts <handle-or-id> [outDir]
//   tsx scripts/sello/export-product.ts h-armband-3

import { config } from "dotenv";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { ProxyAgent, setGlobalDispatcher } from "undici";
import { htmlToText } from "./html-to-text.ts";

config({ path: ".env.local" });

const proxyUrl = process.env.HTTPS_PROXY ?? process.env.https_proxy;
if (proxyUrl) setGlobalDispatcher(new ProxyAgent(proxyUrl));

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var ${name}`);
  return value;
}

const SUPABASE_URL = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
const SERVICE_KEY = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

function mediaUrl(storagePath: string): string {
  return `${SUPABASE_URL}/storage/v1/object/public/product-media/${storagePath}`;
}

async function rest<T>(pathAndQuery: string): Promise<T> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${pathAndQuery}`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
  });
  if (!res.ok) throw new Error(`Supabase REST error ${res.status}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

type ProductRow = {
  id: string;
  title: string;
  handle: string;
  status: string;
  description_html: string | null;
};

type VariantRow = {
  id: string;
  title: string;
  sku: string | null;
  price: number;
  compare_at_price: number | null;
  option1: string | null;
  option2: string | null;
  option3: string | null;
};

type MediaRow = {
  id: string;
  storage_path: string;
  alt_text: string | null;
  position: number;
};

export type SelloListing = {
  sourceProductId: string;
  handle: string;
  title: string;
  description: string;
  singlePrice: number | null;
  images: { url: string; localPath: string; alt: string | null }[];
  variants: { title: string; option1: string | null; option2: string | null; option3: string | null; price: number; compareAtPrice: number | null; sku: string | null }[];
  freeShipping: true;
};

async function main() {
  const idOrHandle = process.argv[2];
  if (!idOrHandle) {
    console.error("Usage: tsx scripts/sello/export-product.ts <handle-or-id> [outDir]");
    process.exit(1);
  }
  const outDir = process.argv[3] ?? path.join("data", "sello-export", idOrHandle);

  const filter = /^[0-9a-f-]{36}$/i.test(idOrHandle) ? `id=eq.${idOrHandle}` : `handle=eq.${idOrHandle}`;
  const products = await rest<ProductRow[]>(`products?select=id,title,handle,status,description_html&${filter}&limit=1`);
  const product = products[0];
  if (!product) throw new Error(`No product found for "${idOrHandle}"`);

  const [variants, media] = await Promise.all([
    rest<VariantRow[]>(`product_variants?select=id,title,sku,price,compare_at_price,option1,option2,option3&product_id=eq.${product.id}&order=created_at.asc`),
    rest<MediaRow[]>(`media?select=id,storage_path,alt_text,position&product_id=eq.${product.id}&order=position.asc`),
  ]);

  mkdirSync(outDir, { recursive: true });
  const imagesDir = path.join(outDir, "images");
  mkdirSync(imagesDir, { recursive: true });

  const images: SelloListing["images"] = [];
  for (const [i, m] of media.entries()) {
    const url = mediaUrl(m.storage_path);
    const res = await fetch(url);
    if (!res.ok) {
      console.warn(`  skip image ${url}: HTTP ${res.status}`);
      continue;
    }
    const ext = path.extname(m.storage_path) || ".jpg";
    const localPath = path.join(imagesDir, `${String(i).padStart(2, "0")}${ext}`);
    writeFileSync(localPath, Buffer.from(await res.arrayBuffer()));
    images.push({ url, localPath, alt: m.alt_text });
  }

  const prices = new Set(variants.map((v) => v.price));
  const singlePrice = prices.size === 1 ? variants[0]?.price ?? null : null;

  const listing: SelloListing = {
    sourceProductId: product.id,
    handle: product.handle,
    title: product.title,
    description: htmlToText(product.description_html),
    singlePrice,
    images,
    variants: variants.map((v) => ({
      title: v.title,
      option1: v.option1,
      option2: v.option2,
      option3: v.option3,
      price: v.price,
      compareAtPrice: v.compare_at_price,
      sku: v.sku,
    })),
    freeShipping: true,
  };

  const manifestPath = path.join(outDir, "listing.json");
  writeFileSync(manifestPath, JSON.stringify(listing, null, 2));

  console.log(`Wrote ${manifestPath}`);
  console.log(`  title: ${listing.title}`);
  console.log(`  images: ${listing.images.length}`);
  console.log(`  variants: ${listing.variants.length}`);
  console.log(`  single price: ${listing.singlePrice ?? "(varies by variant)"}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
