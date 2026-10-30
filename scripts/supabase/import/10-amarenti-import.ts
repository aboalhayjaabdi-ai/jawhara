// One-time import of the "Amarenti" bag/wallet catalog export (57 products, 58 variants, 12
// collections) into this exact store: real products in Shopify (so they're purchasable through
// the same Shopify-hosted checkout as every other product), mirrored into Supabase (so the
// existing custom storefront renders them with zero new components), with collection membership,
// sub-collection tiles, and per-category PDP content wired into the existing mechanisms the site
// already uses for the current jewelry catalog (collections.template_suffix +
// collection_tile_items for sub-collection tiles; products.template_suffix + product_templates for
// PDP specs/care/FAQ content).
//
// Source data: data/exports/amarenti/{products.json,shopify_import_plan.json,images/,
// collections-images/} -- merged from the three-part export package, gitignored (same as every
// other data/exports/* raw extraction).
//
// Usage:
//   npx tsx scripts/supabase/import/10-amarenti-import.ts            # dry run (default, no writes)
//   npx tsx scripts/supabase/import/10-amarenti-import.ts --commit   # real run
//
// Idempotent: every Shopify write keys off productSet's handle identifier (create-or-update) and
// every Supabase write is an upsert keyed on the real unique column (handle/shopify_id). Re-running
// after a partial failure only fills in what's still missing -- never duplicates.
import { readFileSync } from "node:fs";
import { extname, join } from "node:path";
import { shopifyGraphQL } from "../../shopify/client.ts";
import { upsert, selectAll, insertMany } from "../rest.ts";
import { uploadFile, publicUrl } from "../storage.ts";
import { idTail, chunk } from "./util.ts";

const COMMIT = process.argv.includes("--commit");
const DATA_DIR = join(process.cwd(), "data/exports/amarenti");
const log = (...a: unknown[]) => console.log(...a);

type ExportProduct = {
  handle: string;
  title: string;
  status: string;
  body_html: string;
  vendor: string;
  seo_title: string | null;
  seo_description: string | null;
  variants: {
    title: string;
    options: string[];
    sku: string;
    barcode: string;
    price: string;
    compare_at_price: string | null;
    taxable: boolean;
    inventory_tracked: boolean;
    inventory_quantity: number;
    inventory_policy: string;
    weight: { value: number; unit: string };
  }[];
  images: { position: number; file: string }[];
  collections: { handle: string; title: string }[];
};

type Plan = {
  apiVersion: string;
  collections: {
    handle: string;
    title: string;
    parent: string | null;
    image: { file: string; altText: string; showsExportedProduct: boolean };
    imageFromExportedProduct: { product: string };
    products: string[];
  }[];
};

const products: ExportProduct[] = JSON.parse(readFileSync(join(DATA_DIR, "products.json"), "utf8"));
const plan: Plan = JSON.parse(readFileSync(join(DATA_DIR, "shopify_import_plan.json"), "utf8"));

// The 6 collections whose provided "current" image file actually shows an unrelated, still-live
// Jawhara jewelry product (confirmed via data/collections.csv's own "Bilden visar exporterad
// produkt" column) -- never used. Every other collection's provided file is a real photo of one of
// the products this import brings in, safe to reuse directly.
const USE_EXPORTED_PRODUCT_IMAGE = new Set(["vaskor-och-tillbehor", "h-vaskor", "di-vaskor", "ysl-vaskor", "cc-vaskor", "planbocker"]);
// Maps the plan's own collection handle to the real handle on THIS site (the Väskor hub already
// exists, pre-wired with template_suffix='vaskor' and linked from the header nav + homepage
// sections -- see components/layout/header.tsx and migration 0021 -- so it's reused rather than
// recreated under the plan's own "vaskor" handle).
const COLLECTION_HANDLE_OVERRIDE: Record<string, string> = { vaskor: "vaskor-och-tillbehor" };
function realCollectionHandle(planHandle: string): string {
  return COLLECTION_HANDLE_OVERRIDE[planHandle] ?? planHandle;
}

const GIFT_SET_HANDLE = "gift-sets";
const WALLET_HUB_HANDLE = "planbocker";

function categoryOf(p: ExportProduct): "vaskor" | "gift-sets" | "planbocker" {
  const cols = new Set(p.collections.map((c) => c.handle));
  if (cols.has(GIFT_SET_HANDLE)) return "gift-sets";
  if (cols.has(WALLET_HUB_HANDLE) || cols.has("cc-planbocker")) return "planbocker";
  return "vaskor";
}

