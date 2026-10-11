import Image from "next/image";
import Link from "next/link";
import { getCollectionTileGroup } from "@/lib/collection-tiles";

export async function SubcategoryTiles({ templateSuffix }: { templateSuffix: string | null }) {
  const tiles = await getCollectionTileGroup(templateSuffix);
  if (tiles.length === 0) return null;

  return (
    <div className="-mx-6 mb-10 flex gap-4 overflow-x-auto px-6 pb-2 lg:-mx-14 lg:px-14">
      {tiles.map((tile) => (
        <Link key={tile.handle} href={`/collections/${tile.handle}`} className="flex w-32 flex-shrink-0 flex-col gap-3 lg:w-48">
          <div className="relative aspect-[4/5] w-full overflow-hidden bg-[#f4f4f4]">
            {tile.image_url && (
              <Image src={tile.image_url} alt={tile.title} fill className="object-cover" sizes="(min-width: 1024px) 192px, 128px" />
            )}
          </div>
          <span className="text-center text-[11px] leading-tight lg:text-xs">{tile.title}</span>
        </Link>
      ))}
    </div>
  );
}
