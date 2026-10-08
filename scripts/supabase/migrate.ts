import { readdirSync, readFileSync } from "node:fs";
import { runSql } from "./db.ts";

const MIGRATIONS_DIR = "supabase/migrations";

const files = readdirSync(MIGRATIONS_DIR)
  .filter((f) => f.endsWith(".sql"))
  .sort();

for (const file of files) {
  console.log(`Applying ${file}...`);
  const sql = readFileSync(`${MIGRATIONS_DIR}/${file}`, "utf8");
  await runSql(sql);
  console.log(`✓ ${file}`);
}

console.log(`\n✓ ${files.length} migration(s) applied`);
