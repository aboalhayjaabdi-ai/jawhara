# Jawhara ERP API (v1)

REST API that lets the freight forwarder's ERP fetch orders that are ready to ship, product data
with images, and send back tracking numbers and delivery statuses. All data comes from Jawhara's
existing order and product data (Supabase, kept in sync with Shopify); nothing in the website,
the Shopify checkout or the existing order sync is changed by it.

- **Base URL:** `https://www.jawhara.se/api/erp/v1`
- **Format:** JSON (UTF-8). Times are ISO 8601 in UTC. Prices are in the order's currency (SEK).
- **Code:** `app/api/erp/v1/*`, `lib/erp/*`. Tables: `erp_order_exports`, `erp_api_requests`
  (migration `supabase/migrations/0052_erp_api.sql`).

## Authentication

Every request needs the API key in the `Authorization` header:

```
Authorization: Bearer jwerp_...
```

- The key is stored in the Vercel environment variable **`ERP_API_KEYS`** (Production). It may hold
  several keys separated by commas, so a key can be rotated without downtime: add the new key,
  give it to the ERP, then remove the old one. Keys shorter than 32 characters are ignored.
- Optional **`ERP_ALLOWED_IPS`**: comma-separated IP addresses. When set, only those IPs are accepted.
- Optional **`ERP_ORDERS_FROM`**: go-live date (ISO, e.g. `2026-11-20T00:00:00+01:00`). Orders placed
  before it are not listed by `GET /orders` (they are handled the way they are today).
- HTTPS only. Never put the key in a URL.

## Common behaviour

| Topic | Behaviour |
|---|---|
| Request id | Every response has `requestId` in the body and an `X-Request-Id` header. Quote it when reporting a problem. |
| Errors | `{"error": {"code": "...", "message": "...", "details": ...}, "requestId": "..."}` with a fitting HTTP status (see the table at the end). |
| Retries | `GET` is always safe to retry. For `POST`, send an **`Idempotency-Key`** header (any unique string, e.g. a UUID per operation). Repeating the same POST with the same key returns the stored first answer (header `Idempotent-Replay: true`) and does nothing again. On `5xx` or a timeout: retry with the same key, backing off (e.g. 2 s, 10 s, 60 s). |
| Rate limits | Keep to about 2 requests per second. Vercel's edge protection can answer `403`/`429` to bursts; treat those as retryable with back-off. |
| Customer data | Orders only contain what is needed to deliver: recipient name, company, phone and shipping address. No email addresses, no payment data. |
| Logging | Every call is logged in `erp_api_requests` (method, path, status, duration, IP, error) without request bodies or customer data. |

## 1. Orders

### `GET /orders`

Shopify orders that are **paid** (or partly refunded), **not cancelled, not hidden, not test
orders**, and still have something left to ship (placed on or after `ERP_ORDERS_FROM` when set).
Oldest first.

| Query | Default | Meaning |
|---|---|---|
| `exportState` | `new` | `new` = not yet acknowledged by the ERP; `acknowledged`; `all` |
| `limit` | `50` | 1–100 |
| `since` | — | Paging cursor: pass the previous response's `nextCursor` |

Response:

```json
{
  "orders": [
    {
      "orderId": "c7229989-6959-4c72-8652-c91deed97a14",
      "orderNumber": "#SE103139",
      "status": "ready",
      "createdAt": "2026-11-03T14:30:24+00:00",
      "paidAt": "2026-11-03T14:30:26+00:00",
      "currency": "SEK",
      "shippingMethod": "PostNord Hemleverans",
      "totals": { "subtotal": 1248, "shipping": 0, "discounts": 0, "total": 1248 },
      "recipient": { "name": "Anna Andersson", "company": null, "phone": "+46701234567" },
      "shippingAddress": {
        "address1": "Storgatan 1", "address2": null, "city": "Stockholm",
        "province": null, "zip": "111 22", "country": "Sweden", "countryCode": "SE"
      },
      "customerNote": null,
      "items": [
        {
          "lineId": "0b5d…",
          "sku": "LADY-RED",
          "title": "Lady Väska",
          "variantTitle": "Röd",
          "quantity": 1,
          "orderedQuantity": 1,
          "unitPrice": 999,
          "weight": 0,
          "weightUnit": "KILOGRAMS",
          "imageUrl": "https://jghzjdirxdxtshywezxz.supabase.co/storage/v1/object/public/product-media/…-hd2.png",
          "productId": "f86edac4-…",
          "variantId": "8a1c…",
          "productHandle": "lady-vaska-1",
          "model": "Lady Väska",
          "color": "Röd"
        }
      ],
      "erp": { "firstFetchedAt": "2026-11-19T10:00:00Z", "acknowledgedAt": null, "erpReference": null }
    }
  ],
  "nextCursor": "2026-11-03T14:30:24+00:00",
  "requestId": "…"
}
```

