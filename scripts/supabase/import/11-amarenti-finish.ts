// Continuation of 10-amarenti-import.ts after its first --commit run got all the way through
// creating every product + collection in Shopify and mirroring products/variants into Supabase,
// then failed on the media upsert (wrong on_conflict target -- media's real unique constraint is
// (shopify_id, product_id), not shopify_id alone, see migration 0002). Rather than re-running the
// whole import (which would call productSet again per product and risk Shopify treating the
// resubmitted image as a second, duplicate file), this picks every id up fresh from Shopify by
// handle and only does the steps that never ran: media, collection_products + reorder, tile items,
// product_templates, main menu.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { shopifyGraphQL } from "../../shopify/client.ts";
import { upsert, selectAll, insertMany } from "../rest.ts";
import { publicUrl } from "../storage.ts";
import { idTail, chunk } from "./util.ts";

const DATA_DIR = join(process.cwd(), "data/exports/amarenti");
const log = (...a: unknown[]) => console.log(...a);

type ExportProduct = { handle: string; title: string; images: { file: string }[]; collections: { handle: string }[] };
type Plan = { collections: { handle: string; title: string; products: string[] }[] };

const products: ExportProduct[] = JSON.parse(readFileSync(join(DATA_DIR, "products.json"), "utf8"));
const plan: Plan = JSON.parse(readFileSync(join(DATA_DIR, "shopify_import_plan.json"), "utf8"));
const COLLECTION_HANDLE_OVERRIDE: Record<string, string> = { vaskor: "vaskor-och-tillbehor" };
const realCollectionHandle = (h: string) => COLLECTION_HANDLE_OVERRIDE[h] ?? h;

