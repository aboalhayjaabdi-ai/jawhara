// Sello checkout test: products listed here skip the Jawhara cart and send the customer straight
// to the Sello store's checkout with the mapped Sello product. Remove an entry to restore the
// normal "Lägg till i varukorgen" button for that product.

const SELLO_STORE_URL = "https://sello.bio/jawhara";

// Jawhara product handle -> Sello product id
const SELLO_PRODUCT_BY_HANDLE: Record<string, number> = {
  "diana-orhange": 1045638,
};

export function selloCheckoutUrl(handle: string, quantity = 1): string | null {
  const selloId = SELLO_PRODUCT_BY_HANDLE[handle];
  if (!selloId) return null;
  return `${SELLO_STORE_URL}/checkout/?add-to-cart=${selloId}&quantity=${quantity}&fx=SEK`;
}
