/**
 * Section access for the restricted "fulfillment_staff" role. 'admin' and 'staff' can reach
 * every /admin/* page unchanged -- this allowlist exists purely to confine fulfillment_staff to
 * Orders + Products (view only) + the packing-slip print view, per its stated design: order
 * processing/tracking without customer, financial, or store-configuration access.
 *
 * Path-prefix matching alone can isolate *sections* (this file), but not actions *within* an
 * allowed section (e.g. blocking a refund while still allowing fulfillment on the same order
 * page) -- those are enforced separately, at the point of mutation, via requireFullAdmin() in
 * each sensitive Server Action.
 */
const FULFILLMENT_STAFF_ALLOWED_PREFIXES = ["/admin/orders", "/admin/products", "/admin/print"];

// Checked before the allowlist above -- these sub-paths sit under an allowed prefix but are
// still full mutations (new/duplicate/bulk-import a product, create a manual order) that a
// view-only + fulfillment-only role must never reach, even by direct URL.
const FULFILLMENT_STAFF_EXCLUDED_PATHS = ["/admin/orders/new", "/admin/products/new", "/admin/products/import", "/admin/products/inventory"];

export function isAdminPathAllowedForFulfillmentStaff(pathname: string): boolean {
  if (FULFILLMENT_STAFF_EXCLUDED_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return false;
  if (pathname === "/admin") return false; // dashboard shows sales/financial data -- not allowed
  return FULFILLMENT_STAFF_ALLOWED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}
