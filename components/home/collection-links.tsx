import Image from "next/image";
import Link from "next/link";
import { getCollectionsByHandles } from "@/lib/queries";

export async function CollectionLinks({ heading, handles }: { heading?: string; handles: string[] }) {
  const collections = await getCollectionsByHandles(handles);
  if (collections.length === 0) return null;

  // 3 per row on desktop when the count divides evenly by 3 but not 4 (e.g. 6 categories), with
  // square tiles so two rows don't dominate the page; otherwise the original 4-up grid.
  const threeUp = collections.length % 3 === 0 && collections.length % 4 !== 0;

  return (
    <section className="mx-auto max-w-[1328px] px-4 py-12 sm:px-6 lg:px-14">
      {heading && <h2 className="mb-8 text-center text-[24px] sm:text-[28px]">{heading}</h2>}
      <div className={`grid grid-cols-2 gap-3 sm:gap-5 ${threeUp ? "lg:grid-cols-3" : "lg:grid-cols-4"}`}>
        {collections.map((c) => (
          <Link
            key={c.handle}
            href={`/collections/${c.handle}`}
            className={`group relative block aspect-[3/4] overflow-hidden bg-[#f4f4f4] ${threeUp ? "lg:aspect-square" : ""}`}
          >
            {c.image_url && (
              <Image
                src={c.image_url}
                alt={c.title}
                fill
                className="object-cover motion-safe:transition-transform motion-safe:duration-700 group-hover:scale-[1.03]"
                sizes={threeUp ? "(min-width: 1024px) 33vw, 50vw" : "(min-width: 1024px) 25vw, 50vw"}
              />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/45 to-transparent" />
            <span className="absolute bottom-4 left-4 font-serif text-lg text-white sm:bottom-5 sm:left-5 sm:text-xl">{c.title}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
