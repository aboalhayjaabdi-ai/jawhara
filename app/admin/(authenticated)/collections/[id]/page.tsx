import Link from "next/link";
import { notFound } from "next/navigation";
import { createAuthServerClient } from "@/lib/supabase/server-auth";
import { supabaseService } from "@/lib/supabase/service-client";
import { mediaUrl } from "@/lib/supabase/media";
import { checkCollectionDiscountImpact } from "@/lib/admin/discount-guard";
import { getCollectionDeleteImpact } from "@/app/admin/(authenticated)/collections/[id]/actions/delete";
import { CollectionCoreForm } from "@/components/admin/collection-core-form";
import { CollectionSeoForm } from "@/components/admin/collection-seo-form";
import { CollectionImageUploader } from "@/components/admin/collection-image-uploader";
import { CollectionProductsManager } from "@/components/admin/collection-products-manager";
import { CollectionTileGroupEditor } from "@/components/admin/collection-tile-group-editor";
import { CollectionSidebarActions } from "@/components/admin/collection-sidebar-actions";

export const dynamic = "force-dynamic";

export default async function AdminCollectionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createAuthServerClient();

  const { data: collection } = await supabase
    .from("collections")
    .select("id, title, handle, description_html, image_url, seo_title, seo_description, template_suffix, source, shopify_id")
    .eq("id", id)
    .maybeSingle();
  if (!collection) notFound();

  const [{ data: members }, { data: templates }, { data: allCollections }, deleteImpact, discountImpact] = await Promise.all([
    supabase
      .from("collection_products")
      .select("position, products(id, title, media(storage_path, position))")
      .eq("collection_id", id)
      .order("position"),
    supabase.from("product_templates").select("key, name").order("name"),
    supabase.from("collections").select("id, title").neq("id", id).order("title"),
    getCollectionDeleteImpact(id),
    checkCollectionDiscountImpact(collection.shopify_id),
  ]);

  const memberProducts = (members ?? [])
    .map((m: any) => {
      const p = m.products;
      if (!p) return null;
      const sortedMedia = [...(p.media ?? [])].sort((a: any, b: any) => a.position - b.position);
      return { id: p.id, title: p.title, thumbnailUrl: sortedMedia[0] ? mediaUrl(sortedMedia[0].storage_path) : null };
    })
    .filter(Boolean) as { id: string; title: string; thumbnailUrl: string | null }[];

  let tileItems: { id: string; collectionId: string; title: string }[] = [];
  if (collection.template_suffix) {
    const { data: tiles } = await supabaseService
      .from("collection_tile_items")
      .select("id, child_collection_id, position, collections(title)")
      .eq("template_suffix", collection.template_suffix)
      .order("position");
    tileItems = (tiles ?? []).map((t: any) => ({ id: t.id, collectionId: t.child_collection_id, title: t.collections?.title ?? "" }));
  }

  return (
    <div className="max-w-6xl">
      <div className="mb-6">
        <Link href="/admin/collections" className="text-xs uppercase tracking-wide text-gray-500 hover:text-gray-900">
          ← Kollektioner
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-gray-900">{collection.title}</h1>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <CollectionCoreForm
            collectionId={collection.id}
            initial={{ title: collection.title, descriptionHtml: collection.description_html, templateSuffix: collection.template_suffix }}
            templateOptions={templates ?? []}
          />

          <CollectionProductsManager collectionId={collection.id} initialMembers={memberProducts} />

          {collection.template_suffix && (
            <CollectionTileGroupEditor templateSuffix={collection.template_suffix} initialItems={tileItems} allCollections={allCollections ?? []} />
          )}

          <CollectionSeoForm collectionId={collection.id} initial={{ seoTitle: collection.seo_title, seoDescription: collection.seo_description }} />
        </div>

        <div className="space-y-6">
          <CollectionImageUploader collectionId={collection.id} initialUrl={collection.image_url} />
          <CollectionSidebarActions
            collectionId={collection.id}
            title={collection.title}
            handle={collection.handle}
            source={collection.source}
            productCount={deleteImpact.productCount}
            discountImpact={discountImpact}
          />
        </div>
      </div>
    </div>
  );
}
