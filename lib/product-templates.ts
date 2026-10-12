// Real per-category product page content, keyed by Shopify's own templateSuffix
// (products.template_suffix / collections.template_suffix). Originally a hardcoded static Record
// (every string read verbatim from the real theme export, including known content quirks like the
// erbjudande-vaskor intro's confirmed-stale duplicate text -- see git history for the full
// provenance notes); migrated to the DB-backed product_templates table (Phase 3,
// scripts/supabase/backfill-product-templates.ts copied every entry verbatim, byte-for-byte
// verified) so admins can manage template content without a code deploy. Same exported type and
// function contract as before -- now async, since it's a real query instead of an object lookup.
import { supabase } from "./supabase/client";

export type AccordionRow = { heading: string; body: string };

export type ProductTemplateContent = {
  introParagraph: string | null;
  trustLines: string[] | null;
  uspBlock: { heading: string; body: string }[] | null;
  faq: { question: string; answer: string }[] | null;
  descriptionHeading: string;
  accordionRows: AccordionRow[];
  sizeGuideHref: string | null;
  offerMessage: { heading: string; body: string; href?: string | null } | null;
  showInventoryStatus: boolean;
  galleryLayout: "carousel" | "grid";
};

export async function getProductTemplateContent(templateSuffix: string | null): Promise<ProductTemplateContent | null> {
  if (!templateSuffix) return null;

  const { data } = await supabase
    .from("product_templates")
    .select("intro_paragraph, trust_lines, usp_block, faq, description_heading, accordion_rows, size_guide_href, offer_message, show_inventory_status, gallery_layout")
    .eq("key", templateSuffix)
    .maybeSingle();
  if (!data) return null;

  return {
    introParagraph: data.intro_paragraph,
    trustLines: data.trust_lines,
    uspBlock: data.usp_block,
    faq: data.faq,
    descriptionHeading: data.description_heading,
    accordionRows: data.accordion_rows ?? [],
    sizeGuideHref: data.size_guide_href,
    offerMessage: data.offer_message,
    showInventoryStatus: data.show_inventory_status,
    galleryLayout: data.gallery_layout,
  };
}