function contentType(ext: string): string {
  const e = ext.toLowerCase();
  if (e === ".png") return "image/png";
  if (e === ".avif") return "image/avif";
  if (e === ".webp") return "image/webp";
  return "image/jpeg";
}

// --- Image upload (local file -> our own Storage, used both as Shopify's fetch source and as the
// permanent Supabase media/collection image). Uploading once, to a stable handle-based path, avoids
// any dependency on the export package's own temporary image host staying reachable. ---
const uploadedProductImage = new Map<string, { path: string; url: string }>();
async function uploadProductImage(p: ExportProduct): Promise<{ path: string; url: string }> {
  const cached = uploadedProductImage.get(p.handle);
  if (cached) return cached;
  const img = p.images[0];
  const ext = extname(img.file);
  const storagePath = `imports/amarenti/${p.handle}${ext}`;
  if (COMMIT) {
    const bytes = readFileSync(join(DATA_DIR, img.file));
    await uploadFile("product-media", storagePath, bytes, contentType(ext));
  }
  const result = { path: storagePath, url: publicUrl("product-media", storagePath) };
  uploadedProductImage.set(p.handle, result);
  return result;
}
async function uploadCollectionImage(c: Plan["collections"][number]): Promise<{ path: string; url: string }> {
  const realHandle = realCollectionHandle(c.handle);
  if (USE_EXPORTED_PRODUCT_IMAGE.has(realHandle)) {
    const product = products.find((p) => p.handle === c.imageFromExportedProduct.product);
    if (!product) throw new Error(`${c.handle}: exported-product image fallback "${c.imageFromExportedProduct.product}" not found`);
    return uploadProductImage(product);
  }
  const ext = extname(c.image.file);
  const localFile = join(DATA_DIR, "collections-images", `${c.handle}${ext}`);
  const storagePath = `imports/amarenti/_collections/${realHandle}${ext}`;
  if (COMMIT) {
    const bytes = readFileSync(localFile);
    await uploadFile("product-media", storagePath, bytes, contentType(ext));
  }
  return { path: storagePath, url: publicUrl("product-media", storagePath) };
}

