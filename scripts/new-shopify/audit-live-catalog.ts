// READ-ONLY + cart-only: every active website variant vs the NEW store's Storefront API (the same
// API and token the site's cart uses): exists, available for sale, same price and compare-at price
// as the site shows, and actually addable to a real cart. Creates throwaway carts, never a checkout.
import { supabaseService as s } from "../../lib/supabase/service-client.ts";
const url = `https://${process.env.NEW_SHOPIFY_STORE_DOMAIN}/api/2026-10/graphql.json`;
const sf = async (query: string, variables?: any) => (await (await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", "X-Shopify-Storefront-Access-Token": process.env.NEW_SHOPIFY_STOREFRONT_ACCESS_TOKEN! }, body: JSON.stringify({ query, variables }) })).json());
const rows: any[] = [];
for (let f = 0; ; f += 1000) { const { data } = await s.from("product_variants").select("id, title, price, compare_at_price, new_shopify_variant_id, shopify_variant_id, products!inner(handle, status)").eq("products.status", "active").range(f, f + 999); rows.push(...data!); if (data!.length < 1000) break; }
const issues: string[] = [];
const noId = rows.filter((r) => !r.new_shopify_variant_id); for (const r of noId) issues.push(`no new-store id: ${r.products.handle}/${r.title}`);
const withId = rows.filter((r) => r.new_shopify_variant_id);
const n = (x: any) => (x == null ? null : Number(x));
for (let i = 0; i < withId.length; i += 100) {
  const chunk = withId.slice(i, i + 100);
  const d = await sf(`query($ids:[ID!]!){ nodes(ids:$ids){ ... on ProductVariant { id availableForSale price { amount currencyCode } compareAtPrice { amount } product { handle } } } }`, { ids: chunk.map((r) => r.new_shopify_variant_id) });
  if (d.errors) { issues.push("storefront error " + JSON.stringify(d.errors).slice(0, 200)); continue; }
  d.data.nodes.forEach((v: any, j: number) => {
    const r = chunk[j]; const k = `${r.products.handle}/${r.title}`;
    if (!v) { issues.push(`not visible in Headless storefront: ${k}`); return; }
    if (v.product.handle !== r.products.handle) issues.push(`handle mismatch ${k} -> ${v.product.handle}`);
    if (!v.availableForSale) issues.push(`not available for sale: ${k}`);
    if (n(v.price.amount) !== n(r.price) || v.price.currencyCode !== "SEK") issues.push(`price ${k}: site ${r.price} shop ${v.price.amount} ${v.price.currencyCode}`);
    if (n(v.compareAtPrice?.amount) !== n(r.compare_at_price)) issues.push(`compare-at ${k}: site ${r.compare_at_price} shop ${v.compareAtPrice?.amount ?? null}`);
  });
  const c = await sf(`mutation($l:[CartLineInput!]!){ cartCreate(input:{ lines:$l }){ cart { totalQuantity lines(first:250){ nodes { quantity merchandise { ... on ProductVariant { id } } } } } userErrors { message } } }`, { l: chunk.map((r) => ({ merchandiseId: r.new_shopify_variant_id, quantity: 1 })) });
  const cart = c.data?.cartCreate?.cart; const ue = c.data?.cartCreate?.userErrors ?? [];
  if (ue.length || !cart) issues.push(`cartCreate chunk ${i}: ${JSON.stringify(ue).slice(0, 200)}`);
  else { const inCart = new Set(cart.lines.nodes.map((l: any) => l.merchandise.id)); for (const r of chunk) if (!inCart.has(r.new_shopify_variant_id)) issues.push(`not addable to cart: ${r.products.handle}/${r.title}`); }
}
console.log(`Active website variants: ${rows.length}; with new-store id: ${withId.length}; checked in Storefront + real carts: ${withId.length}.`);
console.log(issues.length ? `${issues.length} issue(s):\n  ${issues.slice(0, 40).join("\n  ")}` : "No issues: all present, purchasable, same price and compare-at price, all addable to a cart.");
