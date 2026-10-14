import { runSql } from "./db";

async function main() {
  const [vaskor] = await runSql<any[]>(`
    select intro_paragraph from product_templates where key = 'vaskor'
  `);
  if (!vaskor?.intro_paragraph) throw new Error("vaskor template intro_paragraph not found");

  const escaped = vaskor.intro_paragraph.replace(/'/g, "''");

  const before = await runSql<any[]>(`
    select intro_paragraph from product_templates where key = 'erbjudande-vaskor'
  `);
  console.log("Before:", before[0].intro_paragraph);

  await runSql(`
    update product_templates
    set intro_paragraph = '${escaped}'
    where key = 'erbjudande-vaskor'
  `);

  const after = await runSql<any[]>(`
    select intro_paragraph from product_templates where key = 'erbjudande-vaskor'
  `);
  console.log("After: ", after[0].intro_paragraph);
  console.log("Match expected:", after[0].intro_paragraph === vaskor.intro_paragraph);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