// --- Shopify mutations/queries ---
const Q = {
  productSet: `
    mutation($identifier: ProductSetIdentifiers!, $input: ProductSetInput!) {
      productSet(identifier: $identifier, input: $input, synchronous: true) {
        product {
          id
          handle
          variants(first: 10) { nodes { id title taxable } }
          media(first: 2) { nodes { id ... on MediaImage { image { url width height } } } }
        }
        userErrors { field message }
      }
    }`,
  collectionByHandle: `query($handle: String!) { collectionByIdentifier(identifier: { handle: $handle }) { id handle image { url } products(first: 250, sortKey: COLLECTION_DEFAULT) { nodes { id handle } } } }`,
  collectionCreate: `mutation($collection: CollectionCreateInput!) { collectionCreate(collection: $collection) { collection { id handle } userErrors { field message } } }`,
  collectionUpdate: `mutation($collection: CollectionUpdateInput!) { collectionUpdate(collection: $collection) { collection { id handle } userErrors { field message } } }`,
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
  log(COMMIT ? "COMMIT -- real writes will happen." : "DRY RUN -- no writes, just a plan. Pass --commit to execute.");
  log(`${products.length} products, ${products.reduce((s, p) => s + p.variants.length, 0)} variants, ${plan.collections.length} collections.\n`);

  // ============================================================
  // 1. Collections: create the 11 new ones, reuse the existing Väskor hub as-is.
  // ============================================================
  log("== Collections ==");
  const collectionShopifyId = new Map<string, string>(); // real handle -> gid
  for (const c of plan.collections) {
    const realHandle = realCollectionHandle(c.handle);
    const { collectionByIdentifier: existing } = await shopifyGraphQL<{
      collectionByIdentifier: { id: string; image: { url: string } | null } | null;
    }>(Q.collectionByHandle, { handle: realHandle });
    const image = await uploadCollectionImage(c);
    if (existing) {
      collectionShopifyId.set(realHandle, existing.id);
      log(`  reuse ${c.title} (${realHandle})`);
      // Only set the image if the collection doesn't already have a real one (the Väskor hub is
      // the one pre-existing case here, currently imageless) -- never overwrite a curated image.
      if (COMMIT && !existing.image) {
        const r = await shopifyGraphQL<{ collectionUpdate: { userErrors: any[] } }>(Q.collectionUpdate, {
          collection: { id: existing.id, image: { src: image.url, altText: c.image.altText } },
        });
        userErrors(`image for ${realHandle}`, r.collectionUpdate.userErrors);
      }
    } else {
      log(`  ${COMMIT ? "create" : "would create"} ${c.title} (${realHandle})`);
      if (COMMIT) {
        const r = await shopifyGraphQL<{ collectionCreate: { collection: { id: string } | null; userErrors: any[] } }>(Q.collectionCreate, {
          collection: { handle: realHandle, title: c.title, sortOrder: "MANUAL", image: { src: image.url, altText: c.image.altText } },
        });
        userErrors(`create ${realHandle}`, r.collectionCreate.userErrors);
        collectionShopifyId.set(realHandle, r.collectionCreate.collection!.id);
      }
    }

    if (COMMIT) {
      await upsert(
        "collections",
        [
          {
            shopify_id: idTail(collectionShopifyId.get(realHandle)!),
            title: c.title,
            handle: realHandle,
            source: "shopify",
            image_url: image.url,
            // Only the two hub collections drive a sub-collection tile group on their own page --
            // every leaf collection here keeps template_suffix null, same as e.g. "guld-armband-1".
            template_suffix: realHandle === "vaskor-och-tillbehor" ? "vaskor" : realHandle === "planbocker" ? "planbocker" : null,
          },
        ],
        "handle"
      );
    }
  }

  // ============================================================
  // 2. Products: create/update in Shopify, upload the image, mirror into Supabase.
  // ============================================================
  log("\n== Products ==");
  const createdProductId = new Map<string, string>(); // handle -> gid
  const createdVariantIds = new Map<string, { id: string; title: string }[]>();
  const createdMedia = new Map<string, { id: string; width: number | null; height: number | null }>();

  for (const p of products) {
    const category = categoryOf(p);
    const targetCollectionHandles = Array.from(new Set(p.collections.map((c) => realCollectionHandle(c.handle))));
    const image = await uploadProductImage(p);

    const hasRealOptions = p.variants.length > 1;
    const productOptions = hasRealOptions
      ? [{ name: "Storlek", values: p.variants.map((v) => ({ name: v.title })) }]
      : [{ name: "Title", values: [{ name: "Default Title" }] }];

    const variantsInput = p.variants.map((v, i) => ({
      price: v.price,
      compareAtPrice: v.compare_at_price || null,
      taxable: false, // package requirement: all 58 variants momsfria -- see final report re: VAT.
      inventoryPolicy: v.inventory_policy === "CONTINUE" ? "CONTINUE" : "DENY",
      inventoryItem: { tracked: v.inventory_tracked ?? false }, // matches every existing variant's own convention
      optionValues: hasRealOptions ? [{ optionName: "Storlek", name: v.title }] : [{ optionName: "Title", name: "Default Title" }],
      position: i + 1,
    }));

    log(`  ${COMMIT ? "" : "(dry) "}${p.handle}: ${category}, ${p.variants.length} variant(er), ${targetCollectionHandles.length} collection(er)`);

    if (!COMMIT) continue;

    const input: Record<string, unknown> = {
      handle: p.handle,
      title: p.title,
      descriptionHtml: p.body_html,
      vendor: p.vendor,
      status: "ACTIVE",
      templateSuffix: category,
      seo: { title: p.seo_title || null, description: p.seo_description || null },
      productOptions,
      variants: variantsInput,
      files: [{ originalSource: image.url, alt: p.title, contentType: "IMAGE" }],
      collections: targetCollectionHandles.map((h) => collectionShopifyId.get(h)).filter(Boolean),
    };

    const r = await shopifyGraphQL<{ productSet: { product: any; userErrors: any[] } }>(Q.productSet, {
      identifier: { handle: p.handle },
      input,
    });
    userErrors(`productSet ${p.handle}`, r.productSet.userErrors);
    const prod = r.productSet.product;
    createdProductId.set(p.handle, prod.id);
    createdVariantIds.set(
      p.handle,
      prod.variants.nodes.map((v: any) => ({ id: v.id, title: v.title }))
    );
    const firstMedia = prod.media.nodes[0];
    if (firstMedia) createdMedia.set(p.handle, { id: firstMedia.id, width: firstMedia.image?.width ?? null, height: firstMedia.image?.height ?? null });

    // Belt-and-braces: productSet above already sets taxable:false, but re-check and fix in case
    // Shopify ever defaults a variant to taxable regardless (same safety net the original
    // import-collections.mjs script applies as its own step 1).
    const stillTaxed = prod.variants.nodes.filter((v: any) => v.taxable);
    if (stillTaxed.length) {
      await shopifyGraphQL(
        `mutation($productId: ID!, $variants: [ProductVariantsBulkInput!]!) { productVariantsBulkUpdate(productId: $productId, variants: $variants) { userErrors { field message } } }`,
        { productId: prod.id, variants: stillTaxed.map((v: any) => ({ id: v.id, taxable: false })) }
      );
    }
  }

  // ============================================================
  // 3. Supabase mirror: products, product_variants, media.
  // ============================================================
  if (COMMIT) {
    log("\n== Supabase mirror ==");
    const productRows = products.map((p) => ({
      shopify_id: idTail(createdProductId.get(p.handle)),
      title: p.title,
      handle: p.handle,
      status: "active",
      vendor: p.vendor,
      description_html: p.body_html,
      seo_title: p.seo_title,
      seo_description: p.seo_description,
      source: "shopify",
      template_suffix: categoryOf(p),
      published_at: new Date().toISOString(),
    }));
    for (const batch of chunk(productRows, 50)) await upsert("products", batch, "shopify_id");
    log(`✓ products: ${productRows.length} upserted`);

    const productIdByShopify = new Map(
      (await selectAll<{ id: string; shopify_id: string }>("products", "select=id,shopify_id")).map((r) => [r.shopify_id, r.id])
    );

    const variantRows: any[] = [];
    for (const p of products) {
      const supabaseVariants = createdVariantIds.get(p.handle) ?? [];
      const productId = productIdByShopify.get(idTail(createdProductId.get(p.handle)!));
      p.variants.forEach((v, i) => {
        const shopifyVariant = supabaseVariants[i];
        variantRows.push({
          shopify_id: idTail(shopifyVariant?.id),
          product_id: productId,
          title: v.title,
          sku: v.sku || null,
          barcode: v.barcode || null,
          price: Number(v.price),
          compare_at_price: v.compare_at_price ? Number(v.compare_at_price) : null,
          inventory_quantity: v.inventory_quantity ?? 0,
          inventory_policy: v.inventory_policy || null,
          taxable: false,
          option1: v.title,
        });
      });
    }
    for (const batch of chunk(variantRows, 100)) await upsert("product_variants", batch, "shopify_id");
    log(`✓ product_variants: ${variantRows.length} upserted`);

    // Every product here has exactly one image (confirmed against the export's own
    // sammanfattning.json: 57 products, 57 images) -- media.nodes[0] from productSet's response is
    // unambiguously that one image, so its real id is trustworthy to use directly.
    const mediaRows = products
      .map((p) => {
        const media = createdMedia.get(p.handle);
        if (!media) return null;
        return {
          shopify_id: idTail(media.id),
          product_id: productIdByShopify.get(idTail(createdProductId.get(p.handle)!)),
          storage_path: uploadedProductImage.get(p.handle)!.path,
          alt_text: p.title,
          width: media.width,
          height: media.height,
          position: 0,
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null && !!r.product_id);
    for (const batch of chunk(mediaRows, 100)) await upsert("media", batch, "shopify_id,product_id");
    log(`✓ media: ${mediaRows.length} upserted`);

    // ============================================================
    // 4. collection_products (Supabase) + reorder (Shopify), per the plan's exact original order.
    // ============================================================
    log("\n== Collection membership + order ==");
    const collectionIdByHandle = new Map(
      (await selectAll<{ id: string; handle: string }>("collections", "select=id,handle")).map((r) => [r.handle, r.id])
    );
    for (const c of plan.collections) {
      const realHandle = realCollectionHandle(c.handle);
      const collId = collectionShopifyId.get(realHandle)!;
      const moves = c.products.map((h, i) => ({ id: createdProductId.get(h), newPosition: String(i) })).filter((m) => m.id);
      for (const batch of chunk(moves, 250)) {
        const r = await shopifyGraphQL<{ collectionReorderProducts: { job: any; userErrors: any[] } }>(Q.reorder, { id: collId, moves: batch });
        userErrors(`reorder ${realHandle}`, r.collectionReorderProducts.userErrors);
        await waitForJob(r.collectionReorderProducts.job);
      }

      const collRowId = collectionIdByHandle.get(realHandle);
      if (collRowId) {
        const cpRows = c.products
          .map((h, i) => ({
            collection_id: collRowId,
            product_id: productIdByShopify.get(idTail(createdProductId.get(h)!)),
            position: i,
          }))
          .filter((r) => r.product_id);
        await insertMany("collection_products", cpRows, "collection_id,product_id");
      }
      log(`  ✓ ${c.title}: ${c.products.length} produkter`);
    }

    // Publish every collection to the Online Store channel.
    const { publications } = await shopifyGraphQL<{ publications: { nodes: { id: string; name: string }[] } }>(Q.publications, {});
    const online = publications.nodes.find((p) => /online store/i.test(p.name));
    if (online) {
      for (const id of collectionShopifyId.values()) {
        await shopifyGraphQL(Q.publish, { id, input: [{ publicationId: online.id }] }).catch(() => {});
      }
    }

    // ============================================================
    // 5. collection_tile_items: sub-collection tiles on the two hub pages.
    // ============================================================
    log("\n== Sub-collection tiles ==");
    const tileChildren = [
      ["vaskor", ["lv-vaskor", "gg-vaskor", "h-vaskor", "di-vaskor", "ysl-vaskor", "cc-vaskor", "miu-vaskor", "jacq-vaskor", "gift-sets"]],
      ["planbocker", ["cc-planbocker"]],
    ] as const;
    const collectionsByHandle = new Map(
      (await selectAll<{ id: string; handle: string }>("collections", "select=id,handle")).map((r) => [r.handle, r.id])
    );
    for (const [templateSuffix, children] of tileChildren) {
      const rows = children.map((h, i) => ({ template_suffix: templateSuffix, child_collection_id: collectionsByHandle.get(h), position: i }));
      await insertMany("collection_tile_items", rows.filter((r) => r.child_collection_id), "template_suffix,child_collection_id");
      log(`  ✓ ${templateSuffix}: ${children.length} tiles`);
    }

    // ============================================================
    // 6. product_templates: PDP specs/care/FAQ content, one per real category. Content is the
    // export's own authored Swedish copy (shared store policies: 14 dagars öppet köp, fri frakt,
    // Klarna/kort/Apple&Google Pay via Stripe -- same as every existing template), with two real
    // mistakes in the source fixed here rather than copied verbatim: a stray capital in "VÅrd"
    // (gift sets), and the wallet FAQ's quality answer literally talking about "väskor" (bags)
    // instead of plånböcker. The bag template's own offerMessage ("lägg en väska + en plånbok i
    // varukorgen, plånboken blir gratis") is deliberately NOT carried over -- that's a real
    // discount the store would need to actually grant at checkout, which nothing in this import (or
    // the request that asked for it) builds; shipping the text without the mechanism would promise
    // customers something that never happens at checkout. Flagged in the final report.
    // ============================================================
    log("\n== Product templates (PDP content) ==");
    const SHARED_FAQ_INTRO = [
      { question: "Vilken returpolicy gäller?", answer: "Vi har 14 dagars öppet köp, no questions asked." },
    ];
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
    log(`✓ product_templates: ${templateRows.length} upserted (vaskor, gift-sets, planbocker)`);

    // ============================================================
    // 7. Main menu: add "Plånböcker" right after "Väskor" -- the only new top-level link this
    // import needs (Väskor already exists in the header; see components/layout/header.tsx and
    // migration 0021). Never touches or replaces any other item.
    // ============================================================
    log("\n== Main menu ==");
    const menus = await selectAll<{ id: string; handle: string }>("storefront_menus", "select=id,handle&handle=eq.main-menu");
    const mainMenu = menus[0];
    if (mainMenu) {
      const items = await selectAll<{ id: string; title: string; href: string; position: number }>(
        "storefront_menu_items",
        `select=id,title,href,position&menu_id=eq.${mainMenu.id}&order=position.asc`
      );
      const alreadyThere = items.some((i) => i.title === "Plånböcker");
      if (!alreadyThere) {
        const vaskorIdx = items.findIndex((i) => i.title === "Väskor");
        const insertAt = vaskorIdx >= 0 ? items[vaskorIdx].position + 1 : items.length;
        // Shift everything at/after insertAt down by one position first.
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
      log(`  VARNING: hittade ingen "main-menu" -- lägg till "Plånböcker" manuellt i /admin/storefront/menus`);
    }
  } else {
    log("\n(dry run: skipping Supabase mirror, collection membership/order, tiles, templates, menu)");
  }

  log(`\n${COMMIT ? "Klart." : "Torrkörningen hittade inga problem. Kör med --commit för att genomföra."}`);
}

main().catch((e) => {
  console.error(`\nFEL: ${e.message}`);
  process.exit(1);
});
