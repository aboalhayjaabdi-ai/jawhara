import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { shopifyGraphQL } from "../client.ts";
import { isDone, markDone } from "./util.ts";

const RESOURCE = "theme";
const THEME_ID = "gid://shopify/OnlineStoreTheme/205514506578"; // Jawhara 3.0 (role: MAIN, the live theme)
const OUT_DIR = "data/exports/theme";

if (isDone(RESOURCE)) {
  console.log(`✓ ${RESOURCE} already extracted (delete data/exports/${RESOURCE}.done to re-run)`);
  process.exit(0);
}

interface FileMeta {
  filename: string;
  contentType: string;
  size: string;
}

// Step 1: list every file (metadata only — cheap, paginated).
const allFiles: FileMeta[] = [];
let after: string | null = null;
let hasNextPage = true;

while (hasNextPage) {
  const data: any = await shopifyGraphQL(
    `query($after: String) {
      theme(id: "${THEME_ID}") {
        files(first: 250, after: $after) {
          edges { cursor node { filename contentType size } }
          pageInfo { hasNextPage }
        }
      }
    }`,
    { after }
  );
  const conn = data.theme.files;
  allFiles.push(...conn.edges.map((e: any) => e.node));
  hasNextPage = conn.pageInfo.hasNextPage;
  after = conn.edges.length ? conn.edges[conn.edges.length - 1].cursor : null;
  if (conn.edges.length === 0) break;
}

console.log(`Found ${allFiles.length} theme files. Fetching content...`);

// Step 2: fetch body content in batches of 25 filenames per call.
function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

let written = 0;
let skippedBinary = 0;

for (const batch of chunk(allFiles, 25)) {
  const filenames = batch.map((f) => f.filename);
  const data: any = await shopifyGraphQL(
    `query($filenames: [String!]!) {
      theme(id: "${THEME_ID}") {
        files(filenames: $filenames) {
          nodes {
            filename
            body {
              __typename
              ... on OnlineStoreThemeFileBodyText { content }
              ... on OnlineStoreThemeFileBodyBase64 { contentBase64 }
              ... on OnlineStoreThemeFileBodyUrl { url }
            }
          }
        }
      }
    }`,
    { filenames }
  );

  for (const node of data.theme.files.nodes) {
    const outPath = `${OUT_DIR}/${node.filename}`;
    mkdirSync(dirname(outPath), { recursive: true });

    if (node.body.__typename === "OnlineStoreThemeFileBodyText") {
      writeFileSync(outPath, node.body.content);
      written++;
    } else if (node.body.__typename === "OnlineStoreThemeFileBodyBase64") {
      writeFileSync(outPath, Buffer.from(node.body.contentBase64, "base64"));
      written++;
    } else {
      // URL-backed body (large files Shopify serves via redirect) — record the URL
      // for a manual/follow-up download rather than fetching through this script.
      writeFileSync(`${outPath}.url.txt`, node.body.url ?? "");
      skippedBinary++;
    }
  }
  console.log(`  ...${written + skippedBinary}/${allFiles.length} files processed`);
}

writeFileSync(`${OUT_DIR}/_file-manifest.json`, JSON.stringify(allFiles, null, 2));

markDone(RESOURCE, allFiles.length);
console.log(`✓ theme: ${written} files written, ${skippedBinary} URL-only (see .url.txt files) -> ${OUT_DIR}/`);
