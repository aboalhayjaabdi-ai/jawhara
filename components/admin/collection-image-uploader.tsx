"use client";

import Image from "next/image";
import { useRef, useState } from "react";

export function CollectionImageUploader({ collectionId, initialUrl }: { collectionId: string; initialUrl: string | null }) {
  const [url, setUrl] = useState(initialUrl);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleUpload(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch(`/api/admin/collections/${collectionId}/image`, { method: "POST", body: formData });
    const data = await res.json();
    if (!res.ok) setError(data.error ?? "Uppladdning misslyckades.");
    else setUrl(data.url);
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5">
      <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Bild</div>
      <div className="relative mb-3 aspect-[4/5] w-full overflow-hidden rounded bg-gray-100">
        {url && <Image src={url} alt="" fill className="object-cover" sizes="280px" />}
      </div>
      {error && <div className="mb-2 text-xs text-rose-600">{error}</div>}
      <label className="block cursor-pointer rounded-md border border-gray-300 px-3 py-2 text-center text-xs font-medium text-gray-700 hover:bg-gray-50">
        {uploading ? "Laddar upp…" : "Ladda upp bild"}
        <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => handleUpload(e.target.files)} disabled={uploading} />
      </label>
    </div>
  );
}