- `items[].quantity` is what is **still to ship** (ordered minus already shipped minus refunded).
- `items[].imageUrl` is the image of the **exact purchased variant**, as frozen when the order came
  in (falls back to the variant's, then the product's current first image). Public URL, no login.
- **What exactly to pack, per line:** `title` (product name), `variantTitle` (every option the
  customer chose, e.g. "17 cm" or "Röd"; `null` when the product has no options), `model` + `color`
  (set when the product is one colour of a model, e.g. bags: "Lilly Väska" / "Svart"),
  `quantity`, and `imageUrl` (the picture of exactly that product/variant).
- `status`: `ready`, `partially_fulfilled`, `fulfilled`, `cancelled`, `unpaid`, `hidden`.
- `nextCursor` is `null` when there are no more pages.

### `GET /orders/{orderNumber}`

One order in any state (e.g. to re-check that it is still `ready` just before shipping).
`orderNumber` with or without `#`: `/orders/SE103139` or `/orders/%23SE103139`.

### `POST /orders/{orderNumber}/acknowledge`

Tells Jawhara the ERP has taken the order over. It then no longer appears under `exportState=new`,
so **the same order is never processed twice**. Idempotent: acknowledging again keeps the first
time. Refused (`409`) for cancelled, unpaid or hidden orders.

```json
// request (body optional)
{ "erpReference": "WMS-000123" }

// response
{ "orderNumber": "#SE103139", "status": "ready", "acknowledgedAt": "2026-11-19T10:01:00Z",
  "erpReference": "WMS-000123", "alreadyAcknowledged": false, "requestId": "…" }
```

**Recommended flow:** `GET /orders` → store each order → `POST …/acknowledge` → pick & pack →
`POST /shipments`.

> **Identify lines by `lineId` (or `variantId`), not by SKU.** In Jawhara's current product data
> the SKU field often holds a material description (e.g. "18K GULDPLÄTERAT ROSTFRITT STÅL") or is
> empty, so it is not unique. `items[].sku` is passed through as-is for information.

## 2. Products and images

### `GET /products`

Active products with variants, SKUs and public image URLs, from the website's own product data.

| Query | Default | Meaning |
|---|---|---|
| `offset` | `0` | Paging (use `nextOffset`) |
| `limit` | `100` | 1–250 |
| `sku` | — | Only the product that has this SKU |
| `updatedSince` | — | Only products changed after this time |

```json
{
  "products": [
    {
      "productId": "f86edac4-…",
      "handle": "lady-vaska-1",
      "title": "Lady Väska",
      "productType": null,
      "model": "Lady Väska",
      "color": "Röd",
      "url": "https://jawhara.se/products/lady-vaska-1",
      "updatedAt": "2026-11-17T12:00:00Z",
      "images": ["https://…/product-media/…-hd2.png", "https://…/product-media/…-hd2.png"],
      "variants": [
        {
          "variantId": "8a1c…", "sku": "LADY-RED", "barcode": null, "title": "Röd", "options": ["Röd"],
          "price": 999, "compareAtPrice": 1899, "weight": 0, "weightUnit": "KILOGRAMS",
          "imageUrl": "https://…/product-media/…-hd2.png", "imageIsVariantSpecific": true
        }
      ]
    }
  ],
  "total": 446,
  "nextOffset": 100,
  "requestId": "…"
}
```

`variants[].imageUrl` is the image assigned to that variant (`imageIsVariantSpecific: true`),
otherwise the product's first image. Images are only read; nothing is uploaded to Shopify.

## 3. Shipments (tracking numbers)

### `POST /shipments`

Registers a sent parcel. It does exactly what "Lägg till leverans" in Jawhara admin does:
1. creates the fulfillment in the right Shopify store (Shopify does not email the customer),
2. saves it in Supabase (the order becomes `FULFILLED` / `PARTIALLY_FULFILLED`),
3. registers the tracking number with 17TRACK,
4. sends Jawhara's own shipping email to the customer (which also starts the follow-up emails).

