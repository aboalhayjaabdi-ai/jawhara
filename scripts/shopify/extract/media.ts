import { createWriteStream, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { EXPORT_DIR, MEDIA_DIR } from "./util.ts";
import "../client.ts"; // side effect: configures the outbound proxy dispatcher for fetch

interface ImageRef {
  productId: string;
  imageId: string;
  url: string;
}

function extFromUrl(url: string): string {
  const match = new URL(url).pathname.match(/\.(jpg|jpeg|png|webp|gif|avif)$/i);
  return match ? match[1].toLowerCase() : "jpg";
}

function idTail(gid: string): string {
  return gid.split("/").pop()!;
}

const lines = readFileSync(`${EXPORT_DIR}/products.jsonl`, "utf8").trim().split("\n");
const refs: ImageRef[] = [];

for (const line of lines) {
  const product = JSON.parse(line);
  const productId = idTail(product.id);
  for (const edge of product.images.edges) {
    refs.push({ productId, imageId: idTail(edge.node.id), url: edge.node.url });
  }
}

mkdirSync(MEDIA_DIR, { recursive: true });

const manifestPath = `${EXPORT_DIR}/media-manifest.jsonl`;
let downloaded = 0;
let skipped = 0;
let failed = 0;
const manifestLines: string[] = [];

for (const ref of refs) {
  const dir = `${MEDIA_DIR}/${ref.productId}`;
  mkdirSync(dir, { recursive: true });
  const ext = extFromUrl(ref.url);
  const localPath = `${dir}/${ref.imageId}.${ext}`;

  manifestLines.push(
    JSON.stringify({ productId: ref.productId, imageId: ref.imageId, shopifyUrl: ref.url, localPath })
  );

  if (existsSync(localPath)) {
    skipped++;
    continue;
  }

  try {
    const res = await fetch(ref.url);
    if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
    await pipeline(Readable.fromWeb(res.body as any), createWriteStream(localPath));
    downloaded++;
    if (downloaded % 50 === 0) console.log(`  downloaded ${downloaded}...`);
  } catch (err) {
    failed++;
    console.log(`  ✗ failed ${ref.url}: ${err instanceof Error ? err.message : err}`);
  }
}

writeFileSync(manifestPath, manifestLines.join("\n") + "\n");

console.log(`\n✓ media: ${downloaded} downloaded, ${skipped} already present, ${failed} failed (of ${refs.length} total)`);
console.log(`  manifest -> ${manifestPath}`);
if (failed > 0) {
  console.log(`  Re-run this script to retry failed downloads (already-downloaded files are skipped).`);
}
