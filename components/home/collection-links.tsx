import Image from "next/image";
import Link from "next/link";
import { getCollectionsByHandles } from "@/lib/queries";

export async function CollectionLinks({ heading, handles }: { heading?: string; handles: string[] }) {
  const collections = await getCollectionsByHandles(handles);
  if (collections.length === 0) return null;

  return (
    <section className="px-6 py-10 lg:px-14">
      {heading && <p className="mb-6 text-center text-base">{heading}</p>}
      <div className="grid grid-cols-2 gap-5 lg:grid-cols-4">
        {collections.map((c) => (
          <Link key={c.handle} href={`/collections/${c.handle}`} className="relative block aspect-[3/4] overflow-hidden">
            {c.image_url && <Image src={c.image_url} alt={c.title} fill className="object-cover" sizes="25vw" />}
            <div className="absolute inset-0 bg-gradient-to-t from-black/45 to-transparent" />
            <span className="absolute bottom-5 left-5 font-serif text-xl text-white">{c.title}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
