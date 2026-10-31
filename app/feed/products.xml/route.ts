import { getProductFeedItems } from "@/lib/queries";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://jawhara.se";

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function stripHtml(html: string | null): string {
  if (!html) return "";
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

// Meta/Google cap custom_label_0 at 100 characters -- confirmed live (7 of 432 products, each in
// up to 10 collections, produced a 103-117 char joined string and Meta flagged every one of them
// as "value too long" on every feed upload). Packs as many whole handles as fit under that budget
// (shortest first, so a heavily-tagged product keeps the most labels rather than silently losing
// whichever handles happened to sort last) instead of ever emitting an invalid, truncated field.
const CUSTOM_LABEL_MAX_LENGTH = 100;
function buildCustomLabel0(handles: string[]): string {
  const sorted = [...handles].sort((a, b) => a.length - b.length);
  const kept: string[] = [];
  let length = 0;
  for (const handle of sorted) {
    const addedLength = kept.length === 0 ? handle.length : handle.length + 1; // +1 for the joining comma
    if (length + addedLength > CUSTOM_LABEL_MAX_LENGTH) continue;
    kept.push(handle);
    length += addedLength;
  }
  return kept.join(",");
}

/**
 * Public, Google Shopping / Meta Catalog-compatible product feed -- RSS 2.0 with the standard
 * <g:*> namespace both platforms accept. Generated entirely from real, active Supabase product
 * data; needs no external credentials. Linked from the admin marketing settings page.
 */
export async function GET() {
  const items = await getProductFeedItems();

  const itemsXml = items
    .map((p) => {
      const link = `${SITE_URL}/products/${p.handle}`;
      const availability = p.available ? "in stock" : "out of stock";
      const salePriceXml =
        p.compareAtPrice != null && p.compareAtPrice > p.price ? `<g:sale_price>${p.price.toFixed(2)} ${p.currency}</g:sale_price>` : "";
      const regularPrice = p.compareAtPrice != null && p.compareAtPrice > p.price ? p.compareAtPrice : p.price;
      const description = stripHtml(p.descriptionHtml).slice(0, 5000);
      // Commerce Manager product-set rules match this with "Custom label 0" -> "Contains" ->
      // "<handle>", which selects a product that's in multiple collections for every matching set
      // (a single-value field couldn't).
      const customLabel0 = buildCustomLabel0(p.collectionHandles);

      return `
    <item>
      <g:id>${escapeXml(p.id)}</g:id>
      <title>${escapeXml(p.title)}</title>
      <description>${escapeXml(description || p.title)}</description>
      <link>${escapeXml(link)}</link>
      ${p.image ? `<g:image_link>${escapeXml(p.image)}</g:image_link>` : ""}
      <g:availability>${availability}</g:availability>
      <g:price>${regularPrice.toFixed(2)} ${p.currency}</g:price>
      ${salePriceXml}
      <g:condition>new</g:condition>
      <g:brand>Jawhara</g:brand>
      <g:identifier_exists>false</g:identifier_exists>
      ${customLabel0 ? `<g:custom_label_0>${escapeXml(customLabel0)}</g:custom_label_0>` : ""}
    </item>`;
    })
    .join("");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
  <channel>
    <title>Jawhara</title>
    <link>${SITE_URL}</link>
    <description>Jawhara produktflöde</description>${itemsXml}
  </channel>
</rss>`;

  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      // 1h previously meant an admin's collection/catalog edit could sit invisible to Meta's
      // crawler for up to an hour after a manual "Hämta nu" refresh -- confirmed live (a 70-product
      // collection change didn't show up in the canonical feed response until this cache expired,
      // same data appearing instantly on a cache-busted URL). 5 min matches this app's other
      // revalidate windows and keeps the feed cheap to serve without that lag.
      "Cache-Control": "public, max-age=300, s-maxage=300",
    },
  });
}
