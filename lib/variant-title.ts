// Shopify names a product's lone variant literally "Default Title" when it has no real
// customer-facing options (no size/color choice) -- an internal convention never meant to be
// shown. Real options (e.g. "Grå", "Large") should always pass through unchanged.
export function normalizeVariantTitle(title: string | null | undefined): string | null {
  const trimmed = title?.trim() ?? "";
  if (!trimmed || trimmed.toLowerCase() === "default title") return null;
  return trimmed;
}
