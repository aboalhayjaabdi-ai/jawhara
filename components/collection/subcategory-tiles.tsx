import Image from "next/image";
import Link from "next/link";
import { getCollectionsByHandles } from "@/lib/queries";
import { mediaUrl } from "@/lib/supabase/media";
import { COLLECTION_TILE_GROUPS, COLLECTION_TILE_FALLBACK_IMAGE } from "@/lib/collection-tiles";

export async function SubcategoryTiles({ templateSuffix }: { templateSuffix: string | null }) {
  const handles = templateSuffix ? COLLECTION_TILE_GROUPS[templateSuffix] : undefined;
  if (!handles) return null;

  const collections = await getCollectionsByHandles(handles);
  if (collections.length === 0) return null;

  return (
    <div className="-mx-6 mb-10 flex gap-4 overflow-x-auto px-6 pb-2 lg:-mx-14 lg:px-14">
      {collections.map((c) => {
        const fallback = COLLECTION_TILE_FALLBACK_IMAGE[c.handle];
        const imageUrl = c.image_url ?? (fallback ? mediaUrl(fallback) : null);
        return (
          <Link key={c.handle} href={`/collections/${c.handle}`} className="flex w-32 flex-shrink-0 flex-col gap-3">
            <div className="relative aspect-[4/5] w-full overflow-hidden bg-[#f4f4f4]">
              {imageUrl && <Image src={imageUrl} alt={c.title} fill className="object-cover" sizes="128px" />}
            </div>
            <span className="text-center text-[11px] leading-tight">{c.title}</span>
          </Link>
        );
      })}
    </div>
  );
}
