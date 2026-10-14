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

      return `
    <item>
      <g:id>${escapeXml(p.variantId)}</g:id>
      <g:item_group_id>${escapeXml(p.productId)}</g:item_group_id>
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
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
    },
  });
}