```json
// request -- send an Idempotency-Key header
{
  "orderNumber": "#SE103139",
  "trackingNumber": "YT2632000713274332",
  "carrier": "YunExpress",
  "trackingUrl": "https://www.yuntrack.com/parcelTracking?id=YT2632000713274332",
  "items": [ { "lineId": "0b5d…", "quantity": 1 } ],
  "dryRun": false
}
```

| Field | Required | Notes |
|---|---|---|
| `orderNumber` | yes | With or without `#` |
| `trackingNumber` | yes | 6–40 letters/digits (spaces and dashes are removed) |
| `carrier` | no | Detected from the tracking number when left out (YunExpress, 4PX, …) |
| `trackingUrl` | no | Must be `https://` |
| `items` | no | Lines in this parcel, each `{ "lineId": "…" }` (recommended) or `{ "sku": "…" }` plus `quantity`. Left out = **everything still unshipped** on the order. |
| `dryRun` | no | `true` = validate and return the plan, write nothing |

Responses:

```json
// 201 Created
{ "result": "created",
  "shipment": { "shipmentId": "…", "orderNumber": "#SE103139", "trackingNumber": "YT2632000713274332",
                "carrier": "YunExpress", "trackingUrl": "https://…", "shippedAt": "…", "deliveredAt": null,
                "shopifySynced": true, "items": [ { "lineId": "…", "sku": "LADY-RED", "title": "Lady Väska", "quantity": 1 } ],
                "customerNotified": true },
  "requestId": "…" }

// 200 -- this tracking number is already registered on this order (nothing new is created)
{ "result": "already_registered", "shipment": { … }, "requestId": "…" }
```

**Duplicate protection:** the same tracking number on the same order is never registered twice,
quantities can never exceed what is left to ship, and Shopify itself refuses to fulfil items twice.

### `POST /shipments/{trackingNumber}/status`

A delivery status for a registered shipment.

```json
{ "status": "delivered", "occurredAt": "2026-11-28T09:12:00Z", "message": "Levererad till postlåda" }
```

| `status` | Effect |
|---|---|
| `in_transit`, `out_for_delivery`, `ready_for_pickup`, `attempted_delivery`, `exception` | Added to the Shopify fulfillment as a tracking event |
| `delivered` | Same, and the shipment's delivered time is set in Supabase |

The same status for the same shipment is a no-op (`"result": "unchanged"`). If Shopify refuses the
event, the answer says `"result": "saved_shopify_failed"` with the reason; send it again later.
Note: if Shopify's own "shipping update" notifications are switched on under Shopify → Settings →
Notifications, Shopify may email the customer on these events.

## 4. Health

`GET /health` → `{ "ok": true, "api": "jawhara-erp", "version": "v1", "time": "…" }` (checks the key).

## Error codes

| HTTP | `code` examples | What to do |
|---|---|---|
| 400 | `invalid_json` | Fix the request |
| 401 | `unauthorized` | Wrong or missing key |
| 403 | `ip_not_allowed` | IP not in `ERP_ALLOWED_IPS` (or an edge block: retry later) |
| 404 | `order_not_found`, `shipment_not_found` | Check the number |
| 409 | `order_cancelled`, `order_unpaid`, `order_hidden`, `nothing_to_fulfill`, `quantity_exceeds_remaining` | Do not ship / nothing left to ship |
| 413 | `payload_too_large` | Body over 100 kB |
| 422 | `invalid_tracking_number`, `invalid_status`, `unknown_item`, … | Fix the field named in `message` |
| 502 | `shopify_rejected` | Shopify refused; retry later with the same Idempotency-Key |
| 503 | `not_configured` | `ERP_API_KEYS` not set |
| 500 | `internal_error` | Retry with the same Idempotency-Key |

## Example (curl)

```bash
KEY="jwerp_..."   # from Vercel → Settings → Environment Variables → ERP_API_KEYS
curl -s https://www.jawhara.se/api/erp/v1/orders?limit=10 -H "Authorization: Bearer $KEY"
curl -s -X POST https://www.jawhara.se/api/erp/v1/shipments \
  -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -H "Idempotency-Key: 6f1c2f0e-0d47-4a7e-9f1e-1a2b3c4d5e6f" \
  -d '{"orderNumber":"SE103139","trackingNumber":"YT2632000713274332","dryRun":true}'
```
