import { ensureBucket } from "./storage.ts";

await ensureBucket("product-media", true); // public — storefront images
await ensureBucket("backups", false); // private — raw export snapshot, admin-only
console.log("✓ buckets ready");
