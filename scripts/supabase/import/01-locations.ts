import { upsert } from "../rest.ts";
import { idTail, readJsonl } from "./util.ts";

const locations = readJsonl("locations");

const rows = locations.map((l: any) => ({
  shopify_id: idTail(l.id),
  name: l.name,
  is_active: l.isActive,
  city: l.address?.city ?? null,
  country_code: l.address?.countryCode ?? null,
}));

const result = await upsert("locations", rows, "shopify_id");
console.log(`✓ locations: ${result.length} upserted`);
