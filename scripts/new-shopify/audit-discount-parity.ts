// Cart-only: for random carts, compares the site's own total (/api/cart/totals, production), the
// OLD store's Shopify cart total and the NEW store's Shopify cart total. No checkout is created.
import { supabaseService as s } from "../../lib/supabase/service-client.ts";
const N = Number(process.argv[2] ?? 40);
const stores = {
  old: [process.env.SHOPIFY_STOREFRONT_DOMAIN ?? process.env.SHOPIFY_STORE_DOMAIN, process.env.SHOPIFY_STOREFRONT_ACCESS_TOKEN, "shopify_variant_id"],
  new: [process.env.NEW_SHOPIFY_STORE_DOMAIN, process.env.NEW_SHOPIFY_STOREFRONT_ACCESS_TOKEN, "new_shopify_variant_id"],
} as const;
const cartTotal = async (store: keyof typeof stores, lines: any[], code: string | null) => {
  const [domain, token, col] = stores[store];
  const r = await (await fetch(`https://${domain}/api/2026-10/graphql.json`, { method: "POST", headers: { "Content-Type": "application/json", "X-Shopify-Storefront-Access-Token": token! },
    body: JSON.stringify({ query: `mutation($i:CartInput!){ cartCreate(input:$i){ cart { cost { totalAmount { amount } } discountCodes { code applicable } } userErrors { message } } }`,
      variables: { i: { lines: lines.map((l) => ({ merchandiseId: l.v[col], quantity: l.qty })), ...(code ? { discountCodes: [code] } : {}) } } }) })).json();
  const c = r.data?.cartCreate?.cart; return c ? { total: Number(c.cost.totalAmount.amount), codeOk: c.discountCodes[0]?.applicable ?? null } : { total: NaN, codeOk: null, err: JSON.stringify(r).slice(0, 150) };
};
const rows: any[] = [];
for (let f = 0; ; f += 1000) { const { data } = await s.from("product_variants").select("id, title, price, shopify_variant_id, new_shopify_variant_id, products!inner(handle, status, tags, template_suffix)").eq("products.status", "active").not("new_shopify_variant_id", "is", null).range(f, f + 999); rows.push(...data!); if (data!.length < 1000) break; }
const bags = rows.filter((r) => /vask/.test(r.products.handle)), wallets = rows.filter((r) => /planbok/.test(r.products.handle)), jewelry = rows.filter((r) => (r.products.tags ?? []).includes("3for2"));
const pick = (a: any[]) => a[Math.floor(Math.random() * a.length)];
let mism = 0;
for (let i = 0; i < N; i++) {
  const kind = ["3for2", "3for2-mixed", "bag+wallet", "random", "code"][i % 5];
  let lines: { v: any; qty: number }[] = [];
  if (kind === "3for2") lines = [{ v: pick(jewelry), qty: 3 }];
  if (kind === "3for2-mixed") lines = [pick(jewelry), pick(jewelry), pick(jewelry), pick(jewelry)].map((v) => ({ v, qty: 1 }));
  if (kind === "bag+wallet") lines = [{ v: pick(bags), qty: 1 }, { v: pick(wallets), qty: 1 }];
  if (kind === "random") lines = [pick(rows), pick(rows)].map((v) => ({ v, qty: 1 + Math.floor(Math.random() * 2) }));
  if (kind === "code") lines = [{ v: pick(rows), qty: 1 }];
  const seen = new Map<string, { v: any; qty: number }>(); for (const l of lines) { const e = seen.get(l.v.id); if (e) e.qty += l.qty; else seen.set(l.v.id, { ...l }); } lines = [...seen.values()];
  const code = kind === "code" ? "RABATT20F" : null;
  const site = await (await fetch("https://www.jawhara.se/api/cart/totals", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cart: lines.map((l) => ({ variantId: l.v.id, qty: l.qty })), discountCode: code }) })).json();
  const [o, n] = await Promise.all([cartTotal("old", lines, code), cartTotal("new", lines, code)]);
  const ok = Math.abs(o.total - n.total) < 0.01 && Math.abs(Number(site.total) - n.total) <= 1 && o.codeOk === n.codeOk;
  if (!ok) mism++;
  console.log(`${ok ? "OK  " : "DIFF"} ${kind.padEnd(12)} site ${String(site.total).padStart(7)} | old ${String(o.total).padStart(7)} | new ${String(n.total).padStart(7)}${code ? ` | code ok old ${o.codeOk} new ${n.codeOk}` : ""}  ${lines.map((l) => `${l.v.products.handle}x${l.qty}`).join(", ")}`);
}
console.log(`\n${N - mism}/${N} carts identical (site = old store = new store).`);