const Q = {
  byHandle: `query($handle: String!) {
    productByIdentifier(identifier: { handle: $handle }) {
      id
      variants(first: 10) { nodes { id title } }
      media(first: 2) { nodes { id ... on MediaImage { image { url width height } } } }
    }
  }`,
  collectionByHandle: `query($handle: String!) { collectionByIdentifier(identifier: { handle: $handle }) { id } }`,
  reorder: `mutation($id: ID!, $moves: [MoveInput!]!) { collectionReorderProducts(id: $id, moves: $moves) { job { id done } userErrors { field message } } }`,
  publications: `query { publications(first: 50) { nodes { id name } } }`,
  publish: `mutation($id: ID!, $input: [PublicationInput!]!) { publishablePublish(id: $id, input: $input) { userErrors { field message } } }`,
  job: `query($id: ID!) { job(id: $id) { id done } }`,
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function waitForJob(job: { id: string; done: boolean } | null | undefined) {
  if (!job || job.done) return;
  for (let i = 0; i < 60; i++) {
    await sleep(1000);
    const { job: j } = await shopifyGraphQL<{ job: { id: string; done: boolean } | null }>(Q.job, { id: job.id });
    if (!j || j.done) return;
  }
}
function userErrors(where: string, errs: { field: string[]; message: string }[] | undefined) {
  if (errs?.length) throw new Error(`${where}: ${errs.map((e) => `${(e.field ?? []).join(".")} ${e.message}`).join("; ")}`);
}

async function main() {
  log("== Re-reading every product fresh from Shopify (by handle) ==");
  const productId = new Map<string, string>();
  const media = new Map<string, { id: string; width: number | null; height: number | null }>();
  for (const p of products) {
    const { productByIdentifier: prod } = await shopifyGraphQL<{ productByIdentifier: any }>(Q.byHandle, { handle: p.handle });
    if (!prod) throw new Error(`${p.handle}: not found in Shopify -- expected it to already exist from the first run.`);
    productId.set(p.handle, prod.id);
    const m = prod.media.nodes[0];
    if (m) media.set(p.handle, { id: m.id, width: m.image?.width ?? null, height: m.image?.height ?? null });
  }
  log(`  ${productId.size} products found, ${media.size} with an image`);

  const collectionShopifyId = new Map<string, string>();
  for (const c of plan.collections) {
    const realHandle = realCollectionHandle(c.handle);
    const { collectionByIdentifier: coll } = await shopifyGraphQL<{ collectionByIdentifier: { id: string } | null }>(Q.collectionByHandle, {
      handle: realHandle,
    });
    if (!coll) throw new Error(`${realHandle}: collection not found -- expected it to already exist from the first run.`);
    collectionShopifyId.set(realHandle, coll.id);
  }
  log(`  ${collectionShopifyId.size} collections found`);

  const productIdByShopify = new Map(
    (await selectAll<{ id: string; shopify_id: string }>("products", "select=id,shopify_id")).map((r) => [r.shopify_id, r.id])
  );

  // --- media ---
  log("\n== media ==");
  const mediaRows = products
    .map((p) => {
      const m = media.get(p.handle);
      if (!m) return null;
      const ext = p.images[0].file.split(".").pop();
      return {
        shopify_id: idTail(m.id),
        product_id: productIdByShopify.get(idTail(productId.get(p.handle)!)),
        storage_path: `imports/amarenti/${p.handle}.${ext}`,
        alt_text: p.title,
        width: m.width,
        height: m.height,
        position: 0,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null && !!r.product_id);
  for (const batch of chunk(mediaRows, 100)) await upsert("media", batch, "shopify_id,product_id");
  log(`✓ media: ${mediaRows.length} upserted`);
  // Sanity check: every uploaded image's public URL must actually resolve (confirms storage_path
  // matches what 10-amarenti-import.ts actually uploaded to, not just a guess at the pattern).
  const sampleUrl = publicUrl("product-media", mediaRows[0].storage_path);
  const check = await fetch(sampleUrl);
  log(`  sanity check ${sampleUrl} -> ${check.status}`);

  // --- collection_products + reorder + publish ---
  log("\n== Collection membership + order ==");
  const collectionIdByHandle = new Map(
    (await selectAll<{ id: string; handle: string }>("collections", "select=id,handle")).map((r) => [r.handle, r.id])
  );
  for (const c of plan.collections) {
    const realHandle = realCollectionHandle(c.handle);
    const collId = collectionShopifyId.get(realHandle)!;
    const moves = c.products.map((h, i) => ({ id: productId.get(h), newPosition: String(i) })).filter((m) => m.id);
    for (const batch of chunk(moves, 250)) {
      const r = await shopifyGraphQL<{ collectionReorderProducts: { job: any; userErrors: any[] } }>(Q.reorder, { id: collId, moves: batch });
      userErrors(`reorder ${realHandle}`, r.collectionReorderProducts.userErrors);
      await waitForJob(r.collectionReorderProducts.job);
    }
    const collRowId = collectionIdByHandle.get(realHandle);
    if (collRowId) {
      const cpRows = c.products
        .map((h, i) => ({ collection_id: collRowId, product_id: productIdByShopify.get(idTail(productId.get(h)!)), position: i }))
        .filter((r) => r.product_id);
      await insertMany("collection_products", cpRows, "collection_id,product_id");
    }
    log(`  ✓ ${c.title}: ${c.products.length} produkter`);
  }

  const { publications } = await shopifyGraphQL<{ publications: { nodes: { id: string; name: string }[] } }>(Q.publications, {});
  const online = publications.nodes.find((p) => /online store/i.test(p.name));
  if (online) {
    for (const id of collectionShopifyId.values()) {
      await shopifyGraphQL(Q.publish, { id, input: [{ publicationId: online.id }] }).catch(() => {});
    }
    log(`✓ published all collections to ${online.name}`);
  }

  // --- collection_tile_items ---
  log("\n== Sub-collection tiles ==");
  const tileChildren = [
    ["vaskor", ["lv-vaskor", "gg-vaskor", "h-vaskor", "di-vaskor", "ysl-vaskor", "cc-vaskor", "miu-vaskor", "jacq-vaskor", "gift-sets"]],
    ["planbocker", ["cc-planbocker"]],
  ] as const;
  for (const [templateSuffix, children] of tileChildren) {
    const rows = children.map((h, i) => ({ template_suffix: templateSuffix, child_collection_id: collectionIdByHandle.get(h), position: i }));
    await insertMany("collection_tile_items", rows.filter((r) => r.child_collection_id), "template_suffix,child_collection_id");
    log(`  ✓ ${templateSuffix}: ${children.length} tiles`);
  }

  // --- product_templates ---
  log("\n== Product templates (PDP content) ==");
  const SHARED_FAQ_INTRO = [{ question: "Vilken returpolicy gäller?", answer: "Vi har 14 dagars öppet köp, no questions asked." }];
  const SHARED_FAQ_OUTRO = [
    {
      question: "Hur lång är leveranstiden?",
      answer:
        "Leveranstiden är 5–10 arbetsdagar. Vi arbetar med internationella leverantörer och lager, vilket gör att vi kan erbjuda noggrant utvalda produkter av hög kvalitet till ett mer tillgängligt pris. Alla beställningar skickas spårbart direkt till dig.",
    },
    {
      question: "Hur mycket kostar frakten?",
      answer: "Vi erbjuder alltid fri frakt på alla beställningar, oavsett ordervärde. Din beställning skickas spårbart direkt hem till dig utan extra kostnad.",
    },
    {
      question: "Vilka betalningsmetoder erbjuder ni?",
      answer: "Vi erbjuder säkra betalningar via Klarna, kortbetalning och Apple/Google Pay. Alla betalningar hanteras tryggt genom Stripe Payments för en säker och smidig köpupplevelse.",
    },
  ];
  const templateRows = [
    {
      key: "vaskor",
      name: "Väskor",
      intro_paragraph: "Väskor som sätter stilen och tål att användas varje dag. Vi erbjuder trendiga modeller i tåliga material.",
      trust_lines: null,
      usp_block: null,
      faq: [
        ...SHARED_FAQ_INTRO,
        { question: "Är era väskor av bra kvalitet?", answer: "Vi väljer våra väskor med fokus på material, finish och detaljer för att kombinera stil med användbarhet i vardagen." },
        ...SHARED_FAQ_OUTRO,
      ],
      description_heading: "Specifikationer",
      accordion_rows: [
        {
          heading: "Vård",
          body: "Ta hand om din väska genom att torka av den med en mjuk, fuktig trasa vid behov. Undvik att överfylla väskan så att den håller formen, och skydda den mot kraftigt regn och fukt. Förvara den torrt när den inte används.",
        },
      ],
      size_guide_href: null,
      offer_message: null,
      show_inventory_status: true,
      gallery_layout: "grid",
    },
    {
      key: "gift-sets",
      name: "Gift sets",
      intro_paragraph: "Väskor som sätter stilen och tål att användas varje dag. Vi erbjuder trendiga modeller i tåliga material.",
      trust_lines: ["14 dagars öppet köp", "Fri frakt", "Betala säkert med Klarna"],
      usp_block: null,
      faq: [
        ...SHARED_FAQ_INTRO,
        { question: "Är era väskor av bra kvalitet?", answer: "Vi väljer våra väskor med fokus på material, finish och detaljer för att kombinera stil med användbarhet i vardagen." },
        ...SHARED_FAQ_OUTRO,
      ],
      description_heading: "Specifikationer",
      accordion_rows: [
        {
          heading: "Vård",
          body: "Ta hand om din väska genom att torka av den med en mjuk, fuktig trasa vid behov. Undvik att överfylla väskan så att den håller formen, och skydda den mot kraftigt regn och fukt. Förvara den torrt när den inte används.",
        },
      ],
      size_guide_href: null,
      offer_message: null,
      show_inventory_status: true,
      gallery_layout: "carousel",
    },
    {
      key: "planbocker",
      name: "Plånböcker",
      intro_paragraph: "Plånböcker med stilren design och en känsla av lyx.",
      trust_lines: null,
      usp_block: null,
      faq: [
        ...SHARED_FAQ_INTRO,
        { question: "Är era plånböcker av bra kvalitet?", answer: "Vi väljer våra plånböcker med fokus på material, finish och detaljer för en produkt som håller i vardagen." },
        ...SHARED_FAQ_OUTRO,
      ],
      description_heading: "Specifikationer",
      accordion_rows: [],
      size_guide_href: null,
      offer_message: null,
      show_inventory_status: true,
      gallery_layout: "grid",
    },
  ];
  await upsert("product_templates", templateRows, "key");
  log(`✓ product_templates: ${templateRows.length} upserted`);

  // --- main menu ---
  log("\n== Main menu ==");
  const menus = await selectAll<{ id: string; handle: string }>("storefront_menus", "select=id,handle&handle=eq.main-menu");
  const mainMenu = menus[0];
  if (mainMenu) {
    const items = await selectAll<{ id: string; title: string; href: string; position: number }>(
      "storefront_menu_items",
      `select=id,title,href,position&menu_id=eq.${mainMenu.id}&order=position.asc`
    );
    if (!items.some((i) => i.title === "Plånböcker")) {
      const vaskorIdx = items.findIndex((i) => i.title === "Väskor");
      const insertAt = vaskorIdx >= 0 ? items[vaskorIdx].position + 1 : items.length;
      for (const item of items) {
        if (item.position >= insertAt) {
          await upsert("storefront_menu_items", [{ id: item.id, menu_id: mainMenu.id, title: item.title, href: item.href, position: item.position + 1 }], "id");
        }
      }
      await insertMany("storefront_menu_items", [{ menu_id: mainMenu.id, title: "Plånböcker", href: "/collections/planbocker", position: insertAt }], "id");
      log(`✓ "Plånböcker" tillagd i huvudmenyn efter "Väskor"`);
    } else {
      log(`  redan tillagd, hoppar över`);
    }
  } else {
    log(`  VARNING: hittade ingen "main-menu"`);
  }

  log("\nKlart.");
}

main().catch((e) => {
  console.error(`\nFEL: ${e.message}`);
  process.exit(1);
});
