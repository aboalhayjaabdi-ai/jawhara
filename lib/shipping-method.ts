// The real, single shipping method Jawhara currently offers -- Sweden-only, always free (see
// app/api/checkout/route.ts's shipping_address_collection + lib/discounts.ts's shipping: 0).
// One shared constant so the cart, checkout summary, and order-confirmation email can never
// drift from each other on the label.
export const SHIPPING_METHOD_NAME = "PostNord Hemleverans";
