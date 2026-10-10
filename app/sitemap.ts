import type { MetadataRoute } from "next";
import { supabase } from "@/lib/supabase/client";
import { PAGES } from "@/lib/pages-content";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://jawhara.se";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [{ data: products }, { data: collections }] = await Promise.all([
    supabase.from("products").select("handle, updated_at").eq("status", "active"),
    supabase.from("collections").select("handle, updated_at"),
  ]);

  const staticEntries: MetadataRoute.Sitemap = [
    { url: SITE_URL, changeFrequency: "daily", priority: 1 },
    { url: `${SITE_URL}/collections/all`, changeFrequency: "daily", priority: 0.9 },
    ...Object.keys(PAGES).map((handle) => ({
      url: `${SITE_URL}/pages/${handle}`,
      changeFrequency: "monthly" as const,
      priority: 0.3,
    })),
  ];

  const productEntries: MetadataRoute.Sitemap = (products ?? []).map((p) => ({
    url: `${SITE_URL}/products/${p.handle}`,
    lastModified: p.updated_at ?? undefined,
    changeFrequency: "weekly",
    priority: 0.7,
  }));

  const collectionEntries: MetadataRoute.Sitemap = (collections ?? []).map((c) => ({
    url: `${SITE_URL}/collections/${c.handle}`,
    lastModified: c.updated_at ?? undefined,
    changeFrequency: "daily",
    priority: 0.8,
  }));

  return [...staticEntries, ...collectionEntries, ...productEntries];
}
