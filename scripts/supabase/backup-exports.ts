import { readFileSync, readdirSync } from "node:fs";
import { uploadFile } from "./storage.ts";

const EXPORT_DIR = "data/exports";
const DATE_PREFIX = new Date().toISOString().slice(0, 10);

const files = readdirSync(EXPORT_DIR).filter((f) => f.endsWith(".jsonl") || f.endsWith(".json"));

for (const file of files) {
  const data = readFileSync(`${EXPORT_DIR}/${file}`);
  const contentType = file.endsWith(".json") ? "application/json" : "application/x-ndjson";
  await uploadFile("backups", `${DATE_PREFIX}/${file}`, data, contentType);
  console.log(`✓ uploaded ${file} (${(data.length / 1024).toFixed(0)} KB)`);
}

console.log(`\n✓ ${files.length} export files backed up to the private 'backups' bucket under ${DATE_PREFIX}/`);
